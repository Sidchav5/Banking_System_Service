import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Redis } from 'ioredis';

import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
} from '@bankflow/shared';

import { config } from './config';
import { healthRouter } from './routes/health';
import { proxyRouter } from './routes/proxy';
import { globalLimiter, authLimiter } from './middleware/rateLimiter';

// ────────────────────────────────────────────────────────────────────────────
// BankFlow — API Gateway
//
// Single entry point for all frontend requests.
// Responsibilities:
//   ✓ CORS
//   ✓ Security headers (Helmet)
//   ✓ Request ID generation
//   ✓ Correlation ID propagation
//   ✓ Structured HTTP access logging (Morgan → Winston)
//   ✓ Rate limiting (Redis-backed)
//   ✓ Route proxying to downstream services
//   ✓ Health / readiness probes
//   ✓ Global error handling
// ────────────────────────────────────────────────────────────────────────────

const logger = createLogger('api-gateway');

// ─── Redis Client (shared across the gateway) ───────────────────────────────
export const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
  enableOfflineQueue: false,
});

redisClient.on('connect', () => logger.info('Redis connected'));
redisClient.on('error', () => {
  // Mute background reconnection log spam when Redis is offline in local dev
});

// ─── Express App ────────────────────────────────────────────────────────────
const app = express();

// ─── Security Headers ────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl) in dev
      if (!origin && !config.isProd) return callback(null, true);
      if (!origin || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Correlation-ID',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Request-ID', 'X-Correlation-ID', 'X-RateLimit-Remaining'],
  }),
);

// ─── Request ID + Correlation ID ────────────────────────────────────────────
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// ─── HTTP Access Logging ─────────────────────────────────────────────────────
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: {
      write: (message: string) =>
        logger.info('HTTP access', { type: 'http_access', message: message.trim() }),
    },
    skip: (req) => req.url === '/health', // Skip health check noise
  }),
);

// ─── Body Parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Rate Limiting ───────────────────────────────────────────────────────────
app.use(globalLimiter);
app.use('/api/v1/auth', authLimiter); // Stricter limit for auth routes

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/', healthRouter);    // /health, /ready
app.use('/', proxyRouter);     // /api/v1/**

// 404 handler — no route matched
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    },
  });
});

// ─── Global Error Handler (must be last) ────────────────────────────────────
app.use(errorHandler);

// ─── Startup ─────────────────────────────────────────────────────────────────
async function start() {
  try {
    // Attempt Redis connection gracefully
    await redisClient.connect().catch((err) => {
      logger.warn('Redis unavailable — running API Gateway in standalone mode', { error: err.message });
    });

    app.listen(config.port, () => {
      logger.info(
        `🚀 BankFlow API Gateway running on http://localhost:${config.port}`,
        {
          port: config.port,
          environment: config.nodeEnv,
          services: Object.keys(config.services),
        },
      );
    });
  } catch (err) {
    logger.error('Failed to start API Gateway', { err });
    process.exit(1);
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
  await redisClient.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down');
  await redisClient.quit();
  process.exit(0);
});

void start();
