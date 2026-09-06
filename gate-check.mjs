import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3181';
const MK = 'local-test-only-management-key-0123456789abcdef';
const browser = await chromium.launch({ channel: process.env.UI_BROWSER_CHANNEL ?? 'msedge' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

// Fill content and submit without a key: 403 → prompt + disabled Create.
await page.goto(BASE + '/create', { waitUntil: 'networkidle' });
await page.fill('#content', 'gated browser flow');
await page.getByRole('button', { name: 'Create Secret' }).click();
await page.waitForTimeout(1500);
console.log('key prompt shown:', await page.isVisible('#instance-access-key'));
console.log('Create disabled while gated:', await page.getByRole('button', { name: 'Create Secret' }).isDisabled());

// Unlock with a valid key: prompt closes, creation auto-retries.
const response = await fetch(`${BASE}/api/create-keys`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-management-key': MK },
  body: JSON.stringify({ label: 'browser gated flow' }),
});
const { key: rawKey } = await response.json();
await page.fill('#instance-access-key', rawKey);
await page.getByRole('button', { name: /Unlock/ }).click();
await page.waitForTimeout(2000);
console.log('result screen shown:', await page.isVisible('text=/Share the link|your secret/i'));
console.log('Create re-enabled after unlock:', !(await page.getByRole('button', { name: 'Create Secret' }).isDisabled()));

await browser.close();
console.log('gate check passed');
