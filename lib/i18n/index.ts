/**
 * Lightweight i18n registry, no framework. Dictionaries live in per-locale
 * files (./en.ts is the reference shape); this module only wires them up.
 */
// Explicit ./x.ts extensions so the plain-node self-check can import this
// module (same convention as lib/access-keys.ts).
import { en } from './en.ts';
import { de } from './de.ts';
import type { Dict } from './en.ts';

export type { Dict, ApiMessageCode } from './en';

export const locales = ['en', 'de'] as const;
export type Locale = (typeof locales)[number];

/** UI label per locale, shown in its own language (endonym). */
export const localeEndonyms: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
};

export const dictionaries: Record<Locale, Dict> = { en, de };

export function getDict(locale: Locale): Dict {
  return dictionaries[locale] ?? dictionaries.en;
}

/** Replaces {placeholder} tokens in a dictionary string. */
export function format(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

/**
 * Relative countdown to a future timestamp, localized by the platform
 * ("in 4 hours" / "in 4 Stunden") — no per-locale unit strings needed.
 * Picks the largest unit that fits and floors it: for a deletion notice an
 * understatement is safer than an overstatement, and the clamp keeps a
 * stale tick from formatting a past or zero value.
 */
export function countdownTo(until: number, locale: string, now: number = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, size] of units) {
    if (until - now >= size) return rtf.format(Math.floor((until - now) / size), unit);
  }
  return rtf.format(Math.max(1, Math.floor((until - now) / 1000)), 'second');
}

