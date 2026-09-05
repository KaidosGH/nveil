'use client';

import { createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { type Dict, type Locale, localeEndonyms, locales } from '@/lib/i18n/index';

const I18nContext = createContext<{ locale: Locale; t: Dict } | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={{ locale, t: dict }}>{children}</I18nContext.Provider>;
}

export function useI18n(): { locale: Locale; t: Dict } {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/**
 * Language select (cookie). Uses router.refresh() so server components
 * re-render with the new locale while client state survives — the create
 * result screen keeps its links and the manage page keeps its in-memory
 * creator token (previously a full reload wiped both, and the burn guard
 * below a revealed secret existed only to prevent exactly that).
 * Rendered from the locale registry, so adding a language in
 * lib/i18n/index.ts is the only change needed for it to appear here.
 */
export function LocaleToggle({ locale }: { locale: Locale }) {
  const router = useRouter();

  function switchLocale(target: string) {
    const next = locales.includes(target as Locale) ? (target as Locale) : 'en';
    document.cookie = `nveil-lang=${next}; path=/; max-age=31536000; samesite=lax; secure`;
    router.refresh();
  }

  return (
    <>
      <label className="sr-only" htmlFor="nveil-lang-select">
        {localeEndonyms[locale]}
      </label>
      <select
        id="nveil-lang-select"
        value={locale}
        onChange={(e) => switchLocale(e.target.value)}
        className="h-8 rounded border border-border/60 bg-transparent px-1.5 font-mono text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeEndonyms[l]}
          </option>
        ))}
      </select>
    </>
  );
}
