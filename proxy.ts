import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Content-Security-Policy proxy (formerly middleware.ts, Next 16 convention).
 * In production the response carries a per-request nonce; Next.js reads the
 * CSP header off the request and applies the nonce to its own bootstrap
 * scripts automatically (see the Next.js CSP guide), so no inline script
 * executes without a nonce. Dev is relaxed — Next's dev tooling injects
 * inline scripts/eval that can't be nonced.
 */
export default function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';

  // /managed is an operator page: without content/managed.(html|txt) it does
  // not exist. Decided here because notFound() downstream cannot change the
  // status once the force-dynamic layout shell has streamed (it renders the
  // not-found UI but with status 200).
  if (request.nextUrl.pathname.replace(/\/+$/, '') === '/managed') {
    const content = join(process.cwd(), 'content');
    if (!existsSync(join(content, 'managed.html')) && !existsSync(join(content, 'managed.txt'))) {
      return new NextResponse(null, { status: 404 });
    }
  }

  let scriptSrc = `'self' 'unsafe-inline' 'unsafe-eval'`;
  if (!isDev) {
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    // No 'self' here: under 'strict-dynamic' (CSP3) host sources are ignored,
    // so it only earns a console warning on every page load. The nonce is the
    // sole trust root; script propagation covers the static chunks.
    scriptSrc = `'nonce-${nonce}' 'strict-dynamic'`;
    request.headers.set('x-nonce', nonce);
  }

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `connect-src 'self'`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
  ].join('; ');

  request.headers.set('content-security-policy', csp);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
