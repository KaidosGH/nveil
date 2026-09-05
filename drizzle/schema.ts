import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
