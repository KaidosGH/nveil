import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accessKeys } from '@/drizzle/schema';
import { ensureSchema } from '@/lib/db-init';
import {
  ACCESS_KEY_COOKIE,
  ACCESS_KEYS_REQUIRED,
  accessKeyCookie,
  isKeyUsable,
  keyHash,
} from '@/lib/access-keys';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * Session-info for the create-key gate: tells the holder of a valid key
 * WHICH key is active (display prefix + label only — no secret material)
 * and lets them forget it on this browser (clears the httpOnly cookie).
 * Only meaningful when the access-key gate is on.
 */

function presentedKey(request: NextRequest): string {
  return request.cookies.get(ACCESS_KEY_COOKIE)?.value ?? request.headers.get('x-access-key') ?? '';
}

export async function GET(request: NextRequest) {
  if (!ACCESS_KEYS_REQUIRED) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const limit = rateLimit(`ckv:${await clientIp(request.headers)}`, 10, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  await ensureSchema();

  const presented = presentedKey(request);
  const [row] = presented
    ? await db
        .select()
        .from(accessKeys)
        .where(and(eq(accessKeys.keyHash, keyHash(presented)), isNull(accessKeys.revokedAt)))
    : [];
  if (!row || !isKeyUsable(row)) {
    return NextResponse.json({ error: 'invalid_key' }, { status: 401 });
  }
  return NextResponse.json({ prefix: row.keyPrefix, label: row.label });
}

/** Forgets the key on this browser: clears the httpOnly cookie. */
export async function DELETE(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({
    name: ACCESS_KEY_COOKIE,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
