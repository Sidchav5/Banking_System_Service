import 'dotenv/config';
import express from 'express';
import { config } from './config';
import { pool, query } from './db';
import { postJournalEntry } from './engine/doubleEntryEngine';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
  AppError,
  Errors,
  authenticateToken,
} from '@bankflow/shared';

const SERVICE_NAME = 'ledger-service';
const PORT = config.port;
const VERSION = '1.0.0';

const logger = createLogger(SERVICE_NAME);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// ─── Health Endpoints ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.get('/ready', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({
      status: 'ready',
      service: SERVICE_NAME,
      checks: { database: 'ok' },
    });
  } catch {
    res.status(503).json({
      status: 'not_ready',
      service: SERVICE_NAME,
      checks: { database: 'fail' },
    });
  }
});

// ─── Deposit Journal Endpoint ────────────────────────────────────────────────

app.post('/journals/deposit', authenticateToken, async (req, res, next) => {
  try {
    const { accountNumber, amount, description } = req.body;
    if (!accountNumber || !amount || amount <= 0) {
      throw new AppError(
        'Valid accountNumber and positive amount (in paise) are required',
        400,
        'INVALID_INPUT'
      );
    }

    const refId = `DEP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const journalRecord = await postJournalEntry({
      referenceId: refId,
      description: description || `Cash deposit into account ${accountNumber}`,
      entryType: 'DEPOSIT',
      entries: [
        {
          accountNumber: config.cashReserveAccount,
          entryDirection: 'DEBIT',
          amount: Number(amount),
        },
        {
          accountNumber,
          entryDirection: 'CREDIT',
          amount: Number(amount),
        },
      ],
    });

    res.status(201).json({
      success: true,
      data: journalRecord,
      requestId: req.headers['x-request-id'] as string,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Withdrawal Journal Endpoint ─────────────────────────────────────────────

app.post('/journals/withdraw', authenticateToken, async (req, res, next) => {
  try {
    const { accountNumber, amount, description } = req.body;
    if (!accountNumber || !amount || amount <= 0) {
      throw new AppError(
        'Valid accountNumber and positive amount (in paise) are required',
        400,
        'INVALID_INPUT'
      );
    }

    const refId = `WTH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const journalRecord = await postJournalEntry({
      referenceId: refId,
      description: description || `Cash withdrawal from account ${accountNumber}`,
      entryType: 'WITHDRAWAL',
      entries: [
        {
          accountNumber,
          entryDirection: 'DEBIT',
          amount: Number(amount),
        },
        {
          accountNumber: config.cashReserveAccount,
          entryDirection: 'CREDIT',
          amount: Number(amount),
        },
      ],
    });

    res.status(201).json({
      success: true,
      data: journalRecord,
      requestId: req.headers['x-request-id'] as string,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Custom Double-Entry Journal Endpoint ────────────────────────────────────

app.post('/journals', authenticateToken, async (req, res, next) => {
  try {
    const journalRecord = await postJournalEntry(req.body);
    res.status(201).json({
      success: true,
      data: journalRecord,
      requestId: req.headers['x-request-id'] as string,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Query Account Ledger Entries ────────────────────────────────────────────

app.get('/journals/account/:accountNumber', authenticateToken, async (req, res, next) => {
  try {
    const { accountNumber } = req.params;
    const result = await query(
      `SELECT 
        l.id AS "ledgerEntryId",
        l.journal_entry_id AS "journalEntryId",
        l.account_number AS "accountNumber",
        l.entry_direction AS "entryDirection",
        l.amount,
        l.created_at AS "createdAt",
        j.reference_id AS "referenceId",
        j.description,
        j.entry_type AS "entryType"
       FROM ledger_entries l
       JOIN journal_entries j ON l.journal_entry_id = j.id
       WHERE l.account_number = $1
       ORDER BY l.created_at DESC`,
      [accountNumber]
    );

    res.json({
      success: true,
      data: result.rows,
      requestId: req.headers['x-request-id'] as string,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Query Detailed Journal Entry ────────────────────────────────────────────

app.get('/journals/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const journalRes = await query(
      `SELECT id, reference_id AS "referenceId", description, entry_type AS "entryType", created_at AS "createdAt"
       FROM journal_entries WHERE id = $1`,
      [id]
    );

    if (journalRes.rows.length === 0) {
      throw Errors.NotFound(`Journal entry with ID ${id}`);
    }

    const entriesRes = await query(
      `SELECT id, journal_entry_id AS "journalEntryId", account_number AS "accountNumber", entry_direction AS "entryDirection", amount, created_at AS "createdAt"
       FROM ledger_entries WHERE journal_entry_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        journal: journalRes.rows[0],
        entries: entriesRes.rows,
      },
      requestId: req.headers['x-request-id'] as string,
    });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`🚀 ${SERVICE_NAME} running on port :${PORT}`, { port: PORT });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing ledger-service pool');
  pool.end();
  process.exit(0);
});
