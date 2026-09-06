import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db, deleteExpired } from '@/lib/db';
import { accessKeys, secrets } from '@/drizzle/schema';
import { ensureSchema } from '@/lib/db-init';
import { createSecretSchema } from '@/lib/validation';
import { clientIp, rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { apiMessage } from '@/lib/i18n-server';
import { readBodyCapped } from '@/lib/request-body';
import {
  ACCESS_KEY_COOKIE,
  ACCESS_KEYS_REQUIRED,
  createKeyCookie,
  createKeyCookieMaxAge,
  isKeyUsable,
  keyHash,
} from '@/lib/access-keys';

/** JSON body cap: ciphertext max (~137 KB) + envelope/metadata overhead. */
const BODY_CAP = 300_000;

export async function POST(request: NextRequest) {
  const limit = rateLimit(`create:${await clientIp(request.headers)}`, RATE_LIMITS.createPerHour, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: apiMessage(request, 'rate_limited') },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  // Hard byte cap on the actually-read body: Content-Length is client-supplied
  // and absent on chunked bodies, so only counting what we read bounds memory
  // regardless of transfer encoding (the proxy 1 MB caps are defense-in-depth).
  await ensureSchema();

  // Access-key gate (managed instances): unauthorized bodies are never read.
  let keyCookie: ReturnType<typeof createKeyCookie> | null = null;
  if (ACCESS_KEYS_REQUIRED) {
    const presented =
      request.headers.get('x-access-key') ?? request.cookies.get(ACCESS_KEY_COOKIE)?.value ?? '';
    const [row] = presented
      ? await db
          .select()
          .from(accessKeys)
          .where(and(eq(accessKeys.keyHash, keyHash(presented)), isNull(accessKeys.revokedAt)))
      : [];
    if (!row || !isKeyUsable(row)) {
      const response = NextResponse.json(
        { error: 'access_key_required', message: apiMessage(request, 'access_key_required') },
        { status: 403 },
      );
      // A stale cookie would trap the holder in 403s — clear it.
      if (presented) {
        response.cookies.set({ name: ACCESS_KEY_COOKIE, value: '', httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0 });
      }
      return response;
    }
    keyCookie = createKeyCookie(presented, createKeyCookieMaxAge(row.expiresAt));
    await db.update(accessKeys).set({ lastUsedAt: new Date() }).where(eq(accessKeys.id, row.id));
  }

  const raw = await readBodyCapped(request, BODY_CAP);
  if (raw === null) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = createSecretSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  // Lazy cleanup piggybacks on traffic instead of a cron.
  await deleteExpired();

  const id = crypto.randomUUID();
  await db.insert(secrets).values({ id, ...parsed.data });

  const response = NextResponse.json({ id }, { status: 201 });
  // Sliding cookie: a successful creation renews the holder's browser
  // credential (still capped by the key's own expiry).
  if (keyCookie) response.cookies.set(keyCookie);
  return response;
}
