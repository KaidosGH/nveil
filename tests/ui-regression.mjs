// UI regression tests (browser, via Playwright driving system Edge/Chrome).
// Covers the regressions that actually bit and had only manual coverage:
//
//   1. Language switch must not re-run view/manage mount flows — the URL
//      fragment (key/token) is scrubbed after first read by design, so a
//      re-run would probe with empty key material and destroy the state
//      (the "Cannot manage secret" / "Cannot open secret" bugs).
//   2. Language switch on the create-result screen must preserve the
//      one-time links (they live only in client state).
//   3. Passphrase inputs are text-typed (PassphraseInput) — no
//      type="password" field for browser password managers to capture.
//
// Run: BASE_URL=http://localhost:3100 node tests/ui-regression.mjs
// (requires `npx playwright install` once, or a system Edge/Chrome).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  encrypt,
  generateCreatorToken,
  generateKey,
  keyChecksum,
  tokenHash,
} from '../lib/crypto.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';

async function makeSecret({ content, burnAfterRead = false, password = false }) {
  const { key, keyString } = await generateKey();
  const token = generateCreatorToken();
  const { ciphertext, iv } = await encrypt(key, content);
  const body = {
    ciphertext,
    iv,
    keyChecksum: await keyChecksum(keyString),
    creatorTokenHash: await tokenHash(token),
    burnAfterRead,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  if (password) {
    // Wrap via the same client routine the browser flow uses.
    const { wrapKeyWithPassword } = await import('../lib/crypto.ts');
    Object.assign(body, await wrapKeyWithPassword(keyString, 'correct horse battery staple'));
    body.hasPassword = true;
  }
  const response = await fetch(`${BASE}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201, `create failed: ${response.status}`);
  const { id } = await response.json();
  return { id, keyString, token };
}

const browser = await chromium.launch({
  channel: process.env.UI_BROWSER_CHANNEL ?? 'msedge', // system Edge; 'chrome' also works
});
const page = await (await browser.newContext()).newPage();
page.setDefaultTimeout(15_000);

// 1. Language switch on the MANAGE page must preserve state (token scrubbed
//    after first read — a re-run of the mount effect loses it).
{
  const { id, token } = await makeSecret({ content: 'lang switch target' });
  await page.goto(`${BASE}/manage/${id}#${token}`);
  await page.waitForSelector('text=Expires', { timeout: 10_000 }).catch(async () => {
    // i18n: fall back to any card content proving "ready" state
    await page.waitForSelector(`text=${id.slice(0, 8)}`, { timeout: 10_000 });
  });
  const readyText = await page.evaluate(() => document.body.innerText);
  assert.ok(!/invalid/i.test(readyText), 'manage page must be ready before switch');

  await page.selectOption('#nveil-lang-select', 'de');
  // router.refresh() is async: wait for a German-only string from the
  // dictionary to render, so assertions run on the refreshed page.
  await page.waitForSelector('text=Läuft ab'); // de manage.expires
  const after = await page.evaluate(() => document.body.innerText);
  assert.ok(!/invalid|ungültig/i.test(after), `manage state lost after locale switch: ${after.slice(0, 200)}`);
  assert.ok(
    await page.isVisible('#nveil-lang-select'),
    'footer select must survive refresh',
  );
  console.log('1. manage page: language switch preserves state: ok');
}

// 2. Language switch on a REVEALED secret must keep the plaintext on screen
//    (mount effect runs once per id; fragment already scrubbed).
{
  const { id, keyString } = await makeSecret({ content: 'reveal me once', burnAfterRead: true });
  await page.goto(`${BASE}/secret/${id}#${keyString}`);
  // Burn secrets need the explicit reveal click.
  await page.click('button:has-text("Reveal"), button:has-text("Anzeigen")');
  await page.waitForSelector('text=reveal me once', { timeout: 10_000 });

  await page.selectOption('#nveil-lang-select', 'de');
  // German view.readyTitle only renders once the refreshed page keeps the
  // ready state — a state-losing regression times this out instead of
  // asserting against a stale screen.
  await page.waitForSelector('text=Entschlüsseltes Secret');
  assert.ok(
    await page.isVisible('text=reveal me once'),
    'revealed secret content must survive a locale switch',
  );
  // 2b. Deletion countdown: a regular secret shows "self-deletes in …" next
  //     to the absolute date. Burn secrets deliberately show none — they die
  //     on read, so an expiry would be misleading. The context is still on
  //     the German locale from the switch above.
  {
    const { id, keyString } = await makeSecret({ content: 'countdown target' });
    await page.goto(`${BASE}/secret/${id}#${keyString}`);
    await page.waitForSelector('text=countdown target', { timeout: 10_000 });
    const text = await page.evaluate(() => document.body.innerText);
    assert.match(text, /löscht sich in \d+ (Stunde|Minute|Sekunde)/, 'deletion countdown must render');
  }
  console.log('2. revealed burn secret: language switch preserves content: ok');
}

// 3. Language switch on the CREATE-RESULT screen preserves the one-time links.
{
  // Drive the real create form: fill content, submit, land on result screen.
  await page.goto(`${BASE}/create`);
  await page.fill('#content', 'result screen target');
  await page.click('button:has-text("Create Secret"), button:has-text("Secret erstellen")');
  await page.waitForSelector('text=/Manage link|Verwaltungslink/', { timeout: 15_000 });
  const urlBefore = await page.inputValue('input[readonly]');

  await page.selectOption('#nveil-lang-select', 'de');
  await page.waitForSelector('text=Verwaltungslink'); // de result.manageToggle
  const resultVisible = await page.isVisible('text=/Secret-Link|Create another|Weiteres/').catch(() => false);
  const onForm = await page.isVisible('#content').catch(() => false);
  assert.ok(resultVisible, 'language switch kicked back to the create form (state lost)');
  assert.ok(!onForm, 'create form must not reappear after locale switch on result screen');
  assert.equal(await page.inputValue('input[readonly]'), urlBefore, 'secret link changed');
  console.log('3. create-result screen: language switch preserves links: ok');
}

// 4. Passphrase fields are text-typed (no type="password" capture surface).
{
  await page.goto(`${BASE}/create`);
  const none = await page.locator('input[type="password"]').count();
  assert.equal(none, 0, 'no password-typed inputs may exist on the create page');
  // Toggle to password key delivery; passphrase fields appear — still text-typed.
  await page.click('summary:has-text("Advanced"), summary:has-text("Erweitert")');
  await page.click('[role="radio"]:has-text("Password"), [role="radio"]:has-text("Passwort")');
  await page.waitForSelector('#secret-passphrase');
  const type = await page.getAttribute('#secret-passphrase', 'type');
  assert.equal(type, 'text', 'passphrase field must be text-typed (PassphraseInput)');
  assert.ok(await page.isVisible('#secret-passphrase + button'),
    'eye toggle must be present next to the passphrase field');

  // Decrypt dialog: same guarantee on a password-protected secret.
  const { id, keyString } = await makeSecret({
    content: 'pw protected', burnAfterRead: false, password: true,
  });
  await page.goto(`${BASE}/secret/${id}`);
  await page.waitForSelector('#secret-passphrase', { timeout: 10_000 });
  const t2 = await page.getAttribute('#secret-passphrase', 'type');
  assert.equal(t2, 'text', 'decrypt passphrase field must be text-typed');
  // And the full unlock path works with the toggle present.
  await page.fill('#secret-passphrase', 'correct horse battery staple');
  await page.click('button:has-text("Unlock secret"), button:has-text("Secret entsperren")');
  await page.waitForSelector('text=pw protected', { timeout: 10_000 });
  console.log('4. passphrase fields: text-typed on create + decrypt, unlock works: ok');
}

await browser.close();
console.log('ui regression tests passed');
