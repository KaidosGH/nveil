// E2E check against a running server. Usage:
//   BASE_URL=http://localhost:3100 node tests/e2e.mjs
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  decrypt,
  encrypt,
  generateCreatorToken,
  generateKey,
  keyChecksum,
  tokenHash,
  unwrapKeyWithPassword,
  wrapKeyWithPassword,
} from '../lib/crypto.ts';
const BASE = process.env.BASE_URL ?? 'http://localhost:3100';

async function createSecret({ content, burnAfterRead = true, maxViews = null, expiresInSeconds = 3600, password }) {
  const { key, keyString } = await generateKey();
  const token = generateCreatorToken();
  const { ciphertext, iv } = await encrypt(key, content);
  const envelope = password ? await wrapKeyWithPassword(keyString, password) : {};
  const response = await fetch(`${BASE}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ciphertext,
      iv,
      keyChecksum: await keyChecksum(keyString),
      creatorTokenHash: await tokenHash(token),
      burnAfterRead,
      maxViews,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      ...envelope,
    }),
  });
  if (response.status !== 201) {
    throw new Error(`create failed: ${response.status} ${await response.text()}`);
  }
  const { id } = await response.json();
  return { id, keyString, token };
}

async function fetchSecret(id, keyString) {
  const headers = keyString ? { 'x-key-checksum': await keyChecksum(keyString) } : {};
  const response = await fetch(`${BASE}/api/secrets/${id}`, { headers });
  const data = await response.json().catch(() => null);
  return { response, data };
}

// 1. Full round trip: create, fetch, decrypt (non-burn secret).
{
  const content = '# API key\n\n`sk-test-123`';
  const { id, keyString } = await createSecret({ content, burnAfterRead: false });
  const { response, data } = await fetchSecret(id, keyString);
  assert.equal(response.status, 200);
  assert.equal(await decrypt(keyString, data.iv, data.ciphertext), content);
  assert.equal(data.burnAfterRead, false);
  assert.ok(!('creatorTokenHash' in data), 'token hash must not be exposed via GET');
  assert.ok(!('keyChecksum' in data), 'stored key checksum must not be disclosed via GET');
  console.log('1. create + view round trip: ok');
}

// 2. Burn after read: the first key-valid GET consumes the secret atomically —
//    payload reads require the key checksum (non-burn too), wrong keys are
//    rejected without consuming, and exactly one of two concurrent readers wins.
{
  const checksumHeaders = async (s) => ({ 'x-key-checksum': await keyChecksum(s) });

  const { id, keyString } = await createSecret({ content: 'burn me' });
  const noKey = await fetch(`${BASE}/api/secrets/${id}`);
  assert.equal(noKey.status, 403, 'payload must not be released without a key checksum');
  const wrong = await fetch(`${BASE}/api/secrets/${id}`, { headers: await checksumHeaders(await generateKey().then(k => k.keyString)) });
  assert.equal(wrong.status, 403, 'a wrong key must not consume the secret');
  const intact = await fetch(`${BASE}/api/secrets/${id}?meta=1`);
  assert.equal(intact.status, 200, 'wrong-key attempts must leave the secret retrievable');
  assert.equal((await intact.json()).burnAfterRead, true, 'meta probe must expose the burn flag');

  // H1 regression: a token-less DELETE must never destroy a burn secret —
  // only the atomic key-checked GET consumes it.
  const dosAttempt = await fetch(`${BASE}/api/secrets/${id}`, { method: 'DELETE' });
  assert.equal(dosAttempt.status, 403, 'token-less DELETE must be rejected even for burn secrets');
  const stillAlive = await fetch(`${BASE}/api/secrets/${id}?meta=1`);
  assert.equal(stillAlive.status, 200, 'rejected DELETE must not have destroyed the secret');

  const first = await fetch(`${BASE}/api/secrets/${id}`, { headers: await checksumHeaders(keyString) });
  assert.equal(first.status, 200);
  const second = await fetch(`${BASE}/api/secrets/${id}`, { headers: await checksumHeaders(keyString) });
  assert.equal(second.status, 404, 'second read must find the secret consumed');
  console.log('2. burn after read: ok');
}

// 2b. Concurrent burn readers: exactly one of two simultaneous requests wins.
{
  const { id, keyString } = await createSecret({ content: 'race me' });
  const headers = { 'x-key-checksum': await keyChecksum(keyString) };
  const [a, b] = await Promise.all([
    fetch(`${BASE}/api/secrets/${id}`, { headers }),
    fetch(`${BASE}/api/secrets/${id}`, { headers }),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 404], 'exactly one concurrent reader must win');
  const text = await (a.status === 200 ? a : b).json();
  assert.equal(await decrypt(keyString, text.iv, text.ciphertext), 'race me');
  console.log('2b. concurrent burn race: ok');
}

// 3. Creator token: wrong token rejected (header + legacy query), valid token deletes,
//    token required for non-burn secrets.
{
  const { id, token } = await createSecret({ content: 'manage me', burnAfterRead: false });
  const wrong = await fetch(`${BASE}/api/secrets/${id}`, { headers: { 'x-creator-token': 'wrong-token-wrong-token-wrong-to' } });
  assert.equal(wrong.status, 403);
  // M2 regression: a token in the query string must not authorize management
  // actions (it would land in proxy access logs).
  const qsDelete = await fetch(`${BASE}/api/secrets/${id}?token=${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
  assert.equal(qsDelete.status, 403, 'query-string tokens must not authorize deletion');
  // Manage flow: token-authenticated meta probe returns full metadata…
  const metaProbe = await fetch(`${BASE}/api/secrets/${id}?meta=1`, { headers: { 'x-creator-token': token } });
  assert.equal(metaProbe.status, 200);
  assert.ok((await metaProbe.json()).createdAt, 'token meta probe must include manage metadata');
  // …but not the payload: reading requires the key checksum.
  const tokenOnlyPayload = await fetch(`${BASE}/api/secrets/${id}`, { headers: { 'x-creator-token': token } });
  assert.equal(tokenOnlyPayload.status, 403, 'token alone must not release the payload');

  const noToken = await fetch(`${BASE}/api/secrets/${id}`, { method: 'DELETE' });
  assert.equal(noToken.status, 403);

  const deleted = await fetch(`${BASE}/api/secrets/${id}`, {
    method: 'DELETE',
    headers: { 'x-creator-token': token },
  });
  assert.equal(deleted.status, 200);
  const gone = await fetchSecret(id);
  assert.equal(gone.response.status, 404);
  console.log('3. creator token validation + deletion: ok');
}

// 4. Expiry: an already-expired secret is rejected and cleaned up.
{
  const { id } = await createSecret({ content: 'too late', expiresInSeconds: 1 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const response = await fetch(`${BASE}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ garbage: true }),
  });
  assert.equal(response.status, 400, 'invalid payload must be rejected');
  const { response: expired } = await fetchSecret(id);
  assert.equal(expired.status, 410);
  console.log('4. expiry + input validation: ok');
}

// 5. Metadata integrity: manage-page visits (token meta probe) must not mark
//    the secret viewed; the view flow (key checksum, no token) must.
{
  const { id, token, keyString } = await createSecret({ content: 'meta', burnAfterRead: false });
  const manage = await (
    await fetch(`${BASE}/api/secrets/${id}?meta=1`, { headers: { 'x-creator-token': token } })
  ).json();
  assert.equal(manage.viewedAt, null);
  const view = await (await fetch(`${BASE}/api/secrets/${id}`, {
    headers: { 'x-key-checksum': await keyChecksum(keyString) },
  })).json();
  assert.ok(view.viewedAt, 'view flow must record viewedAt');
  console.log('5. viewedAt metadata integrity: ok');
}

// 6. Oversized request bodies are rejected before parsing (memory-DoS guard).
//    Both transfer shapes: honest Content-Length over the cap, and a chunked
//    body with no Content-Length at all — the streamed cap counts actual
//    bytes, so both must 413 (see lib/request-body.ts).
{
  const oversized = JSON.stringify({ ciphertext: 'X'.repeat(300_001) });
  const response = await fetch(`${BASE}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: oversized,
  });
  assert.equal(response.status, 413);
  const chunked = await fetch(`${BASE}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(oversized));
        controller.close();
      },
    }),
    duplex: 'half',
  });
  assert.equal(chunked.status, 413, 'chunked body without Content-Length must hit the same cap');
  console.log('6. oversized payload rejection: ok');
}

// 7. Password protection: keyless meta probe serves the envelope, the client
//    unwraps with the password, wrong passwords never consume burn secrets,
//    and the round trip decrypts. The password itself never appears on the wire.
{
  const password = 'e2e-passwörd 🔐'; // betterleaks:allow — throwaway test fixture (scratch DB only)
  const { id, keyString } = await createSecret({ content: 'password wrapped', burnAfterRead: true, password });

  // Keyless meta probe: password flag + envelope, no content.
  const meta = await (await fetch(`${BASE}/api/secrets/${id}?meta=1`)).json();
  assert.equal(meta.hasPassword, true);
  assert.equal(meta.burnAfterRead, true);
  assert.ok(meta.wrappedKey && meta.wrapIv && meta.wrapSalt, 'meta probe must serve the envelope');

  // A wrong password is rejected client-side (GCM) and never touches the server,
  // so the burn secret must survive it.
  await assert.rejects(() =>
    unwrapKeyWithPassword('nope', meta.wrappedKey, meta.wrapIv, meta.wrapSalt));
  const stillThere = await (await fetch(`${BASE}/api/secrets/${id}?meta=1`)).json();
  assert.equal(stillThere.burnAfterRead, true, 'wrong-password attempt must not consume the secret');

  // Correct password: unwrap -> checksum fetch -> decrypt (consumes the burn secret).
  const unwrapped = await unwrapKeyWithPassword(password, meta.wrappedKey, meta.wrapIv, meta.wrapSalt);
  assert.equal(unwrapped, keyString);
  const { response, data } = await fetchSecret(id, unwrapped);
  assert.equal(response.status, 200);
  assert.equal(await decrypt(unwrapped, data.iv, data.ciphertext), 'password wrapped');
  const consumed = await fetch(`${BASE}/api/secrets/${id}?meta=1`);
  assert.equal(consumed.status, 404, 'burn secret must be consumed after the successful read');
  console.log('7. password protection: ok');
}

// 7b. Password validation at the trust boundary: envelope fields without
//     hasPassword are rejected, as are hasPassword requests missing them.
{
  const { keyString } = await generateKey();
  const envelope = await wrapKeyWithPassword(keyString, 'valid-password');
  const base = {
    ciphertext: 'AA',
    iv: 'AAAAAAAAAAAAAAAA',
    keyChecksum: 'A'.repeat(43),
    creatorTokenHash: 'A'.repeat(43),
    burnAfterRead: false,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const post = (body) => fetch(`${BASE}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const stray = await post({ ...base, wrappedKey: envelope.wrappedKey });
  assert.equal(stray.status, 400, 'envelope without hasPassword must be rejected');
  const incomplete = await post({ ...base, hasPassword: true });
  assert.equal(incomplete.status, 400, 'hasPassword without envelope must be rejected');
  console.log('7b. password envelope validation: ok');
}

// 7c. Stored-content cap: 100 KiB plaintext + 16-byte GCM tag = 136,556
//     base64url chars is the longest valid ciphertext — the documented
//     100 KB limit, enforced server-side without the server seeing plaintext.
{
  const post = (ciphertext) => fetch(`${BASE}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ciphertext,
      iv: 'A'.repeat(16),
      keyChecksum: 'A'.repeat(43),
      creatorTokenHash: 'A'.repeat(43),
      burnAfterRead: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
  });
  const overCap = await post('X'.repeat(136_557));
  assert.equal(overCap.status, 400, 'ciphertext beyond the 100 KB content cap must be rejected');
  console.log('7c. content size cap: ok');
}

// 8. Security headers present.
{
  const response = await fetch(`${BASE}/`);
  const csp = response.headers.get('content-security-policy') ?? '';
  assert.match(csp, /script-src 'nonce-[^']+' 'strict-dynamic'/);
  // 'self' must stay out of script-src: under 'strict-dynamic' (CSP3) it is
  // ignored policy and only earns a console warning on every page load.
  assert.doesNotMatch(csp, /script-src[^;]*'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('strict-transport-security') ?? '', /max-age=/);
  console.log('8. security headers: ok');
}

// 8b. Legal routes: all four kinds serve a page. The placeholder text is
//     only asserted when the operator's file is absent — locally content/
//     may exist, in CI it never does (gitignored).
{
  const ROUTES = [
    ['imprint', '/imprint'],
    ['privacy', '/privacy'],
    ['cookies_and_tracking', '/cookies-and-tracking'],
    ['tos', '/tos'],
  ];
  for (const [kind, route] of ROUTES) {
    const res = await fetch(`${BASE}${route}`);
    assert.equal(res.status, 200, `${route} must serve a page`);
    const hasOperatorContent = ['html', 'txt'].some((ext) =>
      existsSync(path.join(process.cwd(), 'content', `${kind}.${ext}`)),
    );
    if (!hasOperatorContent) {
      assert.match(await res.text(), /placeholder|Platzhalter/, `${route} must show the no-content placeholder`);
    }
  }
  console.log('8b. legal routes: ok');
}

// 9. Abuse reporting (only when the server runs with NVEIL_REPORT_ABUSE=true
//    and TEST_ABUSE=1 is set for this script).
if (process.env.TEST_ABUSE === '1') {
  const key = process.env.ABUSE_KEY ?? '';
  const adminHeaders = { 'x-abuse-key': key };
  const reportAbuse = async (url, reason) => {
    const r = await fetch(`${BASE}/api/abuse-reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, reason }),
    });
    return r;
  };

  // 9a. Report a live secret: accepted, fragment must never be stored,
  //     footer-style reports (no checksum) land as unverified.
  {
    const { id } = await createSecret({ content: 'abuse target' });
    const response = await reportAbuse(`${BASE}/secret/${id}#${'leakedkeyshouldnotbestored'}`, 'test reason');
    assert.equal(response.status, 202);
    const list = await (await fetch(`${BASE}/api/abuse-reports/list`, { headers: adminHeaders })).json();
    const entry = list.reports.find((r) => r.secretId === id);
    assert.ok(entry, 'report must appear in the admin queue');
    assert.equal(entry.reason, 'test reason');
    assert.equal(entry.stillExists, true);
    assert.equal(entry.witnessVerified, false, 'footer reports (no checksum) must be unverified');
  }

  // 9a-2. Witness verification: a report filed with the key checksum of the
  //       actual secret (the post-decryption dialog flow) is marked verified;
  //       a foreign checksum stays unverified — and the 202 never changes.
  {
    const { id, keyString } = await createSecret({ content: 'witness target' });
    const { keyString: otherKey } = await generateKey();
    const witnessHeaders = { 'Content-Type': 'application/json', 'x-key-checksum': await keyChecksum(keyString) };
    const wrongHeaders = { 'Content-Type': 'application/json', 'x-key-checksum': await keyChecksum(otherKey) };

    const verified = await fetch(`${BASE}/api/abuse-reports`, {
      method: 'POST',
      headers: witnessHeaders,
      body: JSON.stringify({ url: `${BASE}/secret/${id}`, reason: 'seen it' }),
    });
    assert.equal(verified.status, 202);
    const spoof = await fetch(`${BASE}/api/abuse-reports`, {
      method: 'POST',
      headers: wrongHeaders,
      body: JSON.stringify({ url: `${BASE}/secret/${id}`, reason: 'spoofed witness' }),
    });
    assert.equal(spoof.status, 202, 'a wrong checksum must still be accepted (uniform 202)');

    const list = await (await fetch(`${BASE}/api/abuse-reports/list`, { headers: adminHeaders })).json();
    const entries = list.reports.filter((r) => r.secretId === id);
    const trueWitness = entries.find((r) => r.reason === 'seen it');
    const spoofer = entries.find((r) => r.reason === 'spoofed witness');
    assert.equal(trueWitness.witnessVerified, true, 'matching checksum must mark the report verified');
    assert.equal(spoofer.witnessVerified, false, 'foreign checksum must stay unverified');
  }

  // 9b. Admin key enforcement + invalid URL handling.
  {
    const noKey = await fetch(`${BASE}/api/abuse-reports/list`);
    assert.equal(noKey.status, 401);
    const wrongKey = await fetch(`${BASE}/api/abuse-reports/list`, { headers: { 'x-abuse-key': 'nope' } });
    assert.equal(wrongKey.status, 401);
    const invalid = await reportAbuse('not-a-nveil-link', null);
    assert.equal(invalid.status, 400);
  }

  // 9c. Delete flow: queue action removes the secret and closes the report.
  {
    const { id } = await createSecret({ content: 'abuse delete target', burnAfterRead: false });
    await reportAbuse(`${BASE}/secret/${id}`, null);
    const list = await (await fetch(`${BASE}/api/abuse-reports/list`, { headers: adminHeaders })).json();
    const entry = list.reports.find((r) => r.secretId === id && !r.resolvedAt);
    assert.ok(entry, 'report must be queued');
    const del = await fetch(`${BASE}/api/abuse-reports/${entry.id}/delete-secret`, {
      method: 'POST',
      headers: adminHeaders,
    });
    assert.equal(del.status, 200);
    assert.equal((await del.json()).deleted, true);
    const { response } = await fetchSecret(id);
    assert.equal(response.status, 404, 'reported secret must be deleted');
    const after = await (
      await fetch(`${BASE}/api/abuse-reports/list?includeResolved=1`, { headers: adminHeaders })
    ).json();
    assert.ok(after.reports.find((r) => r.id === entry.id).resolvedAt, 'report must be resolved');
  }

  // 9d. Dismiss flow closes a report without deleting the secret.
  {
    const { id, keyString } = await createSecret({ content: 'dismiss target', burnAfterRead: false });
    await reportAbuse(`${BASE}/secret/${id}`, null);
    const list = await (await fetch(`${BASE}/api/abuse-reports/list`, { headers: adminHeaders })).json();
    const entry = list.reports.find((r) => r.secretId === id && !r.resolvedAt);
    const res = await fetch(`${BASE}/api/abuse-reports/${entry.id}/resolve`, {
      method: 'POST',
      headers: adminHeaders,
    });
    assert.equal(res.status, 200);
    const { response, data } = await fetchSecret(id, keyString);
    assert.equal(response.status, 200, 'dismissed reports must not delete the secret');
    assert.equal(await decrypt(keyString, data.iv, data.ciphertext), 'dismiss target');
  }

  console.log('9. abuse reporting: ok');
}

// 10. View-limit expiry (maxViews): key-valid reads consume the budget, wrong
//     keys and meta probes never do, the final read deletes the row, and
//     concurrent readers can never exceed the cap.
{
  const { id, keyString, token } = await createSecret({
    content: 'two views only',
    burnAfterRead: false,
    maxViews: 2,
  });

  // Wrong key: rejected without consuming a view.
  const wrong = await generateKey().then((k) => fetchSecret(id, k.keyString));
  assert.equal(wrong.response.status, 403, 'a wrong key must not read or consume a view');

  // Creator meta probe: exposes the counter, consumes nothing.
  const meta = await fetch(`${BASE}/api/secrets/${id}?meta=1`, { headers: { 'x-creator-token': token } });
  assert.equal(meta.status, 200);
  assert.equal((await meta.json()).viewCount, 0, 'meta probes must not count as views');

  // Two key-valid reads: the second is the final view and consumes the row…
  const first = await fetchSecret(id, keyString);
  assert.equal(first.response.status, 200);
  const afterFirst = await fetch(`${BASE}/api/secrets/${id}?meta=1`, { headers: { 'x-creator-token': token } });
  assert.equal((await afterFirst.json()).viewCount, 1, 'a granted read must increment the counter');
  const second = await fetchSecret(id, keyString);
  assert.equal(second.response.status, 200, 'the final view must still be granted');
  // …so a third read finds nothing: the final view deleted the row outright.
  // ('consumed' is the concurrency-window answer when the row still exists.)
  const third = await fetchSecret(id, keyString);
  assert.equal(third.response.status, 404);
  assert.equal(third.data.error, 'not_found');
  const afterMeta = await fetch(`${BASE}/api/secrets/${id}?meta=1`, { headers: { 'x-creator-token': token } });
  assert.equal(afterMeta.status, 404, 'an exhausted secret must be deleted');

  // Concurrency: with a budget of 2, exactly two of three parallel readers
  // are granted — the counter can never overshoot into an extra view.
  const race = await createSecret({ content: 'race views', burnAfterRead: false, maxViews: 2 });
  const attempts = await Promise.all([
    fetchSecret(race.id, race.keyString),
    fetchSecret(race.id, race.keyString),
    fetchSecret(race.id, race.keyString),
  ]);
  const granted = attempts.filter((a) => a.response.status === 200);
  const consumed = attempts.filter((a) => a.response.status === 404);
  assert.equal(granted.length, 2, 'exactly maxViews concurrent reads may be granted');
  assert.equal(consumed.length, 1, 'the reader beyond the cap must be consumed');
  console.log('10. view-limit expiry (maxViews): ok');
}

// 11. Rate limiting: creating eventually returns 429 with Retry-After (exhausts the create budget — always runs last).
{
  let limited = null;
  for (let i = 0; i < 50 && !limited; i++) {
    const response = await fetch(`${BASE}/api/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: 'AA',
        iv: 'AAAAAAAAAAAAAAAA',
        keyChecksum: 'A'.repeat(43),
        creatorTokenHash: 'A'.repeat(43),
        burnAfterRead: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    if (response.status === 429) {
      assert.ok(response.headers.get('retry-after'), '429 must carry Retry-After');
      limited = response;
    }
  }
  assert.ok(limited, 'create rate limit never triggered');
  console.log('11. rate limiting: ok');
}


console.log('e2e passed');