import type { Metadata } from 'next';
import { LegalPage } from '@/lib/legal-page';

export const metadata: Metadata = { title: 'Terms' };

export default function TosPage() {
  return <LegalPage kind="tos" />;
}
