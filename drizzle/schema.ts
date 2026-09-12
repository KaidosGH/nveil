import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const secrets = pgTable('secrets', {
  id: text('id').primaryKey(),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  keyChecksum: text('key_checksum').notNull(),
  creatorTokenHash: text('creator_token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  burnAfterRead: boolean('burn_after_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  viewedAt: timestamp('viewed_at', { withTimezone: true }),
  // View-limit expiry: max_views caps key-valid payload reads (NULL =
  // unlimited, burn secrets never set it); view_count increments atomically
  // per granted read. A counter — never who viewed or from where.
  maxViews: integer('max_views'),
  viewCount: integer('view_count').default(0).notNull(),
  // Password protection: the content key wrapped by a password-derived key.
  // The password itself never reaches the server.
  hasPassword: boolean('has_password').default(false).notNull(),
  wrappedKey: text('wrapped_key'),
  wrapIv: text('wrap_iv'),
  wrapSalt: text('wrap_salt'),
});

export const abuseReports = pgTable('abuse_reports', {
  id: text('id').primaryKey(),
  secretId: text('secret_id').notNull(),
  reason: text('reason'),
  /** True when the report was filed from below a decrypted secret (the
   *  reporter proved key possession via the x-key-checksum header). */
  witnessVerified: boolean('witness_verified').default(false).notNull(),
  existedAtReport: boolean('existed_at_report').default(false).notNull(),
  secretExpiresAt: timestamp('secret_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// Optional access-key gate (NVEIL_ACCESS_KEYS=require): hashed keys that
// gate secret creation on managed instances. Raw keys are shown once and
// never stored; secrets are NOT linked to keys (privacy posture).
// Runtime instance settings (management UI writable). Only cosmetic/UX
// settings live here; security posture and bootstrap config stay env-only.
// A DB row overrides the env default; deleting the row resets to the env.
export const instanceSettings = pgTable('instance_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accessKeys = pgTable('access_keys', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
