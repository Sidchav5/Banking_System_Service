import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types/api.types';

// Extend Express Request interface to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'bankflow_dev_jwt_secret_key_32_chars';

/**
 * Authentication middleware that verifies JWT bearer tokens.
 * Attaches decoded payload to req.user.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    const reqId = (req as unknown as { id?: string }).id ?? 'unknown';
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token missing',
      },
      requestId: reqId,
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    const reqId = (req as unknown as { id?: string }).id ?? 'unknown';
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired authentication token',
      },
      requestId: reqId,
    });
  }
}

/**
 * Role-Based Access Control (RBAC) middleware.
 * Ensures the authenticated user has one of the allowed roles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const reqId = (req as unknown as { id?: string }).id ?? 'unknown';
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required',
        },
        requestId: reqId,
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Role '${req.user.role}' is not authorized to access this resource`,
        },
        requestId: reqId,
      });
      return;
    }

    next();
  };
}
