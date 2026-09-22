import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import { createLogger, requestIdMiddleware, correlationIdMiddleware, errorHandler } from '@bankflow/shared';

// ─────────────────────────────────────────────────────────────────────────────
// payment-network simulator — NPCI-Inspired Payment Router
//
// Responsibilities:
//   - Receive payment routing requests from payment-service
//   - Look up bank routing info from bank-service
//   - Forward credit requests to external-bank simulator
//   - Simulate network conditions (latency, failures)
//
// Failure simulation via header X-Simulate-Failure:
//   TIMEOUT          → 12s delay (caller will time out)
//   NETWORK_ERROR    → Immediate connection refused simulation
//   BANK_UNAVAILABLE → Forwards to external-bank with same header
//   CREDIT_FAILED    → Forwards to external-bank with same header
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = 'payment-network';
const PORT = parseInt(process.env.PORT ?? '4000', 10);
const VERSION = '1.0.0';

const BANK_SERVICE_URL = process.env.BANK_SERVICE_URL ?? 'http://localhost:3008';
const EXTERNAL_BANK_URL = process.env.EXTERNAL_BANK_URL ?? 'http://localhost:4001';

const logger = createLogger(SERVICE_NAME);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// ─── Health Endpoints ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.get('/ready', (_req, res) => {
  res.json({
    status: 'ready',
    service: SERVICE_NAME,
    checks: { router: 'ok' },
  });
});

// ─── POST /route — Route a payment to the destination bank ───────────────────

app.post('/route', async (req, res) => {
  const simulateFailure = req.headers['x-simulate-failure'] as string | undefined;
  const correlationId = req.headers['x-correlation-id'] as string | undefined;

  logger.info('Payment routing request received', {
    destinationBankCode: req.body?.destinationBankCode,
    paymentReference: req.body?.paymentReference,
    simulateFailure: simulateFailure ?? 'none',
  });

  // ── Failure Mode: NETWORK_ERROR ──────────────────────────────────────────
  if (simulateFailure === 'NETWORK_ERROR') {
    logger.warn('Simulating NETWORK_ERROR');
    res.status(503).json({
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Payment network connectivity failure (simulated)',
      },
    });
    return;
  }

  // ── Failure Mode: TIMEOUT (network level) ────────────────────────────────
  if (simulateFailure === 'TIMEOUT') {
    logger.warn('Simulating network TIMEOUT — no response for 12s');
    await new Promise((resolve) => setTimeout(resolve, 12000));
    res.status(504).json({
      success: false,
      error: {
        code: 'GATEWAY_TIMEOUT',
        message: 'Payment network timed out (simulated)',
      },
    });
    return;
  }

  const {
    paymentReference,
    sourceAccountNumber,
    sourceBankCode,
    destinationAccountNumber,
    destinationBankCode,
    amountMinor,
    currency,
    description,
  } = req.body;

  if (!destinationBankCode || !destinationAccountNumber || !amountMinor) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'destinationBankCode, destinationAccountNumber and amountMinor are required',
      },
    });
    return;
  }

  // ── Simulate network latency (50–200ms) ──────────────────────────────────
  await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150));

  try {
    // ── Lookup bank routing info from bank-service ────────────────────────
    const bankRes = await axios.get(`${BANK_SERVICE_URL}/route/${destinationBankCode}`, {
      timeout: 5000,
    });
    const bankInfo = bankRes.data.data;

    if (!bankInfo.isActive) {
      res.status(503).json({
        success: false,
        error: { code: 'BANK_UNAVAILABLE', message: `Destination bank ${destinationBankCode} is not active` },
      });
      return;
    }

    logger.info('Routing payment to external bank', {
      destinationBankCode,
      creditEndpoint: bankInfo.creditEndpoint,
      paymentReference,
    });

    // ── Forward to external-bank simulator ───────────────────────────────
    const creditRes = await axios.post(
      `${EXTERNAL_BANK_URL}/credit`,
      {
        destinationAccountNumber,
        destinationBankCode,
        amountMinor,
        currency,
        paymentReference,
        description,
        sourceAccountNumber,
        sourceBankCode,
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId ?? '',
          'X-Payment-Reference': paymentReference ?? '',
          // Forward any failure simulation header
          ...(simulateFailure ? { 'X-Simulate-Failure': simulateFailure } : {}),
        },
      }
    );

    const networkReference = `NET-${Date.now()}-${Math.floor(Math.random() * 99999)}`;

    logger.info('Payment routed successfully', {
      paymentReference,
      networkReference,
      creditId: creditRes.data?.data?.creditId,
    });

    res.status(200).json({
      success: true,
      data: {
        networkReference,
        paymentReference,
        destinationBankCode,
        destinationAccountNumber,
        creditId: creditRes.data?.data?.creditId,
        status: 'CREDITED',
        processedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    // External bank failed — propagate failure
    const statusCode = err.response?.status ?? 503;
    const errCode = err.response?.data?.error?.code ?? 'CREDIT_FAILED';
    const errMsg = err.response?.data?.error?.message ?? err.message ?? 'External bank credit failed';

    logger.error('Payment routing failed', {
      paymentReference,
      destinationBankCode,
      statusCode,
      errCode,
      errMsg,
    });

    res.status(statusCode).json({
      success: false,
      error: {
        code: errCode,
        message: errMsg,
      },
    });
  }
});

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`🌐 ${SERVICE_NAME} simulator running on port :${PORT}`, {
    port: PORT,
    bankServiceUrl: BANK_SERVICE_URL,
    externalBankUrl: EXTERNAL_BANK_URL,
  });
});

process.on('SIGTERM', () => {
  logger.info('Shutting down payment-network simulator');
  process.exit(0);
});
