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
// notification-service  (Port 3011)
//
// In-app notification store. Created by payment-service on saga terminal states.
// Users can list and mark notifications as read.
//
// Endpoints:
//   GET  /notifications          — List for authenticated user (paginated)
//   GET  /notifications/unread-count — Unread count for bell badge
//   POST /notifications/mark-read    — Mark one or all as read
//   POST /notifications          — Create (internal use / service-to-service)
//   DELETE /notifications/:id    — Delete a notification
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = 'notification-service';
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
      logger.info('notification-service schema bootstrapped');
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

// ─── GET /notifications ──────────────────────────────────────────────────────

app.get('/notifications', authenticateToken, async (req: any, res, next) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;
    if (!userId) throw new AppError('User ID not found in token', 401, 'UNAUTHORIZED');

    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));
    const offset = (page - 1) * limit;
    const unreadOnly = req.query.unread === 'true';

    const whereClause = unreadOnly
      ? 'WHERE user_id = $1 AND is_read = FALSE'
      : 'WHERE user_id = $1';

    const countResult = await query(
      `SELECT COUNT(*) FROM notifications ${whereClause}`,
      [userId]
    );

    const result = await query(
      `SELECT id, type, title, message, metadata, is_read, created_at, read_at
       FROM notifications
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return res.json({
      success: true,
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /notifications/unread-count ────────────────────────────────────────

app.get('/notifications/unread-count', authenticateToken, async (req: any, res, next) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;
    if (!userId) throw new AppError('User ID not found in token', 401, 'UNAUTHORIZED');

    const result = await query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );
    return res.json({
      success: true,
      data: { unreadCount: parseInt(result.rows[0].count, 10) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /notifications/mark-read ──────────────────────────────────────────

app.post('/notifications/mark-read', authenticateToken, async (req: any, res, next) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;
    if (!userId) throw new AppError('User ID not found in token', 401, 'UNAUTHORIZED');

    const { notificationId, all } = req.body;

    if (all === true) {
      await query(
        `UPDATE notifications SET is_read = TRUE, read_at = NOW()
         WHERE user_id = $1 AND is_read = FALSE`,
        [userId]
      );
      return res.json({ success: true, message: 'All notifications marked as read' });
    }

    if (!notificationId) {
      throw new AppError('Provide notificationId or all=true', 400, 'INVALID_REQUEST');
    }

    const result = await query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, userId]
    );
    if (!result.rows.length) {
      throw new AppError('Notification not found', 404, 'NOT_FOUND');
    }
    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /notifications — Internal: Create a notification ──────────────────
// Called by payment-service and other services (no auth required — internal only)

app.post('/notifications', async (req, res, next) => {
  try {
    const { userId, type, title, message, metadata } = req.body;
    if (!userId || !type || !title || !message) {
      throw new AppError('userId, type, title, message are required', 400, 'INVALID_REQUEST');
    }

    const validTypes = [
      'PAYMENT_COMPLETED', 'PAYMENT_REVERSED', 'PAYMENT_FAILED',
      'DEPOSIT', 'WITHDRAWAL', 'ACCOUNT_FROZEN', 'ACCOUNT_UNFROZEN', 'SYSTEM',
    ];
    if (!validTypes.includes(type)) {
      throw new AppError(`Invalid type. Use: ${validTypes.join(', ')}`, 400, 'INVALID_TYPE');
    }

    const result = await query(
      `INSERT INTO notifications (id, user_id, type, title, message, metadata, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW())
       RETURNING *`,
      [uuidv4(), userId, type, title, message, JSON.stringify(metadata ?? {})]
    );

    logger.info('Notification created', { userId, type, title });
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /notifications/:id ───────────────────────────────────────────────

app.delete('/notifications/:id', authenticateToken, async (req: any, res, next) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;
    const result = await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, userId]
    );
    if (!result.rows.length) {
      throw new AppError('Notification not found', 404, 'NOT_FOUND');
    }
    return res.json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── Admin: GET /admin/notifications — All notifications (Staff/Admin view) ──

app.get('/admin/notifications', authenticateToken, requireRole(['ADMIN', 'EMPLOYEE', 'AUDITOR']), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT id, user_id, type, title, message, is_read, created_at
       FROM notifications
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await query(`SELECT COUNT(*) FROM notifications`);

    return res.json({
      success: true,
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
      data: result.rows,
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
    logger.info(`🔔 ${SERVICE_NAME} running on :${PORT}`, { port: PORT, service: SERVICE_NAME });
  });
}

start().catch((err) => {
  logger.error('Fatal startup error', { err });
  process.exit(1);
});

process.on('SIGTERM', () => { logger.info('Shutting down'); process.exit(0); });
