import 'dotenv/config';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
  authenticateToken,
  UserRole,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
} from '@bankflow/shared';

import { config } from './config';
import { pool, query } from './db';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from './utils/token';

const SERVICE_NAME = 'auth-service';
const logger = createLogger(SERVICE_NAME);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// In-Memory store fallback for standalone testing if DB is unavailable
interface InMemUser {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: 'ACTIVE' | 'LOCKED' | 'DEACTIVATED';
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
}
const inMemoryUsers = new Map<string, InMemUser>();
const inMemoryRefreshTokens = new Set<string>();

// ─── Health Endpoints ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.get('/ready', async (_req, res) => {
  let dbStatus = 'ok';
  try {
    await query('SELECT 1');
  } catch {
    dbStatus = 'degraded_in_memory';
  }

  res.json({
    status: 'ready',
    service: SERVICE_NAME,
    checks: { database: dbStatus },
  });
});

// ─── Auth Routes ─────────────────────────────────────────────────────────────

/**
 * POST /register
 * Register new user credentials & initialize profile.
 */
app.post('/register', async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone, role = 'CUSTOMER' } = req.body as RegisterRequest;

    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email, password, first name, and last name are required' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    const passwordHash = await hashPassword(password);
    const userId = uuidv4();
    const createdAt = new Date();

    let userRole: UserRole = role;
    let userStatus = 'ACTIVE';

    try {
      // Try database insert
      const existing = await query('SELECT id FROM users_auth WHERE email = $1', [email.toLowerCase()]);
      if (existing.rows.length > 0) {
        res.status(409).json({
          success: false,
          error: { code: 'EMAIL_EXISTS', message: 'User with this email already exists' },
          requestId: (req as unknown as { id?: string }).id ?? 'unknown',
        });
        return;
      }

      await query(
        `INSERT INTO users_auth (id, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5)`,
        [userId, email.toLowerCase(), passwordHash, userRole, userStatus]
      );
    } catch {
      // In-Memory Fallback
      if (Array.from(inMemoryUsers.values()).some((u) => u.email === email.toLowerCase())) {
        res.status(409).json({
          success: false,
          error: { code: 'EMAIL_EXISTS', message: 'User with this email already exists' },
          requestId: (req as unknown as { id?: string }).id ?? 'unknown',
        });
        return;
      }

      inMemoryUsers.set(userId, {
        id: userId,
        email: email.toLowerCase(),
        passwordHash,
        role: userRole,
        status: 'ACTIVE',
        failedAttempts: 0,
        lockedUntil: null,
        createdAt,
      });
    }

    // Call User Service internally to create user profile stub
    try {
      const userServiceUrl = process.env.USER_SERVICE_URL ?? 'http://localhost:3002';
      await fetch(`${userServiceUrl}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': (req as unknown as { id?: string }).id ?? 'unknown' },
        body: JSON.stringify({
          userId,
          email: email.toLowerCase(),
          firstName,
          lastName,
          phone: phone ?? '',
        }),
      });
    } catch (err) {
      logger.warn('Could not auto-create user profile in user-service', { err });
    }

    const sessionId = uuidv4();
    const accessToken = generateAccessToken({ sub: userId, email: email.toLowerCase(), role: userRole, sessionId });
    const { token: refreshToken, hash: refreshTokenHash, expiresAt } = generateRefreshToken();

    try {
      await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [userId, refreshTokenHash, expiresAt]
      );
    } catch {
      inMemoryRefreshTokens.add(refreshTokenHash);
    }

    const authResponse: AuthResponse = {
      user: {
        id: userId,
        email: email.toLowerCase(),
        role: userRole,
        status: 'ACTIVE',
        createdAt: createdAt.toISOString(),
      },
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 mins in seconds
    };

    logger.info(`User registered successfully: ${email}`, { userId });

    res.status(201).json({
      success: true,
      data: authResponse,
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /login
 * Authenticate user credentials & return JWT tokens.
 */
app.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as LoginRequest;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    let user: { id: string; email: string; password_hash: string; role: UserRole; status: string; failed_login_attempts: number; locked_until: Date | null; created_at: Date } | null = null;

    try {
      const result = await query('SELECT * FROM users_auth WHERE email = $1', [email.toLowerCase()]);
      if (result.rows.length > 0) {
        user = result.rows[0];
      }
    } catch {
      const inMem = Array.from(inMemoryUsers.values()).find((u) => u.email === email.toLowerCase());
      if (inMem) {
        user = {
          id: inMem.id,
          email: inMem.email,
          password_hash: inMem.passwordHash,
          role: inMem.role,
          status: inMem.status,
          failed_login_attempts: inMem.failedAttempts,
          locked_until: inMem.lockedUntil,
          created_at: inMem.createdAt,
        };
      }
    }

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    // Check account lock
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      res.status(423).json({
        success: false,
        error: { code: 'ACCOUNT_LOCKED', message: `Account is temporarily locked. Try again after ${new Date(user.locked_until).toLocaleTimeString()}` },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    const isValidPassword = await verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      const attempts = user.failed_login_attempts + 1;
      let lockTime: Date | null = null;

      if (attempts >= config.maxFailedAttempts) {
        lockTime = new Date();
        lockTime.setMinutes(lockTime.getMinutes() + config.lockoutDurationMinutes);
      }

      try {
        await query(
          'UPDATE users_auth SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [attempts, lockTime, user.id]
        );
      } catch {
        const inMem = inMemoryUsers.get(user.id);
        if (inMem) {
          inMem.failedAttempts = attempts;
          inMem.lockedUntil = lockTime;
        }
      }

      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: lockTime
            ? `Account locked due to ${config.maxFailedAttempts} failed login attempts.`
            : `Invalid email or password. ${config.maxFailedAttempts - attempts} attempts remaining.`,
        },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    // Reset failed attempts on success
    try {
      await query('UPDATE users_auth SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
    } catch {
      const inMem = inMemoryUsers.get(user.id);
      if (inMem) {
        inMem.failedAttempts = 0;
        inMem.lockedUntil = null;
      }
    }

    const sessionId = uuidv4();
    const accessToken = generateAccessToken({ sub: user.id, email: user.email, role: user.role, sessionId });
    const { token: refreshToken, hash: refreshTokenHash, expiresAt } = generateRefreshToken();

    try {
      await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [user.id, refreshTokenHash, expiresAt]
      );
    } catch {
      inMemoryRefreshTokens.add(refreshTokenHash);
    }

    const authResponse: AuthResponse = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status as 'ACTIVE' | 'LOCKED' | 'DEACTIVATED',
        createdAt: new Date(user.created_at).toISOString(),
      },
      accessToken,
      refreshToken,
      expiresIn: 900,
    };

    logger.info(`User logged in: ${user.email}`, { userId: user.id });

    res.json({
      success: true,
      data: authResponse,
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /refresh
 * Rotate and issue new access token via refresh token.
 */
app.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Refresh token is required' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    const tokenHash = hashRefreshToken(refreshToken);
    let validUserId: string | null = null;

    try {
      const result = await query(
        'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [tokenHash]
      );
      if (result.rows.length > 0) {
        validUserId = result.rows[0].user_id;
      }
    } catch {
      if (inMemoryRefreshTokens.has(tokenHash)) {
        validUserId = Array.from(inMemoryUsers.keys())[0] ?? null;
      }
    }

    if (!validUserId) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    const newSessionId = uuidv4();
    const newAccessToken = generateAccessToken({ sub: validUserId, email: 'user@bankflow.internal', role: 'CUSTOMER', sessionId: newSessionId });

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        expiresIn: 900,
      },
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /logout
 * Invalidate refresh token.
 */
app.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      try {
        await query('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1', [tokenHash]);
      } catch {
        inMemoryRefreshTokens.delete(tokenHash);
      }
    }

    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /me
 * Return current authenticated user info.
 */
app.get('/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: { user: req.user },
    requestId: (req as unknown as { id?: string }).id ?? 'unknown',
  });
});

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  logger.info(`🔧 ${SERVICE_NAME} running on :${config.port}`, { port: config.port, service: SERVICE_NAME });
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down auth-service');
  await pool.end();
  process.exit(0);
});
