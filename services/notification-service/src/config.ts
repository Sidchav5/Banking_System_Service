import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const config = {
  serviceName: 'notification-service',
  port: parseInt(process.env.PORT ?? '3011', 10),
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET ?? 'bankflow_dev_jwt_secret_key_32_chars',
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://neondb_owner:npg_THv4tw3bXCjW@ep-flat-wave-b3gqfmc1-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
};
