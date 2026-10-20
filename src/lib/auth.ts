import crypto from 'crypto';
import { nanoid } from 'nanoid';

/**
 * Generates an opaque random token (32 chars) for host or participant access.
 */
export function generateToken(): string {
  return nanoid(32);
}

/**
 * Generates a short human-friendly 6-character uppercase session code (e.g. 'SPLIT4', 'EAT889')
 */
export function generateSessionCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude 0, 1, I, O to avoid visual confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Computes a SHA-256 hash of a secret token for secure database storage.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Validates a plain token against its stored SHA-256 hash using constant-time comparison.
 */
export function verifyToken(plainToken: string, storedHash: string): boolean {
  if (!plainToken || !storedHash) return false;
  const computed = hashToken(plainToken);
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
  } catch {
    return false;
  }
}
