import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, deleteExpired } from '@/lib/db';
import { secrets } from '@/drizzle/schema';
import { clientIp, rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { verifyCreatorToken } from '@/lib/creator-token';
import { verifyKeyChecksum } from '@/lib/key-checksum';
import { apiMessage } from '@/lib/i18n-server';

type RouteContext = { params: Promise<{ id: string }> };

function error(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: code, message }, { status, headers });
}

// Secret state changes without URL changes (expiry, burns) — browsers and any
// intermediate proxy must never reuse a cached response.
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest, context: RouteContext) {
  const limit = rateLimit(`view:${await clientIp(request.headers)}`, RATE_LIMITS.viewPerMinute, 60 * 1000);
  if (!limit.ok) {
    return error(429, 'rate_limited', apiMessage(request, 'rate_limited'), {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  const { id } = await context.params;

  const [secret] = await db.select().from(secrets).where(eq(secrets.id, id));
  if (!secret) {
    return error(404, 'not_found', apiMessage(request, 'not_found'));
  }
  if (secret.expiresAt.getTime() < Date.now()) {
    await db.delete(secrets).where(eq(secrets.id, id));
    return error(410, 'expired', apiMessage(request, 'expired'));
  }
  // Lazy cleanup piggybacks on traffic instead of a cron.
  await deleteExpired();

  // The creator token arrives exclusively in a header — the fragment-based
  // management links keep it out of proxy access logs, and there is no
  // query-string channel for it to leak through.
  const token = request.headers.get('x-creator-token');
  if (token !== null && !verifyCreatorToken(token, secret.creatorTokenHash)) {
    return error(403, 'invalid_token', apiMessage(request, 'invalid_token'));
  }

  // Status probe: keyless (the view flow's pre-check) returns the burn and
  // password flags; with a valid creator token it returns the full metadata
  // the manage page needs. Metadata never includes the stored key checksum.
  //
  // For password-protected secrets the keyless probe also returns the wrapped
  // key envelope: the recipient's link is keyless by design, so this is the
  // only way the password gate can obtain the material it unwraps. The
  // envelope is useless without the password (PBKDF2 + GCM), and burn
  // consumption still requires the unwrapped key's checksum — a wrong
  // password never reaches the consuming fetch.
  if (request.nextUrl.searchParams.has('meta')) {
    const wrapped = secret.hasPassword
      ? { wrappedKey: secret.wrappedKey, wrapIv: secret.wrapIv, wrapSalt: secret.wrapSalt }
      : {};
    const meta =
      token !== null
        ? {
            burnAfterRead: secret.burnAfterRead,
            hasPassword: secret.hasPassword,
            ...wrapped,
            createdAt: secret.createdAt,
            expiresAt: secret.expiresAt,
            viewedAt: secret.viewedAt,
          }
        : { burnAfterRead: secret.burnAfterRead, hasPassword: secret.hasPassword, ...wrapped };
    return NextResponse.json(meta, { headers: NO_STORE });
  }

  // Every payload read must present the key checksum. This verifies knowledge
  // of the key server-side (403 otherwise) and avoids publishing the stored
  // checksum, which would hand keyless callers an offline guessing oracle.
  const checksum = request.headers.get('x-key-checksum');
  if (!checksum || !verifyKeyChecksum(checksum, secret.keyChecksum)) {
    return error(403, 'invalid_key', apiMessage(request, 'invalid_key'));
  }

  // Burn-after-read: the first key-valid request consumes the secret. Row
  // deletion and payload return happen in one atomic statement, so concurrent
  // readers cannot both receive the ciphertext.
  if (secret.burnAfterRead) {
    const [burned] = await db
      .delete(secrets)
      .where(and(eq(secrets.id, id), eq(secrets.keyChecksum, checksum)))
      .returning();
    if (!burned) {
      return error(404, 'consumed', apiMessage(request, 'consumed'));
    }
    return NextResponse.json({
      ciphertext: burned.ciphertext,
      iv: burned.iv,
      hasPassword: burned.hasPassword,
      wrappedKey: burned.hasPassword ? burned.wrappedKey : undefined,
      wrapIv: burned.hasPassword ? burned.wrapIv : undefined,
      wrapSalt: burned.hasPassword ? burned.wrapSalt : undefined,
      burnAfterRead: true,
      createdAt: burned.createdAt,
      expiresAt: burned.expiresAt,
      viewedAt: burned.viewedAt,
    }, { headers: NO_STORE });
  }

  // Only the view flow (no token) marks the secret as viewed — manage-page
  // visits must not pollute the metadata.
  if (token === null && secret.viewedAt === null) {
    secret.viewedAt = new Date();
    await db.update(secrets).set({ viewedAt: secret.viewedAt }).where(eq(secrets.id, id));
  }

  return NextResponse.json({
    ciphertext: secret.ciphertext,
    iv: secret.iv,
    hasPassword: secret.hasPassword,
    wrappedKey: secret.hasPassword ? secret.wrappedKey : undefined,
    wrapIv: secret.hasPassword ? secret.wrapIv : undefined,
    wrapSalt: secret.hasPassword ? secret.wrapSalt : undefined,
    burnAfterRead: secret.burnAfterRead,
    createdAt: secret.createdAt,
    expiresAt: secret.expiresAt,
    viewedAt: secret.viewedAt,
  }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  // Deletion is authenticated by the 256-bit token itself; the limiter only
  // blunts token-guessing and burn spam.
  const limit = rateLimit(`delete:${await clientIp(request.headers)}`, RATE_LIMITS.deletePerMinute, 60 * 1000);
  if (!limit.ok) {
    return error(429, 'rate_limited', apiMessage(request, 'rate_limited'), {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  const { id } = await context.params;

  const [secret] = await db.select().from(secrets).where(eq(secrets.id, id));
  if (!secret) {
    return error(404, 'not_found', apiMessage(request, 'not_found'));
  }

  // Deletion always requires the creator token. (A token-less branch for burn
  // secrets existed for the old client-side burn flow; since burn consumption
  // moved server-side into GET, that path was only ever reachable as a
  // denial-of-service by anyone holding the bare ID.)
  const token = request.headers.get('x-creator-token');
  if (token === null) {
    return error(403, 'token_required', apiMessage(request, 'token_required'));
  }
  if (!verifyCreatorToken(token, secret.creatorTokenHash)) {
    return error(403, 'invalid_token', apiMessage(request, 'invalid_token'));
  }

  await db.delete(secrets).where(eq(secrets.id, id));
  return NextResponse.json({ ok: true });
}
