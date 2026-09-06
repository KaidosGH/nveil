import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LABELS } from '@/lib/legal-page-labels';
import { getLegalContent } from '@/lib/legal-content';
import { LegalPage } from '@/lib/legal-page';

const label = LABELS.managed;

export const metadata: Metadata = { title: label.en };

export default async function ManagedPage() {
  // Without operator content there is nothing to show (the footer link is
  // also hidden in that state) — surface the visit as a real 404.
  if (!(await getLegalContent('managed'))) notFound();
  return <LegalPage kind="managed" />;
}
