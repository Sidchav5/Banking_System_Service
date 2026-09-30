import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { config } from './config';
import { pool, query } from './db';
import { executePaymentSaga, mapRow } from './saga/paymentSaga';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
  AppError,
  Errors,
  authenticateToken,
  requireRole,
} from '@bankflow/shared';

// ─────────────────────────────────────────────────────────────────────────────
// payment-service
//
// Inter-bank payment lifecycle management with Saga orchestration.
//
// Endpoints:
//   POST   /payments              — Initiate inter-bank payment (idempotent)
//   GET    /payments              — List user's payments
//   GET    /payments/:id          — Get payment details + event history
//   POST   /payments/:id/reverse  — Staff: manually trigger reversal
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = 'payment-service';
const PORT = config.port;
const VERSION = '1.0.0';

const logger = createLogger(SERVICE_NAME);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// ─── Bootstrap DB Schema ──────────────────────────────────────────────────────

async function bootstrapSchema() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await pool.query(sql);
      logger.info('payment-service schema bootstrapped');
    }
  } catch (err: any) {
    logger.warn('Schema bootstrap skipped (in-memory fallback active)', { error: err.message });
  }
}

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
    res.json({ status: 'ready', service: SERVICE_NAME, checks: { database: 'ok' } });
  } catch {
    res.status(503).json({ status: 'not_ready', service: SERVICE_NAME, checks: { database: 'fail' } });
  }
});

// ─── POST /payments — Initiate Inter-Bank Payment ────────────────────────────

app.post('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const {
      sourceAccountNumber,
      destinationAccountNumber,
      destinationBankCode,
      amount,
      currency = 'INR',
      description,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!sourceAccountNumber || !destinationAccountNumber || !destinationBankCode || !amount) {
      throw new AppError(
        'sourceAccountNumber, destinationAccountNumber, destinationBankCode, and amount are required',
        400,
        'VALIDATION_ERROR'
      );
    }

    if (typeof amount !== 'number' || amount <= 0) {
      throw new AppError('amount must be a positive integer (in paise/minor units)', 400, 'VALIDATION_ERROR');
    }

    if (destinationBankCode === 'BANKFLOW') {
      throw new AppError(
        'Use the internal transfer endpoint for same-bank transfers. This endpoint is for inter-bank only.',
        400,
        'INVALID_OPERATION'
      );
    }

    // ── Idempotency Check ────────────────────────────────────────────────────
    const idempotencyKey =
      (req.headers['x-idempotency-key'] as string) ||
      (req.headers['idempotency-key'] as string) ||
      (req.body.idempotencyKey as string) ||
      null;

    if (idempotencyKey) {
      const existing = await query(
        `SELECT * FROM payments WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (existing.rows.length > 0) {
        logger.info('Idempotency hit — returning existing payment', { idempotencyKey });
        res.status(200).json({
          success: true,
          data: mapRow(existing.rows[0]),
          idempotent: true,
          requestId: (req as any).id ?? 'unknown',
        });
        return;
      }
    }

    // ── Validate source account belongs to user ──────────────────────────────
    try {
      const accRes = await axios.get(
        `${config.accountServiceUrl}/by-number/${sourceAccountNumber}`,
        {
          headers: { Authorization: req.headers.authorization },
          timeout: 5000,
        }
      );
      const account = accRes.data.data;
      if (account.userId !== userId) {
        throw new AppError('You do not own this source account', 403, 'FORBIDDEN');
      }
      if (account.status !== 'ACTIVE') {
        throw new AppError(`Source account is ${account.status} and cannot be used for payments`, 400, 'ACCOUNT_NOT_ACTIVE');
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError('Source account validation failed', 502, 'ACCOUNT_VALIDATION_ERROR');
    }

    // ── Validate destination bank exists ─────────────────────────────────────
    try {
      await axios.get(`${config.bankServiceUrl}/route/${destinationBankCode}`, { timeout: 5000 });
    } catch {
      throw new AppError(`Unknown destination bank: ${destinationBankCode}`, 400, 'INVALID_BANK_CODE');
    }

    // ── Create Payment Record (INITIATED) ────────────────────────────────────
    const paymentNumber = `PAY-${Date.now()}-${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;
    const paymentRes = await query(
      `INSERT INTO payments (
         payment_number, idempotency_key,
         source_account_number, source_user_id, source_bank_code,
         destination_account_number, destination_bank_code,
         amount, currency, description, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'INITIATED')
       RETURNING *`,
      [
        paymentNumber,
        idempotencyKey,
        sourceAccountNumber,
        userId,
        'BANKFLOW',
        destinationAccountNumber,
        destinationBankCode,
        amount,
        currency,
        description,
      ]
    );

    const payment = mapRow(paymentRes.rows[0]);

    // Insert initial event
    await query(
      `INSERT INTO payment_events (payment_id, from_status, to_status, event_type, detail)
       VALUES ($1, NULL, 'INITIATED', 'PAYMENT_INITIATED', 'Payment created')`,
      [payment.id]
    );

    // ── Execute Saga Asynchronously (but await for response) ─────────────────
    const simulateFailure =
      (req.headers['x-simulate-failure'] as string) || undefined;

    const authHeader = req.headers.authorization;
    const authToken = authHeader ? authHeader.replace('Bearer ', '') : undefined;

    logger.info('Starting payment saga', {
      paymentId: payment.id,
      paymentNumber,
      destinationBankCode,
      amount,
      simulateFailure: simulateFailure ?? 'none',
    });

    // Run saga — we return the result inline (synchronous saga for demo clarity)
    const finalPayment = await executePaymentSaga(
      {
        sourceAccountNumber,
        sourceUserId: userId,
        destinationAccountNumber,
        destinationBankCode,
        amount,
        currency,
        description,
        idempotencyKey: idempotencyKey ?? undefined,
        simulateFailure,
        authToken,
      },
      payment
    );

    // ── Fire notification for terminal saga states ─────────────────────────
    const terminalStates = ['COMPLETED', 'REVERSED', 'FAILED'];
    if (terminalStates.includes(finalPayment.status)) {
      const notifTypeMap: Record<string, string> = {
        COMPLETED: 'PAYMENT_COMPLETED',
        REVERSED: 'PAYMENT_REVERSED',
        FAILED: 'PAYMENT_FAILED',
      };
      const notifTitleMap: Record<string, string> = {
        COMPLETED: '✅ Payment Successful',
        REVERSED: '↩️ Payment Reversed',
        FAILED: '❌ Payment Failed',
      };
      const amountRupees = (finalPayment.amount / 100).toFixed(2);
      const notifMsgMap: Record<string, string> = {
        COMPLETED: `₹${amountRupees} sent to ${destinationAccountNumber} (${destinationBankCode}) — Ref: ${finalPayment.paymentNumber}`,
        REVERSED: `₹${amountRupees} transfer to ${destinationAccountNumber} was reversed. Amount refunded to your account.`,
        FAILED: `₹${amountRupees} transfer to ${destinationAccountNumber} failed. No amount was deducted.`,
      };
      axios
        .post(
          `${config.notificationServiceUrl}/notifications`,
          {
            userId,
            type: notifTypeMap[finalPayment.status],
            title: notifTitleMap[finalPayment.status],
            message: notifMsgMap[finalPayment.status],
            metadata: {
              paymentId: finalPayment.id,
              paymentNumber: finalPayment.paymentNumber,
              amount: finalPayment.amount,
              status: finalPayment.status,
            },
          },
          { timeout: 3000 }
        )
        .catch(() => {
          // Notification is best-effort; never block payment response
        });
    }

    const statusCode = finalPayment.status === 'COMPLETED' ? 201 : 202;

    res.status(statusCode).json({
      success: true,
      data: finalPayment,
      requestId: (req as any).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /payments — List user's payments ────────────────────────────────────

app.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const { status, limit = '20', offset = '0' } = req.query;

    let queryStr = `
      SELECT * FROM payments
      WHERE source_user_id = $1
    `;
    const params: any[] = [userId];

    if (status) {
      params.push(status);
      queryStr += ` AND status = $${params.length}`;
    }

    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const result = await query(queryStr, params);

    res.json({
      success: true,
      data: result.rows.map(mapRow),
      requestId: (req as any).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /payments/:id — Get payment + event history ─────────────────────────

app.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const paymentResult = await query(
      `SELECT * FROM payments WHERE payment_number = $1 OR (id::text = $1 AND $1 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')`,
      [id]
    );

    if (paymentResult.rows.length === 0) {
      throw Errors.NotFound(`Payment ${id}`);
    }

    const payment = mapRow(paymentResult.rows[0]);

    // Fetch event history (Saga audit trail)
    const eventsResult = await query(
      `SELECT id, from_status AS "fromStatus", to_status AS "toStatus",
              event_type AS "eventType", detail, occurred_at AS "occurredAt"
       FROM payment_events
       WHERE payment_id = $1
       ORDER BY occurred_at ASC`,
      [payment.id]
    );

    res.json({
      success: true,
      data: {
        ...payment,
        events: eventsResult.rows,
      },
      requestId: (req as any).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /payments/:id/reverse — Staff-triggered manual reversal ─────────────

app.post(
  '/:id/reverse',
  authenticateToken,
  requireRole('ADMIN', 'EMPLOYEE'),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const paymentResult = await query(
        `SELECT * FROM payments WHERE id = $1 OR payment_number = $1`,
        [id]
      );

      if (paymentResult.rows.length === 0) {
        throw Errors.NotFound(`Payment ${id}`);
      }

      const payment = mapRow(paymentResult.rows[0]);

      if (!['COMPLETED', 'CREDIT_FAILED', 'TIMEOUT'].includes(payment.status)) {
        throw new AppError(
          `Payment ${id} is in status ${payment.status} and cannot be manually reversed`,
          400,
          'INVALID_STATUS'
        );
      }

      if (payment.status === 'COMPLETED' || payment.reversalJournalId == null) {
        // Post reversal journal
        const reversalRef = `PAY-MANUAL-REVERSAL-${payment.paymentNumber}`;
        const reversalRes = await axios.post(
          `${config.ledgerServiceUrl}/journals`,
          {
            referenceId: reversalRef,
            description: `Manual staff reversal of payment ${payment.paymentNumber}`,
            entryType: 'PAYMENT_REVERSAL',
            entries: [
              {
                accountNumber: payment.sourceAccountNumber,
                entryDirection: 'CREDIT',
                amount: payment.amount,
              },
              {
                accountNumber: 'CASH_RESERVE_1000',
                entryDirection: 'DEBIT',
                amount: payment.amount,
              },
            ],
          },
          {
            timeout: 8000,
            headers: { Authorization: req.headers.authorization ?? '' },
          }
        );

        const reversalJournalId = reversalRes.data?.data?.journal?.id ?? null;

        await query(
          `UPDATE payments SET status = 'REVERSED', reversal_journal_id = $1, updated_at = NOW() WHERE id = $2`,
          [reversalJournalId, payment.id]
        );

        await query(
          `INSERT INTO payment_events (payment_id, from_status, to_status, event_type, detail)
           VALUES ($1, $2, 'REVERSED', 'MANUAL_REVERSAL', 'Staff-triggered manual reversal')`,
          [payment.id, payment.status]
        );

        logger.info('Manual reversal completed by staff', { paymentId: payment.id, reversalJournalId });
      }

      const updatedPayment = await query(`SELECT * FROM payments WHERE id = $1`, [payment.id]);

      res.json({
        success: true,
        data: mapRow(updatedPayment.rows[0]),
        requestId: (req as any).id ?? 'unknown',
      });
    } catch (err) {
      next(err);
    }
  }
);

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

async function start() {
  await bootstrapSchema();
  app.listen(PORT, () => {
    logger.info(`🚀 ${SERVICE_NAME} running on port :${PORT}`, {
      port: PORT,
      environment: config.nodeEnv,
      networkTimeout: `${config.networkTimeoutMs}ms`,
    });
  });
}

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down payment-service');
  pool.end();
  process.exit(0);
});

void start();
