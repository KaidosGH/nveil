import { createHash, timingSafeEqual } from 'node:crypto';
import { REPORT_ABUSE_KEY } from '@/lib/deployment';

/**
 * Constant-time check of the abuse-admin key. Both sides are hashed first so
 * the comparison length is fixed regardless of input.
 */
export function verifyAbuseKey(submitted: string): boolean {
  if (REPORT_ABUSE_KEY.length < 32 || submitted.length === 0) return false;
  const submittedHash = createHash('sha256').update(submitted).digest();
  const expectedHash = createHash('sha256').update(REPORT_ABUSE_KEY).digest();
  return timingSafeEqual(submittedHash, expectedHash);
}
