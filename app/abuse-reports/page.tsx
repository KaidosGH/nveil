'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, PassphraseInput } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/components/i18n-provider';
import { format } from '@/lib/i18n/index';

type Report = {
  id: string;
  secretId: string;
  reason: string | null;
  witnessVerified: boolean;
  existedAtReport: boolean;
  secretExpiresAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  deletedAt: string | null;
  stillExists: boolean;
};

/**
 * Operator queue for abuse reports. The admin key is entered once per browser
 * session (kept in sessionStorage) and sent as a header — it never appears in
 * URLs or server logs. Open reports are listed by default; resolved ones are
 * hidden behind a toggle and purged after the retention window.
 */
export default function AbuseReportsPage() {
  const { t } = useI18n();
  const ta = t.abuseAdmin;
  const [keyInput, setKeyInput] = useState('');
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [details, setDetails] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const load = useCallback(
    async (key: string, includeResolved: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/abuse-reports/list${includeResolved ? '?includeResolved=1' : ''}`,
          { headers: { 'x-abuse-key': key } },
        );
        if (!response.ok) {
          setError(response.status === 401 ? ta.invalidKey : ta.unreachable);
          setStoredKey(null);
          sessionStorage.removeItem('nveil-abuse-key');
          return;
        }
        const data = await response.json();
        setReports(data.reports as Report[]);
        setStoredKey(key);
        sessionStorage.setItem('nveil-abuse-key', key);
      } catch {
        setError(ta.unreachable);
      } finally {
        setLoading(false);
      }
    },
    [ta],
  );

  const refresh = useCallback(() => {
    if (storedKey) void load(storedKey, showResolved);
  }, [load, storedKey, showResolved]);

  useEffect(() => {
    const saved = sessionStorage.getItem('nveil-abuse-key');
    if (saved) void load(saved, showResolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(report: Report, action: 'delete-secret' | 'resolve') {
    if (!storedKey) return;
    setBusyId(report.id);
    try {
      const response = await fetch(`/api/abuse-reports/${report.id}/${action}`, {
        method: 'POST',
        headers: { 'x-abuse-key': storedKey },
      });
      if (response.ok) {
        if (details?.id === report.id) setDetails(null);
        await load(storedKey, showResolved);
      } else {
        setError(ta.actionFailed);
      }
    } catch {
      setError(ta.unreachable);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAllExisting() {
    if (!storedKey) return;
    const targets = reports.filter((r) => r.stillExists && !r.deletedAt);
    let deleted = 0;
    for (const report of targets) {
      try {
        const response = await fetch(`/api/abuse-reports/${report.id}/delete-secret`, {
          method: 'POST',
          headers: { 'x-abuse-key': storedKey },
        });
        if (response.ok) deleted++;
      } catch {
        /* continue with the rest */
      }
    }
    setConfirmBulk(false);
    setBulkResult(format(ta.bulkDone, { d: deleted, t: targets.length }));
    await load(storedKey, showResolved);
  }

  const openReports = reports.filter((r) => r.stillExists && !r.deletedAt);

  if (storedKey === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="sr-only">{ta.unlockTitle}</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert aria-hidden className="size-5" /> {ta.unlockTitle}
            </CardTitle>
            <CardDescription>{ta.unlockDesc}</CardDescription>
          </CardHeader>
          <CardContent>
          {/* No <form>: Firefox-lineage password capture hooks into form
              submission, so a formless, button-driven card never triggers the
              "save password" prompt for the operator key. Enter still submits
              via the input's onKeyDown. PassphraseInput (text + eye toggle):
              password managers key their capture on type=password fields,
              which this is not. */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="abuse-key">{ta.keyLabel}</Label>
              <PassphraseInput
                id="abuse-key"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  // Match the Button's loading guard: repeated Enter while a
                  // request is in flight must not fire concurrent loads — a
                  // stale 401 landing after a 200 would clear a valid session.
                  if (e.key === 'Enter' && keyInput && !loading) {
                    void load(keyInput, showResolved);
                  }
                }}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive-foreground">{error}</p>}
            <Button
              type="button"
              className="w-full"
              loading={loading}
              disabled={!keyInput}
              onClick={() => void load(keyInput, showResolved)}
            >
              {ta.unlock}
            </Button>
          </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-4xl px-4 py-12">
      <h1 className="sr-only">{ta.title}</h1>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>{ta.title}</CardTitle>
              <CardDescription>
                {format(
                  reports.length === 1 ? ta.summaryOne : ta.summaryMany,
                  { open: reports.length, live: openReports.length },
                )}{' '}
                {ta.resolvedNote}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => {
                  setShowResolved((v) => !v);
                  void load(storedKey, !showResolved);
                }}
              >
                {showResolved ? ta.hideResolved : ta.showResolved}
              </Button>
              <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={refresh}>
                <RefreshCw aria-hidden className="size-4" /> {ta.refresh}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive-foreground">{error}</p>}
          {bulkResult && <p className="text-sm">{bulkResult}</p>}

          {reports.length === 0 && <p className="text-sm text-muted-foreground">{ta.noReports}</p>}

          {reports.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                {/* The visible CardTitle names this table for screen readers. */}
                <caption className="sr-only">{ta.title}</caption>
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{ta.th.reported}</th>
                    <th className="py-2 pr-3 font-medium">{ta.th.secret}</th>
                    <th className="py-2 pr-3 font-medium">{ta.th.reason}</th>
                    <th className="py-2 pr-3 font-medium">{ta.th.status}</th>
                    <th className="py-2 font-medium">{ta.th.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="py-2 pr-3">
                        <div className="whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleDateString()}
                          <div className="text-xs text-muted-foreground">
                            {new Date(r.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        /secret/{r.secretId.slice(0, 8)}…
                        {r.secretExpiresAt && (
                          <div className="font-sans text-xs text-muted-foreground">
                            {ta.labels.expires} {new Date(r.secretExpiresAt).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 max-w-48">
                        <div className="line-clamp-1 break-words">
                          {r.reason ?? <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {/* Witness badge: filed from below a decrypted secret
                            (reporter proved key possession) vs. footer report. */}
                        <span
                          className={
                            r.witnessVerified
                              ? 'mr-2 rounded border border-border/60 px-1.5 py-0.5 text-xs text-foreground'
                              : 'mr-2 rounded border border-border/60 px-1.5 py-0.5 text-xs text-muted-foreground'
                          }
                        >
                          {r.witnessVerified ? ta.status.verified : ta.status.unverified}
                        </span>
                        {r.deletedAt ? (
                          <span className="text-muted-foreground">{ta.status.deleted}</span>
                        ) : r.resolvedAt ? (
                          <span className="text-muted-foreground">{ta.status.dismissed}</span>
                        ) : r.stillExists ? (
                          <span className="text-destructive-foreground">{ta.status.live}</span>
                        ) : (
                          <span className="text-muted-foreground">{ta.status.gone}</span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-2 whitespace-nowrap">
                          <Button variant="outline" size="sm" onClick={() => setDetails(r)}>
                            {ta.details}
                          </Button>
                          {r.stillExists && !r.deletedAt && (
                            <Button
                              variant="destructive"
                              size="sm"
                              loading={busyId === r.id}
                              onClick={() => void act(r, 'delete-secret')}
                            >
                              {ta.delete}
                            </Button>
                          )}
                          {!r.resolvedAt && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyId === r.id}
                              onClick={() => void act(r, 'resolve')}
                            >
                              {ta.dismiss}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {openReports.length > 0 && (
            <div className="rounded-md border border-destructive/40 p-4">
              {confirmBulk ? (
                <div className="space-y-3">
                  <p className="text-sm">
                    {format(ta.confirmBulk, { n: openReports.length })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void deleteAllExisting()}
                    >
                      {ta.yesDelete}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmBulk(false)}>
                      {t.manage.cancel}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="destructive" size="sm" onClick={() => setConfirmBulk(true)}>
                  <Trash2 aria-hidden className="size-4" />{' '}
                  {format(ta.deleteAll, { n: openReports.length })}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={details !== null}
        onClose={() => setDetails(null)}
        title={ta.details}
        width="max-w-lg"
      >
        {details && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">{ta.labels.reportedAt}</dt>
              <dd>{new Date(details.createdAt).toLocaleString()}</dd>
              <dt className="text-muted-foreground">{ta.labels.secretId}</dt>
              <dd className="break-all font-mono text-xs">{details.secretId}</dd>
              <dt className="text-muted-foreground">{ta.labels.expires}</dt>
              <dd>
                {details.secretExpiresAt
                  ? new Date(details.secretExpiresAt).toLocaleString()
                  : '—'}
              </dd>
              <dt className="text-muted-foreground">{ta.labels.existedAt}</dt>
              <dd>{details.existedAtReport ? t.common.yes : t.common.no}</dd>
              <dt className="text-muted-foreground">{ta.labels.witness}</dt>
              <dd>{details.witnessVerified ? ta.status.verified : ta.status.unverified}</dd>
              <dt className="text-muted-foreground">{ta.labels.status}</dt>
              <dd>
                {details.deletedAt
                  ? format(ta.status.deletedAt, { date: new Date(details.deletedAt).toLocaleString() })
                  : details.resolvedAt
                    ? format(ta.status.dismissedAt, {
                        date: new Date(details.resolvedAt).toLocaleString(),
                      })
                    : details.stillExists
                      ? ta.status.openLive
                      : ta.status.openGone}
              </dd>
            </dl>
            <div>
              <div className="mb-1 text-muted-foreground">{ta.labels.reason}</div>
              <p className="whitespace-pre-wrap break-words rounded-md border bg-background/40 px-3 py-2">
                {details.reason ?? '—'}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              {details.stillExists && !details.deletedAt && (
                <Button
                  variant="destructive"
                  size="sm"
                  loading={busyId === details.id}
                  onClick={() => void act(details, 'delete-secret')}
                >
                  <Trash2 aria-hidden className="size-4" /> {ta.deleteSecret}
                </Button>
              )}
              {!details.resolvedAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === details.id}
                  onClick={() => void act(details, 'resolve')}
                >
                  <CheckCircle2 aria-hidden className="size-4" /> {ta.dismiss}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
