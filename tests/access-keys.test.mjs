// Self-check for lib/access-keys.ts: key generation/hashing, management-key
// verification (constant-time compare against the configured env value) and
// the cookie lifetime clamp (cookie must never outlive its key's expiry).
// Run: node tests/access-keys.test.mjs  (part of `npm run check`)
import assert from 'node:assert/strict';

process.env.NVEIL_MANAGEMENT_KEY = 'test-management-key-0123456789abcdef';
const { generateAccessKey, keyHash, verifyManagementKey, isKeyUsable, accessKeyCookieMaxAge, presentedAccessKey } =
  await import('../lib/access-keys.ts');

const DAY = 86_400_000;

// Key generation: raw keys carry the recognizable prefix, hashes are stable.
const { raw, hash, prefix } = generateAccessKey();
assert.ok(raw.startsWith('nveil_'), 'raw key must carry the prefix');
assert.equal(raw.length, 6 + 43, 'raw key = prefix + 32 bytes base64url');
assert.equal(hash, keyHash(raw), 'hash must match the raw key');
assert.ok(prefix.startsWith('nveil_') && prefix.length <= 14);

// Management key: correct value passes, wrong/empty values fail.
assert.equal(verifyManagementKey(process.env.NVEIL_MANAGEMENT_KEY), true);
assert.equal(verifyManagementKey('wrong-key'), false);
assert.equal(verifyManagementKey(''), false);

// Usability: revocation and expiry are both honored.
const now = Date.now();
assert.equal(isKeyUsable({ revokedAt: null, expiresAt: null }), true);
assert.equal(isKeyUsable({ revokedAt: new Date(now - 1000), expiresAt: null }), false);
assert.equal(isKeyUsable({ revokedAt: null, expiresAt: new Date(now - 1000) }), false);
assert.equal(isKeyUsable({ revokedAt: null, expiresAt: new Date(now + DAY) }), true);

// Cookie lifetime: capped at 30 days, shortened to a key's expiry, never 0.
assert.equal(accessKeyCookieMaxAge(null), 2_592_000);
assert.ok(Math.abs(accessKeyCookieMaxAge(new Date(now + 10 * DAY)) - 10 * DAY / 1000) < 5);
assert.ok(Math.abs(accessKeyCookieMaxAge(new Date(now + 3600_000)) - 3600) < 5);
assert.equal(accessKeyCookieMaxAge(new Date(now - 1000)), 60, 'already-expired key still gets a minimal lifetime');

// presentedAccessKey: the explicit header wins over the cookie, the cookie is
// the fallback, and neither means ''. Both gate routes now share this, so the
// precedence cannot diverge between them.
const withHeaders = (headers) => new Request('http://localhost/', { headers });
assert.equal(presentedAccessKey(withHeaders({ 'x-access-key': 'h', cookie: 'nveil-access-key=c' })), 'h');
assert.equal(presentedAccessKey(withHeaders({ cookie: 'nveil-access-key=c; other=x' })), 'c');
assert.equal(presentedAccessKey(withHeaders({})), '');

console.log('access-keys self-check passed');
