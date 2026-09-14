import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '3003', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET ?? 'bankflow_dev_jwt_secret_key_32_chars',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/bankflow_account',
  defaultDailyLimitMinor: 10000000,    // ₹100,000.00 (in paise)
  defaultSingleLimitMinor: 5000000,     // ₹50,000.00 (in paise)
};
