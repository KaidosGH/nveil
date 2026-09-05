/**
 * Shared legal-page labels/routes — imported by the footer (per render)
 * and lib/legal-page.tsx. Kept separate so importers never pull the React
 * component module.
 *
 * The imprint label leads with "Impressum" in every locale: the page
 * targets operators hosted in Germany, where that is the term readers
 * (and §5 DDG) know; the English name follows for everyone else. Other
 * host countries would localize differently.
 */
export const LABELS = {
  imprint: { en: 'Impressum / Imprint', de: 'Impressum', route: '/imprint' },
  privacy: { en: 'Privacy', de: 'Datenschutz', route: '/privacy' },
  cookies_and_tracking: { en: 'Cookies & Tracking', de: 'Cookies & Tracking', route: '/cookies-and-tracking' },
  tos: { en: 'Terms', de: 'Nutzungsbedingungen', route: '/tos' },
} as const;
