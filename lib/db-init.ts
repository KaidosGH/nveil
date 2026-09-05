import { sql } from 'drizzle-orm';
import { db, getSchemaInitPromise, setSchemaInitPromise } from './db';
import { INIT_SQL } from './schema-ddl';

/**
 * Idempotent; retries on the next request if the database was not reachable.
 * The promise cache only covers successful application — if the DB connection
 * or the table disappears later, checkDb() resets it via resetSchemaCache()
 * and the DDL re-runs.
 */
export function ensureSchema(): Promise<void> {
  const cached = getSchemaInitPromise();
  if (cached) return cached;
  const promise = db
    .execute(sql.raw(INIT_SQL))
    .then(() => undefined)
    .catch((error) => {
      setSchemaInitPromise(null);
      throw error;
    });
  setSchemaInitPromise(promise);
  return promise;
}
