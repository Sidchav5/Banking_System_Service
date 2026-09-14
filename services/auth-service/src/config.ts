import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET ?? 'bankflow_dev_jwt_secret_key_32_chars',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET ?? 'bankflow_dev_refresh_secret_key_32',
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN ?? '24h',
  refreshTokenExpiresInDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? '7', 10),
  saltRounds: 10,
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 15,
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/bankflow_auth',
};
