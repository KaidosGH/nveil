import type { Metadata } from 'next';
import { LegalPage } from '@/lib/legal-page';

export const metadata: Metadata = { title: 'Datenschutzerklärung' };

export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
