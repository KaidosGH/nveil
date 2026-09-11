'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/components/i18n-provider';
import type { ApiMessageCode } from '@/lib/i18n/index';

type Meta = {
  burnAfterRead: boolean;
  createdAt: string;
  expiresAt: string;
  viewedAt: string | null;
};

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; meta: Meta }
  | { phase: 'deleted' };

export function ManageSecret({ id }: { id: string }) {
  const { t } = useI18n();
  const tokenRef = useRef('');
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const localizedError = useCallback(
    (data: { error?: string; message?: string } | null, fallback: string): string =>
      (data?.error && data.error in t.api ? t.api[data.error as ApiMessageCode] : null) ??
      data?.message ??
      fallback,
    [t],
  );
  // Latest-value refs so the mount effect below can run exactly once per id:
  // a locale change (router.refresh) swaps the dict identity, and re-running
  // the effect would read the already-scrubbed fragment — an empty token.
  const localizedErrorRef = useRef(localizedError);
  localizedErrorRef.current = localizedError;
  const tRef = useRef(t);
  tRef.current = t;
  const initializedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (initializedForRef.current === id) return;
    initializedForRef.current = id;

    // Fragment-based token: never sent to the server, never in proxy logs.
    tokenRef.current = window.location.hash.slice(1);
    (async () => {
      try {
        // Token-authenticated meta probe: read-only metadata for the manage
        // view. The payload endpoint requires the key checksum (which the
        // manage link deliberately does not carry) and must never be called here.
        const response = await fetch(`/api/secrets/${id}?meta=1`, {
          headers: { 'x-creator-token': tokenRef.current },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setState({
            phase: 'error',
            message: localizedErrorRef.current(data, tRef.current.manage.errorFallback),
          });
          return;
        }
        // Token is validated and held in memory — scrub it from the address bar.
        window.history.replaceState(null, '', window.location.pathname);
        setState({ phase: 'ready', meta: data as Meta });
      } catch {
        setState({ phase: 'error', message: tRef.current.manage.unreachable });
      }
    })();
  }, [id]);

  async function onDelete() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/secrets/${id}`, {
        method: 'DELETE',
        headers: { 'x-creator-token': tokenRef.current },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setState({
          phase: 'error',
          message: localizedError(data, t.manage.errorFallback),
        });
        return;
      }
      setState({ phase: 'deleted' });
    } catch {
      setState({ phase: 'error', message: t.manage.unreachable });
    } finally {
      setDeleting(false);
    }
  }

  if (state.phase === 'loading') {
    // Mirrors the view-secret loading card: spinner + label, announced via
    // role=status (WCAG 4.1.3).
    return (
      <Card>
        <CardContent
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 p-10 text-muted-foreground"
        >
          <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          {t.common.loading}
        </CardContent>
      </Card>
    );
  }

  if (state.phase === 'error') {
    return (
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive-foreground">
            <TriangleAlert aria-hidden className="size-5" /> {t.manage.invalidTitle}
          </CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state.phase === 'deleted') {
    return (
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>{t.manage.deletedTitle}</CardTitle>
          <CardDescription>{t.manage.deletedDesc}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { meta } = state;
  const yesNo = (v: boolean) => (v ? t.common.yes : t.common.no);

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle>{t.manage.title}</CardTitle>
        <CardDescription>{t.manage.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t.manage.created}</dt>
          <dd>{new Date(meta.createdAt).toLocaleString()}</dd>
          <dt className="text-muted-foreground">{t.manage.expires}</dt>
          <dd>{new Date(meta.expiresAt).toLocaleString()}</dd>
          <dt className="text-muted-foreground">{t.manage.burn}</dt>
          <dd>{yesNo(meta.burnAfterRead)}</dd>
          <dt className="text-muted-foreground">{t.manage.viewed}</dt>
          <dd>{meta.viewedAt ? new Date(meta.viewedAt).toLocaleString() : t.manage.notYet}</dd>
        </dl>

        {confirming ? (
          <div className="animate-pop space-y-3 rounded-md border border-destructive/40 p-4">
            <p className="text-sm">{t.manage.confirm}</p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={onDelete} loading={deleting}>
                {t.manage.yesDelete}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                {t.manage.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 aria-hidden className="size-4" /> {t.manage.delete}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
