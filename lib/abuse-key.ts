import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ABUSE_REPORTS_ENABLED, REPORT_ABUSE_KEY } from '@/lib/deployment';
import { clientIp, RATE_LIMITS, rateLimit } from '@/lib/rate-limit';

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

/**
 * Gate shared by the operator queue endpoints (list, resolve, delete-secret):
 * per-IP limiter first (brute-force blunting; the key itself is unguessable
 * and fail-closed via ABUSE_REPORTS_ENABLED), then the key check. Returns the
 * response to send, or null when the caller is authorized.
 */
export async function requireAbuseAdmin(request: NextRequest): Promise<NextResponse | null> {
  const limit = rateLimit(
    `abuse-admin:${await clientIp(request.headers)}`,
    RATE_LIMITS.abuseAdminPerMinute,
    60 * 1000,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }
  if (!ABUSE_REPORTS_ENABLED || !verifyAbuseKey(request.headers.get('x-abuse-key') ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
