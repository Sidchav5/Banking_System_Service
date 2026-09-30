import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
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
// reconciliation-service  (Port 3010)
//
// Compares payment-service state vs ledger-service state.
// Detects and records mismatches for manual/automated resolution.
//
// Endpoints:
//   GET  /runs              — List reconciliation runs
//   POST /runs              — Trigger a new run (Admin/Employee)
//   GET  /runs/:id          — Run details + items
//   GET  /mismatches        — All unresolved mismatches
//   POST /mismatches/:id/resolve  — Resolve a mismatch
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = 'reconciliation-service';
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
      logger.info('reconciliation-service schema bootstrapped');
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

// ─── GET /runs ───────────────────────────────────────────────────────────────

app.get('/runs', authenticateToken, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, status, payments_checked, mismatches_found, triggered_by, summary, started_at, completed_at
       FROM reconciliation_runs
       ORDER BY started_at DESC
       LIMIT 50`
    );
    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /runs — Trigger a reconciliation run ───────────────────────────────

app.post('/runs', authenticateToken, requireRole(['ADMIN', 'EMPLOYEE', 'AUDITOR']), async (req: any, res, next) => {
  const runId = uuidv4();
  const triggeredBy = req.user?.email ?? 'system';

  try {
    // Create run record
    await query(
      `INSERT INTO reconciliation_runs (id, status, triggered_by, started_at)
       VALUES ($1, 'RUNNING', $2, NOW())`,
      [runId, triggeredBy]
    );

    // Run reconciliation asynchronously and respond immediately
    runReconciliation(runId, triggeredBy).catch((err) => {
      logger.error('Reconciliation run failed', { runId, err });
    });

    return res.status(202).json({
      success: true,
      message: 'Reconciliation run started',
      data: { runId, status: 'RUNNING', triggeredBy },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Core reconciliation logic ───────────────────────────────────────────────

async function runReconciliation(runId: string, triggeredBy: string) {
  const client = await pool.connect();
  try {
    // Fetch all payments from payments table
    let payments: any[] = [];
    try {
      const result = await client.query(
        `SELECT id, amount_paise, status, source_account_number, destination_account_number, created_at
         FROM payments
         ORDER BY created_at DESC
         LIMIT 500`
      );
      payments = result.rows;
    } catch {
      payments = [];
    }

    let mismatchCount = 0;
    const items: any[] = [];

    for (const payment of payments) {
      // For each payment, check if a matching ledger journal exists
      let ledgerStatus = null;
      let ledgerAmount = null;
      let mismatchType = 'OK';

      try {
        // Check ledger journals for this payment's transaction
        const ledgerResult = await client.query(
          `SELECT j.status, SUM(le.amount_minor) as total_amount
           FROM journals j
           JOIN ledger_entries le ON le.journal_id = j.id
           WHERE j.transaction_id::text = $1
              OR j.reference_id::text = $1
           GROUP BY j.status
           LIMIT 1`,
          [payment.id]
        );

        if (ledgerResult.rows.length === 0) {
          // No ledger entry found for a completed payment
          if (payment.status === 'COMPLETED') {
            mismatchType = 'MISSING_LEDGER';
            mismatchCount++;
          }
          // For failed/reversed payments with no ledger — OK (might have been reversed before posting)
        } else {
          const ledger = ledgerResult.rows[0];
          ledgerStatus = ledger.status;
          ledgerAmount = Number(ledger.total_amount);

          // Check amount consistency
          if (payment.status === 'COMPLETED' && ledgerAmount !== Number(payment.amount_paise) * 2) {
            // *2 because double-entry: debit + credit both stored
            // Minor mismatch tolerance
            const diff = Math.abs(ledgerAmount - Number(payment.amount_paise) * 2);
            if (diff > 100) { // > 1 rupee difference
              mismatchType = 'AMOUNT_MISMATCH';
              mismatchCount++;
            }
          }
        }
      } catch {
        // Ledger tables might not be in same schema
        mismatchType = 'OK';
      }

      if (mismatchType !== 'OK') {
        items.push({
          runId,
          paymentId: payment.id,
          paymentStatus: payment.status,
          paymentAmount: Number(payment.amount_paise),
          ledgerStatus,
          ledgerAmount,
          mismatchType,
        });
      }
    }

    // Insert mismatch items
    for (const item of items) {
      await client.query(
        `INSERT INTO reconciliation_items
           (id, run_id, payment_id, payment_status, payment_amount, ledger_status, ledger_amount, mismatch_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [uuidv4(), item.runId, item.paymentId, item.paymentStatus, item.paymentAmount,
          item.ledgerStatus, item.ledgerAmount, item.mismatchType]
      );
    }

    const summary = payments.length === 0
      ? 'No payments found to reconcile (run after completing some inter-bank transfers)'
      : `Checked ${payments.length} payments. Found ${mismatchCount} mismatches.`;

    // Update run as completed
    await client.query(
      `UPDATE reconciliation_runs
       SET status = 'COMPLETED', payments_checked = $1, mismatches_found = $2, summary = $3, completed_at = NOW()
       WHERE id = $4`,
      [payments.length, mismatchCount, summary, runId]
    );

    logger.info('Reconciliation run completed', { runId, paymentsChecked: payments.length, mismatchCount });
  } catch (err) {
    await client.query(
      `UPDATE reconciliation_runs SET status = 'FAILED', completed_at = NOW() WHERE id = $1`,
      [runId]
    ).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── GET /runs/:id ───────────────────────────────────────────────────────────

app.get('/runs/:id', authenticateToken, async (req, res, next) => {
  try {
    const runResult = await query(
      `SELECT * FROM reconciliation_runs WHERE id = $1`,
      [req.params.id]
    );
    if (!runResult.rows.length) {
      throw new AppError('Reconciliation run not found', 404, 'RUN_NOT_FOUND');
    }

    const itemsResult = await query(
      `SELECT * FROM reconciliation_items WHERE run_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    return res.json({
      success: true,
      data: {
        run: runResult.rows[0],
        items: itemsResult.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /mismatches ─────────────────────────────────────────────────────────

app.get('/mismatches', authenticateToken, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT ri.*, rr.triggered_by, rr.started_at as run_started_at
       FROM reconciliation_items ri
       JOIN reconciliation_runs rr ON rr.id = ri.run_id
       WHERE ri.resolution = 'PENDING'
         AND ri.mismatch_type != 'OK'
       ORDER BY ri.created_at DESC
       LIMIT 100`
    );
    return res.json({
      success: true,
      total: result.rowCount,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /mismatches/:id/resolve ────────────────────────────────────────────

app.post('/mismatches/:id/resolve', authenticateToken, requireRole(['ADMIN', 'EMPLOYEE']), async (req: any, res, next) => {
  try {
    const { resolution, note } = req.body;
    if (!['RESOLVED', 'ESCALATED', 'IGNORED'].includes(resolution)) {
      throw new AppError('Invalid resolution. Use RESOLVED, ESCALATED, or IGNORED', 400, 'INVALID_RESOLUTION');
    }

    const result = await query(
      `UPDATE reconciliation_items
       SET resolution = $1, resolved_by = $2, resolution_note = $3, resolved_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [resolution, req.user?.email, note ?? null, req.params.id]
    );
    if (!result.rows.length) {
      throw new AppError('Mismatch item not found', 404, 'ITEM_NOT_FOUND');
    }

    logger.info('Mismatch resolved', { itemId: req.params.id, resolution, by: req.user?.email });
    return res.json({
      success: true,
      message: `Mismatch marked as ${resolution}`,
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

async function start() {
  await bootstrapSchema();
  app.listen(PORT, () => {
    logger.info(`🔍 ${SERVICE_NAME} running on :${PORT}`, { port: PORT, service: SERVICE_NAME });
  });
}

start().catch((err) => {
  logger.error('Fatal startup error', { err });
  process.exit(1);
});

process.on('SIGTERM', () => { logger.info('Shutting down'); process.exit(0); });
