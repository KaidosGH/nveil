import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, deleteExpired } from '@/lib/db';
import { abuseReports, secrets } from '@/drizzle/schema';
import { abuseReportSchema } from '@/lib/validation';
import { ABUSE_REPORTS_ENABLED } from '@/lib/deployment';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { verifyKeyChecksum } from '@/lib/key-checksum';
import { apiMessage } from '@/lib/i18n-server';
import { readBodyCapped } from '@/lib/request-body';

/** Extracts the secret ID from a pasted link; fragments/search are dropped. */
function extractSecretId(raw: string): string | null {
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/^\/(?:secret|manage)\/([A-Za-z0-9-]{1,64})$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!ABUSE_REPORTS_ENABLED) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Reports are rare — a hard cap keeps the queue from being flooded.
  const limit = rateLimit(`abuse:${await clientIp(request.headers)}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: apiMessage(request, 'rate_limited') },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  // Same hard byte cap as the secrets route, for the same reason:
  // Content-Length is client-supplied and absent on chunked bodies.
  const raw = await readBodyCapped(request, 300_000);
  if (raw === null) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = abuseReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const secretId = extractSecretId(parsed.data.url);
  if (!secretId) {
    return NextResponse.json(
      { error: 'invalid_url', message: apiMessage(request, 'invalid_url') },
      { status: 400 },
    );
  }

  await deleteExpired();
  const [secret] = await db.select().from(secrets).where(eq(secrets.id, secretId));

  // Witness verification: reports filed from below a decrypted secret carry the
  // key checksum (the dialog has it in scope after decryption), proving the
  // reporter held the key. A missing or mismatching checksum simply means
  // "unverified" — it must never reject or otherwise change the response,
  // otherwise the uniform-202 guarantee (reporters never learn whether the ID
  // exists) would break.
  const witnessChecksum = request.headers.get('x-key-checksum');
  const witnessVerified =
    witnessChecksum !== null && !!secret && verifyKeyChecksum(witnessChecksum, secret.keyChecksum);

  // Uniform response: never tell the reporter whether the ID exists.
  await db.insert(abuseReports).values({
    id: randomUUID(),
    secretId,
    reason: parsed.data.reason || null,
    witnessVerified,
    existedAtReport: !!secret,
    secretExpiresAt: secret?.expiresAt ?? null,
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
