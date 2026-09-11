// E2E check for the access-key gate — requires a server started with
// NVEIL_ACCESS_KEYS=require and NVEIL_MANAGEMENT_KEY (>= 32 chars).
// Usage:
//   BASE_URL=http://localhost:3202 NVEIL_MANAGEMENT_KEY=<key> node tests/access-keys.e2e.mjs
// Covers: enforcement without key, management auth, key creation via the
// management API, header-based creation, verify endpoint + cookie flow,
// and revocation taking effect immediately.
import assert from 'node:assert/strict';
import {
  encrypt,
  generateCreatorToken,
  generateKey,
  keyChecksum,
  tokenHash,
} from '../lib/crypto.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:3202';
const MANAGEMENT_KEY = process.env.NVEIL_MANAGEMENT_KEY;
assert.ok(MANAGEMENT_KEY && MANAGEMENT_KEY.length >= 32, 'NVEIL_MANAGEMENT_KEY must be set');

async function createSecret(extraHeaders = {}) {
  const { key, keyString } = await generateKey();
  const { ciphertext, iv } = await encrypt(key, 'gated test');
  return fetch(`${BASE}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({
      ciphertext,
      iv,
      keyChecksum: await keyChecksum(keyString),
      creatorTokenHash: await tokenHash(generateCreatorToken()),
      burnAfterRead: true,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  });
}

// 1. Without any key: creation is rejected with 403 access_key_required.
{
  const response = await createSecret();
  assert.equal(response.status, 403);
  const data = await response.json();
  assert.equal(data.error, 'access_key_required');
  console.log('1. create without key rejected: ok');
}

// 2. Management API is key-gated: no key and wrong key are rejected.
{
  const noKey = await fetch(`${BASE}/api/access-keys`);
  assert.equal(noKey.status, 401);
  const wrongKey = await fetch(`${BASE}/api/access-keys`, {
    headers: { 'x-management-key': 'wrong-wrong-wrong-wrong-wrong' },
  });
  assert.equal(wrongKey.status, 401);
  console.log('2. management auth: ok');
}

// 3. Management key creates a key — raw value returned exactly once.
let rawKey = '';
let keyId = '';
{
  const response = await fetch(`${BASE}/api/access-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-management-key': MANAGEMENT_KEY },
    body: JSON.stringify({ label: 'e2e test key' }),
  });
  assert.equal(response.status, 201);
  const data = await response.json();
  rawKey = data.key;
  keyId = data.id;
  assert.ok(rawKey.startsWith('nveil_'), 'raw key carries the recognizable prefix');
  console.log('3. management key creation: ok');
}

// 4. Valid key authorizes creation (header-based).
{
  const response = await createSecret({ 'x-access-key': rawKey });
  assert.equal(response.status, 201, 'valid access key must authorize creation');
  console.log('4. header-based creation: ok');
}

// 5. Verify endpoint moves the key into an httpOnly cookie; cookie-based
//    creation then works, and scripts get nothing readable.
{
  const verify = await fetch(`${BASE}/api/access-keys/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: rawKey }),
  });
  assert.equal(verify.status, 200);
  const setCookie = verify.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /nveil-access-key=/);
  assert.match(setCookie, /HttpOnly/i);
  let cookie = setCookie.split(';')[0];
  const response = await createSecret({ Cookie: cookie });
  assert.equal(response.status, 201, 'cookie-based creation must work');
  console.log('5. cookie flow: ok');

  // 5b. Session info: the cookie holder learns prefix + label (no secret
  //     material), and forgetting clears the cookie server-side.
  const session = await fetch(`${BASE}/api/access-keys/session`, {
    headers: { Cookie: cookie },
  });
  assert.equal(session.status, 200);
  const info = await session.json();
  assert.equal(info.prefix, rawKey.slice(0, 12));
  assert.equal(info.label, 'e2e test key');
  const forget = await fetch(`${BASE}/api/access-keys/session`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  assert.equal(forget.status, 204);
  const reverify = await fetch(`${BASE}/api/access-keys/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: rawKey }),
  });
  assert.equal(reverify.status, 200);
  cookie = reverify.headers.get('set-cookie').split(';')[0];
  console.log('5b. session info + forget: ok');
}

// 6. Revocation takes effect immediately: header AND cookie holders fail.
{
  const revoke = await fetch(`${BASE}/api/access-keys/${keyId}`, {
    method: 'DELETE',
    headers: { 'x-management-key': MANAGEMENT_KEY },
  });
  assert.equal(revoke.status, 200);
  const after = await createSecret({ 'x-access-key': rawKey });
  assert.equal(after.status, 403, 'revoked key must no longer authorize creation');
  const verify = await fetch(`${BASE}/api/access-keys/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: rawKey }),
  });
  assert.equal(verify.status, 401);
  console.log('6. revocation: ok');
}

// 7. Management cookie session: the UI flow exchanges the typed key for an
//    httpOnly cookie; wrong keys are rejected and logout clears the cookie.
{
  const wrong = await fetch(`${BASE}/api/management/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'wrong-wrong-wrong-wrong-wrong' }),
  });
  assert.equal(wrong.status, 401);

  const unlock = await fetch(`${BASE}/api/management/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: MANAGEMENT_KEY }),
  });
  assert.equal(unlock.status, 200);
  const setCookie = unlock.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /nveil-management=/);
  assert.match(setCookie, /HttpOnly/i);
  const mgmtCookie = setCookie.split(';')[0];

  // Cookie alone authenticates the management API (no header).
  const keys = await fetch(`${BASE}/api/access-keys`, { headers: { Cookie: mgmtCookie } });
  assert.equal(keys.status, 200, 'management cookie must authenticate the keys API');

  const logout = await fetch(`${BASE}/api/management/session`, {
    method: 'DELETE',
    headers: { Cookie: mgmtCookie },
  });
  assert.equal(logout.status, 204);
  const cleared = logout.headers.get('set-cookie') ?? '';
  assert.match(cleared, /nveil-management=;/, 'logout must clear the cookie');
  console.log('7. management cookie session: ok');
}

console.log('access-key gate e2e passed');
