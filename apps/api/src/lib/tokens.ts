import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque bearer tokens for magic links and sessions.
 *
 * We hand out the raw token exactly once and store only its SHA-256, so the
 * database never contains anything that can be replayed as a credential. Lookups
 * are by hash, which is a constant-length exact match - no timing comparison needed.
 */

/** 256 bits of entropy, URL- and email-safe. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
