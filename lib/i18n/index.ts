/**
 * Lightweight i18n registry, no framework. Dictionaries live in per-locale
 * files (./en.ts is the reference shape); this module only wires them up.
 */
import { en } from './en';
import { de } from './de';
import type { Dict } from './en';

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

