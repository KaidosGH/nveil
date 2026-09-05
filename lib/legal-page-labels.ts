/**
 * Shared legal-page labels/routes — imported by the footer (per render)
 * and lib/legal-page.tsx. Kept separate so importers never pull the React
 * component module.
 *
 * Labels are per-locale endonyms: each locale names the page the way its
 * readers know it (de: "Impressum" per §5 DDG), with no host-region
 * assumption baked into the default.
 */
export const LABELS = {
  imprint: { en: 'Imprint', de: 'Impressum', route: '/imprint' },
  privacy: { en: 'Privacy', de: 'Datenschutz', route: '/privacy' },
  cookies_and_tracking: { en: 'Cookies & Tracking', de: 'Cookies & Tracking', route: '/cookies-and-tracking' },
  tos: { en: 'Terms', de: 'Nutzungsbedingungen', route: '/tos' },
} as const;
