import type { Metadata, Viewport } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppBackground } from '@/components/app-background';
import { InsecureContextWarning } from '@/components/insecure-context-warning';
import { SiteFooter } from '@/components/site-footer';
import { I18nProvider } from '@/components/i18n-provider';
import { getAnnouncement } from '@/lib/announcement';
import { getDict } from '@/lib/i18n/index';
import { localeFromParts } from '@/lib/i18n-server';
import { getEffectiveDefaultLanguage } from '@/lib/instance-settings';
import './globals.css';

// Matches the forced dark theme so mobile browser chrome blends in, and
// colorScheme makes the browser paint the initial canvas dark before any CSS
// arrives (new-tab / hard-refresh loads otherwise flash white first).
export const viewport: Viewport = {
  themeColor: '#0b0b0d',
  colorScheme: 'dark',
};

// Per-request CSP nonces (see proxy.ts) require dynamic rendering —
// statically prerendered HTML cannot carry a nonce.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'nveil — Share secrets securely',
    template: '%s | nveil',
  },
  description: 'Zero-knowledge ephemeral secrets sharing. Self-hosted, end-to-end encrypted.',
  robots: { index: false },
  manifest: '/site.webmanifest',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = localeFromParts(
    cookieStore.get('nveil-lang')?.value,
    await getEffectiveDefaultLanguage(),
  );
  const announcement = await getAnnouncement();

  // Pre-CSS canvas color: the browser paints this inline background before
  // globals.css arrives — keep it in sync with --background (#0b0b0d).
  return (
    <html lang={locale} style={{ background: '#0b0b0d' }}>
      <head>
        {/* next/font/local does not auto-preload variable fonts; the file is
            the stable public copy, so this link is build-independent. */}
        <link
          rel="preload"
          href="/fonts/inter-latin-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="flex min-h-dvh flex-col">
        <I18nProvider locale={locale} dict={getDict(locale)}>
          {/* Keyboard users bypass header/footer on every page (WCAG 2.4.1);
              visually hidden until focused. */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground focus:outline-2 focus:outline-ring"
          >
            {getDict(locale).common.skipToContent}
          </a>
          <InsecureContextWarning />
          <AppBackground />
          {/* Operator announcement (content/announcement.txt) — an optional
              notice bar at the very top of every page: demo disclaimer,
              maintenance window, incident note. Plain text, non-dismissible:
              the operator chose to show it. */}
          {announcement && (
            <div
              role="note"
              className="border-b border-border/60 bg-muted/40 px-4 py-2.5 text-center text-sm text-muted-foreground"
            >
              {announcement}
            </div>
          )}
          <header className="px-4 pt-4 sm:px-6 sm:pt-5">
            <Link
              href="/"
              aria-label="nveil — home"
              className="inline-block rounded focus-visible:outline-2"
            >
              <Image
                src="/logo.png"
                alt="nveil"
                width={800}
                height={400}
                priority
                className="h-14 w-auto sm:h-16"
              />
            </Link>
          </header>
          {/* min-w-0 lets this flex item shrink so inner overflow containers scroll
              instead of stretching the page (e.g. the abuse-reports table). */}
          <div id="main-content" className="flex min-w-0 flex-1 flex-col">{children}</div>
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
