import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
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

  // 'managed' is an operator page, not a legal page: without operator content
  // there is nothing to show (the footer link is also hidden in that state).
  if (kind === 'managed' && !file) notFound();

  if (file) {
    return (
      // Solid Card surface: operator text must stay readable over the
      // animated background (same content treatment as the app's cards).
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <Card className="animate-fade-up">
          <CardContent className="pt-6">
            {file.format === 'html' ? (
              // Operator-provided content — trusted to the same degree as the codebase.
              <div
                className="space-y-4 text-sm leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:mt-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-6 [&_hr]:border-border [&_li]:leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:text-foreground [&_table]:mt-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: file.content }}
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{file.content}</div>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Card className="animate-fade-up">
        <CardContent className="pt-6">
          <h1 className="text-2xl font-semibold">{label[locale]}</h1>
          <p className="mt-6 text-sm text-muted-foreground">
            {legalText[locale].body}
          </p>
          <Placeholder kind={kind} locale={locale} />
          </CardContent>
        </Card>
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
