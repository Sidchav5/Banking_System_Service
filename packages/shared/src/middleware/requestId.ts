import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// ────────────────────────────────────────────────────────────────────────────
// Request ID Middleware
//
// Attaches a unique UUID (v4) to every incoming request as:
//   - req.id         → accessible in route handlers
//   - X-Request-ID   → returned in every response header
//
// If the client sends an X-Request-ID header, we use that value.
// This allows clients to trace their request through logs.
// ────────────────────────────────────────────────────────────────────────────

// Extend Express Request type to include our custom properties
declare global {
  namespace Express {
    interface Request {
      id: string;
      correlationId: string;
      startTime: number;
    }
  }
}

/**
 * Middleware: Attaches a unique request ID to every request.
 *
 * Header precedence (in order):
 *   1. X-Request-ID sent by client (pass-through)
 *   2. Generated UUID v4
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? uuidv4();

  req.id = requestId;
  req.startTime = Date.now();

  // Echo the request ID back in the response so clients can correlate logs
  res.setHeader('X-Request-ID', requestId);

  next();
}
