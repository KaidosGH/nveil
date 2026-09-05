import { NextResponse } from 'next/server';
import { checkDb, deleteExpired } from '@/lib/db';
import { ensureSchema } from '@/lib/db-init';

export async function GET() {
  // Applying the schema doubles as the database readiness probe. The cleanup
  // ride-along makes the Docker healthcheck (calls this every 30s) act as the
  // expiration cron: expired data is purged even with zero traffic.
  const dbOk = await ensureSchema()
    .then(async () => {
      await deleteExpired();
      return checkDb();
    })
    .catch(() => false);
  return NextResponse.json(
    { status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'up' : 'down' },
    { status: dbOk ? 200 : 503 },
  );
}
