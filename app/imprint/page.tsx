import type { Metadata } from 'next';
import { LegalPage } from '@/lib/legal-page';

export const metadata: Metadata = { title: 'Impressum / Imprint' };

export default function ImprintPage() {
  return <LegalPage kind="imprint" />;
}
