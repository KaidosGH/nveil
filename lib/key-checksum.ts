import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison: both sides are hashed to a fixed length
 * first, so neither input length nor content can leak through timing.
 * Shared by the management/abuse/key-checksum verifiers (verifyCreatorToken
 * stays bespoke — it compares a submitted digest against a stored hash).
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const aHash = createHash('sha256').update(a).digest();
  const bHash = createHash('sha256').update(b).digest();
  return timingSafeEqual(aHash, bHash);
}

/**
 * Constant-time comparison of a submitted key checksum against the stored
 * one. Same pattern as verifyCreatorToken/verifyAbuseKey: both sides are
 * hashed to a fixed length before the timing-safe compare.
 */
export function verifyKeyChecksum(submitted: string, stored: string): boolean {
  return timingSafeEqualStrings(submitted, stored);
}
