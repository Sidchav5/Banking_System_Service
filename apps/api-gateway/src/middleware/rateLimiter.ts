import rateLimit from 'express-rate-limit';
import { config } from '../config';

// ────────────────────────────────────────────────────────────────────────────
// Resilient Rate Limiters
//
// Uses in-memory store by default for high reliability.
// Does not crash if Redis is unavailable during local development.
// ────────────────────────────────────────────────────────────────────────────

/** General API rate limiter — 100 requests per minute per IP */
export const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: 'draft-7',
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
});
