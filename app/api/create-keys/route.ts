import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createKeys } from '@/drizzle/schema';
import { ensureSchema } from '@/lib/db-init';
import { generateCreateKey, requireManagement } from '@/lib/create-keys';

export async function GET(request: NextRequest) {
  const gate = await requireManagement(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: gate.retryAfter ? { 'Retry-After': String(gate.retryAfter) } : undefined },
    );
  }
  const rows = await db
    .select({
      id: createKeys.id,
      label: createKeys.label,
      prefix: createKeys.keyPrefix,
      createdAt: createKeys.createdAt,
      expiresAt: createKeys.expiresAt,
      lastUsedAt: createKeys.lastUsedAt,
      revokedAt: createKeys.revokedAt,
    })
    .from(createKeys)
    .orderBy(desc(createKeys.createdAt));
  return NextResponse.json({ keys: rows });
}

const createSchema = z.object({
  label: z.string().min(1).max(100),
  expiresAt: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now(), 'expiresAt must be in the future')
    .nullish(),
});

export async function POST(request: NextRequest) {
  const gate = await requireManagement(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: gate.retryAfter ? { 'Retry-After': String(gate.retryAfter) } : undefined },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const key = generateCreateKey();
  const id = randomUUID();
  await db.insert(createKeys).values({
    id,
    label: parsed.data.label,
    keyHash: key.hash,
    keyPrefix: key.prefix,
    expiresAt: parsed.data.expiresAt ?? null,
  });

  // The raw key is returned exactly once — only its hash is stored.
  return NextResponse.json(
    { id, label: parsed.data.label, prefix: key.prefix, expiresAt: parsed.data.expiresAt ?? null, key: key.raw },
    { status: 201 },
  );
}
