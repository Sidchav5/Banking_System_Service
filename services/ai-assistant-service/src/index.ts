import 'dotenv/config';
import express from 'express';
import { config } from './config';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('ai-assistant-service');
const app = express();

app.use(express.json());

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: config.serviceName,
    version: '1.0.0',
    phase: 'Day 11 — Ingestion Pipeline Complete',
    timestamp: new Date().toISOString(),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  logger.info(`${config.serviceName} listening on port ${config.port}`, {
    port: config.port,
    phase: 'Day 11',
  });
});
