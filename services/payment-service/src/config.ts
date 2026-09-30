import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '3006', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET ?? 'bankflow_dev_jwt_secret_key_32_chars',
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/bankflow_payment',
  // Downstream service URLs
  ledgerServiceUrl: process.env.LEDGER_SERVICE_URL ?? 'http://localhost:3004',
  accountServiceUrl: process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3003',
  paymentNetworkUrl: process.env.PAYMENT_NETWORK_URL ?? 'http://localhost:4000',
  bankServiceUrl: process.env.BANK_SERVICE_URL ?? 'http://localhost:3008',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3011',
  // Saga timeouts
  networkTimeoutMs: parseInt(process.env.NETWORK_TIMEOUT_MS ?? '8000', 10), // 8s timeout
};
