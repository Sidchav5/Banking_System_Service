import 'dotenv/config';
import express from 'express';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
  AppError,
} from '@bankflow/shared';

// ─────────────────────────────────────────────────────────────────────────────
// bank-service — Bank Registry
//
// Maintains the registry of banks in the BankFlow network.
// Uses an in-memory store (no DB) — fast lookups and cache-friendly.
// In production this would be backed by a Redis cache + DB.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = 'bank-service';
const PORT = parseInt(process.env.PORT ?? '3008', 10);
const VERSION = '1.0.0';

const logger = createLogger(SERVICE_NAME);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// ─── Bank Registry ────────────────────────────────────────────────────────────

interface Bank {
  code: string;
  name: string;
  ifscPrefix: string;
  type: 'INTERNAL' | 'EXTERNAL_SIM';
  creditEndpoint: string;  // URL to credit endpoint (for routing)
  isActive: boolean;
  country: string;
  currency: string;
}

const bankRegistry: Bank[] = [
  {
    code: 'BANKFLOW',
    name: 'BankFlow Bank (Internal)',
    ifscPrefix: 'BKFL',
    type: 'INTERNAL',
    creditEndpoint: '', // handled internally
    isActive: true,
    country: 'IN',
    currency: 'INR',
  },
  {
    code: 'HDFC_SIM',
    name: 'HDFC Bank (Simulator)',
    ifscPrefix: 'HDFC',
    type: 'EXTERNAL_SIM',
    creditEndpoint: process.env.EXTERNAL_BANK_URL ?? 'http://localhost:4001',
    isActive: true,
    country: 'IN',
    currency: 'INR',
  },
  {
    code: 'ICICI_SIM',
    name: 'ICICI Bank (Simulator)',
    ifscPrefix: 'ICIC',
    type: 'EXTERNAL_SIM',
    creditEndpoint: process.env.EXTERNAL_BANK_URL ?? 'http://localhost:4001',
    isActive: true,
    country: 'IN',
    currency: 'INR',
  },
  {
    code: 'AXIS_SIM',
    name: 'Axis Bank (Simulator)',
    ifscPrefix: 'UTIB',
    type: 'EXTERNAL_SIM',
    creditEndpoint: process.env.EXTERNAL_BANK_URL ?? 'http://localhost:4001',
    isActive: true,
    country: 'IN',
    currency: 'INR',
  },
  {
    code: 'SBI_SIM',
    name: 'State Bank of India (Simulator)',
    ifscPrefix: 'SBIN',
    type: 'EXTERNAL_SIM',
    creditEndpoint: process.env.EXTERNAL_BANK_URL ?? 'http://localhost:4001',
    isActive: true,
    country: 'IN',
    currency: 'INR',
  },
];

// ─── Health Endpoints ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    banks: bankRegistry.length,
  });
});

app.get('/ready', (_req, res) => {
  res.json({
    status: 'ready',
    service: SERVICE_NAME,
    checks: { registry: 'ok', banks: bankRegistry.length },
  });
});

// ─── GET /banks — List all active banks ──────────────────────────────────────

app.get('/', (_req, res) => {
  const banks = bankRegistry
    .filter((b) => b.isActive)
    .map(({ code, name, ifscPrefix, type, country, currency, isActive }) => ({
      code,
      name,
      ifscPrefix,
      type,
      country,
      currency,
      isActive,
    }));

  logger.info('Listed bank registry', { count: banks.length });

  res.json({
    success: true,
    data: banks,
    requestId: (res as any).locals?.requestId ?? 'unknown',
  });
});

// ─── GET /banks/:code — Get single bank by code ───────────────────────────────

app.get('/:code', (req, res, next) => {
  try {
    const { code } = req.params;
    const bank = bankRegistry.find(
      (b) => b.code.toUpperCase() === code.toUpperCase()
    );

    if (!bank) {
      throw new AppError(`Bank with code '${code}' not found in registry`, 404, 'BANK_NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        code: bank.code,
        name: bank.name,
        ifscPrefix: bank.ifscPrefix,
        type: bank.type,
        country: bank.country,
        currency: bank.currency,
        isActive: bank.isActive,
        creditEndpoint: bank.type === 'EXTERNAL_SIM' ? bank.creditEndpoint : undefined,
      },
      requestId: (res as any).locals?.requestId ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /route/:code — Routing endpoint for payment-network ─────────────────
// Returns routing info (including creditEndpoint) for routing decisions

app.get('/route/:code', (req, res, next) => {
  try {
    const { code } = req.params;
    const bank = bankRegistry.find(
      (b) => b.code.toUpperCase() === code.toUpperCase()
    );

    if (!bank) {
      throw new AppError(`No routing info for bank code '${code}'`, 404, 'BANK_NOT_FOUND');
    }

    if (!bank.isActive) {
      throw new AppError(`Bank '${code}' is currently inactive`, 503, 'BANK_UNAVAILABLE');
    }

    res.json({
      success: true,
      data: {
        code: bank.code,
        name: bank.name,
        type: bank.type,
        creditEndpoint: bank.creditEndpoint,
        isActive: bank.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`🏦 ${SERVICE_NAME} running on port :${PORT}`, {
    port: PORT,
    service: SERVICE_NAME,
    environment: process.env.NODE_ENV ?? 'development',
    banks: bankRegistry.map((b) => b.code),
  });
});

process.on('SIGTERM', () => {
  logger.info('Shutting down bank-service');
  process.exit(0);
});
