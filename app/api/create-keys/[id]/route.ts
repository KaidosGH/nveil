import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createKeys } from '@/drizzle/schema';
import { ensureSchema } from '@/lib/db-init';
import { requireManagement } from '@/lib/create-keys';

type RouteContext = { params: Promise<{ id: string }> };

/** Revokes a create key — takes effect immediately for every holder. */
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
    .update(createKeys)
    .set({ revokedAt: new Date() })
    .where(eq(createKeys.id, id))
    .returning({ id: createKeys.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
