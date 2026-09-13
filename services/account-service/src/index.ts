import 'dotenv/config';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
  authenticateToken,
  Account,
  OpenAccountRequest,
  UpdateLimitsRequest,
  AccountStatusUpdateRequest,
  AccountType,
  AccountStatus,
} from '@bankflow/shared';

import { config } from './config';
import { pool, query } from './db';
import { generateAccountNumber } from './utils/accountNumber';

const SERVICE_NAME = 'account-service';
const logger = createLogger(SERVICE_NAME);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// In-Memory store fallback for standalone testing
const inMemoryAccounts = new Map<string, Account>();

// ─── Health Endpoints ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.get('/ready', async (_req, res) => {
  let dbStatus = 'ok';
  try {
    await query('SELECT 1');
  } catch {
    dbStatus = 'degraded_in_memory';
  }

  res.json({
    status: 'ready',
    service: SERVICE_NAME,
    checks: { database: dbStatus },
  });
});

// ─── Account Routes ──────────────────────────────────────────────────────────

/**
 * POST /
 * Open a new bank account for the authenticated user.
 */
app.post('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const { accountType = 'SAVINGS', initialDeposit = 0 } = req.body as OpenAccountRequest;

    if (!['SAVINGS', 'CURRENT', 'FIXED_DEPOSIT'].includes(accountType)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid account type' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    const accountId = uuidv4();
    const accountNumber = generateAccountNumber();
    const now = new Date().toISOString();
    const depositPaise = Math.max(0, Math.floor(initialDeposit));

    const newAccount: Account = {
      id: accountId,
      accountNumber,
      userId,
      accountType,
      currency: 'INR',
      balance: depositPaise,
      availableBalance: depositPaise,
      status: 'ACTIVE',
      dailyTransferLimit: config.defaultDailyLimitMinor,
      singleTransactionLimit: config.defaultSingleLimitMinor,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await query(
        `INSERT INTO accounts (id, account_number, user_id, account_type, currency, balance, available_balance, status, daily_transfer_limit, single_transaction_limit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          accountId,
          accountNumber,
          userId,
          accountType,
          'INR',
          depositPaise,
          depositPaise,
          'ACTIVE',
          config.defaultDailyLimitMinor,
          config.defaultSingleLimitMinor,
        ]
      );
    } catch {
      inMemoryAccounts.set(accountId, newAccount);
    }

    logger.info(`Opened new ${accountType} account: ${accountNumber}`, { userId, accountId });

    res.status(201).json({
      success: true,
      data: newAccount,
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /
 * List all bank accounts owned by the authenticated user.
 */
app.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    let userAccounts: Account[] = [];

    try {
      const result = await query('SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      userAccounts = result.rows.map((row) => ({
        id: row.id,
        accountNumber: row.account_number,
        userId: row.user_id,
        accountType: row.account_type as AccountType,
        currency: row.currency,
        balance: parseInt(row.balance, 10),
        availableBalance: parseInt(row.available_balance, 10),
        status: row.status as AccountStatus,
        dailyTransferLimit: parseInt(row.daily_transfer_limit, 10),
        singleTransactionLimit: parseInt(row.single_transaction_limit, 10),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      }));
    } catch {
      userAccounts = Array.from(inMemoryAccounts.values()).filter((acc) => acc.userId === userId);
    }

    res.json({
      success: true,
      data: userAccounts,
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /:id
 * Fetch detailed information for a specific account.
 */
app.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const accountId = req.params.id;
    const userId = req.user!.sub;
    const role = req.user!.role;

    let targetAccount: Account | null = null;

    try {
      const result = await query('SELECT * FROM accounts WHERE id = $1', [accountId]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        targetAccount = {
          id: row.id,
          accountNumber: row.account_number,
          userId: row.user_id,
          accountType: row.account_type as AccountType,
          currency: row.currency,
          balance: parseInt(row.balance, 10),
          availableBalance: parseInt(row.available_balance, 10),
          status: row.status as AccountStatus,
          dailyTransferLimit: parseInt(row.daily_transfer_limit, 10),
          singleTransactionLimit: parseInt(row.single_transaction_limit, 10),
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        };
      }
    } catch {
      targetAccount = inMemoryAccounts.get(accountId) ?? null;
    }

    if (!targetAccount) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Account not found' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    // Authorization check
    if (targetAccount.userId !== userId && !['ADMIN', 'EMPLOYEE', 'AUDITOR'].includes(role)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not authorized to access this account' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    res.json({
      success: true,
      data: targetAccount,
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /:id/status
 * Update account status (FREEZE, UNFREEZE, BLOCK, CLOSE).
 */
app.patch('/:id/status', authenticateToken, async (req, res, next) => {
  try {
    const accountId = req.params.id;
    const { status, reason } = req.body as AccountStatusUpdateRequest;

    if (!['ACTIVE', 'FROZEN', 'BLOCKED', 'CLOSED'].includes(status)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid status value' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    const now = new Date();

    try {
      await query('UPDATE accounts SET status = $1, updated_at = $2 WHERE id = $3', [status, now, accountId]);
    } catch {
      const acc = inMemoryAccounts.get(accountId);
      if (acc) {
        acc.status = status;
        acc.updatedAt = now.toISOString();
      }
    }

    logger.info(`Account ${accountId} status updated to ${status}`, { reason, updatedBy: req.user!.sub });

    res.json({
      success: true,
      data: { accountId, status, updatedBy: req.user!.sub },
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /:id/limits
 * Update account transaction limits.
 */
app.patch('/:id/limits', authenticateToken, async (req, res, next) => {
  try {
    const accountId = req.params.id;
    const { dailyTransferLimit, singleTransactionLimit } = req.body as UpdateLimitsRequest;

    const now = new Date();

    try {
      await query(
        `UPDATE accounts
         SET daily_transfer_limit = COALESCE($1, daily_transfer_limit),
             single_transaction_limit = COALESCE($2, single_transaction_limit),
             updated_at = $3
         WHERE id = $4`,
        [dailyTransferLimit, singleTransactionLimit, now, accountId]
      );
    } catch {
      const acc = inMemoryAccounts.get(accountId);
      if (acc) {
        if (dailyTransferLimit !== undefined) acc.dailyTransferLimit = dailyTransferLimit;
        if (singleTransactionLimit !== undefined) acc.singleTransactionLimit = singleTransactionLimit;
        acc.updatedAt = now.toISOString();
      }
    }

    logger.info(`Account limits updated for ${accountId}`, { dailyTransferLimit, singleTransactionLimit });

    res.json({
      success: true,
      data: { accountId, dailyTransferLimit, singleTransactionLimit },
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  logger.info(`🔧 ${SERVICE_NAME} running on :${config.port}`, { port: config.port, service: SERVICE_NAME });
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down account-service');
  await pool.end();
  process.exit(0);
});
