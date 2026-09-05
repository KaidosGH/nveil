// Visual check for the QR modal: preview padding + PNG rounded corners.
// Run: BASE_URL=http://localhost:3229 node tests/qr-visual-check.mjs
// (needs a running server, no DB — the create API is stubbed)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3229';
const browser = await chromium.launch({ channel: process.env.UI_BROWSER_CHANNEL ?? 'msedge' });
const page = await (await browser.newContext()).newPage();
page.setDefaultTimeout(15_000);

await page.goto(`${BASE}/create`);
await page.waitForSelector('textarea');
await page.fill('textarea', 'QR visual check payload');

// No DB in this visual check: stub the create API so the client flow proceeds.
await page.route('**/api/secrets', (route) =>
  route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'qr-check-0000' }) }),
);
const createBtn = page.locator('button:has-text("Create Secret")').first();
await createBtn.click();

// Result screen: URL input + QR button appear.
await page.waitForSelector('input[readonly]', { timeout: 15_000 });

// Open the QR modal — the button contains a QrCode icon; match by its role text fallbacks.
const qrButton = page.locator('button', { hasText: /QR/i }).first();
await qrButton.click();
await page.waitForSelector('[class*="aspect-square"] svg', { timeout: 15_000 });
// The PNG button is disabled={!pngHref} — enabled means the canvas render
// finished and state is committed. No fixed sleep: this waits exactly as
// long as generation actually takes.
await page.waitForSelector('button:not([disabled])', { timeout: 15_000, state: 'visible' });
const pngEnabled = await page
  .locator('button', { hasText: /png/i })
  .first()
  .isEnabled();
assert.ok(pngEnabled, 'PNG download button still disabled — pngHref never set');

const result = await page.evaluate(() => {
  const card = document.querySelector('[class*="aspect-square"]');
  const svg = card?.querySelector('svg');
  const out = { cardWidth: null, svgWidth: null, gapPx: null, padding: null, radius: null };
  if (!card || !svg) return out;
  const c = card.getBoundingClientRect();
  const s = svg.getBoundingClientRect();
  out.cardWidth = Math.round(c.width);
  out.svgWidth = Math.round(s.width);
  out.gapPx = Math.round((c.width - s.width) / 2);
  out.padding = getComputedStyle(card).padding;
  out.radius = getComputedStyle(card).borderRadius;
  return out;
});
console.log('preview:', JSON.stringify(result));
assert.ok(result.gapPx <= 8, `preview padding too large: ${result.gapPx}px per side (want <= 8px)`);
assert.ok(result.gapPx >= 2, `preview padding vanished: ${result.gapPx}px per side (want >= 2px)`);

// PNG: pull the generated data URL out of React state via the download button.
// Instead, re-derive it: click the PNG download and intercept the blob via a
// CDP-free trick — read the anchor's href by monkey-patching click.
const pngHref = await page.evaluate(async () => {
  const origClick = HTMLAnchorElement.prototype.click;
  let href = null;
  HTMLAnchorElement.prototype.click = function () {
    href = this.href;
    HTMLAnchorElement.prototype.click = origClick;
  };
  const buttons = [...document.querySelectorAll('button')];
  const pngBtn = buttons.find((b) => /png/i.test(b.textContent ?? ''));
  if (pngBtn) pngBtn.click();
  return href;
});
console.log('png href present:', !!pngHref, 'len:', pngHref?.length ?? 0);
// pngHref must exist before any pixel assertions can run — no silent bypass.
assert.ok(pngHref && pngHref.length > 0, 'pngHref is empty — canvas QR generation did not run');

// Decode the PNG and inspect its corner pixels for rounded transparency.
const cornerInfo = await page.evaluate(async (href) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = href; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
  return {
    size: img.width,
    topLeft: px(0, 0),
    center: px(img.width >> 1, img.height >> 1),
  };
}, pngHref);
console.log('png:', JSON.stringify(cornerInfo));
// Corner of a rounded card at (0,0) must be transparent (alpha 0) — that is
// the rounded corner; a square-cornered PNG would be opaque white there.
assert.equal(cornerInfo.topLeft[3], 0, 'PNG top-left corner is not transparent — rounded corners missing');
// Renderer contract: 12px per module; size = (modules + 2*4 quiet) * 12.
// Derive the expected module count from the SAME payload the app encodes:
// the result URL is `${BASE}/secret/<id>#<43-char base64url key>` (a real
// generated key is always 43 chars), so rebuild that shape here.
const { create } = await import('qrcode');
const encodedUrl = `${BASE}/secret/qr-check-0000#${'k'.repeat(43)}`;
const expectedSize = (create(encodedUrl, { errorCorrectionLevel: 'H' }).modules.size + 8) * 12;
assert.equal(
  cornerInfo.size,
  expectedSize,
  `PNG size ${cornerInfo.size} does not match the (modules + 8) * 12 renderer contract (expected ${expectedSize})`,
);
console.log('QR visual check passed');

await browser.close();
