import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, isNull } from 'drizzle-orm';
import { db, deleteExpired } from '@/lib/db';
import { abuseReports, secrets } from '@/drizzle/schema';
import { requireAbuseAdmin } from '@/lib/abuse-key';

/**
 * Admin queue: reports with live existence of the underlying secret.
 * By default only open (unresolved) reports are returned; `?includeResolved`
 * also returns closed ones (they are purged after the retention window).
 */
export async function GET(request: NextRequest) {
  const denied = await requireAbuseAdmin(request);
  if (denied) return denied;

  await deleteExpired();

  const includeResolved = request.nextUrl.searchParams.has('includeResolved');
  const rows = await db
    .select({
      id: abuseReports.id,
      secretId: abuseReports.secretId,
      reason: abuseReports.reason,
      witnessVerified: abuseReports.witnessVerified,
      existedAtReport: abuseReports.existedAtReport,
      secretExpiresAt: abuseReports.secretExpiresAt,
      createdAt: abuseReports.createdAt,
      resolvedAt: abuseReports.resolvedAt,
      deletedAt: abuseReports.deletedAt,
      stillExists: secrets.id,
    })
    .from(abuseReports)
    .leftJoin(secrets, eq(abuseReports.secretId, secrets.id))
    .$dynamic()
    .where(includeResolved ? undefined : isNull(abuseReports.resolvedAt))
    .orderBy(desc(abuseReports.createdAt));

  return NextResponse.json(
    {
      reports: rows.map((row) => ({ ...row, stillExists: row.stillExists !== null })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
