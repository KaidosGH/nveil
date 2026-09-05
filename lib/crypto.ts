/**
 * Web Crypto wrappers. Runs in the browser (main use) and in Node >= 20
 * (globalThis.crypto), which lets the self-check exercise the same code.
 *
 * Encoding convention: everything that crosses the wire or a URL is base64url
 * without padding. A 32-byte key/hash encodes to 43 chars, a 12-byte IV to 16.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importAesKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Fresh random AES-256 key, returned both as a usable CryptoKey and as its base64url string. */
export async function generateKey(): Promise<{ key: CryptoKey; keyString: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return { key: await importAesKey(raw), keyString: toBase64Url(raw) };
}

/** 256-bit creator (deletion) token, base64url. */
export function generateCreatorToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Base64Url(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toBase64Url(new Uint8Array(digest));
}

/** SHA-256 of the raw key bytes — what the server stores and the client validates against. */
export function keyChecksum(keyString: string): Promise<string> {
  return sha256Base64Url(fromBase64Url(keyString));
}

/** SHA-256 of the raw creator token bytes — the only form the server ever sees. */
export function tokenHash(token: string): Promise<string> {
  return sha256Base64Url(fromBase64Url(token));
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return { ciphertext: toBase64Url(new Uint8Array(encrypted)), iv: toBase64Url(iv) };
}

export async function decrypt(keyString: string, iv: string, ciphertext: string): Promise<string> {
  const cryptoKey = await importAesKey(fromBase64Url(keyString));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv) },
    cryptoKey,
    fromBase64Url(ciphertext),
  );
  return decoder.decode(plaintext);
}

// --- Password protection (envelope: a password-derived key wraps the content key) ---

/** OWASP 2023+ guidance for PBKDF2-HMAC-SHA256. */
const PBKDF2_ITERATIONS = 600_000;

async function deriveWrapKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Wraps the content key with a password-derived AES-GCM key. The content
 * ciphertext, IV and checksum stay exactly as in the passwordless flow; only
 * the key material gets a second envelope. Nothing but the wrapped form ever
 * leaves the creator's browser.
 */
export async function wrapKeyWithPassword(keyString: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapKey = await deriveWrapKey(password, salt);
  const { ciphertext: wrappedKey, iv: wrapIv } = await encrypt(wrapKey, keyString);
  return { hasPassword: true, wrappedKey, wrapIv, wrapSalt: toBase64Url(salt) };
}

/**
 * Recovers the content key from its password envelope. A wrong password fails
 * the GCM authentication — this happens client-side, before the checksum is
 * ever presented to the server, so burn secrets are never consumed by a
 * wrong-password attempt.
 */
export async function unwrapKeyWithPassword(
  password: string,
  wrappedKey: string,
  wrapIv: string,
  wrapSalt: string,
): Promise<string> {
  const wrapKey = await deriveWrapKey(password, fromBase64Url(wrapSalt));
  return decryptWithKey(wrapKey, wrapIv, wrappedKey);
}

/** decrypt() keyed by CryptoKey instead of the base64url string form. */
async function decryptWithKey(key: CryptoKey, iv: string, ciphertext: string): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv) },
    key,
    fromBase64Url(ciphertext),
  );
  return decoder.decode(plaintext);
}
