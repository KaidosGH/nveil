import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { accessKeys } from '@/drizzle/schema';
import { generateAccessKey, requireManagement } from '@/lib/access-keys';
import { ADMIN_BODY_CAP, parseJsonBody } from '@/lib/request-body';
import { denied } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  const gate = await requireManagement(request);
  if (!gate.ok) return denied(gate);
  const rows = await db
    .select({
      id: accessKeys.id,
      label: accessKeys.label,
      prefix: accessKeys.keyPrefix,
      createdAt: accessKeys.createdAt,
      expiresAt: accessKeys.expiresAt,
      lastUsedAt: accessKeys.lastUsedAt,
      revokedAt: accessKeys.revokedAt,
    })
    .from(accessKeys)
    .orderBy(desc(accessKeys.createdAt));
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
  if (!gate.ok) return denied(gate);

  const parsed = await parseJsonBody(request, ADMIN_BODY_CAP, createSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const key = generateAccessKey();
  const id = randomUUID();
  await db.insert(accessKeys).values({
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
