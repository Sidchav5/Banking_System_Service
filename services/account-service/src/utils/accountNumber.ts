import crypto from 'crypto';

/**
 * Generates a realistic 12-digit bank account number.
 * Format: 1000XXXXXXXX (12 digits total)
 */
export function generateAccountNumber(): string {
  const prefix = '1000';
  const random8Digits = crypto.randomInt(10000000, 99999999).toString();
  return `${prefix}${random8Digits}`;
}
