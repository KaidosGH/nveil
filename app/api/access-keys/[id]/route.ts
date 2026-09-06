import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accessKeys } from '@/drizzle/schema';
import { ensureSchema } from '@/lib/db-init';
import { requireManagement } from '@/lib/access-keys';

type RouteContext = { params: Promise<{ id: string }> };

/** Revokes an access key — takes effect immediately for every holder. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const gate = await requireManagement(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: gate.retryAfter ? { 'Retry-After': String(gate.retryAfter) } : undefined },
    );
  }

  const { id } = await context.params;
  const updated = await db
    .update(accessKeys)
    .set({ revokedAt: new Date() })
    .where(eq(accessKeys.id, id))
    .returning({ id: accessKeys.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
