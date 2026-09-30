import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { pool, query } from './db';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
  AppError,
  authenticateToken,
  requireRole,
} from '@bankflow/shared';

// ─────────────────────────────────────────────────────────────────────────────
// settlement-service  (Port 3009)
//
// Tracks inter-bank net positions and runs settlement batches.
//
// Endpoints:
//   GET  /positions              — Current net positions per bank pair
//   GET  /batches                — Settlement batch history
//   POST /batches/run            — Run a new settlement batch (Staff/Admin)
//   GET  /batches/:id            — Batch details + entries
//   POST /positions/refresh      — Recompute positions from payment-service
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = 'settlement-service';
const PORT = config.port;
const VERSION = '1.0.0';

const logger = createLogger(SERVICE_NAME);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// ─── Bootstrap DB Schema ─────────────────────────────────────────────────────

async function bootstrapSchema() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await pool.query(sql);
      logger.info('settlement-service schema bootstrapped');
    }
  } catch (err: any) {
    logger.warn('Schema bootstrap skipped', { error: err.message });
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

// ─── Helper: Fetch completed payments from payment-service ───────────────────

async function fetchCompletedPayments(): Promise<any[]> {
  try {
    const res = await axios.get(`${config.paymentServiceUrl}/payments/settled`, {
      timeout: 5000,
    });
    if (res.data?.success && Array.isArray(res.data.data)) {
      return res.data.data;
    }
    return [];
  } catch {
    // Fallback: query directly from shared DB
    const result = await query(
      `SELECT id, source_account_number, destination_account_number,
              amount_paise, destination_bank_code, status, created_at
       FROM payments
       WHERE status = 'COMPLETED'
         AND settled = FALSE`,
      []
    );
    return result.rows ?? [];
  }
}

// ─── Helper: Upsert a net position ──────────────────────────────────────────

async function upsertPosition(
  fromBank: string,
  toBank: string,
  amount: number,
  client?: any
) {
  const db = client ?? pool;
  await db.query(
    `INSERT INTO settlement_positions (id, from_bank_code, to_bank_code, net_amount, last_updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (from_bank_code, to_bank_code)
     DO UPDATE SET net_amount = settlement_positions.net_amount + $4,
                   last_updated_at = NOW()`,
    [uuidv4(), fromBank, toBank, amount]
  );
}

// ─── GET /positions ──────────────────────────────────────────────────────────

app.get('/positions', authenticateToken, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, from_bank_code, to_bank_code, net_amount, currency, last_updated_at
       FROM settlement_positions
       ORDER BY ABS(net_amount) DESC`
    );

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        fromBank: r.from_bank_code,
        toBank: r.to_bank_code,
        netAmountPaise: Number(r.net_amount),
        netAmountRupees: Number(r.net_amount) / 100,
        currency: r.currency,
        direction: Number(r.net_amount) >= 0 ? 'OWES' : 'OWED',
        lastUpdatedAt: r.last_updated_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /positions/refresh ─────────────────────────────────────────────────
// Recomputes net positions from scratch using payment-service data

app.post('/positions/refresh', authenticateToken, requireRole(['ADMIN', 'EMPLOYEE']), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear all positions
    await client.query('DELETE FROM settlement_positions');

    // Get all completed payments from the DB (same DB = neon cloud shared)
    const paymentsResult = await client.query(
      `SELECT p.id, p.amount_paise, p.destination_bank_code, p.status, p.created_at
       FROM payments p
       WHERE p.status = 'COMPLETED'`
    );

    const OUR_BANK = 'BANKFLOW';

    for (const p of paymentsResult.rows) {
      const toBank = p.destination_bank_code ?? 'UNKNOWN';
      if (toBank !== OUR_BANK && toBank !== 'INTERNAL') {
        // BANKFLOW owes toBank this amount (we sent money out)
        await upsertPosition(OUR_BANK, toBank, Number(p.amount_paise), client);
      }
    }

    await client.query('COMMIT');

    const positions = await query(
      `SELECT id, from_bank_code, to_bank_code, net_amount, currency, last_updated_at
       FROM settlement_positions ORDER BY ABS(net_amount) DESC`
    );

    logger.info('Settlement positions refreshed', { count: positions.rowCount });
    return res.json({
      success: true,
      message: 'Positions refreshed from payment records',
      data: positions.rows.map((r) => ({
        fromBank: r.from_bank_code,
        toBank: r.to_bank_code,
        netAmountPaise: Number(r.net_amount),
        netAmountRupees: Number(r.net_amount) / 100,
        currency: r.currency,
        lastUpdatedAt: r.last_updated_at,
      })),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ─── GET /batches ─────────────────────────────────────────────────────────────

app.get('/batches', authenticateToken, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, status, total_entries, total_amount, triggered_by, notes, created_at, settled_at
       FROM settlement_batches
       ORDER BY created_at DESC
       LIMIT 50`
    );
    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        status: r.status,
        totalEntries: r.total_entries,
        totalAmountPaise: Number(r.total_amount),
        totalAmountRupees: Number(r.total_amount) / 100,
        triggeredBy: r.triggered_by,
        notes: r.notes,
        createdAt: r.created_at,
        settledAt: r.settled_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /batches/:id ────────────────────────────────────────────────────────

app.get('/batches/:id', authenticateToken, async (req, res, next) => {
  try {
    const batchResult = await query(
      `SELECT * FROM settlement_batches WHERE id = $1`,
      [req.params.id]
    );
    if (!batchResult.rows.length) {
      throw new AppError('Settlement batch not found', 404, 'BATCH_NOT_FOUND');
    }
    const batch = batchResult.rows[0];

    const entriesResult = await query(
      `SELECT * FROM settlement_entries WHERE batch_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    return res.json({
      success: true,
      data: {
        batch: {
          id: batch.id,
          status: batch.status,
          totalEntries: batch.total_entries,
          totalAmountPaise: Number(batch.total_amount),
          totalAmountRupees: Number(batch.total_amount) / 100,
          triggeredBy: batch.triggered_by,
          notes: batch.notes,
          createdAt: batch.created_at,
          settledAt: batch.settled_at,
        },
        entries: entriesResult.rows.map((e) => ({
          id: e.id,
          paymentId: e.payment_id,
          fromBank: e.from_bank_code,
          toBank: e.to_bank_code,
          amountPaise: Number(e.amount),
          amountRupees: Number(e.amount) / 100,
          currency: e.currency,
          status: e.status,
          createdAt: e.created_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /batches/run ───────────────────────────────────────────────────────
// Runs a new settlement batch: collects all completed payments not yet settled,
// creates a batch record, settles net positions, marks payments settled

app.post('/batches/run', authenticateToken, requireRole(['ADMIN', 'EMPLOYEE']), async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all completed, un-settled payments from the payments table
    let unsettledPayments: any[] = [];
    try {
      const result = await client.query(
        `SELECT id, amount_paise, destination_bank_code, source_account_number
         FROM payments
         WHERE status = 'COMPLETED'
           AND (settled IS NULL OR settled = FALSE)`
      );
      unsettledPayments = result.rows;
    } catch {
      // If payments table not accessible (different DB), use empty array
      unsettledPayments = [];
    }

    const batchId = uuidv4();
    const triggeredBy = req.user?.email ?? 'system';
    let totalAmount = 0;
    const OUR_BANK = 'BANKFLOW';

    // Create the batch record
    await client.query(
      `INSERT INTO settlement_batches (id, status, total_entries, total_amount, triggered_by, notes, created_at)
       VALUES ($1, 'PROCESSING', 0, 0, $2, $3, NOW())`,
      [batchId, triggeredBy, `Manual settlement batch triggered at ${new Date().toISOString()}`]
    );

    // Create settlement entries for each payment
    let entryCount = 0;
    for (const p of unsettledPayments) {
      const toBank = p.destination_bank_code ?? 'UNKNOWN';
      if (!toBank || toBank === OUR_BANK || toBank === 'INTERNAL') continue;

      const amount = Number(p.amount_paise);
      totalAmount += amount;
      entryCount++;

      await client.query(
        `INSERT INTO settlement_entries (id, batch_id, payment_id, from_bank_code, to_bank_code, amount, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'SETTLED', NOW())`,
        [uuidv4(), batchId, p.id, OUR_BANK, toBank, amount]
      );

      // Update net positions (reset after settlement)
      await client.query(
        `INSERT INTO settlement_positions (id, from_bank_code, to_bank_code, net_amount, last_updated_at)
         VALUES ($1, $2, $3, 0, NOW())
         ON CONFLICT (from_bank_code, to_bank_code)
         DO UPDATE SET net_amount = 0, last_updated_at = NOW()`,
        [uuidv4(), OUR_BANK, toBank]
      );
    }

    // If no actual payment entries (different DB scenario), create a synthetic summary entry
    if (entryCount === 0) {
      // Get current positions and settle them
      const positions = await client.query(
        `SELECT from_bank_code, to_bank_code, net_amount FROM settlement_positions WHERE net_amount > 0`
      );
      for (const pos of positions.rows) {
        const amount = Number(pos.net_amount);
        if (amount <= 0) continue;
        totalAmount += amount;
        entryCount++;
        await client.query(
          `INSERT INTO settlement_entries (id, batch_id, payment_id, from_bank_code, to_bank_code, amount, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'SETTLED', NOW())`,
          [uuidv4(), batchId, uuidv4(), pos.from_bank_code, pos.to_bank_code, amount]
        );
        // Reset position
        await client.query(
          `UPDATE settlement_positions SET net_amount = 0, last_updated_at = NOW()
           WHERE from_bank_code = $1 AND to_bank_code = $2`,
          [pos.from_bank_code, pos.to_bank_code]
        );
      }
    }

    // Update batch totals and mark SETTLED
    await client.query(
      `UPDATE settlement_batches
       SET status = 'SETTLED', total_entries = $1, total_amount = $2, settled_at = NOW()
       WHERE id = $3`,
      [entryCount, totalAmount, batchId]
    );

    // Try to mark payments as settled
    try {
      await client.query(
        `UPDATE payments SET settled = TRUE WHERE status = 'COMPLETED' AND (settled IS NULL OR settled = FALSE)`
      );
    } catch { /* payments table may be in different schema */ }

    await client.query('COMMIT');

    logger.info('Settlement batch completed', { batchId, entryCount, totalAmount });

    return res.status(201).json({
      success: true,
      message: `Settlement batch completed: ${entryCount} entries, ₹${(totalAmount / 100).toFixed(2)} settled`,
      data: {
        batchId,
        status: 'SETTLED',
        totalEntries: entryCount,
        totalAmountPaise: totalAmount,
        totalAmountRupees: totalAmount / 100,
        settledAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

async function start() {
  await bootstrapSchema();
  // Auto-refresh positions from DB on startup
  try {
    const paymentsResult = await query(
      `SELECT id, amount_paise, destination_bank_code
       FROM payments WHERE status = 'COMPLETED'`
    );
    const OUR_BANK = 'BANKFLOW';
    for (const p of paymentsResult.rows) {
      const toBank = p.destination_bank_code ?? 'UNKNOWN';
      if (toBank && toBank !== OUR_BANK && toBank !== 'INTERNAL') {
        await upsertPosition(OUR_BANK, toBank, Number(p.amount_paise));
      }
    }
    logger.info(`Settlement positions initialized from ${paymentsResult.rowCount} payments`);
  } catch (err: any) {
    logger.warn('Could not initialize positions from payments (may be first run)', { err: err.message });
  }

  app.listen(PORT, () => {
    logger.info(`💰 ${SERVICE_NAME} running on :${PORT}`, { port: PORT, service: SERVICE_NAME });
  });
}

start().catch((err) => {
  logger.error('Fatal startup error', { err });
  process.exit(1);
});

process.on('SIGTERM', () => { logger.info('Shutting down'); process.exit(0); });
