import 'dotenv/config';
import express from 'express';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
} from '@bankflow/shared';

// ─────────────────────────────────────────────────────────────────────────────
// settlement-service — Stub
// This stub will be replaced with full implementation on the appropriate day.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = 'settlement-service';
const PORT = parseInt(process.env.PORT ?? '3009', 10);
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

app.get('/ready', (_req, res) => {
  res.json({
    status: 'ready',
    service: SERVICE_NAME,
    checks: { stub: 'ok' },
  });
});

// ─── Stub Route ─────────────────────────────────────────────────────────────

app.all('*', (_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: `${SERVICE_NAME} is not yet implemented`,
    },
  });
});

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`🔧 ${SERVICE_NAME} (stub) running on :${PORT}`, { port: PORT, service: SERVICE_NAME });
});

process.on('SIGTERM', () => { logger.info('Shutting down'); process.exit(0); });
