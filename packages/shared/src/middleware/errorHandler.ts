import { Request, Response, NextFunction } from 'express';
import { defaultLogger } from '../logger';

// ────────────────────────────────────────────────────────────────────────────
// Global Error Handler Middleware
//
// Must be registered LAST in the Express middleware chain:
//   app.use(errorHandler);
//
// Catches all errors passed via next(err) and formats them as the
// standard BankFlow API error response.
// ────────────────────────────────────────────────────────────────────────────

/** Structured application error with optional error code */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Common pre-defined errors */
export const Errors = {
  NotFound: (resource: string) =>
    new AppError(`${resource} not found`, 404, 'NOT_FOUND'),

  Unauthorized: (message = 'Unauthorized') =>
    new AppError(message, 401, 'UNAUTHORIZED'),

  Forbidden: (message = 'Forbidden') =>
    new AppError(message, 403, 'FORBIDDEN'),

  BadRequest: (message: string, code = 'BAD_REQUEST') =>
    new AppError(message, 400, code),

  Conflict: (message: string, code = 'CONFLICT') =>
    new AppError(message, 409, code),

  TooManyRequests: (message = 'Too many requests') =>
    new AppError(message, 429, 'RATE_LIMITED'),

  InternalError: (message = 'Internal server error') =>
    new AppError(message, 500, 'INTERNAL_ERROR', false),
} as const;

/** Express global error handler — must be last middleware */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_ERROR';

  // Log unexpected (non-operational) errors at error level
  if (!isAppError || !err.isOperational) {
    defaultLogger.error('Unhandled error', {
      err,
      requestId: req.id,
      correlationId: req.correlationId,
      method: req.method,
      url: req.url,
    });
  }

  // Never leak stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: isAppError ? err.message : 'An unexpected error occurred',
      ...(isDev && { stack: err.stack }),
    },
    requestId: req.id,
  });
}
