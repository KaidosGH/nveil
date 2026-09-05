import { Card, CardContent } from '@/components/ui/card';

/**
 * Loading placeholder for /create: shown when the landing page's CTA
 * navigates here. Card-shaped, because everything this route renders is a
 * card. The fade is opacity-only, so it stays on under prefers-reduced-motion.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <Card className="animate-fade">
        <CardContent className="space-y-4 p-6">
          <div className="h-5 w-1/3 rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
          <div className="h-28 rounded-md bg-muted" />
        </CardContent>
      </Card>
    </main>
  );
}
