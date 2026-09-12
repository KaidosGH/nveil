// Self-check for countdownTo (lib/i18n/index.ts): largest-unit selection,
// flooring (understatement beats overstatement for a deletion), and the
// clamp that keeps a stale tick from formatting a past value.
// Run: node tests/countdown.test.mjs  (part of `npm run check`)
import assert from 'node:assert/strict';
import { countdownTo } from '../lib/i18n/index.ts';

const now = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// Largest unit wins, floored, localized via Intl.RelativeTimeFormat.
assert.equal(countdownTo(now + 3 * DAY + 2 * HOUR, 'en', now), 'in 3 days');
assert.equal(countdownTo(now + 4 * HOUR + 12 * MIN, 'en', now), 'in 4 hours');
assert.equal(countdownTo(now + 4 * HOUR + 12 * MIN, 'de', now), 'in 4 Stunden');
assert.equal(countdownTo(now + 59 * MIN, 'en', now), 'in 59 minutes');

// Under a minute it counts seconds; a stale/past tick clamps to 1.
assert.equal(countdownTo(now + 45_000, 'en', now), 'in 45 seconds');
assert.equal(countdownTo(now + 90_000, 'en', now), 'in 1 minute');
assert.equal(countdownTo(now - 5_000, 'en', now), 'in 1 second');

console.log('countdown self-check passed');
