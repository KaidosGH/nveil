import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
// Relative (not @/ aliases) so the plain-node self-check can import this module.
import { db } from './db.ts';
import { accessKeys } from '../drizzle/schema.ts';
import { clientIp, RATE_LIMITS, rateLimit } from './rate-limit.ts';
import { timingSafeEqualStrings } from './key-checksum.ts';
import { fromBase64Url, toBase64Url } from './crypto.ts';

/**
 * Optional access-key gate (NVEIL_ACCESS_KEYS=require): on managed instances
 * only holders of a valid access key may create secrets. Reads, manage links
 * and abuse reporting are never gated. Keys are 256-bit random values shown
 * once; only their SHA-256 hash is stored. Secrets are NOT linked to keys —
 * the only key metadata is label, prefix and lifecycle timestamps.
 *
 * The management key (NVEIL_MANAGEMENT_KEY) guards key administration and
 * fails closed when missing or shorter than 32 chars.
 */

export const MANAGEMENT_KEY = process.env.NVEIL_MANAGEMENT_KEY ?? '';
export const MANAGEMENT_ENABLED = MANAGEMENT_KEY.length >= 32;
export const ACCESS_KEYS_REQUIRED = process.env.NVEIL_ACCESS_KEYS === 'require';

export const ACCESS_KEY_COOKIE = 'nveil-access-key';
/** Hard cap for the cookie lifetime; a key's own expiry shortens it further. */
export const ACCESS_KEY_COOKIE_CAP_S = 60 * 60 * 24 * 30;

/** httpOnly cookie carrying the management key (see requireManagement). */
export const MANAGEMENT_COOKIE = 'nveil-management';

const RAW_PREFIX = 'nveil_';

export function generateAccessKey(): { raw: string; hash: string; prefix: string } {
  const raw = RAW_PREFIX + randomBytes(32).toString('base64url');
  return { raw, hash: keyHash(raw), prefix: raw.slice(0, RAW_PREFIX.length + 6) };
}

export function keyHash(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('base64url');
}

/** Constant-time comparison of a submitted management key against the configured one. */
export function verifyManagementKey(submitted: string): boolean {
  if (!MANAGEMENT_ENABLED || submitted.length === 0) return false;
  return timingSafeEqualStrings(submitted, MANAGEMENT_KEY);
}

/**
 * The one access-key lookup shared by every gated route: a non-empty raw key
 * selects the row by hash; revoked rows are filtered in the WHERE clause, so
 * only expiry is left for the caller to check via isKeyUsable(). Returns
 * undefined for empty input — a valid shape, not an error.
 */
export async function findUsableAccessKey(
  raw: string,
): Promise<{ id: string; label: string; keyPrefix: string; expiresAt: Date | null; revokedAt: Date | null } | undefined> {
  if (!raw) return undefined;
  const [row] = await db
    .select({
      id: accessKeys.id,
      label: accessKeys.label,
      keyPrefix: accessKeys.keyPrefix,
      expiresAt: accessKeys.expiresAt,
      // The WHERE clause filters revoked rows; the column is selected only so
      // the shape satisfies isKeyUsable().
      revokedAt: accessKeys.revokedAt,
    })
    .from(accessKeys)
    .where(and(eq(accessKeys.keyHash, keyHash(raw)), isNull(accessKeys.revokedAt)));
  return row;
}

/** Full cookie attributes — httpOnly keeps the key away from scripts entirely. */
export function accessKeyCookie(raw: string, maxAgeSeconds: number) {
  return {
    name: ACCESS_KEY_COOKIE,
    value: raw,
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * Cookie values must be cookie-safe (no `;`, `,`, control chars) whatever the
 * operator put in NVEIL_MANAGEMENT_KEY, so the management cookie carries the
 * key base64url-encoded; requireManagement decodes before comparing.
 */
function encodeCookieValue(raw: string): string {
  return toBase64Url(new TextEncoder().encode(raw));
}

function decodeCookieValue(value: string): string {
  try {
    return new TextDecoder().decode(fromBase64Url(value));
  } catch {
    return '';
  }
}

/** One cookie's value from a raw Cookie header, or undefined when absent. */
function cookieValue(headers: Headers, name: string): string | undefined {
  const prefix = `${name}=`;
  const part = (headers.get('cookie') ?? '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(prefix));
  return part?.slice(prefix.length);
}

/**
 * The access key presented with a request: the explicit `x-access-key` header
 * first (API callers, the documented contract), then the httpOnly cookie set
 * by /api/access-keys/verify. Shared so the gate routes cannot drift on which
 * one wins when both are present.
 */
export function presentedAccessKey(request: Request): string {
  return request.headers.get('x-access-key') || cookieValue(request.headers, ACCESS_KEY_COOKIE) || '';
}

/** Session cookie for the management UI: cleared when the browser closes. */
export function managementCookie(raw: string) {
  return {
    name: MANAGEMENT_COOKIE,
    value: encodeCookieValue(raw),
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/',
  };
}

/** Clears the access-key cookie (forget flow + stale-cookie cleanup). */
export function clearedAccessKeyCookie() {
  return { ...accessKeyCookie('', 0), value: '', maxAge: 0 };
}

/** Clears the management cookie (logout / failed revalidation). */
export function clearedManagementCookie() {
  return { ...managementCookie(''), value: '', maxAge: 0 };
}

/**
 * Gate shared by the management endpoints: per-IP limiter (brute-force
 * blunting; the key itself is unguessable and fails closed), then the key
 * check. The credential arrives either as the raw key in the x-management-key
 * header (operators scripting the API, e2e tests) or — preferred — in the
 * httpOnly management cookie the unlock endpoint sets (browser UI).
 * Framework-free (no next/server import) so the module stays testable with
 * plain node; routes turn a denial into the JSON response directly.
 */
export async function requireManagement(
  request: Request,
): Promise<{ ok: true } | { ok: false; status: number; error: string; retryAfter?: number }> {
  const limit = rateLimit(
    `mgmt:${await clientIp(request.headers)}`,
    RATE_LIMITS.managementPerMinute,
    60 * 1000,
  );
  if (!limit.ok) {
    return { ok: false, status: 429, error: 'rate_limited', retryAfter: limit.retryAfterSeconds };
  }
  // Cookie first so a stale header can never shadow the live session, then
  // the explicit header for non-browser callers. The cookie value is
  // base64url-encoded (see managementCookie) — decoded before comparing.
  const headers = request.headers;
  const cookieKey = cookieValue(headers, MANAGEMENT_COOKIE);
  const submitted = (cookieKey ? decodeCookieValue(cookieKey) : '') || headers.get('x-management-key') || '';
  if (!MANAGEMENT_ENABLED || !verifyManagementKey(submitted)) {
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
export function accessKeyCookieMaxAge(expiresAt: Date | null): number {
  if (!expiresAt) return ACCESS_KEY_COOKIE_CAP_S;
  const untilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  return Math.max(60, Math.min(ACCESS_KEY_COOKIE_CAP_S, untilExpiry));
}
