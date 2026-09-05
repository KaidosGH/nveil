import type { Metadata } from 'next';
import { LegalPage } from '@/lib/legal-page';

export const metadata: Metadata = { title: 'Cookies & Tracking' };

export default function CookiesAndTrackingPage() {
  return <LegalPage kind="cookies_and_tracking" />;
}
