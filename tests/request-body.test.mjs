// Self-check for lib/request-body.ts: the byte cap must hold for chunked
// bodies (no Content-Length) — the bypass that defeated the old header-only
// check — and multi-byte UTF-8 split across chunks must decode correctly.
//
// Run: node tests/request-body.test.mjs  (part of `npm run check`)
import assert from 'node:assert/strict';
import { readBodyCapped } from '../lib/request-body.ts';

const target = 'http://localhost/test';
const streamOf = (...chunks) =>
  new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
const text = (s) => new TextEncoder().encode(s);

// Chunked body without Content-Length, under the cap: read fully.
{
  const request = new Request(target, {
    method: 'POST',
    body: streamOf(text('{'), text('}')),
    duplex: 'half',
  });
  assert.equal(await readBodyCapped(request, 100), '{}');
}

// Chunked body without Content-Length, over the cap: rejected, not buffered.
{
  const request = new Request(target, {
    method: 'POST',
    body: streamOf(text('x'.repeat(60)), text('y'.repeat(60))),
    duplex: 'half',
  });
  assert.equal(await readBodyCapped(request, 100), null);
}

// Lying Content-Length above the cap: rejected unread.
{
  const request = new Request(target, {
    method: 'POST',
    body: streamOf(text('tiny')),
    headers: { 'content-length': '999999' },
    duplex: 'half',
  });
  assert.equal(await readBodyCapped(request, 100), null);
}

// Empty body: empty string, not null.
{
  const request = new Request(target, { method: 'POST', body: streamOf(), duplex: 'half' });
  assert.equal(await readBodyCapped(request, 100), '');
}

// A 4-byte emoji sequence cut mid-character across the chunk boundary.
{
  const bytes = text('🙂'.repeat(10)); // 40 bytes
  const request = new Request(target, {
    method: 'POST',
    body: streamOf(bytes.slice(0, 17), bytes.slice(17)), // slice 17 splits emoji #5
    duplex: 'half',
  });
  assert.equal(await readBodyCapped(request, 1000), '🙂'.repeat(10));
}

console.log('request-body cap self-check passed');
