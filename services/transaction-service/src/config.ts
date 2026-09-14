import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT ?? '3005', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET ?? 'bankflow_dev_jwt_secret_key_32_chars',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/bankflow_transaction',
  ledgerServiceUrl: process.env.LEDGER_SERVICE_URL ?? 'http://localhost:3004',
  accountServiceUrl: process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3003',
};
