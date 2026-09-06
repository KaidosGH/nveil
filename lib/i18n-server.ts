import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { getEffectiveDefaultLanguage } from '@/lib/instance-settings';
import { getDict, locales, type ApiMessageCode, type Locale } from '@/lib/i18n/index';

const COOKIE_NAME = 'nveil-lang';

/**
 * Locale resolution: an explicit visitor choice (cookie, set via the footer
 * select) wins; otherwise the instance's default language applies (runtime
 * setting from /management, falling back to the NVEIL_DEFAULT_LANGUAGE env).
 */
export function localeFromParts(cookie: string | undefined, fallback: Locale): Locale {
  return locales.includes(cookie as Locale) ? (cookie as Locale) : fallback;
}

/** Locale for server components (reads cookies). */
export async function getServerLocale(): Promise<Locale> {
  return localeFromParts(
    (await cookies()).get(COOKIE_NAME)?.value,
    await getEffectiveDefaultLanguage(),
  );
}

/** Locale for route handlers (reads cookies). */
export async function getRequestLocale(request: NextRequest): Promise<Locale> {
  return localeFromParts(
    request.cookies.get(COOKIE_NAME)?.value,
    await getEffectiveDefaultLanguage(),
  );
}

/** Localized API error message by error code (getDict falls back to English). */
export async function apiMessage(request: NextRequest, code: ApiMessageCode): Promise<string> {
  return getDict(await getRequestLocale(request)).api[code];
}
