// Operator-set deployment flags (server-only: never import from client
// components — REPORT_ABUSE_KEY must not reach the client bundle).

import { type Locale, locales } from '@/lib/i18n/index';
import { getLegalContent } from '@/lib/legal-content';

export const IS_PUBLIC_DEPLOYMENT = process.env.NVEIL_PUBLIC === 'true';

export const REPORT_ABUSE_REQUESTED = process.env.NVEIL_REPORT_ABUSE === 'true';
export const REPORT_ABUSE_KEY = process.env.NVEIL_REPORT_ABUSE_KEY ?? '';

/**
 * Fail closed: enabling abuse reports without a strong key (>= 32 chars)
 * disables the feature instead of exposing an open admin queue.
 */
export const ABUSE_REPORTS_ENABLED =
  REPORT_ABUSE_REQUESTED && REPORT_ABUSE_KEY.length >= 32;

if (REPORT_ABUSE_REQUESTED && !ABUSE_REPORTS_ENABLED) {
  console.warn(
    'NVEIL_REPORT_ABUSE is enabled but NVEIL_REPORT_ABUSE_KEY is missing or too short (< 32 chars) — abuse reporting stays disabled.',
  );
}

/**
 * Legal pages (privacy/imprint) ship as placeholders only; real content comes
 * from the operator-provided `content/` directory (see content.example/).
 * The footer only links documents that actually exist, so a missing file is
 * not a broken link — but a public instance without any legal pages is
 * almost certainly an oversight, hence this hint.
 */
export const LEGAL_CONTENT_HINT =
  'Place the filled-in templates in content/ (see content.example/) and mount it into the container.';

if (IS_PUBLIC_DEPLOYMENT) {
  for (const kind of ['privacy', 'imprint'] as const) {
    if (!(await getLegalContent(kind))) {
      console.warn(
        `NVEIL_PUBLIC is set but no content/${kind}.html (or .txt) was found — /${kind} serves a placeholder and the footer omits the link. ${LEGAL_CONTENT_HINT}`,
      );
    }
  }
}

/** General contact address (privacy notice, imprint fallback, security.txt). */
export const CONTACT_EMAIL = process.env.NVEIL_CONTACT_EMAIL ?? '';

/** Optional dedicated abuse contact (RFC 2142 convention, e.g. abuse@domain). */
export const ABUSE_EMAIL = process.env.NVEIL_ABUSE_EMAIL ?? '';

/**
 * Optional operator footer links (plain hyperlinks only — widgets/iframes
 * would violate the no-third-party-requests posture). Set them on your own
 * instance (e.g. donation or commercial-CTA links); self-hosted deployments
 * show nothing unless they configure them.
 */
export const SUPPORT_URL = process.env.NVEIL_SUPPORT_URL ?? '';
export const MANAGED_URL = process.env.NVEIL_MANAGED_URL ?? '';

/**
 * Default UI language until the visitor picks one with the footer select
 * (which stores the choice in a cookie). Any locale registered in
 * lib/i18n/index.ts is valid; anything else falls back to English.
 */
const configuredLanguage = process.env.NVEIL_DEFAULT_LANGUAGE ?? '';
export const DEFAULT_LANGUAGE: Locale = locales.includes(configuredLanguage as Locale)
  ? (configuredLanguage as Locale)
  : 'en';
