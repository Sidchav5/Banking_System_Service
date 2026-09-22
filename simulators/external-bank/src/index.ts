import 'dotenv/config';
import express from 'express';
import { createLogger, requestIdMiddleware, correlationIdMiddleware, errorHandler } from '@bankflow/shared';

// ─────────────────────────────────────────────────────────────────────────────
// external-bank simulator
//
// Simulates HDFC_SIM, ICICI_SIM, AXIS_SIM, SBI_SIM external bank backends.
// Receives credit requests from the payment-network simulator.
//
// Failure simulation modes:
//   FAILURE_RATE env  — 0.0 to 1.0, random failure probability (default 0.15)
//   X-Simulate-Failure header:
//     CREDIT_FAILED   — Always reject the credit
//     TIMEOUT         — Delay 12s (causes upstream timeout)
//     BANK_UNAVAILABLE — Return 503 immediately
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = 'external-bank';
const PORT = parseInt(process.env.PORT ?? '4001', 10);
const VERSION = '1.0.0';
const FAILURE_RATE = parseFloat(process.env.FAILURE_RATE ?? '0.15');

const logger = createLogger(SERVICE_NAME);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// In-memory virtual account ledger (simulated external accounts)
const virtualAccounts = new Map<string, { balance: number; bankCode: string; owner: string }>();

// Seed some known virtual accounts
const seedAccounts = [
  { number: 'EXT100000000001', balance: 0, bankCode: 'HDFC_SIM', owner: 'HDFC Customer A' },
  { number: 'EXT100000000002', balance: 0, bankCode: 'HDFC_SIM', owner: 'HDFC Customer B' },
  { number: 'EXT200000000001', balance: 0, bankCode: 'ICICI_SIM', owner: 'ICICI Customer A' },
  { number: 'EXT200000000002', balance: 0, bankCode: 'ICICI_SIM', owner: 'ICICI Customer B' },
  { number: 'EXT300000000001', balance: 0, bankCode: 'AXIS_SIM', owner: 'Axis Customer A' },
  { number: 'EXT300000000002', balance: 0, bankCode: 'AXIS_SIM', owner: 'Axis Customer B' },
  { number: 'EXT400000000001', balance: 0, bankCode: 'SBI_SIM', owner: 'SBI Customer A' },
];
seedAccounts.forEach((acc) => virtualAccounts.set(acc.number, acc));

// ─── Health Endpoints ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    virtualAccounts: virtualAccounts.size,
    failureRate: FAILURE_RATE,
  });
});

app.get('/ready', (_req, res) => {
  res.json({
    status: 'ready',
    service: SERVICE_NAME,
    checks: { simulator: 'ok' },
  });
});

// ─── GET /accounts — List all virtual accounts ────────────────────────────────

app.get('/accounts', (_req, res) => {
  const accounts = Array.from(virtualAccounts.entries()).map(([number, acc]) => ({
    accountNumber: number,
    balance: acc.balance,
    bankCode: acc.bankCode,
    owner: acc.owner,
  }));

  res.json({ success: true, data: accounts });
});

// ─── GET /accounts/:number — Validate external account ───────────────────────

app.get('/accounts/:number', (req, res) => {
  const account = virtualAccounts.get(req.params.number);
  if (!account) {
    // Accept any unknown account as valid (open banking simulation)
    res.json({
      success: true,
      data: {
        accountNumber: req.params.number,
        exists: false,
        message: 'Account not pre-seeded but will be created on first credit',
      },
    });
    return;
  }
  res.json({
    success: true,
    data: {
      accountNumber: req.params.number,
      bankCode: account.bankCode,
      owner: account.owner,
      exists: true,
    },
  });
});

// ─── POST /credit — Credit an external beneficiary account ───────────────────

app.post('/credit', async (req, res) => {
  const simulateFailure = req.headers['x-simulate-failure'] as string | undefined;

  // ── Failure Mode: BANK_UNAVAILABLE ──────────────────────────────────────
  if (simulateFailure === 'BANK_UNAVAILABLE') {
    logger.warn('Simulating BANK_UNAVAILABLE failure');
    res.status(503).json({
      success: false,
      error: {
        code: 'BANK_UNAVAILABLE',
        message: 'External bank is temporarily unavailable (simulated)',
      },
    });
    return;
  }

  // ── Failure Mode: TIMEOUT ────────────────────────────────────────────────
  if (simulateFailure === 'TIMEOUT') {
    logger.warn('Simulating TIMEOUT failure — delaying 12s');
    await new Promise((resolve) => setTimeout(resolve, 12000));
    res.status(504).json({
      success: false,
      error: {
        code: 'GATEWAY_TIMEOUT',
        message: 'External bank timed out (simulated)',
      },
    });
    return;
  }

  // ── Failure Mode: CREDIT_FAILED ──────────────────────────────────────────
  if (simulateFailure === 'CREDIT_FAILED') {
    logger.warn('Simulating CREDIT_FAILED rejection');
    res.status(422).json({
      success: false,
      error: {
        code: 'CREDIT_REJECTED',
        message: 'External bank rejected the credit (simulated — account frozen or invalid)',
      },
    });
    return;
  }

  // ── Random Failure (configurable rate) ───────────────────────────────────
  if (Math.random() < FAILURE_RATE) {
    logger.warn('Random failure triggered', { failureRate: FAILURE_RATE });
    res.status(422).json({
      success: false,
      error: {
        code: 'CREDIT_FAILED',
        message: `External bank rejected credit (random failure @ ${FAILURE_RATE * 100}% rate)`,
      },
    });
    return;
  }

  // ── Success Path ─────────────────────────────────────────────────────────
  const {
    destinationAccountNumber,
    destinationBankCode,
    amountMinor,
    currency = 'INR',
    paymentReference,
    description,
  } = req.body;

  if (!destinationAccountNumber || !amountMinor || amountMinor <= 0) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'destinationAccountNumber and amountMinor are required' },
    });
    return;
  }

  // Simulate processing delay (50–200ms)
  await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150));

  // Update virtual account balance
  const existing = virtualAccounts.get(destinationAccountNumber);
  if (existing) {
    existing.balance += amountMinor;
    virtualAccounts.set(destinationAccountNumber, existing);
  } else {
    // Auto-create account on first credit
    virtualAccounts.set(destinationAccountNumber, {
      balance: amountMinor,
      bankCode: destinationBankCode ?? 'UNKNOWN',
      owner: 'Auto-created on first credit',
    });
  }

  const creditId = `CRD-${destinationBankCode ?? 'EXT'}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  logger.info('Credit successful', {
    creditId,
    destinationAccountNumber,
    destinationBankCode,
    amountMinor,
    currency,
    paymentReference,
  });

  res.status(200).json({
    success: true,
    data: {
      creditId,
      destinationAccountNumber,
      destinationBankCode,
      amountMinor,
      currency,
      status: 'CREDITED',
      processedAt: new Date().toISOString(),
      description,
      paymentReference,
    },
  });
});

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`🏦 ${SERVICE_NAME} simulator running on port :${PORT}`, {
    port: PORT,
    failureRate: `${FAILURE_RATE * 100}%`,
    virtualAccounts: virtualAccounts.size,
  });
});

process.on('SIGTERM', () => {
  logger.info('Shutting down external-bank simulator');
  process.exit(0);
});
