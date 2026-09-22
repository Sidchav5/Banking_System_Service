import axios from 'axios';
import { pool, query } from '../db';
import { config } from '../config';
import { AppError, createLogger } from '@bankflow/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Payment Saga Orchestrator
//
// Implements the NPCI-inspired inter-bank payment state machine:
//
//   INITIATED
//     └─► DEBITED           (source account debited via ledger-service)
//           └─► SENT_TO_NETWORK   (forwarded to payment-network simulator)
//                 ├─► CREDITED        (external bank credited successfully)
//                 │     └─► COMPLETED ✅
//                 ├─► CREDIT_FAILED   (external bank rejected)
//                 │     └─► REVERSAL_PENDING → REVERSED ✅
//                 └─► TIMEOUT          (network timed out)
//                           └─► REVERSAL_PENDING → REVERSED ✅
//
// Compensation:
//   When credit fails or times out → post a reversal journal to ledger-service
//   (swap DEBIT/CREDIT entries) to return funds to the source account.
// ─────────────────────────────────────────────────────────────────────────────

const logger = createLogger('payment-saga');

export type PaymentStatus =
  | 'INITIATED'
  | 'DEBITED'
  | 'SENT_TO_NETWORK'
  | 'CREDITED'
  | 'COMPLETED'
  | 'CREDIT_FAILED'
  | 'TIMEOUT'
  | 'REVERSAL_PENDING'
  | 'REVERSED'
  | 'FAILED';

export interface PaymentRecord {
  id: string;
  paymentNumber: string;
  idempotencyKey?: string;
  sourceAccountNumber: string;
  sourceUserId: string;
  sourceBankCode: string;
  destinationAccountNumber: string;
  destinationBankCode: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  description?: string;
  paymentNetworkReference?: string;
  creditId?: string;
  failureReason?: string;
  reversalJournalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InitiatePaymentInput {
  sourceAccountNumber: string;
  sourceUserId: string;
  destinationAccountNumber: string;
  destinationBankCode: string;
  amount: number;  // in minor units (paise)
  currency?: string;
  description?: string;
  idempotencyKey?: string;
  simulateFailure?: string; // failure simulation header to pass through
  authToken?: string;
}

// ─── Helper: Update payment status + append event ─────────────────────────────

async function transitionStatus(
  client: any,
  paymentId: string,
  fromStatus: string | null,
  toStatus: string,
  eventType: string,
  detail?: string
) {
  await client.query(
    `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
    [toStatus, paymentId]
  );
  await client.query(
    `INSERT INTO payment_events (payment_id, from_status, to_status, event_type, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [paymentId, fromStatus, toStatus, eventType, detail ?? null]
  );
  logger.info(`Payment ${paymentId}: ${fromStatus} → ${toStatus}`, { eventType, detail });
}

// ─── Main Saga Entry Point ─────────────────────────────────────────────────────

export async function executePaymentSaga(
  input: InitiatePaymentInput,
  payment: PaymentRecord
): Promise<PaymentRecord> {
  const paymentId = payment.id;
  const client = await pool.connect();

  try {
    // ── Step 1: Debit Source Account via ledger-service ──────────────────────
    await client.query('BEGIN');
    await transitionStatus(client, paymentId, 'INITIATED', 'DEBITED', 'DEBIT_INITIATED', 'Debiting source account via ledger');
    await client.query('COMMIT');

    logger.info('Saga Step 1: Debiting source account', {
      paymentId,
      sourceAccount: input.sourceAccountNumber,
      amount: input.amount,
    });

    // Post DEBIT journal to ledger-service
    // For inter-bank: DEBIT customer's account, CREDIT a "nostro" / transit account
    const debitRef = `PAY-DEBIT-${payment.paymentNumber}`;
    try {
      await axios.post(
        `${config.ledgerServiceUrl}/journals`,
        {
          referenceId: debitRef,
          description: `Inter-bank payment debit: ${input.description ?? payment.paymentNumber}`,
          entryType: 'INTERBANK_PAYMENT',
          entries: [
            {
              accountNumber: input.sourceAccountNumber,
              entryDirection: 'DEBIT',
              amount: input.amount,
            },
            {
              // System Cash Reserve (outgoing transit)
              accountNumber: 'CASH_RESERVE_1000',
              entryDirection: 'CREDIT',
              amount: input.amount,
            },
          ],
        },
        {
          timeout: 8000,
          headers: input.authToken ? { Authorization: `Bearer ${input.authToken}` } : {},
        }
      );
    } catch (debitErr: any) {
      // Debit failed → abort, no funds moved
      const reason = debitErr.response?.data?.error?.message ?? debitErr.message ?? 'Debit failed';
      const client2 = await pool.connect();
      try {
        await client2.query('BEGIN');
        await transitionStatus(client2, paymentId, 'DEBITED', 'FAILED', 'DEBIT_FAILED', reason);
        await client2.query('COMMIT');
      } finally {
        client2.release();
      }
      throw new AppError(`Payment debit failed: ${reason}`, 422, 'DEBIT_FAILED');
    }

    // ── Step 2: Send to Payment Network ──────────────────────────────────────
    const client3 = await pool.connect();
    try {
      await client3.query('BEGIN');
      await transitionStatus(client3, paymentId, 'DEBITED', 'SENT_TO_NETWORK', 'SENT_TO_NETWORK', 'Forwarding to payment-network');
      await client3.query('COMMIT');
    } finally {
      client3.release();
    }

    logger.info('Saga Step 2: Forwarding to payment-network', {
      paymentId,
      destinationBank: input.destinationBankCode,
      simulateFailure: input.simulateFailure,
    });

    let networkResult: any = null;
    let creditError: { code: string; message: string } | null = null;
    let timedOut = false;

    try {
      const networkRes = await axios.post(
        `${config.paymentNetworkUrl}/route`,
        {
          paymentReference: payment.paymentNumber,
          sourceAccountNumber: input.sourceAccountNumber,
          sourceBankCode: 'BANKFLOW',
          destinationAccountNumber: input.destinationAccountNumber,
          destinationBankCode: input.destinationBankCode,
          amountMinor: input.amount,
          currency: input.currency ?? 'INR',
          description: input.description,
        },
        {
          timeout: config.networkTimeoutMs,
          headers: {
            'Content-Type': 'application/json',
            ...(input.simulateFailure ? { 'X-Simulate-Failure': input.simulateFailure } : {}),
          },
        }
      );

      networkResult = networkRes.data.data;
    } catch (netErr: any) {
      if (netErr.code === 'ECONNABORTED' || netErr.message?.includes('timeout')) {
        timedOut = true;
        creditError = { code: 'TIMEOUT', message: 'Payment network request timed out' };
      } else {
        creditError = {
          code: netErr.response?.data?.error?.code ?? 'CREDIT_FAILED',
          message: netErr.response?.data?.error?.message ?? netErr.message ?? 'Credit failed at external bank',
        };
      }
    }

    // ── Step 3a: SUCCESS — Credit confirmed ──────────────────────────────────
    if (networkResult && !creditError) {
      // Store network reference + credit ID
      await query(
        `UPDATE payments
         SET payment_network_reference = $1,
             credit_id = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [networkResult.networkReference, networkResult.creditId, paymentId]
      );

      const client4 = await pool.connect();
      try {
        await client4.query('BEGIN');
        await transitionStatus(client4, paymentId, 'SENT_TO_NETWORK', 'CREDITED', 'CREDIT_SUCCEEDED', `CreditID: ${networkResult.creditId}`);
        await transitionStatus(client4, paymentId, 'CREDITED', 'COMPLETED', 'PAYMENT_COMPLETED', 'Payment completed successfully');
        await client4.query('COMMIT');
      } finally {
        client4.release();
      }

      logger.info('Saga COMPLETED successfully', { paymentId, networkRef: networkResult.networkReference });

      const finalRow = await query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
      return mapRow(finalRow.rows[0]);
    }

    // ── Step 3b: FAILURE — Trigger Saga Compensation ─────────────────────────
    const failureStatus: PaymentStatus = timedOut ? 'TIMEOUT' : 'CREDIT_FAILED';
    const failureReason = creditError?.message ?? 'Unknown failure';

    const client5 = await pool.connect();
    try {
      await client5.query('BEGIN');
      await transitionStatus(client5, paymentId, 'SENT_TO_NETWORK', failureStatus, failureStatus, failureReason);
      await client5.query(
        `UPDATE payments SET failure_reason = $1, updated_at = NOW() WHERE id = $2`,
        [failureReason, paymentId]
      );
      await transitionStatus(client5, paymentId, failureStatus, 'REVERSAL_PENDING', 'REVERSAL_INITIATED', 'Saga compensation triggered');
      await client5.query('COMMIT');
    } finally {
      client5.release();
    }

    logger.warn('Saga compensation triggered', { paymentId, failureStatus, failureReason });

    // ── Step 4: Compensation — Reverse the debit ─────────────────────────────
    try {
      const reversalRef = `PAY-REVERSAL-${payment.paymentNumber}`;
      const reversalRes = await axios.post(
        `${config.ledgerServiceUrl}/journals`,
        {
          referenceId: reversalRef,
          description: `Reversal of inter-bank payment ${payment.paymentNumber} — ${failureReason}`,
          entryType: 'PAYMENT_REVERSAL',
          entries: [
            {
              // Re-credit the customer (undo the debit)
              accountNumber: input.sourceAccountNumber,
              entryDirection: 'CREDIT',
              amount: input.amount,
            },
            {
              // Debit the nostro/transit account (undo the credit)
              accountNumber: 'CASH_RESERVE_1000',
              entryDirection: 'DEBIT',
              amount: input.amount,
            },
          ],
        },
        {
          timeout: 8000,
          headers: input.authToken ? { Authorization: `Bearer ${input.authToken}` } : {},
        }
      );

      const reversalJournalId = reversalRes.data?.data?.journal?.id ?? null;

      await query(
        `UPDATE payments SET reversal_journal_id = $1, updated_at = NOW() WHERE id = $2`,
        [reversalJournalId, paymentId]
      );

      const client6 = await pool.connect();
      try {
        await client6.query('BEGIN');
        await transitionStatus(client6, paymentId, 'REVERSAL_PENDING', 'REVERSED', 'REVERSAL_COMPLETED', `Reversal journal: ${reversalJournalId}`);
        await client6.query('COMMIT');
      } finally {
        client6.release();
      }

      logger.info('Saga reversal COMPLETED — funds returned to customer', {
        paymentId,
        reversalJournalId,
        sourceAccount: input.sourceAccountNumber,
      });
    } catch (reversalErr: any) {
      // Reversal itself failed — needs manual intervention
      const reversalErrMsg = reversalErr.response?.data?.error?.message ?? reversalErr.message ?? 'Reversal failed';
      logger.error('Saga reversal FAILED — MANUAL INTERVENTION REQUIRED', {
        paymentId,
        reversalErrMsg,
      });
      // Keep payment in REVERSAL_PENDING for manual resolution
    }

    const finalRow = await query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
    return mapRow(finalRow.rows[0]);
  } finally {
    client.release();
  }
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

export function mapRow(row: any): PaymentRecord {
  return {
    id: row.id,
    paymentNumber: row.payment_number,
    idempotencyKey: row.idempotency_key,
    sourceAccountNumber: row.source_account_number,
    sourceUserId: row.source_user_id,
    sourceBankCode: row.source_bank_code,
    destinationAccountNumber: row.destination_account_number,
    destinationBankCode: row.destination_bank_code,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    description: row.description,
    paymentNetworkReference: row.payment_network_reference,
    creditId: row.credit_id,
    failureReason: row.failure_reason,
    reversalJournalId: row.reversal_journal_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
