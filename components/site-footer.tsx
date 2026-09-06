import Link from 'next/link';
import { ABUSE_REPORTS_ENABLED, IS_PUBLIC_DEPLOYMENT } from '@/lib/deployment';
import { getEffectiveSupportLink } from '@/lib/instance-settings';
import { LABELS } from '@/lib/legal-page-labels';
import { availableLegalKinds } from '@/lib/legal-content';
import { getServerLocale } from '@/lib/i18n-server';
import { getDict } from '@/lib/i18n/index';
import { LocaleToggle } from '@/components/i18n-provider';
import { EffectsToggle } from '@/components/effects-toggle';
import { ReportAbuseDialog } from '@/components/report-abuse-dialog';

const GITHUB_URL = 'https://github.com/KaidosGH/nveil';

/** GitHub mark, inlined (lucide no longer ships brand icons). */
function GitHubIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="size-4">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

/**
 * Footer: source link, language and effects toggles always present; the
 * legal links appear only for public deployments (NVEIL_PUBLIC) AND when
 * the operator actually placed that document in content/ — no links to
 * empty placeholders. The abuse-report entry appears when abuse reporting
 * is enabled (NVEIL_REPORT_ABUSE + key).
 */
export async function SiteFooter() {
  const locale = await getServerLocale();
  const t = getDict(locale);
  const legalKinds = IS_PUBLIC_DEPLOYMENT ? await availableLegalKinds() : [];
  const supportLink = await getEffectiveSupportLink();

  return (
    <footer className="mt-auto border-t border-border/60 py-6 text-center text-sm text-muted-foreground">
      <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {legalKinds.map((kind) => (
          <Link
            key={kind}
            href={LABELS[kind].route}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded px-1 py-1.5 underline-offset-4 hover:underline"
          >
            {LABELS[kind][locale]}
            <span className="sr-only"> {t.common.opensInNewTab}</span>
          </Link>
        ))}
        {ABUSE_REPORTS_ENABLED && <ReportAbuseDialog />}
        <LocaleToggle locale={locale} />
        <EffectsToggle />
        {supportLink && (
          <a
            href="https://ko-fi.com/kaidos"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded px-1 py-1.5 underline-offset-4 hover:underline"
          >
            {t.common.supportProject}
            <span className="sr-only"> {t.common.opensInNewTab}</span>
          </a>
        )}
        {supportLink && (
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="rounded p-1.5 underline-offset-4 hover:opacity-80"
          >
            <GitHubIcon />
            <span className="sr-only">{t.common.opensInNewTab}</span>
          </a>
        )}
      </nav>
    </footer>
  );
}
