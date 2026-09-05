import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time comparison of a submitted creator token against the stored hash. */
export function verifyCreatorToken(token: string, storedHash: string): boolean {
  const submitted = createHash('sha256').update(Buffer.from(token, 'base64url')).digest();
  const stored = Buffer.from(storedHash, 'base64url');
  return submitted.length === stored.length && timingSafeEqual(submitted, stored);
}
