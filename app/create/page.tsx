import type { Metadata } from 'next';
import { CreateSecretForm } from '@/components/create-secret-form';

export const metadata: Metadata = { title: 'Create a secret' };

export default function CreatePage() {
  return (
    // max-w-3xl gives the content textarea the same measure as the view
    // page's display box: ~80 monospace columns + headroom, so creator and
    // recipient see the secret wrapped identically. w-full is required:
    // #main-content is a flex column, and mx-auto without w-full suppresses
    // cross-axis stretch — the main would shrink to its content width.
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      {/* Every page gets an h1 (the card titles are h3); visually hidden —
          sighted users see the card title instead. */}
      <h1 className="sr-only">Create a secret</h1>
      <CreateSecretForm />
    </main>
  );
}
