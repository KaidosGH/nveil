import type { Metadata } from 'next';
import { ManageSecret } from '@/components/manage-secret';
import { getDict } from '@/lib/i18n';
import { getServerLocale } from '@/lib/i18n-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDict(await getServerLocale()).manage.title };
}

export default async function ManageSecretPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = getDict(await getServerLocale()).manage;
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="sr-only">{t.title}</h1>
      <ManageSecret id={id} />
    </main>
  );
}
