import 'dotenv/config';
import express from 'express';
import { config } from './config';
import { pool, query } from './db';
import { idempotencyMiddleware } from './middleware/idempotency';
import { processInternalTransfer } from './services/transferOrchestrator';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
  AppError,
  Errors,
  authenticateToken,
} from '@bankflow/shared';
import axios from 'axios';

const SERVICE_NAME = 'transaction-service';
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

// ─── Internal Transfer Endpoint (Idempotent) ──────────────────────────────────

app.post(
  '/transfers/internal',
  authenticateToken,
  idempotencyMiddleware,
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const idempotencyKey = (req.headers['x-idempotency-key'] ||
        req.headers['idempotency-key']) as string | undefined;
      const authHeader = req.headers.authorization;
      const token = authHeader ? authHeader.replace('Bearer ', '') : undefined;

      const transaction = await processInternalTransfer(
        req.body,
        userId,
        idempotencyKey,
        token
      );

      res.status(201).json({
        success: true,
        data: transaction,
        requestId: (req as any).id ?? 'unknown',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── List Transactions Endpoint ─────────────────────────────────────────────

app.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    logger.debug(`Fetching transactions for user ${userId}`);

    // 1. Get user's accounts to filter relevant transactions
    let userAccountNumbers: string[] = [];
    try {
      const accountsRes = await axios.get(`${config.accountServiceUrl}`, {
        headers: { Authorization: req.headers.authorization },
      });
      if (accountsRes.data.success) {
        userAccountNumbers = accountsRes.data.data.map(
          (acc: any) => acc.accountNumber
        );
      }
    } catch {
      userAccountNumbers = [];
    }

    if (userAccountNumbers.length === 0) {
      res.json({
        success: true,
        data: [],
        requestId: (req as any).id ?? 'unknown',
      });
      return;
    }

    // 2. Query transactions matching user's accounts
    const result = await query(
      `SELECT
        id,
        transaction_number AS "transactionNumber",
        source_account_number AS "sourceAccountNumber",
        destination_account_number AS "destinationAccountNumber",
        amount,
        currency,
        transaction_type AS "transactionType",
        status,
        idempotency_key AS "idempotencyKey",
        description,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
       FROM transactions
       WHERE source_account_number = ANY($1) OR destination_account_number = ANY($1)
       ORDER BY created_at DESC`,
      [userAccountNumbers]
    );

    res.json({
      success: true,
      data: result.rows,
      requestId: (req as any).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get Single Transaction Details ──────────────────────────────────────────

app.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT
        id,
        transaction_number AS "transactionNumber",
        source_account_number AS "sourceAccountNumber",
        destination_account_number AS "destinationAccountNumber",
        amount,
        currency,
        transaction_type AS "transactionType",
        status,
        idempotency_key AS "idempotencyKey",
        description,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
       FROM transactions
       WHERE id = $1 OR transaction_number = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw Errors.NotFound(`Transaction with ID/number ${id}`);
    }

    res.json({
      success: true,
      data: result.rows[0],
      requestId: (req as any).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

// ─── Reverse Transaction Endpoint ────────────────────────────────────────────

app.post('/:id/reverse', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;

    const result = await query(
      `SELECT * FROM transactions WHERE id = $1 OR transaction_number = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw Errors.NotFound(`Transaction with ID/number ${id}`);
    }

    const txn = result.rows[0];

    if (txn.status !== 'COMPLETED') {
      throw new AppError(
        `Transaction ${id} is in status ${txn.status} and cannot be reversed`,
        400,
        'INVALID_STATUS'
      );
    }

    // Post reversal journal to ledger (Swap debit and credit)
    const refId = `REV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const journalPayload = {
      referenceId: refId,
      description: `Reversal of transaction ${txn.transaction_number}`,
      entryType: 'TRANSFER',
      entries: [
        {
          accountNumber: txn.destination_account_number,
          entryDirection: 'DEBIT',
          amount: Number(txn.amount),
        },
        {
          accountNumber: txn.source_account_number,
          entryDirection: 'CREDIT',
          amount: Number(txn.amount),
        },
      ],
    };

    await axios.post(`${config.ledgerServiceUrl}/journals`, journalPayload, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });

    // Update status to REVERSED
    await query(
      `UPDATE transactions SET status = 'REVERSED', updated_at = NOW() WHERE id = $1`,
      [txn.id]
    );

    logger.info(`Reversed transaction ${txn.transaction_number}`, { txnId: txn.id });

    res.json({
      success: true,
      data: {
        transactionId: txn.id,
        transactionNumber: txn.transaction_number,
        status: 'REVERSED',
      },
      requestId: (req as any).id ?? 'unknown',
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
  logger.info('SIGTERM received, closing transaction-service pool');
  pool.end();
  process.exit(0);
});
