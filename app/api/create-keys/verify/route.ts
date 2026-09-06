import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createKeys } from '@/drizzle/schema';
import { ensureSchema } from '@/lib/db-init';
import {
  CREATE_KEY_COOKIE,
  CREATE_KEYS_REQUIRED,
  createKeyCookie,
  createKeyCookieMaxAge,
  isKeyUsable,
  keyHash,
} from '@/lib/create-keys';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

/**
 * One-time key entry for the create page: validates a pasted create key and
 * moves it into an httpOnly cookie, so scripts on the page never handle the
 * credential again. Only meaningful when the create-key gate is on.
 */
export async function POST(request: NextRequest) {
  if (!CREATE_KEYS_REQUIRED) {
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
    .from(createKeys)
    .where(and(eq(createKeys.keyHash, keyHash(parsed.data.key)), isNull(createKeys.revokedAt)));
  if (!row || !isKeyUsable(row)) {
    return NextResponse.json({ error: 'invalid_key' }, { status: 401 });
  }

  await db.update(createKeys).set({ lastUsedAt: new Date() }).where(eq(createKeys.id, row.id));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(createKeyCookie(parsed.data.key, createKeyCookieMaxAge(row.expiresAt)));
  return response;
}
