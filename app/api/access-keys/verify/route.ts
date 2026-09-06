import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accessKeys } from '@/drizzle/schema';
import { ensureSchema } from '@/lib/db-init';
import {
  ACCESS_KEY_COOKIE,
  ACCESS_KEYS_REQUIRED,
  accessKeyCookie,
  accessKeyCookieMaxAge,
  isKeyUsable,
  keyHash,
} from '@/lib/access-keys';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

/**
 * One-time key entry for the create page: validates a pasted create key and
 * moves it into an httpOnly cookie, so scripts on the page never handle the
 * credential again. Only meaningful when the access-key gate is on.
 */
export async function POST(request: NextRequest) {
  if (!ACCESS_KEYS_REQUIRED) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const limit = rateLimit(`ckv:${await clientIp(request.headers)}`, 10, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  await ensureSchema();

  const raw = await request.json().catch(() => null);
  const parsed = z.object({ key: z.string().min(1).max(200) }).safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_key' }, { status: 401 });
  }

  const [row] = await db
    .select()
    .from(accessKeys)
    .where(and(eq(accessKeys.keyHash, keyHash(parsed.data.key)), isNull(accessKeys.revokedAt)));
  if (!row || !isKeyUsable(row)) {
    return NextResponse.json({ error: 'invalid_key' }, { status: 401 });
  }

  await db.update(accessKeys).set({ lastUsedAt: new Date() }).where(eq(accessKeys.id, row.id));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(accessKeyCookie(parsed.data.key, accessKeyCookieMaxAge(row.expiresAt)));
  return response;
}
