import type { Metadata } from 'next';
import { ViewSecret } from '@/components/view-secret';
import { ABUSE_REPORTS_ENABLED } from '@/lib/deployment';

export const metadata: Metadata = { title: 'View secret' };

export default async function ViewSecretPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    // Same measure as the create textarea (~80 mono columns); w-full because
    // #main-content is a flex column — mx-auto alone shrinks to content width.
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="sr-only">View secret</h1>
      {/* The abuse link is rendered by ViewSecret only after decryption, and
          marked witness-verified via the in-scope key checksum. Props must
          stay serializable: this page is a server component. */}
      <ViewSecret id={id} showAbuseReport={ABUSE_REPORTS_ENABLED} />
    </main>
  );
}
