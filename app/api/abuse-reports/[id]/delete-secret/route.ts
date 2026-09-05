import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { abuseReports, secrets } from '@/drizzle/schema';
import { verifyAbuseKey } from '@/lib/abuse-key';
import { ABUSE_REPORTS_ENABLED } from '@/lib/deployment';
import { clientIp, rateLimit } from '@/lib/rate-limit';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Deletes the underlying secret (if it still exists) and closes the report.
 * The report row is kept as an audit trail.
 */
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
  const [report] = await db.select().from(abuseReports).where(eq(abuseReports.id, id));
  if (!report) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const [deletedSecret] = await db
    .delete(secrets)
    .where(eq(secrets.id, report.secretId))
    .returning();

  const now = new Date();
  await db
    .update(abuseReports)
    .set({ deletedAt: now, resolvedAt: now })
    .where(eq(abuseReports.id, id));

  return NextResponse.json({ deleted: !!deletedSecret });
}
