import { NextRequest, NextResponse } from 'next/server';
import {
  MANAGEMENT_ENABLED,
  clearedManagementCookie,
  managementCookie,
  verifyManagementKey,
} from '@/lib/access-keys';
import { clientIp, RATE_LIMITS, rateLimit } from '@/lib/rate-limit';
import { parseJsonBody, SMALL_BODY_CAP } from '@/lib/request-body';
import { keyBodySchema } from '@/lib/validation';

/**
 * Management session for the /management UI: the typed key is exchanged once
 * for an httpOnly cookie (the access-keys verify flow, mirrored), so page
 * scripts never hold or re-send the credential. The cookie dies with the
 * browser session; API callers can keep using the x-management-key header.
 * DELETE logs out. Only meaningful when a management key is configured.
 */
export async function POST(request: NextRequest) {
  if (!MANAGEMENT_ENABLED) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const limit = rateLimit(
    `mgmt-login:${await clientIp(request.headers)}`,
    RATE_LIMITS.managementPerMinute,
    60 * 1000,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await parseJsonBody(request, SMALL_BODY_CAP, keyBodySchema);
  if (!parsed.ok || !verifyManagementKey(parsed.data.key)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(managementCookie(parsed.data.key));
  return response;
}

/** Logs the management UI out of this browser: clears the cookie. */
export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(clearedManagementCookie());
  return response;
}
