import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
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

type SecretRow = typeof secrets.$inferSelect;

/**
 * The payload shape is identical for a burned and an untouched read; only the
 * row source differs. One mapper so a new field can't be added to one branch
 * and forgotten in the other. The wrapped key envelope is exposed only for
 * password-protected secrets.
 */
function payload(s: SecretRow) {
  return {
    ciphertext: s.ciphertext,
    iv: s.iv,
    hasPassword: s.hasPassword,
    wrappedKey: s.hasPassword ? s.wrappedKey : undefined,
    wrapIv: s.hasPassword ? s.wrapIv : undefined,
    wrapSalt: s.hasPassword ? s.wrapSalt : undefined,
    burnAfterRead: s.burnAfterRead,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    viewedAt: s.viewedAt,
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const limit = rateLimit(`view:${await clientIp(request.headers)}`, RATE_LIMITS.viewPerMinute, 60 * 1000);
  if (!limit.ok) {
    return error(429, 'rate_limited', await apiMessage(request, 'rate_limited'), {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  const { id } = await context.params;

  const [secret] = await db.select().from(secrets).where(eq(secrets.id, id));
  if (!secret) {
    return error(404, 'not_found', await apiMessage(request, 'not_found'));
  }
  if (secret.expiresAt.getTime() < Date.now()) {
    await db.delete(secrets).where(eq(secrets.id, id));
    return error(410, 'expired', await apiMessage(request, 'expired'));
  }
  // Lazy cleanup piggybacks on traffic instead of a cron.
  await deleteExpired();

  // The creator token arrives exclusively in a header — the fragment-based
  // management links keep it out of proxy access logs, and there is no
  // query-string channel for it to leak through.
  const token = request.headers.get('x-creator-token');
  if (token !== null && !verifyCreatorToken(token, secret.creatorTokenHash)) {
    return error(403, 'invalid_token', await apiMessage(request, 'invalid_token'));
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
            maxViews: secret.maxViews,
            viewCount: secret.viewCount,
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
    return error(403, 'invalid_key', await apiMessage(request, 'invalid_key'));
  }

  // Consuming read — burn-after-read, or the final allowed view of a
  // view-limited secret (view_count = max_views - 1). One atomic statement:
  // Postgres row locking means concurrent final readers cannot both be
  // granted, the same guarantee burn-after-read has always had. With NULL
  // max_views the comparison is NULL and only burn rows match; a wrong key
  // can never reach this statement (the checksum was verified above).
  const [consumed] = await db
    .delete(secrets)
    .where(
      and(
        eq(secrets.id, id),
        eq(secrets.keyChecksum, checksum),
        or(eq(secrets.burnAfterRead, true), sql`${secrets.viewCount} = ${secrets.maxViews} - 1`),
      ),
    )
    .returning();
  if (consumed) {
    return NextResponse.json(payload(consumed), { headers: NO_STORE });
  }

  // Non-consuming read: increments the counter under the remaining-views
  // guard, so concurrent readers can never push past the cap and both be
  // granted. Only the view flow (no token) marks the secret as viewed —
  // manage-page visits must not pollute the metadata.
  const [granted] = await db
    .update(secrets)
    .set({
      viewCount: sql`${secrets.viewCount} + 1`,
      ...(token === null ? { viewedAt: sql`COALESCE(${secrets.viewedAt}, now())` } : {}),
    })
    .where(
      and(
        eq(secrets.id, id),
        eq(secrets.keyChecksum, checksum),
        or(isNull(secrets.maxViews), sql`${secrets.viewCount} < ${secrets.maxViews}`),
      ),
    )
    .returning();
  if (!granted) {
    // Valid key (verified above) but nothing left to grant: consumed or burned.
    return error(404, 'consumed', await apiMessage(request, 'consumed'));
  }
  // Concurrent grants can land exactly on the cap; the guard keeps the row
  // unreadable from here on — drop it so the ciphertext doesn't linger.
  if (granted.maxViews !== null && granted.viewCount >= granted.maxViews) {
    await db.delete(secrets).where(eq(secrets.id, id));
  }

  return NextResponse.json(payload(granted), { headers: NO_STORE });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  // Deletion is authenticated by the 256-bit token itself; the limiter only
  // blunts token-guessing and burn spam.
  const limit = rateLimit(`delete:${await clientIp(request.headers)}`, RATE_LIMITS.deletePerMinute, 60 * 1000);
  if (!limit.ok) {
    return error(429, 'rate_limited', await apiMessage(request, 'rate_limited'), {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  const { id } = await context.params;

  const [secret] = await db.select().from(secrets).where(eq(secrets.id, id));
  if (!secret) {
    return error(404, 'not_found', await apiMessage(request, 'not_found'));
  }

  // Deletion always requires the creator token. (A token-less branch for burn
  // secrets existed for the old client-side burn flow; since burn consumption
  // moved server-side into GET, that path was only ever reachable as a
  // denial-of-service by anyone holding the bare ID.)
  const token = request.headers.get('x-creator-token');
  if (token === null) {
    return error(403, 'token_required', await apiMessage(request, 'token_required'));
  }
  if (!verifyCreatorToken(token, secret.creatorTokenHash)) {
    return error(403, 'invalid_token', await apiMessage(request, 'invalid_token'));
  }

  await db.delete(secrets).where(eq(secrets.id, id));
  return NextResponse.json({ ok: true });
}
