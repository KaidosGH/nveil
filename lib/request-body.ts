import { z } from 'zod';

/**
 * Named body caps, so routes can't drift apart. Secrets carry ciphertext (the
 * only large payload); management metadata is small; auth bodies are tiny.
 */
export const SECRET_BODY_CAP = 300_000;
export const ADMIN_BODY_CAP = 4_000;
export const SMALL_BODY_CAP = 1_000;

/**
 * Reads a request body as text with a hard byte cap. Replaces the old
 * Content-Length pre-check (client-supplied; a chunked body carries no
 * Content-Length at all, so the header cannot bound what request.json()
 * buffers). Returns null when the body exceeds the cap.
 */
export async function readBodyCapped(request: Request, capBytes: number): Promise<string | null> {
  // Fast path: an honest Content-Length over the cap is rejected unread.
  if (Number(request.headers.get('content-length') ?? 0) > capBytes) return null;

  if (!request.body) return '';
  const reader = request.body.getReader();
  // Per-call decoder: the streaming flag keeps state across chunks, so a
  // shared instance would corrupt concurrent requests' multi-byte sequences.
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > capBytes) {
      void reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Reads a capped JSON body and validates it. Every JSON route shares the same
 * three exits — 413 over cap, 400 on malformed JSON, 400 on schema failure —
 * so they stay uniform. Unguarded JSON.parse used to surface as a 500. Returns
 * a plain descriptor (no next/server import) so routes render the response.
 */
export async function parseJsonBody<T>(
  request: Request,
  capBytes: number,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const raw = await readBodyCapped(request, capBytes);
  if (raw === null) return { ok: false, status: 413, error: 'payload_too_large' };

  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: 'invalid_input' };
  return { ok: true, data: parsed.data };
}
