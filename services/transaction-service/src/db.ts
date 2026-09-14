import { Pool } from 'pg';
import { config } from './config';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('transaction-service-db');
const isCloudDb = config.databaseUrl.includes('neon.tech') || config.databaseUrl.includes('sslmode=require');

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: isCloudDb ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client in transaction-service', { err });
});

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.error('Database query error in transaction-service', { text, err });
    throw err;
  }
}
