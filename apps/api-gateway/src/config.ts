import 'dotenv/config';

// ────────────────────────────────────────────────────────────────────────────
// API Gateway Configuration
//
// All config comes from environment variables.
// This module centralises config access — no process.env scattered around.
// ────────────────────────────────────────────────────────────────────────────

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  // Gateway
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isProd: process.env.NODE_ENV === 'production',

  // CORS
  allowedOrigins: optional('ALLOWED_ORIGINS', 'http://localhost:5173').split(','),

  // Redis (for rate limiting)
  redis: {
    host: optional('REDIS_HOST', 'localhost'),
    port: parseInt(optional('REDIS_PORT', '6379'), 10),
    password: optional('REDIS_PASSWORD', 'bankflow_redis_secret'),
  },

  // Downstream service URLs
  services: {
    auth: optional('AUTH_SERVICE_URL', 'http://localhost:3001'),
    user: optional('USER_SERVICE_URL', 'http://localhost:3002'),
    account: optional('ACCOUNT_SERVICE_URL', 'http://localhost:3003'),
    ledger: optional('LEDGER_SERVICE_URL', 'http://localhost:3004'),
    transaction: optional('TRANSACTION_SERVICE_URL', 'http://localhost:3005'),
    payment: optional('PAYMENT_SERVICE_URL', 'http://localhost:3006'),
    beneficiary: optional('BENEFICIARY_SERVICE_URL', 'http://localhost:3007'),
    bank: optional('BANK_SERVICE_URL', 'http://localhost:3008'),
    settlement: optional('SETTLEMENT_SERVICE_URL', 'http://localhost:3009'),
    reconciliation: optional('RECONCILIATION_SERVICE_URL', 'http://localhost:3010'),
    notification: optional('NOTIFICATION_SERVICE_URL', 'http://localhost:3011'),
  },

  // JWT (gateway validates access tokens before proxying)
  jwt: {
    accessSecret: optional('JWT_ACCESS_SECRET', process.env.JWT_SECRET ?? '7f3b2a9e1d8c4f6a5b0c9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a'),
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 10), // 1 minute
    maxRequests: parseInt(optional('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
    // Stricter limits for auth endpoints
    authWindowMs: parseInt(optional('AUTH_RATE_LIMIT_WINDOW_MS', '900000'), 10), // 15 min
    authMaxRequests: parseInt(optional('AUTH_RATE_LIMIT_MAX_REQUESTS', '10'), 10),
  },
} as const;

export type Config = typeof config;
