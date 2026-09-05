import type { Metadata } from 'next';
import { ManageSecret } from '@/components/manage-secret';

export const metadata: Metadata = { title: 'Manage secret' };

export default async function ManageSecretPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="sr-only">Manage secret</h1>
      <ManageSecret id={id} />
    </main>
  );
}
