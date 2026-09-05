import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { lt } from 'drizzle-orm';
import { secrets, abuseReports } from '@/drizzle/schema';

type DrizzleDb = ReturnType<typeof drizzle>;

const globalForDb = globalThis as unknown as {
  postgresClient?: postgres.Sql;
  drizzleDb?: DrizzleDb;
};

function getDb(): DrizzleDb {
  if (!globalForDb.drizzleDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForDb.postgresClient ??= postgres(url);
    globalForDb.drizzleDb = drizzle(globalForDb.postgresClient);
  }
  return globalForDb.drizzleDb;
}

// ponytail: lazy proxy so importing this module (e.g. during `next build` page
// data collection) never requires a live DATABASE_URL or opens connections.
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

/** Lazy expiration cleanup: runs on secret API access instead of a separate cron. */
const ABUSE_REPORT_RETENTION_DAYS = 7;

// ponytail: throttled so busy traffic doesn't pay two DELETE statements per
// request; expired data then lives at most one extra minute.
const CLEANUP_THROTTLE_MS = 60_000;

let lastCleanupAt = 0;

export async function deleteExpired(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_THROTTLE_MS) return;
  lastCleanupAt = now;

  await db.delete(secrets).where(lt(secrets.expiresAt, new Date()));
  // Resolved abuse reports are purged after the retention window; unresolved
  // ones are kept until the operator handles them.
  const cutoff = new Date(now - ABUSE_REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(abuseReports).where(lt(abuseReports.resolvedAt, cutoff));
}

export async function checkDb(): Promise<boolean> {
  try {
    await getDb().$client`select 1`;
    return true;
  } catch {
    // The database connection dropped; the schema cache may reference a
    // vanished table, so the next ensureSchema() re-runs the DDL.
    resetSchemaCache();
    return false;
  }
}

// The schema-init promise lives here (not in db-init.ts) so its cache-reset
// never needs a db-init -> db import — db-init imports db, never the reverse.
let schemaInitPromise: Promise<void> | null = null;

export function setSchemaInitPromise(promise: Promise<void> | null): void {
  schemaInitPromise = promise;
}

export function getSchemaInitPromise(): Promise<void> | null {
  return schemaInitPromise;
}

/** Forgets the cached successful DDL run (used after a DB-level error). */
export function resetSchemaCache(): void {
  schemaInitPromise = null;
}