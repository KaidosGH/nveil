import { z } from 'zod';

// Base64url, no padding: 12-byte IV -> 16 chars, 32-byte hash -> 43 chars.
const b64 = /^[A-Za-z0-9_-]+$/;

// Envelope field sizes: wrapIv is a 12-byte GCM IV (16 b64url chars),
// wrapSalt 16 bytes (22 chars), wrappedKey 43 chars + 16-byte tag (65 chars).
const wrapField = (label: string, min: number, max = 200) =>
  z.string().regex(b64, `${label} must be base64url`).min(min).max(max);

/**
 * Password protection: when hasPassword is true, the content key must arrive
 * wrapped (wrappedKey/wrapIv/wrapSalt); when false, those fields must be
 * absent. The password itself is never sent — only its PBKDF2 envelope.
 */
export const createSecretSchema = z
  .object({
    ciphertext: z.string().regex(b64).min(1).max(200_000),
    iv: z.string().regex(b64).length(16),
    keyChecksum: z.string().regex(b64).length(43),
    creatorTokenHash: z.string().regex(b64).length(43),
    burnAfterRead: z.boolean(),
    expiresAt: z.coerce
      .date()
      .refine((d) => d.getTime() > Date.now(), 'expiresAt must be in the future')
      .refine(
        (d) => d.getTime() <= Date.now() + 31 * 24 * 60 * 60 * 1000,
        'expiresAt must be at most 31 days ahead',
      ),
    hasPassword: z.boolean().default(false),
    wrappedKey: wrapField('wrappedKey', 65).optional(),
    wrapIv: wrapField('wrapIv', 16).optional(),
    wrapSalt: wrapField('wrapSalt', 22).optional(),
  })
  .refine(
    (s) => !s.hasPassword || (s.wrappedKey !== undefined && s.wrapIv !== undefined && s.wrapSalt !== undefined),
    { message: 'password-protected secrets require wrappedKey, wrapIv and wrapSalt' },
  )
  .refine((s) => s.hasPassword || (s.wrappedKey === undefined && s.wrapIv === undefined && s.wrapSalt === undefined), {
    message: 'wrappedKey/wrapIv/wrapSalt are only valid for password-protected secrets',
  });

export type CreateSecretInput = z.infer<typeof createSecretSchema>;

export const EXPIRATION_PRESETS = {
  '5m': 5 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;

export type ExpirationPreset = keyof typeof EXPIRATION_PRESETS;
export type ExpirationChoice = ExpirationPreset | 'custom';

export const MAX_CONTENT_BYTES = 100 * 1024;

export const abuseReportSchema = z.object({
  url: z.string().min(1).max(500),
  reason: z.string().max(500).nullish(),
});
