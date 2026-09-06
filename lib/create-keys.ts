import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { clientIp, rateLimit } from './rate-limit.ts';

/**
 * Optional create-key gate (NVEIL_CREATE_KEYS=require): on managed instances
 * only holders of a valid create key may create secrets. Reads, manage links
 * and abuse reporting are never gated. Keys are 256-bit random values shown
 * once; only their SHA-256 hash is stored. Secrets are NOT linked to keys —
 * the only key metadata is label, prefix and lifecycle timestamps.
 *
 * The management key (NVEIL_MANAGEMENT_KEY) guards key administration and
 * fails closed when missing or shorter than 32 chars.
 */

export const MANAGEMENT_KEY = process.env.NVEIL_MANAGEMENT_KEY ?? '';
export const MANAGEMENT_ENABLED = MANAGEMENT_KEY.length >= 32;
export const CREATE_KEYS_REQUIRED = process.env.NVEIL_CREATE_KEYS === 'require';

export const CREATE_KEY_COOKIE = 'nveil-create-key';
/** Hard cap for the cookie lifetime; a key's own expiry shortens it further. */
export const CREATE_KEY_COOKIE_CAP_S = 60 * 60 * 24 * 30;

const RAW_PREFIX = 'nveil_';

export function generateCreateKey(): { raw: string; hash: string; prefix: string } {
  const raw = RAW_PREFIX + randomBytes(32).toString('base64url');
  return { raw, hash: keyHash(raw), prefix: raw.slice(0, RAW_PREFIX.length + 6) };
}

export function keyHash(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('base64url');
}

/** Constant-time comparison of a submitted management key against the configured one. */
export function verifyManagementKey(submitted: string): boolean {
  if (!MANAGEMENT_ENABLED || submitted.length === 0) return false;
  const submittedHash = createHash('sha256').update(submitted, 'utf8').digest();
  const expectedHash = createHash('sha256').update(MANAGEMENT_KEY, 'utf8').digest();
  return timingSafeEqual(submittedHash, expectedHash);
}

/**
 * Gate shared by the create-keys management endpoints: per-IP limiter
 * (brute-force blunting; the key itself is unguessable and fails closed),
 * then the key check. Returns what the route should respond with, or
 * { ok: true } when the caller is authorized. Deliberately framework-free
 * (no next/server import) so the module stays testable with plain node.
 */
export async function requireManagement(
  request: Request,
): Promise<{ ok: true } | { ok: false; status: number; error: string; retryAfter?: number }> {
  const limit = rateLimit(`mgmt:${await clientIp(request.headers)}`, 30, 60 * 1000);
  if (!limit.ok) {
    return { ok: false, status: 429, error: 'rate_limited', retryAfter: limit.retryAfterSeconds };
  }
  if (!MANAGEMENT_ENABLED || !verifyManagementKey(request.headers.get('x-management-key') ?? '')) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  return { ok: true };
}

export function isKeyUsable(row: { revokedAt: Date | null; expiresAt: Date | null }): boolean {
  if (row.revokedAt) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

/**
 * Cookie lifetime never outlives the credential: capped at 30 days, and
 * shortened to a key's own expiry when that is sooner.
 */
export function createKeyCookieMaxAge(expiresAt: Date | null): number {
  if (!expiresAt) return CREATE_KEY_COOKIE_CAP_S;
  const untilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  return Math.max(60, Math.min(CREATE_KEY_COOKIE_CAP_S, untilExpiry));
}

/** Full cookie attributes — httpOnly keeps the key away from scripts entirely. */
export function createKeyCookie(raw: string, maxAgeSeconds: number) {
  return {
    name: CREATE_KEY_COOKIE,
    value: raw,
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
