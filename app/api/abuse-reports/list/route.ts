import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, isNull } from 'drizzle-orm';
import { db, deleteExpired } from '@/lib/db';
import { abuseReports, secrets } from '@/drizzle/schema';
import { verifyAbuseKey } from '@/lib/abuse-key';
import { ABUSE_REPORTS_ENABLED } from '@/lib/deployment';
import { clientIp, rateLimit } from '@/lib/rate-limit';

function forbidden() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

/**
 * Admin queue: reports with live existence of the underlying secret.
 * By default only open (unresolved) reports are returned; `?includeResolved`
 * also returns closed ones (they are purged after the retention window).
 */
export async function GET(request: NextRequest) {
  // The key itself is unguessable; the limiter blunts brute force in case an
  // operator picked a guessable (>= 32 char) passphrase as the key.
  const limit = rateLimit(`abuse-admin:${await clientIp(request.headers)}`, 30, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (!ABUSE_REPORTS_ENABLED || !verifyAbuseKey(request.headers.get('x-abuse-key') ?? '')) {
    return forbidden();
  }

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
