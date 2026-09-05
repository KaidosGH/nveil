// Measures the create textarea and the decrypted-secret display box:
// both must be the same pixel width, mono-font, and land near 80 columns.
// Run: BASE_URL=http://localhost:3231 node tests/secret-width-check.mjs
// (needs Node >= 22.18 for default TS stripping of the lib/crypto.ts import;
// on older Node 22: node --experimental-strip-types tests/secret-width-check.mjs)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3231';
// Bundled Chromium when UI_BROWSER_CHANNEL is unset; explicit channel
// (msedge/chrome) when the environment provides one.
const channel = process.env.UI_BROWSER_CHANNEL;
const browser = await chromium.launch(channel ? { channel } : {});
const page = await (await browser.newContext()).newPage();
page.setDefaultTimeout(15_000);

// --- Create page: measure the textarea ---
await page.goto(`${BASE}/create`);
await page.waitForSelector('textarea');
const createInfo = await page.evaluate(() => {
  const ta = document.querySelector('textarea');
  const cs = getComputedStyle(ta);
  // Monospace advance = width of a fixed string / char count.
  const probe = document.createElement('span');
  probe.style.font = cs.font;
  probe.style.whiteSpace = 'pre';
  probe.style.position = 'absolute';
  probe.textContent = '0'.repeat(100);
  document.body.appendChild(probe);
  const chWidth = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return {
    width: Math.round(ta.getBoundingClientRect().width),
    fontFamily: cs.fontFamily.split(',')[0],
    chPx: +chWidth.toFixed(2),
  };
});
const createCols = Math.floor((createInfo.width - 26) / createInfo.chPx); // 26px = border + px-3 paddings
console.log('create textarea:', JSON.stringify(createInfo), '-> ~' + createCols + ' cols');

// --- View page: measure the plain display box ---
// Full real flow: create a real secret in Node via the app's own crypto lib,
// stub both API routes to serve it, then decrypt in the browser. This uses
// no database and exercises the genuine client decrypt path.
const payload = 'A'.repeat(240);
const { generateKey, encrypt } = await import('../lib/crypto.ts');
const { key, keyString: ks } = await generateKey();
const { ciphertext: ct, iv: ivB64 } = await encrypt(key, payload);

// Register stubs BEFORE navigation: the page SSRs as "Decrypting…" and the
// needs-key input only appears after hydration resolves the stubbed probe.
await page.route('**/api/secrets/qr-check-0000?meta=1*', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ burnAfterRead: false, hasPassword: false }) }),
);
await page.route('**/api/secrets/qr-check-0000', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ciphertext: ct, iv: ivB64, hasPassword: false, burnAfterRead: false }),
  }),
);

await page.goto(`${BASE}/secret/qr-check-0000`);
await page.waitForSelector('input#key', { timeout: 15_000 });
await page.fill('input#key', ks);
await page.click('button[type="submit"]');
// The plain display box is the element the test measures — wait for it
// directly (i18n-independent), not for a localized button label.
await page.waitForSelector('.whitespace-pre-wrap', { timeout: 15_000 });
const viewInfo = await page.evaluate(() => {
  const box = document.querySelector('.whitespace-pre-wrap');
  const cs = getComputedStyle(box);
  const probe = document.createElement('span');
  probe.style.font = cs.font;
  probe.style.whiteSpace = 'pre';
  probe.style.position = 'absolute';
  probe.textContent = '0'.repeat(100);
  document.body.appendChild(probe);
  const chWidth = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return {
    width: Math.round(box.getBoundingClientRect().width),
    fontFamily: cs.fontFamily.split(',')[0],
    chPx: +chWidth.toFixed(2),
  };
});
const viewCols = Math.floor((viewInfo.width - 34) / viewInfo.chPx); // 34px = border + px-4 paddings
console.log('view display box:', JSON.stringify(viewInfo), '-> ~' + viewCols + ' cols');

assert.ok(/mono/i.test(createInfo.fontFamily), 'create textarea is not monospace');
assert.ok(/mono/i.test(viewInfo.fontFamily), 'view display box is not monospace');
assert.ok(Math.abs(createInfo.width - viewInfo.width) <= 2, `widths differ: ${createInfo.width} vs ${viewInfo.width}`);
assert.ok(createCols >= 78 && createCols <= 90, `create textarea at ${createCols} cols, want ~80`);
assert.ok(viewCols >= 78 && viewCols <= 90, `view display at ${viewCols} cols, want ~80`);
console.log('secret width check passed');
await browser.close();
