import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { abuseReports } from '@/drizzle/schema';
import { requireAbuseAdmin } from '@/lib/abuse-key';

type RouteContext = { params: Promise<{ id: string }> };

/** Closes a report without touching the underlying secret. */
export async function POST(request: NextRequest, context: RouteContext) {
  const denied = await requireAbuseAdmin(request);
  if (denied) return denied;

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
