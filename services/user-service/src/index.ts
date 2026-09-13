import 'dotenv/config';
import express from 'express';
import {
  createLogger,
  requestIdMiddleware,
  correlationIdMiddleware,
  errorHandler,
  authenticateToken,
  requireRole,
  UserProfile,
  UpdateProfileRequest,
} from '@bankflow/shared';

import { config } from './config';
import { pool, query } from './db';

const SERVICE_NAME = 'user-service';
const logger = createLogger(SERVICE_NAME);
const app = express();
const startTime = Date.now();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(correlationIdMiddleware);

// In-Memory store fallback for standalone testing
const inMemoryProfiles = new Map<string, UserProfile>();

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

// ─── User Profile Routes ──────────────────────────────────────────────────────

/**
 * POST /profile
 * Internal/Registration hook to initialize a user profile.
 */
app.post('/profile', async (req, res, next) => {
  try {
    const { userId, email, firstName, lastName, phone } = req.body;

    if (!userId || !email || !firstName || !lastName) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId, email, firstName, and lastName are required' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    const now = new Date().toISOString();
    const profile: UserProfile = {
      id: userId,
      email: email.toLowerCase(),
      firstName,
      lastName,
      phone: phone ?? '',
      kycStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await query(
        `INSERT INTO user_profiles (id, email, first_name, last_name, phone, kyc_status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET first_name = $3, last_name = $4, phone = $5`,
        [userId, email.toLowerCase(), firstName, lastName, phone ?? '', 'PENDING']
      );
    } catch {
      inMemoryProfiles.set(userId, profile);
    }

    logger.info('User profile created', { userId, email });

    res.status(201).json({
      success: true,
      data: profile,
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /profile
 * Fetch authenticated user's own profile.
 */
app.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    let profile: UserProfile | null = null;

    try {
      const result = await query('SELECT * FROM user_profiles WHERE id = $1', [userId]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        profile = {
          id: row.id,
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          phone: row.phone,
          dateOfBirth: row.date_of_birth,
          address: row.address,
          city: row.city,
          state: row.state,
          zipCode: row.zip_code,
          kycStatus: row.kyc_status,
          kycDocuments: row.kyc_documents,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        };
      }
    } catch {
      profile = inMemoryProfiles.get(userId) ?? null;
    }

    if (!profile) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User profile not found' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    res.json({
      success: true,
      data: profile,
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /profile
 * Update authenticated user's profile information.
 */
app.put('/profile', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const { firstName, lastName, phone, dateOfBirth, address, city, state, zipCode } = req.body as UpdateProfileRequest;

    const now = new Date();

    try {
      await query(
        `UPDATE user_profiles
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             phone = COALESCE($3, phone),
             date_of_birth = COALESCE($4, date_of_birth),
             address = COALESCE($5, address),
             city = COALESCE($6, city),
             state = COALESCE($7, state),
             zip_code = COALESCE($8, zip_code),
             updated_at = $9
         WHERE id = $10`,
        [firstName, lastName, phone, dateOfBirth, address, city, state, zipCode, now, userId]
      );
    } catch {
      const existing = inMemoryProfiles.get(userId);
      if (existing) {
        if (firstName) existing.firstName = firstName;
        if (lastName) existing.lastName = lastName;
        if (phone) existing.phone = phone;
        if (dateOfBirth) existing.dateOfBirth = dateOfBirth;
        if (address) existing.address = address;
        if (city) existing.city = city;
        if (state) existing.state = state;
        if (zipCode) existing.zipCode = zipCode;
        existing.updatedAt = now.toISOString();
      }
    }

    res.json({
      success: true,
      data: { message: 'Profile updated successfully' },
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /:id
 * Admin/Employee view any user profile.
 */
app.get('/:id', authenticateToken, requireRole('ADMIN', 'EMPLOYEE', 'AUDITOR'), async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    let profile: UserProfile | null = null;

    try {
      const result = await query('SELECT * FROM user_profiles WHERE id = $1', [targetUserId]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        profile = {
          id: row.id,
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          phone: row.phone,
          dateOfBirth: row.date_of_birth,
          address: row.address,
          city: row.city,
          state: row.state,
          zipCode: row.zip_code,
          kycStatus: row.kyc_status,
          kycDocuments: row.kyc_documents,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        };
      }
    } catch {
      profile = inMemoryProfiles.get(targetUserId) ?? null;
    }

    if (!profile) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Profile for user ID '${targetUserId}' not found` },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    res.json({
      success: true,
      data: profile,
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /:id/kyc
 * Admin/Employee update KYC verification status.
 */
app.patch('/:id/kyc', authenticateToken, requireRole('ADMIN', 'EMPLOYEE'), async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const { status } = req.body;

    if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(status)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Status must be one of PENDING, VERIFIED, or REJECTED' },
        requestId: (req as unknown as { id?: string }).id ?? 'unknown',
      });
      return;
    }

    try {
      await query('UPDATE user_profiles SET kyc_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, targetUserId]);
    } catch {
      const existing = inMemoryProfiles.get(targetUserId);
      if (existing) {
        existing.kycStatus = status;
        existing.updatedAt = new Date().toISOString();
      }
    }

    logger.info(`KYC status updated for user ${targetUserId}: ${status}`, { adminId: req.user!.sub });

    res.json({
      success: true,
      data: { userId: targetUserId, kycStatus: status },
      requestId: (req as unknown as { id?: string }).id ?? 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  logger.info(`🔧 ${SERVICE_NAME} running on :${config.port}`, { port: config.port, service: SERVICE_NAME });
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down user-service');
  await pool.end();
  process.exit(0);
});
