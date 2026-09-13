import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';

// ────────────────────────────────────────────────────────────────────────────
// Service Proxy Routes
//
// The API Gateway proxies requests to the appropriate microservice.
// The frontend ONLY ever talks to the gateway — never directly to services.
//
// Route mapping:
//   /api/v1/auth/**           → auth-service:3001
//   /api/v1/users/**          → user-service:3002
//   /api/v1/accounts/**       → account-service:3003
//   /api/v1/ledger/**         → ledger-service:3004
//   /api/v1/transactions/**   → transaction-service:3005
//   /api/v1/payments/**       → payment-service:3006
//   /api/v1/beneficiaries/**  → beneficiary-service:3007
//   /api/v1/banks/**          → bank-service:3008
//   /api/v1/settlement/**     → settlement-service:3009
//   /api/v1/reconciliation/** → reconciliation-service:3010
//   /api/v1/notifications/**  → notification-service:3011
// ────────────────────────────────────────────────────────────────────────────

export const proxyRouter = Router();

/** Creates a proxy middleware for a given target service */
function createServiceProxy(target: string, pathRewrite?: Record<string, string>) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error: (_err, _req, res: any) => {
        res.status(502).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Downstream service is temporarily unavailable',
          },
        });
      },
    },
  });
}

// ─── Auth Service ──────────────────────────────────────────────────────────
proxyRouter.use('/api/v1/auth', createServiceProxy(config.services.auth));

// ─── User Service ──────────────────────────────────────────────────────────
proxyRouter.use('/api/v1/users', createServiceProxy(config.services.user));

// ─── Account Service ───────────────────────────────────────────────────────
proxyRouter.use('/api/v1/accounts', createServiceProxy(config.services.account));

// ─── Ledger Service ────────────────────────────────────────────────────────
proxyRouter.use('/api/v1/ledger', createServiceProxy(config.services.ledger));

// ─── Transaction Service ───────────────────────────────────────────────────
proxyRouter.use('/api/v1/transactions', createServiceProxy(config.services.transaction));

// ─── Payment Service ───────────────────────────────────────────────────────
proxyRouter.use('/api/v1/payments', createServiceProxy(config.services.payment));

// ─── Beneficiary Service ───────────────────────────────────────────────────
proxyRouter.use('/api/v1/beneficiaries', createServiceProxy(config.services.beneficiary));

// ─── Bank Service ──────────────────────────────────────────────────────────
proxyRouter.use('/api/v1/banks', createServiceProxy(config.services.bank));

// ─── Settlement Service ────────────────────────────────────────────────────
proxyRouter.use('/api/v1/settlement', createServiceProxy(config.services.settlement));

// ─── Reconciliation Service ────────────────────────────────────────────────
proxyRouter.use('/api/v1/reconciliation', createServiceProxy(config.services.reconciliation));

// ─── Notification Service ──────────────────────────────────────────────────
proxyRouter.use('/api/v1/notifications', createServiceProxy(config.services.notification));

// ─── Admin routes (reconciliation + audit — accessible to ADMIN/AUDITOR) ──
proxyRouter.use(
  '/api/v1/admin/reconciliation',
  createServiceProxy(config.services.reconciliation),
);
