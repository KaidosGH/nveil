import { Card, CardContent } from '@/components/ui/card';
import { getDict } from '@/lib/i18n';
import { getServerLocale } from '@/lib/i18n-server';

/**
 * Loading placeholder for /create: shown when the landing page's CTA
 * navigates here. Card-shaped, because everything this route renders is a
 * card. The skeleton blocks pulse (opacity only), which stays on under
 * prefers-reduced-motion.
 */
export default async function Loading() {
  const label = getDict(await getServerLocale()).common.loading;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <Card className="animate-pulse">
        <CardContent className="space-y-4 p-6">
          <span role="status" className="sr-only">
            {label}
          </span>
          <div className="h-5 w-1/3 rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
          <div className="h-28 rounded-md bg-muted" />
        </CardContent>
      </Card>
    </main>
  );
}
