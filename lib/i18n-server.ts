import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { DEFAULT_LANGUAGE } from '@/lib/deployment';
import { getDict, locales, type ApiMessageCode, type Locale } from '@/lib/i18n/index';

const COOKIE_NAME = 'nveil-lang';

/**
 * Locale resolution: an explicit visitor choice (cookie, set via the footer
 * select) wins; otherwise the operator-configured default applies.
 * Registry-driven: any locale registered in lib/i18n/index.ts is accepted.
 */
export function localeFromParts(cookie: string | undefined): Locale {
  return locales.includes(cookie as Locale) ? (cookie as Locale) : DEFAULT_LANGUAGE;
}

/** Locale for server components (reads cookies). */
export async function getServerLocale(): Promise<Locale> {
  return localeFromParts((await cookies()).get(COOKIE_NAME)?.value);
}

/** Locale for route handlers. */
export function getRequestLocale(request: NextRequest): Locale {
  return localeFromParts(request.cookies.get(COOKIE_NAME)?.value);
}

/** Localized API error message by error code (getDict falls back to English). */
export function apiMessage(request: NextRequest, code: ApiMessageCode): string {
  return getDict(getRequestLocale(request)).api[code];
}
