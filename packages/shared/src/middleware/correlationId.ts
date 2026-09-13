import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// ────────────────────────────────────────────────────────────────────────────
// Correlation ID Middleware
//
// A Correlation ID groups all log lines for a single user-initiated operation
// across multiple services (API Gateway → Auth → Account → Ledger).
//
// Flow:
//   Frontend  →  [generates correlationId]
//               → API Gateway [reads X-Correlation-ID or generates one]
//               → Auth Service [reads X-Correlation-ID, passes it forward]
//               → Ledger Service [reads X-Correlation-ID, logs with it]
//
// Every service must:
//   1. Read X-Correlation-ID from the incoming request
//   2. Attach it to req.correlationId
//   3. Forward it when calling downstream services
//   4. Include it in all log lines for this request
// ────────────────────────────────────────────────────────────────────────────

/**
 * Middleware: Propagates correlation ID across service boundaries.
 *
 * If no X-Correlation-ID header is present, generates a new UUID.
 * The API Gateway is the typical entry point and generates the first ID.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    (req.headers['x-correlation-id'] as string | undefined) ??
    (req.headers['x-request-id'] as string | undefined) ??
    uuidv4();

  req.correlationId = correlationId;

  // Make it available downstream (other services read this header)
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}

/**
 * Helper: Returns the headers to forward to downstream services.
 * Call this when making HTTP requests to other BankFlow services.
 *
 * Usage:
 *   await axios.post(`http://ledger-service:3004/post`, body, {
 *     headers: forwardHeaders(req),
 *   });
 */
export function forwardHeaders(req: Request): Record<string, string> {
  return {
    'X-Correlation-ID': req.correlationId,
    'X-Request-ID': req.id,
    'Content-Type': 'application/json',
  };
}
