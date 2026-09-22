import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const config = {
  serviceName: 'beneficiary-service',
  port: parseInt(process.env.PORT ?? '3007', 10),
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET ?? 'bankflow_dev_jwt_secret_key_32_chars',
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://neondb_owner:npg_THv4tw3bXCjW@ep-flat-wave-b3gqfmc1-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',

  accountServiceUrl: process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3003',
  bankServiceUrl: process.env.BANK_SERVICE_URL ?? 'http://localhost:3008',
  externalBankUrl: process.env.EXTERNAL_BANK_URL ?? 'http://localhost:4001',

  // Cooling period in minutes (default 30 mins)
  coolingPeriodMinutes: parseInt(process.env.COOLING_PERIOD_MINUTES ?? '30', 10),
  // Default max transfer limit during cooling period (in paise: ₹25,000 = 2500000 paise)
  coolingTransferLimitPaise: parseInt(process.env.COOLING_TRANSFER_LIMIT_PAISE ?? '2500000', 10),
};
