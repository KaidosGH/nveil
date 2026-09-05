// Self-check for the CF-aware clientIp spoof protection. Run: node tests/cf-ip.test.mjs
import assert from 'node:assert/strict';
import { clientIp } from '../lib/rate-limit.ts';

// 1. No headers: unknown
assert.equal(await clientIp(new Headers()), 'unknown');

// 2. Simple one-proxy case: last XFF entry (proxy-appended)
assert.equal(
  await clientIp(new Headers({ 'x-forwarded-for': 'forged.1.2.3, 10.0.0.7' })),
  '10.0.0.7',
  'without CF headers the last XFF entry applies',
);

// 3. CF-Connecting-IP from a genuine Cloudflare peer (104.16.x is a CF range):
// the CF header is trusted and wins.
assert.equal(
  await clientIp(
    new Headers({
      'x-forwarded-for': '198.51.100.9, 104.16.132.229',
      'cf-connecting-ip': '198.51.100.9',
    }),
  ),
  '198.51.100.9',
  'CF header must win when the peer is a Cloudflare edge IP',
);

// 4. Spoof attempt: CF-Connecting-IP set, but the peer is NOT Cloudflare —
// header must be IGNORED (fallback to last XFF), so direct hits cannot
// mint fresh rate-limit buckets by rotating the header.
assert.equal(
  await clientIp(
    new Headers({
      'x-forwarded-for': '203.0.113.5, 10.0.0.7',
      'cf-connecting-ip': '6.6.6.6',
    }),
  ),
  '10.0.0.7',
  'CF header must be ignored when the peer is not a Cloudflare IP',
);

// 5. CF header with no XFF at all and no CF peer: ignored, unknown/ip-real fallback
assert.equal(
  await clientIp(new Headers({ 'cf-connecting-ip': '6.6.6.6' })),
  'unknown',
  'CF header alone (no proxy chain) must not be trusted',
);

// 6. Genuine Cloudflare IPv6 edge (2606:4700::/32): CF header trusted and wins.
assert.equal(
  await clientIp(
    new Headers({
      'x-forwarded-for': '198.51.100.9, 2606:4700:a000:1234::1',
      'cf-connecting-ip': '198.51.100.9',
    }),
  ),
  '198.51.100.9',
  'CF header must win for a Cloudflare IPv6 edge peer',
);

// 7. Non-Cloudflare IPv6 peer: header ignored (v6 spoof protection).
assert.equal(
  await clientIp(
    new Headers({
      'x-forwarded-for': '203.0.113.5, 2001:db8::1',
      'cf-connecting-ip': '6.6.6.6',
    }),
  ),
  '2001:db8::1',
  'CF header must be ignored for a non-Cloudflare IPv6 peer',
);

// 8. CF IPv6 edge written in full (non-compressed) form.
assert.equal(
  await clientIp(
    new Headers({
      'x-forwarded-for': '198.51.100.9, 2606:4700:0:0:0:0:0:0',
      'cf-connecting-ip': '198.51.100.9',
    }),
  ),
  '198.51.100.9',
  'full-form IPv6 CF edge peers must be recognized too',
);

console.log('clientIp CF-spoof-protection self-check passed');
