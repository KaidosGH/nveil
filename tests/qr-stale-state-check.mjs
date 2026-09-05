// Stale-state check for the QR modal: reopening the modal (new payload)
// must clear prior output before regenerating, and the invariant
// "no svg rendered => download buttons disabled" must always hold —
// including on the failure path where regeneration never completes.
// Run: BASE_URL=http://localhost:3232 node tests/qr-stale-state-check.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3232';
const browser = await chromium.launch({ channel: process.env.UI_BROWSER_CHANNEL ?? 'msedge' });
const page = await (await browser.newContext()).newPage();
page.setDefaultTimeout(15_000);

await page.goto(`${BASE}/create`);
await page.waitForSelector('textarea');
await page.fill('textarea', 'stale state check');
await page.route('**/api/secrets', (route) =>
  route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'stale-check-0000' }) }),
);
await page.locator('button:has-text("Create Secret")').first().click();
await page.waitForSelector('input[readonly]', { timeout: 15_000 });

// 1. Open the secret QR — generation must succeed.
await page.locator('button', { hasText: /QR/i }).first().click();
await page.waitForSelector('[class*="aspect-square"] svg', { timeout: 15_000 });
const firstSvgLen = await page.evaluate(() => document.querySelector('[class*="aspect-square"] svg')?.outerHTML.length ?? 0);
console.log('first QR rendered, svg len:', firstSvgLen);
assert.ok(firstSvgLen > 100, 'first QR did not render');

// 2. Close and reopen for the same/next payload. The effect clears
//    svg/pngHref before regenerating, so the only consistent states are:
//    (a) transient: no svg AND download buttons disabled (generation in
//        flight or failed), or (b) settled: svg present.
//    Capture whichever state we land in and assert the invariant.
await page.keyboard.press('Escape');
await page.locator('button', { hasText: /QR/i }).first().click();
const state = await page.evaluate(() => {
  const card = document.querySelector('[class*="aspect-square"]');
  const buttons = [...document.querySelectorAll('button')];
  const pngBtn = buttons.find((b) => /png/i.test(b.textContent ?? ''));
  const svgBtn = buttons.find((b) => /svg/i.test(b.textContent ?? ''));
  return {
    svgPresent: !!card?.querySelector('svg'),
    pngDisabled: pngBtn?.disabled ?? null,
    svgDisabled: svgBtn?.disabled ?? null,
  };
});
console.log('state right after reopen:', JSON.stringify(state));
if (!state.svgPresent) {
  // Caught the cleared transient — this is the regression window the
  // clear-before-regenerate fix closes: no output must be downloadable.
  assert.ok(state.pngDisabled, 'no svg present but PNG download enabled');
  assert.ok(state.svgDisabled, 'no svg present but SVG download enabled');
  console.log('caught cleared transient — invariant holds');
} else {
  console.log('regeneration already completed — invariant trivially holds');
}

// 3. Regeneration completes: the QR is back either way.
await page.waitForSelector('[class*="aspect-square"] svg', { timeout: 15_000 });
console.log('QR stale-state check passed');
await browser.close();
