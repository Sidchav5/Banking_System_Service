import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config';
import { JwtPayload } from '@bankflow/shared';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const options: SignOptions = {
    expiresIn: config.accessTokenExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, config.jwtSecret, options);
}

export function generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.refreshTokenExpiresInDays);

  return { token, hash, expiresAt };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
