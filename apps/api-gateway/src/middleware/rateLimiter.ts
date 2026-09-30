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

/** Payment rate limiter — payment initiations per minute per IP */
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.rateLimit.paymentMaxRequests,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Key by IP; in prod would key by userId from JWT
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.replace('Bearer ', '').split('.')[1] ?? req.ip ?? 'unknown';
    return token.substring(0, 20); // Use partial token payload as key
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'PAYMENT_RATE_LIMITED',
        message: 'Too many payment requests. Maximum 5 payments per minute allowed.',
      },
    });
  },
});

