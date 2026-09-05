import { getServerLocale } from '@/lib/i18n-server';
import { type Locale } from '@/lib/i18n/index';
import { getLegalContent, type LegalKind } from '@/lib/legal-content';
import { LABELS } from '@/lib/legal-page-labels';

function Placeholder({ kind, locale }: { kind: LegalKind; locale: Locale }) {
  return (
    <p className="mt-2 text-muted-foreground">
      <strong className="text-foreground">{legalText[locale].fillIn}</strong>{' '}
      <code className="rounded bg-muted px-1">
        content.example/{kind}.html
      </code>{' '}
      → <code className="rounded bg-muted px-1">content/{kind}.html</code>
    </p>
  );
}

/**
 * Renders a legal page: operator-provided content when present
 * (gitignored `content/`, HTML or TXT), otherwise a language-aware
 * placeholder pointing at the templates in `content.example/`.
 * The built-in fallback is deliberately placeholder-only — the legal
 * documents describe the operator's identity and processing, which
 * this software cannot know.
 */
export async function LegalPage({ kind }: { kind: LegalKind }) {
  const file = await getLegalContent(kind);
  const locale = await getServerLocale();
  const label = LABELS[kind];

  if (file) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        {file.format === 'html' ? (
          // Operator-provided content — trusted to the same degree as the codebase.
          <div className="space-y-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: file.content }} />
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{file.content}</div>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{label[locale]}</h1>
      <p className="mt-6 text-sm text-muted-foreground">
        {legalText[locale].body}
      </p>
      <Placeholder kind={kind} locale={locale} />
    </main>
  );
}

const legalText = {
  en: {
    fillIn: 'This page needs your legal content.',
    body: 'The operator of this service provides this page here. As long as no content is configured, this placeholder is shown.',
  },
  de: {
    fillIn: 'Diese Seite benötigt Inhalte des Betreibers.',
    body: 'Der Betreiber dieses Dienstes stellt diese Seite hier bereit. Solange keine Inhalte hinterlegt sind, wird dieser Platzhalter angezeigt.',
  },
} as const;
