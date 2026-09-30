import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';
import { paymentLimiter } from '../middleware/rateLimiter';

// ────────────────────────────────────────────────────────────────────────────
// Service Proxy Routes
//
// The API Gateway proxies requests to the appropriate microservice.
// Uses fixRequestBody to re-stream req.body parsed by express.json()
// ────────────────────────────────────────────────────────────────────────────

export const proxyRouter = Router();

/** Creates a proxy middleware for a given target service */
function createServiceProxy(target: string, pathRewrite?: Record<string, string>) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error: (err, _req, res: any) => {
        if (!res.headersSent) {
          res.status(502).json({
            success: false,
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Downstream service is temporarily unavailable',
              details: err.message,
            },
          });
        }
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

// ─── Payment Service (with payment rate limiter on POST) ───────────────────
proxyRouter.post('/api/v1/payments', paymentLimiter);
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

// ─── Admin routes ─────────────────────────────────────────────────────────
proxyRouter.use(
  '/api/v1/admin/reconciliation',
  createServiceProxy(config.services.reconciliation),
);
proxyRouter.use(
  '/api/v1/admin/settlement',
  createServiceProxy(config.services.settlement),
);
proxyRouter.use(
  '/api/v1/admin/notifications',
  createServiceProxy(config.services.notification),
);
