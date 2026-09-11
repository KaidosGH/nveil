import { NextResponse } from 'next/server';

/**
 * Uniform denial for the shared management gate (`requireManagement`): the
 * `Retry-After` header must ride along on a 429, which is easy to forget when
 * each route re-implements this. Kept out of lib/access-keys.ts, which stays
 * framework-free for the plain-node self-check.
 */
export function denied(gate: { status: number; error: string; retryAfter?: number }) {
  return NextResponse.json(
    { error: gate.error },
    {
      status: gate.status,
      headers: gate.retryAfter ? { 'Retry-After': String(gate.retryAfter) } : undefined,
    },
  );
}
