import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { abuseReports, secrets } from '@/drizzle/schema';
import { requireAbuseAdmin } from '@/lib/abuse-key';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Deletes the underlying secret (if it still exists) and closes the report.
 * The report row is kept as an audit trail.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const denied = await requireAbuseAdmin(request);
  if (denied) return denied;

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
