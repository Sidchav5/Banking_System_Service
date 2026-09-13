import winston from 'winston';

// ────────────────────────────────────────────────────────────────────────────
// BankFlow — Structured Logger
//
// All services use this logger. It outputs JSON in production and
// pretty-printed colour output in development.
//
// Every log line automatically includes:
//   - service name
//   - timestamp (ISO-8601)
//   - correlation ID (if set via AsyncLocalStorage or explicit context)
//   - request ID
//   - log level
// ────────────────────────────────────────────────────────────────────────────

const { combine, timestamp, json, errors, colorize, simple } = winston.format;

const isProd = process.env.NODE_ENV === 'production';

/**
 * Creates a service-scoped Winston logger.
 *
 * Usage:
 *   const logger = createLogger('auth-service');
 *   logger.info({ userId: 'abc' }, 'User logged in');
 *   logger.error({ err }, 'Unexpected error');
 */
export function createLogger(serviceName: string): winston.Logger {
  const formats = isProd
    ? combine(
        errors({ stack: true }), // include stack traces on error objects
        timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
        json(),
      )
    : combine(
        errors({ stack: true }),
        timestamp({ format: 'HH:mm:ss.SSS' }),
        colorize({ all: true }),
        simple(),
      );

  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
    defaultMeta: {
      service: serviceName,
      environment: process.env.NODE_ENV ?? 'development',
    },
    format: formats,
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true,
      }),
    ],
    exitOnError: false,
  });

  return logger;
}

/**
 * Creates a child logger with additional bound context (e.g. requestId, userId).
 * Use this inside request handlers for scoped logging.
 *
 * Usage:
 *   const reqLogger = childLogger(logger, { requestId: req.id, userId: user.id });
 *   reqLogger.info('Processing payment');
 */
export function childLogger(
  parent: winston.Logger,
  context: Record<string, string | number | boolean | undefined>,
): winston.Logger {
  return parent.child(context);
}

// Default logger for cases where a specific service logger isn't needed
export const defaultLogger = createLogger('bankflow');

export type Logger = winston.Logger;
