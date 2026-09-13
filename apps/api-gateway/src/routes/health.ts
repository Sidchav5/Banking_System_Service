import { Router, Request, Response } from 'express';
import { HealthResponse, ReadyResponse } from '@bankflow/shared';
import { redisClient } from '../index';

// ────────────────────────────────────────────────────────────────────────────
// Health Routes
//
// GET /health  → Liveness probe (is the process running?)
//               Returns 200 if the service is alive.
//
// GET /ready   → Readiness probe (is the service ready to handle traffic?)
//               Returns 200 only when all dependencies are healthy.
//               Returns 503 if any critical dependency is down.
//
// These are used by Docker health checks and future Kubernetes probes.
// ────────────────────────────────────────────────────────────────────────────

export const healthRouter = Router();

const startTime = Date.now();
const SERVICE_NAME = 'api-gateway';
const VERSION = process.env.npm_package_version ?? '1.0.0';

/** GET /health — liveness probe */
healthRouter.get('/health', (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: 'ok',
    service: SERVICE_NAME,
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  res.status(200).json(response);
});

/** GET /ready — readiness probe (checks all dependencies) */
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'fail' | 'skip'> = {};
  let allOk = true;

  // Check Redis connectivity
  try {
    await redisClient.ping();
    checks['redis'] = 'ok';
  } catch {
    checks['redis'] = 'fail';
    allOk = false;
  }

  const response: ReadyResponse = {
    status: allOk ? 'ready' : 'not_ready',
    service: SERVICE_NAME,
    checks,
  };

  res.status(allOk ? 200 : 503).json(response);
});
