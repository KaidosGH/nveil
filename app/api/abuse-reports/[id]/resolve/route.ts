import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { abuseReports } from '@/drizzle/schema';
import { verifyAbuseKey } from '@/lib/abuse-key';
import { ABUSE_REPORTS_ENABLED } from '@/lib/deployment';
import { clientIp, rateLimit } from '@/lib/rate-limit';

type RouteContext = { params: Promise<{ id: string }> };

/** Closes a report without touching the underlying secret. */
export async function POST(request: NextRequest, context: RouteContext) {
  // Brute-force blunting (see the list route); the key itself is unguessable.
  const limit = rateLimit(`abuse-admin:${await clientIp(request.headers)}`, 30, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (!ABUSE_REPORTS_ENABLED || !verifyAbuseKey(request.headers.get('x-abuse-key') ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const updated = await db
    .update(abuseReports)
    .set({ resolvedAt: new Date() })
    .where(eq(abuseReports.id, id))
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
