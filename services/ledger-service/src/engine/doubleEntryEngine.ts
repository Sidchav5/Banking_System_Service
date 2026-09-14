import { pool } from '../db';
import { config } from '../config';
import {
  AppError,
  Errors,
  createLogger,
  JournalEntry,
  LedgerEntry,
  PostJournalRequest,
  AmountMinor,
} from '@bankflow/shared';
import axios from 'axios';

const logger = createLogger('double-entry-engine');

export interface FullJournalRecord {
  journal: JournalEntry;
  entries: LedgerEntry[];
}

/**
 * Validates and atomically posts a double-entry journal to the immutable ledger.
 * Enforces: Sum(Debits) == Sum(Credits)
 */
export async function postJournalEntry(
  request: PostJournalRequest
): Promise<FullJournalRecord> {
  const { referenceId = `JRN-${Date.now()}`, description, entryType, entries } = request;

  if (!entries || entries.length < 2) {
    throw new AppError(
      Errors.INVALID_INPUT,
      'Double-entry journal posting requires at least 2 entries (debit & credit)',
      400
    );
  }

  // Calculate totals
  let totalDebits: AmountMinor = 0;
  let totalCredits: AmountMinor = 0;

  for (const entry of entries) {
    if (entry.amount <= 0) {
      throw new AppError(
        Errors.INVALID_INPUT,
        `Entry amount must be greater than zero. Received: ${entry.amount}`,
        400
      );
    }
    if (entry.entryDirection === 'DEBIT') {
      totalDebits += entry.amount;
    } else if (entry.entryDirection === 'CREDIT') {
      totalCredits += entry.amount;
    } else {
      throw new AppError(
        Errors.INVALID_INPUT,
        `Invalid entry direction: ${entry.entryDirection}. Must be DEBIT or CREDIT`,
        400
      );
    }
  }

  if (totalDebits !== totalCredits) {
    logger.error('Unbalanced journal entry attempt blocked', {
      totalDebits,
      totalCredits,
      referenceId,
    });
    throw new AppError(
      'UNBALANCED_JOURNAL',
      `Double-entry principle violated: Total DEBIT (${totalDebits}) does not equal Total CREDIT (${totalCredits})`,
      400
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert Journal Entry Header
    const journalRes = await client.query(
      `INSERT INTO journal_entries (reference_id, description, entry_type)
       VALUES ($1, $2, $3)
       RETURNING id, reference_id AS "referenceId", description, entry_type AS "entryType", created_at AS "createdAt"`,
      [referenceId, description, entryType]
    );
    const journal: JournalEntry = journalRes.rows[0];

    // 2. Insert Ledger Entries
    const ledgerRecords: LedgerEntry[] = [];
    for (const entry of entries) {
      const ledgerRes = await client.query(
        `INSERT INTO ledger_entries (journal_entry_id, account_number, entry_direction, amount)
         VALUES ($1, $2, $3, $4)
         RETURNING id, journal_entry_id AS "journalEntryId", account_number AS "accountNumber", entry_direction AS "entryDirection", amount, created_at AS "createdAt"`,
        [journal.id, entry.accountNumber, entry.entryDirection, entry.amount]
      );
      ledgerRecords.push(ledgerRes.rows[0]);
    }

    await client.query('COMMIT');
    logger.info('Successfully posted double-entry journal', {
      journalId: journal.id,
      referenceId,
      entryType,
      totalAmount: totalDebits,
    });

    // 3. Post-Transaction Account Balance Synchronization
    syncAccountBalances(entries).catch((err) => {
      logger.error('Post-journal balance sync warning (non-blocking)', { err: err.message });
    });

    return {
      journal,
      entries: ledgerRecords,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to post journal entry, transaction rolled back', { err, referenceId });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Synchronizes customer account balances with account-service after journal posting
 */
async function syncAccountBalances(
  entries: PostJournalRequest['entries']
) {
  for (const entry of entries) {
    // Ignore system cash reserve
    if (entry.accountNumber === config.cashReserveAccount) continue;

    // For Customer Liability Account:
    // CREDIT increases balance (+)
    // DEBIT decreases balance (-)
    const delta = entry.entryDirection === 'CREDIT' ? entry.amount : -entry.amount;

    try {
      await axios.patch(
        `http://localhost:3003/api/v1/accounts/by-number/${entry.accountNumber}/balance`,
        { delta }
      );
    } catch (err: any) {
      logger.warn(`Could not sync balance to account-service for account ${entry.accountNumber}`, {
        message: err.message,
      });
    }
  }
}
