import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createKeys } from '@/drizzle/schema';
import { ensureSchema } from '@/lib/db-init';
import { MANAGEMENT_ENABLED, verifyManagementKey } from '@/lib/create-keys';
import { clientIp, rateLimit } from '@/lib/rate-limit';

type RouteContext = { params: Promise<{ id: string }> };

/** Revokes a create key — takes effect immediately for every holder. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const limit = rateLimit(`mgmt:${await clientIp(request.headers)}`, 30, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  await ensureSchema();
  if (!MANAGEMENT_ENABLED || !verifyManagementKey(request.headers.get('x-management-key') ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const updated = await db
    .update(createKeys)
    .set({ revokedAt: new Date() })
    .where(eq(createKeys.id, id))
    .returning({ id: createKeys.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
