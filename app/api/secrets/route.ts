import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, deleteExpired } from '@/lib/db';
import { secrets, accessKeys } from '@/drizzle/schema';
import { ensureSchema } from '@/lib/db-init';
import { createSecretSchema } from '@/lib/validation';
import { clientIp, rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { apiMessage } from '@/lib/i18n-server';
import { parseJsonBody, SECRET_BODY_CAP } from '@/lib/request-body';
import {
  ACCESS_KEYS_REQUIRED,
  accessKeyCookie,
  accessKeyCookieMaxAge,
  clearedAccessKeyCookie,
  findUsableAccessKey,
  isKeyUsable,
  presentedAccessKey,
} from '@/lib/access-keys';

export async function POST(request: NextRequest) {
  const limit = rateLimit(`create:${await clientIp(request.headers)}`, RATE_LIMITS.createPerHour, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: await apiMessage(request, 'rate_limited') },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  // Hard byte cap on the actually-read body: Content-Length is client-supplied
  // and absent on chunked bodies, so only counting what we read bounds memory
  // regardless of transfer encoding (the proxy 1 MB caps are defense-in-depth).
  await ensureSchema();

  // Access-key gate (managed instances): unauthorized bodies are never read.
  let keyCookie: ReturnType<typeof accessKeyCookie> | null = null;
  if (ACCESS_KEYS_REQUIRED) {
    const presented = presentedAccessKey(request);
    const row = await findUsableAccessKey(presented);
    if (!row || !isKeyUsable(row)) {
      const response = NextResponse.json(
        { error: 'access_key_required', message: await apiMessage(request, 'access_key_required') },
        { status: 403 },
      );
      // A stale cookie would trap the holder in 403s — clear it.
      if (presented) response.cookies.set(clearedAccessKeyCookie());
      return response;
    }
    keyCookie = accessKeyCookie(presented, accessKeyCookieMaxAge(row.expiresAt));
    await db.update(accessKeys).set({ lastUsedAt: new Date() }).where(eq(accessKeys.id, row.id));
  }

  const parsed = await parseJsonBody(request, SECRET_BODY_CAP, createSecretSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  // Lazy cleanup piggybacks on traffic instead of a cron.
  await deleteExpired();

  const id = crypto.randomUUID();
  // A 1-view limit IS burn-after-read: normalize so those secrets take the
  // atomic consuming path and the UI's reveal confirmation (the schema
  // already rejects maxViews combined with burnAfterRead).
  const burnAfterRead = parsed.data.burnAfterRead || parsed.data.maxViews === 1;
  const maxViews = parsed.data.maxViews === 1 ? null : (parsed.data.maxViews ?? null);
  await db.insert(secrets).values({
    id,
    ...parsed.data,
    burnAfterRead,
    maxViews,
  });

  const response = NextResponse.json({ id }, { status: 201 });
  // Sliding cookie: a successful creation renews the holder's browser
  // credential (still capped by the key's own expiry).
  if (keyCookie) response.cookies.set(keyCookie);
  return response;
}
