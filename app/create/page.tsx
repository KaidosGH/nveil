import type { Metadata } from 'next';
import { CreateSecretForm } from '@/components/create-secret-form';
import { getDict } from '@/lib/i18n';
import { getServerLocale } from '@/lib/i18n-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDict(await getServerLocale()).create.title };
}

export default async function CreatePage() {
  const t = getDict(await getServerLocale()).create;

  return (
    // max-w-3xl gives the content textarea the same measure as the view
    // page's display box: ~80 monospace columns + headroom, so creator and
    // recipient see the secret wrapped identically. w-full is required:
    // #main-content is a flex column, and mx-auto without w-full suppresses
    // cross-axis stretch — the main would shrink to its content width.
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      {/* Every page gets an h1 (the card titles are h2); visually hidden —
          sighted users see the card title instead. Localized so the document
          language and the heading match (WCAG 3.1.2). */}
      <h1 className="sr-only">{t.title}</h1>
      <CreateSecretForm />
    </main>
  );
}
