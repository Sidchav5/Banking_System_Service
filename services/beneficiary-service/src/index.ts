import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
  AppError,
} from '@bankflow/shared';

import { config } from './config';
import { pool, query } from './db';

// ─────────────────────────────────────────────────────────────────────────────
// beneficiary-service — Full Implementation
//
// Responsibilities:
//   ✓ Beneficiary CRUD (Add, List, Details, Update, Delete)
//   ✓ Account Name Verification Lookup simulation (Internal & External Banks)
//   ✓ Cooling Period Enforcer (30-min window with ₹25,000 transfer limit)
//   ✓ Auto-transition from COOLING → ACTIVE on timer expiration
//   ✓ Developer Bypass endpoint for testing
// ─────────────────────────────────────────────────────────────────────────────

const logger = createLogger(config.serviceName);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// ─── Database Migration on Startup ───────────────────────────────────────────

async function initDb() {
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schemaSql);
    logger.info('Database schema initialized for beneficiary-service');
  } catch (err) {
    logger.error('Failed to initialize beneficiary-service database schema', { err });
  }
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────

interface UserPayload {
  userId: string;
  email: string;
  role: string;
}

function authMiddleware(req: express.Request, _res: express.Response, next: express.NextFunction) {
  // 1. Check Gateway-injected headers
  const headerUserId = req.headers['x-user-id'] as string;
  const headerUserRole = req.headers['x-user-role'] as string;

  if (headerUserId) {
    (req as any).user = {
      userId: headerUserId,
      role: headerUserRole ?? 'CUSTOMER',
    };
    return next();
  }

  // 2. Fallback to JWT Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication token required', 401, 'UNAUTHORIZED'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    (req as any).user = {
      userId: decoded.userId ?? decoded.sub,
      email: decoded.email,
      role: decoded.role ?? 'CUSTOMER',
    };
    next();
  } catch {
    return next(new AppError('Invalid or expired authentication token', 401, 'INVALID_TOKEN'));
  }
}

// ─── Health & Readiness Endpoints ───────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: config.serviceName,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.get('/ready', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ready', service: config.serviceName, db: 'ok' });
  } catch (err: any) {
    res.status(503).json({ status: 'not_ready', service: config.serviceName, error: err.message });
  }
});

// ─── Helper: Auto-Update Expired Cooling Period ─────────────────────────────

async function refreshCoolingStatus(userId: string) {
  // Update all beneficiaries whose cooling_ends_at <= NOW() from 'COOLING' to 'ACTIVE'
  await query(
    `UPDATE beneficiaries
     SET status = 'ACTIVE', updated_at = NOW()
     WHERE user_id = $1 AND status = 'COOLING' AND cooling_ends_at <= NOW()`,
    [userId]
  );
}

// ─── Beneficiary Routes ──────────────────────────────────────────────────────

// 1. POST /verify — Account Name Lookup Simulation
app.post('/verify', authMiddleware, async (req, res, next) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber) {
      throw new AppError('Account number is required for verification', 400, 'INVALID_INPUT');
    }

    const code = (bankCode ?? 'BANKFLOW').toUpperCase();
    let verifiedName = 'Verified Account Holder';

    if (code === 'BANKFLOW') {
      try {
        const accRes = await axios.get(
          `${config.accountServiceUrl}/accounts/by-number/${accountNumber}`,
          { headers: { Authorization: req.headers.authorization } }
        );
        if (accRes.data?.success && accRes.data?.data) {
          verifiedName = `Account ${accountNumber.slice(-4)}`;
        }
      } catch {
        // Fallback default
        verifiedName = 'BankFlow Verified Customer';
      }
    } else {
      // External bank simulator account lookup
      const names: Record<string, string> = {
        EXT100000000001: 'Rahul Verma (HDFC)',
        EXT200000000001: 'Ananya Sharma (ICICI)',
        EXT300000000001: 'Priya Patel (AXIS)',
        EXT400000000001: 'Amit Kumar (SBI)',
      };

      verifiedName = names[accountNumber] ?? `${code} Verified Beneficiary`;
    }

    res.json({
      success: true,
      data: {
        verified: true,
        accountNumber,
        bankCode: code,
        beneficiaryName: verifiedName,
        verifiedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. POST / — Add Beneficiary
app.post('/', authMiddleware, async (req, res, next) => {
  try {
    const user = (req as any).user as UserPayload;
    const { nickname, accountNumber, bankCode, beneficiaryName, ifscCode } = req.body;

    if (!nickname || !accountNumber || !bankCode) {
      throw new AppError('Nickname, account number, and bank code are required', 400, 'INVALID_INPUT');
    }

    const cleanBankCode = bankCode.trim().toUpperCase();
    const cleanAccNum = accountNumber.trim();
    const name = beneficiaryName?.trim() || `Beneficiary (${cleanAccNum.slice(-4)})`;
    const ifsc = ifscCode?.trim() || `${cleanBankCode.slice(0, 4)}0001234`;

    // Calculate cooling period end time (e.g. 30 minutes from now)
    const coolingMinutes = config.coolingPeriodMinutes;
    const coolingEndsAt = new Date(Date.now() + coolingMinutes * 60 * 1000);

    const result = await query(
      `INSERT INTO beneficiaries (
        user_id, nickname, beneficiary_name, account_number, bank_code, ifsc_code,
        status, cooling_ends_at, max_transfer_limit
       ) VALUES ($1, $2, $3, $4, $5, $6, 'COOLING', $7, $8)
       ON CONFLICT (user_id, account_number, bank_code)
       DO UPDATE SET
         nickname = EXCLUDED.nickname,
         beneficiary_name = EXCLUDED.beneficiary_name,
         ifsc_code = EXCLUDED.ifsc_code,
         status = 'COOLING',
         cooling_ends_at = EXCLUDED.cooling_ends_at,
         updated_at = NOW()
       RETURNING *`,
      [
        user.userId,
        nickname.trim(),
        name,
        cleanAccNum,
        cleanBankCode,
        ifsc,
        coolingEndsAt,
        config.coolingTransferLimitPaise,
      ]
    );

    const b = result.rows[0];
    logger.info('Beneficiary created', {
      beneficiaryId: b.id,
      userId: user.userId,
      bankCode: cleanBankCode,
      status: b.status,
    });

    res.status(201).json({
      success: true,
      data: mapBeneficiaryRow(b),
    });
  } catch (err: any) {
    if (err.code === '23505') {
      return next(new AppError('Beneficiary with this account and bank already exists', 409, 'DUPLICATE_BENEFICIARY'));
    }
    next(err);
  }
});

// 3. GET / — List Beneficiaries
app.get('/', authMiddleware, async (req, res, next) => {
  try {
    const user = (req as any).user as UserPayload;

    // Refresh cooling status before listing
    await refreshCoolingStatus(user.userId);

    const result = await query(
      `SELECT * FROM beneficiaries
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [user.userId]
    );

    const list = result.rows.map(mapBeneficiaryRow);
    res.json({
      success: true,
      data: list,
    });
  } catch (err) {
    next(err);
  }
});

// 4. GET /:id — Get Single Beneficiary
app.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const user = (req as any).user as UserPayload;
    await refreshCoolingStatus(user.userId);

    const result = await query(
      `SELECT * FROM beneficiaries WHERE id = $1 AND user_id = $2`,
      [req.params.id, user.userId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Beneficiary not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: mapBeneficiaryRow(result.rows[0]),
    });
  } catch (err) {
    next(err);
  }
});

// 5. PATCH /:id — Update Beneficiary
app.patch('/:id', authMiddleware, async (req, res, next) => {
  try {
    const user = (req as any).user as UserPayload;
    const { nickname, status } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (nickname) {
      updates.push(`nickname = $${idx++}`);
      values.push(nickname.trim());
    }

    if (status && ['ACTIVE', 'DISABLED', 'COOLING'].includes(status)) {
      updates.push(`status = $${idx++}`);
      values.push(status);
    }

    if (updates.length === 0) {
      throw new AppError('No valid fields provided to update', 400, 'INVALID_INPUT');
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id, user.userId);

    const sql = `UPDATE beneficiaries
                 SET ${updates.join(', ')}
                 WHERE id = $${idx++} AND user_id = $${idx}
                 RETURNING *`;

    const result = await query(sql, values);

    if (result.rowCount === 0) {
      throw new AppError('Beneficiary not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: mapBeneficiaryRow(result.rows[0]),
    });
  } catch (err) {
    next(err);
  }
});

// 6. DELETE /:id — Delete Beneficiary
app.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const user = (req as any).user as UserPayload;
    const result = await query(
      `DELETE FROM beneficiaries WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, user.userId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Beneficiary not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      message: 'Beneficiary deleted successfully',
      data: { id: req.params.id },
    });
  } catch (err) {
    next(err);
  }
});

// 7. POST /:id/bypass-cooling — Developer Bypass Endpoint
app.post('/:id/bypass-cooling', authMiddleware, async (req, res, next) => {
  try {
    const user = (req as any).user as UserPayload;
    const result = await query(
      `UPDATE beneficiaries
       SET status = 'ACTIVE', cooling_ends_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, user.userId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Beneficiary not found', 404, 'NOT_FOUND');
    }

    logger.info('Beneficiary cooling period bypassed (dev action)', {
      beneficiaryId: req.params.id,
      userId: user.userId,
    });

    res.json({
      success: true,
      message: 'Cooling period bypassed successfully',
      data: mapBeneficiaryRow(result.rows[0]),
    });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

// ─── Row Mapper ───────────────────────────────────────────────────────────────

function mapBeneficiaryRow(row: any) {
  const isCoolingExpired = new Date(row.cooling_ends_at) <= new Date();
  const effectiveStatus = row.status === 'COOLING' && isCoolingExpired ? 'ACTIVE' : row.status;

  return {
    id: row.id,
    userId: row.user_id,
    nickname: row.nickname,
    beneficiaryName: row.beneficiary_name,
    accountNumber: row.account_number,
    bankCode: row.bank_code,
    ifscCode: row.ifsc_code,
    status: effectiveStatus,
    coolingEndsAt: row.cooling_ends_at,
    maxTransferLimit: Number(row.max_transfer_limit),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Start Server ─────────────────────────────────────────────────────────────

async function start() {
  await initDb();
  app.listen(config.port, () => {
    logger.info(`🚀 ${config.serviceName} listening on port ${config.port}`, {
      port: config.port,
      service: config.serviceName,
    });
  });
}

start().catch((err) => {
  logger.error('Failed to start beneficiary-service', { err });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully');
  process.exit(0);
});
