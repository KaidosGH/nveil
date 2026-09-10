import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accessKeys } from '@/drizzle/schema';
import {
  ACCESS_KEYS_REQUIRED,
  accessKeyCookie,
  accessKeyCookieMaxAge,
  findUsableAccessKey,
  isKeyUsable,
} from '@/lib/access-keys';
import { ensureSchema } from '@/lib/db-init';
import { clientIp, RATE_LIMITS, rateLimit } from '@/lib/rate-limit';
import { ADMIN_BODY_CAP, parseJsonBody } from '@/lib/request-body';
import { keyBodySchema } from '@/lib/validation';

/**
 * One-time key entry for the create page: validates a pasted access key and
 * moves it into an httpOnly cookie, so scripts on the page never handle the
 * credential again. Only meaningful when the access-key gate is on.
 */
export async function POST(request: NextRequest) {
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

  // Public-facing (any visitor of a managed instance can paste a key), so the
  // body is read under the same cap as the management metadata routes.
  const parsed = await parseJsonBody(request, ADMIN_BODY_CAP, keyBodySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const row = await findUsableAccessKey(parsed.data.key);
  if (!row || !isKeyUsable(row)) {
    return NextResponse.json({ error: 'invalid_key' }, { status: 401 });
  }

  await db.update(accessKeys).set({ lastUsedAt: new Date() }).where(eq(accessKeys.id, row.id));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(accessKeyCookie(parsed.data.key, accessKeyCookieMaxAge(row.expiresAt)));
  return response;
}
