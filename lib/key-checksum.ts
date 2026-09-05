import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of a submitted key checksum against the stored
 * one. Same pattern as verifyCreatorToken/verifyAbuseKey: both sides are
 * hashed to a fixed length before the timing-safe compare.
 */
export function verifyKeyChecksum(submitted: string, stored: string): boolean {
  const submittedHash = createHash('sha256').update(submitted).digest();
  const storedHash = createHash('sha256').update(stored).digest();
  return timingSafeEqual(submittedHash, storedHash);
}
