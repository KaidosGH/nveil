import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_KEYS_REQUIRED, clearedAccessKeyCookie, findUsableAccessKey, isKeyUsable, presentedAccessKey } from '@/lib/access-keys';
import { ensureSchema } from '@/lib/db-init';
import { clientIp, RATE_LIMITS, rateLimit } from '@/lib/rate-limit';

/**
 * Session-info for the access-key gate: tells the holder of a valid key
 * WHICH key is active (display prefix + label only — no secret material)
 * and lets them forget it on this browser (clears the httpOnly cookie).
 * Only meaningful when the access-key gate is on.
 */

export async function GET(request: NextRequest) {
  if (!ACCESS_KEYS_REQUIRED) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const limit = rateLimit(`access-key:${await clientIp(request.headers)}`, RATE_LIMITS.accessKeyVerifyPerMinute, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }
  await ensureSchema();

  const row = await findUsableAccessKey(presentedAccessKey(request));
  if (!row || !isKeyUsable(row)) {
    return NextResponse.json({ error: 'invalid_key' }, { status: 401 });
  }
  return NextResponse.json({ prefix: row.keyPrefix, label: row.label });
}

/** Forgets the key on this browser: clears the httpOnly cookie. */
export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(clearedAccessKeyCookie());
  return response;
}
