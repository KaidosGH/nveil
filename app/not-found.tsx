import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { getServerLocale } from '@/lib/i18n-server';
import { getDict } from '@/lib/i18n/index';

export const metadata = { title: 'Page not found' };

/** Unmatched-route 404. The Next built-in follows prefers-color-scheme and
 *  renders white on light-OS machines — the only theme leak in this
 *  forced-dark app. This keeps the dark card style and offers a way back. */
export default async function NotFound() {
  const t = getDict(await getServerLocale()).common;

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive-foreground">
            <TriangleAlert aria-hidden className="size-5" /> {t.pageNotFound}
          </CardTitle>
          <CardDescription>{t.pageNotFoundDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/" className={buttonVariants()}>
            {t.goHome}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
