import { NextRequest, NextResponse } from 'next/server';
import { db, deleteExpired } from '@/lib/db';
import { ensureSchema } from '@/lib/db-init';
import { secrets } from '@/drizzle/schema';
import { createSecretSchema } from '@/lib/validation';
import { clientIp, rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { apiMessage } from '@/lib/i18n-server';

export async function POST(request: NextRequest) {
  const limit = rateLimit(`create:${await clientIp(request.headers)}`, RATE_LIMITS.createPerHour, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: apiMessage(request, 'rate_limited') },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  // Reject oversized uploads before request.json() pulls the whole body into memory.
  // ponytail: Content-Length is client-supplied (chunked bodies bypass it); a
  // streaming read with a hard cap is the upgrade path if this ever matters.
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 300_000) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = createSecretSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  await ensureSchema();
  // Lazy cleanup piggybacks on traffic instead of a cron.
  await deleteExpired();

  const id = crypto.randomUUID();
  await db.insert(secrets).values({ id, ...parsed.data });

  return NextResponse.json({ id }, { status: 201 });
}
