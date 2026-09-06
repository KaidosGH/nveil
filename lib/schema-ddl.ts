/**
 * The runtime DDL applied by lib/db-init.ts, kept in sync with
 * drizzle/schema.ts — the sync is enforced by tests/schema-drift.test.mjs,
 * so a column added to schema.ts without a matching DDL update fails
 * `npm run check`.
 *
 * ponytail: no migration tracking — when the schema grows beyond one table,
 * switch to `drizzle-kit generate` + a migration runner.
 *
 * Lives in an import-free module so the drift test can load it with plain
 * `node --experimental-strip-types` (db-init.ts itself imports the DB client,
 * which raw Node ESM cannot resolve extensionless).
 */
export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS secrets (
    id text PRIMARY KEY,
    ciphertext text NOT NULL,
    iv text NOT NULL,
    key_checksum text NOT NULL,
    creator_token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    burn_after_read boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    viewed_at timestamptz,
    has_password boolean DEFAULT false NOT NULL,
    wrapped_key text,
    wrap_iv text,
    wrap_salt text
);
CREATE TABLE IF NOT EXISTS abuse_reports (
    id text PRIMARY KEY,
    secret_id text NOT NULL,
    reason text,
    witness_verified boolean DEFAULT false NOT NULL,
    existed_at_report boolean DEFAULT false NOT NULL,
    secret_expires_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    resolved_at timestamptz,
    deleted_at timestamptz
);
-- Pre-existing deployments predate the password columns; ADD COLUMN IF NOT
-- EXISTS keeps the migration idempotent without a migration runner.
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS has_password boolean DEFAULT false NOT NULL;
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS wrapped_key text;
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS wrap_iv text;
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS wrap_salt text;
ALTER TABLE abuse_reports ADD COLUMN IF NOT EXISTS witness_verified boolean DEFAULT false NOT NULL;
CREATE TABLE IF NOT EXISTS instance_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS access_keys (
    id text PRIMARY KEY,
    label text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    expires_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    last_used_at timestamptz,
    revoked_at timestamptz
);`;
