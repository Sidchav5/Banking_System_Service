import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { query } from '../db';
import { createLogger } from '@bankflow/shared';

const logger = createLogger('idempotency-middleware');

// In-memory fallback map for standalone dev when DB is disconnected
const inMemoryKeys = new Map<
  string,
  {
    key: string;
    requestPath: string;
    requestHash: string;
    responseCode?: number;
    responseBody?: unknown;
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  }
>();

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const idempotencyKey = (req.headers['x-idempotency-key'] ||
    req.headers['idempotency-key']) as string | undefined;

  // If no idempotency key provided, skip engine
  if (!idempotencyKey) {
    return next();
  }

  const requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(req.body || {}))
    .digest('hex');

  const requestPath = req.originalUrl || req.url;

  try {
    let existingRecord: any = null;

    try {
      const dbRes = await query('SELECT * FROM idempotency_keys WHERE key = $1', [
        idempotencyKey,
      ]);
      if (dbRes.rows.length > 0) {
        existingRecord = dbRes.rows[0];
      }
    } catch {
      existingRecord = inMemoryKeys.get(idempotencyKey) ?? null;
    }

    if (existingRecord) {
      if (existingRecord.status === 'PROCESSING') {
        logger.warn('Concurrent request detected for idempotency key', {
          idempotencyKey,
          requestPath,
        });
        res.status(409).json({
          success: false,
          error: {
            code: 'CONCURRENT_REQUEST',
            message: 'A request with this X-Idempotency-Key is currently being processed. Please wait.',
          },
          requestId: (req as any).id ?? 'unknown',
        });
        return;
      }

      if (existingRecord.status === 'COMPLETED') {
        logger.info('Idempotency hit! Returning cached response', {
          idempotencyKey,
          code: existingRecord.response_code || existingRecord.responseCode,
        });
        res
          .status(existingRecord.response_code || existingRecord.responseCode || 200)
          .json(existingRecord.response_body || existingRecord.responseBody);
        return;
      }
    }

    // Insert new idempotency key with PROCESSING status
    try {
      await query(
        `INSERT INTO idempotency_keys (key, request_path, request_hash, status)
         VALUES ($1, $2, $3, 'PROCESSING')`,
        [idempotencyKey, requestPath, requestHash]
      );
    } catch {
      inMemoryKeys.set(idempotencyKey, {
        key: idempotencyKey,
        requestPath,
        requestHash,
        status: 'PROCESSING',
      });
    }

    // Intercept response to store result upon completion
    const originalJson = res.json.bind(res);
    res.json = (body: any): Response => {
      const statusCode = res.statusCode;
      const finalStatus = statusCode < 400 ? 'COMPLETED' : 'FAILED';

      // Async update idempotency key record
      (async () => {
        try {
          await query(
            `UPDATE idempotency_keys
             SET response_code = $1, response_body = $2, status = $3
             WHERE key = $4`,
            [statusCode, JSON.stringify(body), finalStatus, idempotencyKey]
          );
        } catch {
          const record = inMemoryKeys.get(idempotencyKey);
          if (record) {
            record.responseCode = statusCode;
            record.responseBody = body;
            record.status = finalStatus;
          }
        }
      })();

      return originalJson(body);
    };

    next();
  } catch (err) {
    logger.error('Error in idempotency middleware', { err, idempotencyKey });
    next(err);
  }
}
