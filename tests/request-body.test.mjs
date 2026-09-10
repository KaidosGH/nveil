// Self-check for lib/request-body.ts: the byte cap must hold for chunked
// bodies (no Content-Length) — the bypass that defeated the old header-only
// check — and multi-byte UTF-8 split across chunks must decode correctly.
//
// Run: node tests/request-body.test.mjs  (part of `npm run check`)
import assert from 'node:assert/strict';
import { z } from 'zod';
import { parseJsonBody, readBodyCapped } from '../lib/request-body.ts';

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

// parseJsonBody: every JSON route shares these exits, so pin them. Malformed
// JSON must be a 400 — an unguarded JSON.parse used to surface as a 500.
{
  const schema = z.object({ key: z.string() });
  const post = (body, headers) =>
    new Request(target, { method: 'POST', body, headers, duplex: 'half' });

  const malformed = await parseJsonBody(post(streamOf(text('{')), {}), 100, schema);
  assert.deepEqual(malformed, { ok: false, status: 400, error: 'invalid_json' });

  const valid = await parseJsonBody(post(streamOf(text('{"key":"abc"}')), {}), 100, schema);
  assert.deepEqual(valid, { ok: true, data: { key: 'abc' } });

  const wrongShape = await parseJsonBody(post(streamOf(text('{"key":1}')), {}), 100, schema);
  assert.deepEqual(wrongShape, { ok: false, status: 400, error: 'invalid_input' });

  const tooLarge = await parseJsonBody(post(streamOf(text('x'.repeat(60)), text('y'.repeat(60))), {}), 100, schema);
  assert.deepEqual(tooLarge, { ok: false, status: 413, error: 'payload_too_large' });
}

console.log('request-body cap self-check passed');
