'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/components/i18n-provider';

/** Uncaught client/server render crash boundary. The Next built-in follows
 *  prefers-color-scheme (white on light-OS machines); this keeps the dark
 *  card style and offers a retry. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="sr-only">{t.common.unexpectedError}</h1>
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive-foreground">
            <TriangleAlert aria-hidden className="size-5" /> {t.common.unexpectedError}
          </CardTitle>
          <CardDescription>{t.common.unexpectedErrorDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={reset}>{t.common.retry}</Button>
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            {t.common.goHome}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
