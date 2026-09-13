import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../index';
import { config } from '../config';

// ────────────────────────────────────────────────────────────────────────────
// Rate Limiters
//
// We use Redis-backed rate limiting so limits are shared across all gateway
// instances (important if you run multiple gateway replicas).
//
// Two limiters:
//   1. globalLimiter   — applied to ALL routes (100 req/min per IP)
//   2. authLimiter     — stricter, applied to /api/v1/auth/* (10 req/15min)
//
// Redis key format: rate-limit:{routeKey}:{ip}
// ────────────────────────────────────────────────────────────────────────────

/** General API rate limiter — 100 requests per minute per IP */
export const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: 'draft-7',   // X-RateLimit-* headers
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down and try again.',
      },
    });
  },
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(...args as [string, ...string[]]) as any,
    prefix: 'rl:global:',
  }),
});

/** Auth rate limiter — 10 attempts per 15 minutes per IP (brute force protection) */
export const authLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMaxRequests,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
      },
    });
  },
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(...args as [string, ...string[]]) as any,
    prefix: 'rl:auth:',
  }),
});
