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
