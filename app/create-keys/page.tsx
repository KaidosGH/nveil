'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, PassphraseInput } from '@/components/ui';
import { CopyButton } from '@/components/copy-button';
import { useI18n } from '@/components/i18n-provider';

type CreateKey = {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/**
 * Operator page for the access-key gate (NVEIL_ACCESS_KEYS=require):
 * manage the access keys that unlock secret creation on this instance.
 * The management key is entered once per session (sessionStorage, same
 * pattern as the abuse queue) and sent as a header. New keys are shown
 * exactly once — only their hash is stored server-side.
 */
export default function CreateKeysPage() {
  const { t } = useI18n();
  const ta = t.accessKeysAdmin;
  const [keyInput, setKeyInput] = useState('');
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [keys, setKeys] = useState<CreateKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newExpires, setNewExpires] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (key: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/access-keys', { headers: { 'x-management-key': key } });
        if (!response.ok) {
          setError(response.status === 401 ? ta.invalidKey : ta.unreachable);
          setStoredKey(null);
          sessionStorage.removeItem('nveil-management-key');
          return;
        }
        const data = (await response.json()) as { keys: CreateKey[] };
        setKeys(data.keys);
        setStoredKey(key);
        sessionStorage.setItem('nveil-management-key', key);
      } catch {
        setError(ta.unreachable);
      } finally {
        setLoading(false);
      }
    },
    [ta],
  );

  useEffect(() => {
    const saved = sessionStorage.getItem('nveil-management-key');
    if (saved) {
      void load(saved).finally(() => setBooting(false));
    } else {
      setBooting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createKey() {
    if (!storedKey || !newLabel.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/access-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-management-key': storedKey },
        body: JSON.stringify({
          label: newLabel.trim(),
          expiresAt: newExpires ? new Date(newExpires + 'T23:59:59').toISOString() : null,
        }),
      });
      if (!response.ok) {
        setError(ta.actionFailed);
        return;
      }
      const data = (await response.json()) as { key: string };
      setCreatedRaw(data.key);
      setNewLabel('');
      setNewExpires('');
      await load(storedKey);
    } catch {
      setError(ta.unreachable);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!storedKey) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/access-keys/${id}`, {
        method: 'DELETE',
        headers: { 'x-management-key': storedKey },
      });
      if (response.ok) await load(storedKey);
      else setError(ta.actionFailed);
    } catch {
      setError(ta.unreachable);
    } finally {
      setBusyId(null);
    }
  }

  function status(key: CreateKey): { label: string; tone: string } {
    if (key.revokedAt) return { label: ta.status.revoked, tone: 'text-muted-foreground' };
    if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now())
      return { label: ta.status.expired, tone: 'text-muted-foreground' };
    return { label: ta.status.active, tone: 'text-foreground' };
  }

  if (booting) {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <Card>
          <CardContent
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 p-10 text-muted-foreground"
          >
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t.common.loading}
          </CardContent>
        </Card>
      </main>
    );
  }

  if (storedKey === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="sr-only">{ta.unlockTitle}</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound aria-hidden className="size-5" /> {ta.unlockTitle}
            </CardTitle>
            <CardDescription>{ta.unlockDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="management-key">{ta.keyLabel}</Label>
              <PassphraseInput
                id="management-key"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && keyInput && !loading) void load(keyInput);
                }}
                autoFocus
              />
              {error && <p className="text-sm text-destructive-foreground">{error}</p>}
            </div>
            <Button
              type="button"
              className="w-full"
              loading={loading}
              disabled={!keyInput}
              onClick={() => void load(keyInput)}
            >
              {ta.unlock}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="sr-only">{ta.unlockTitle}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound aria-hidden className="size-5" /> {ta.unlockTitle}
          </CardTitle>
          <CardDescription>{ta.unlockDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="new-key-label">{ta.newKeyLabel}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="new-key-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                placeholder={ta.newKeyLabel}
                maxLength={100}
              />
              <input
                type="date"
                aria-label={ta.expiresLabel}
                value={newExpires}
                onChange={(e) => setNewExpires(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                loading={creating}
                disabled={!newLabel.trim()}
                onClick={() => void createKey()}
              >
                <Plus aria-hidden className="size-4" /> {ta.create}
              </Button>
            </div>
          </div>

          {createdRaw && (
            <div className="space-y-2 rounded-md border border-border/60 p-3" role="alert">
              <p className="text-sm font-semibold">{ta.createdTitle}</p>
              <p className="text-xs text-muted-foreground">{ta.createdDesc}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">
                  {createdRaw}
                </code>
                <CopyButton value={createdRaw} />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive-foreground">{error}</p>}

          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ta.noKeys}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{ta.labelHeader}</th>
                    <th className="py-2 pr-3 font-medium">{ta.prefixHeader}</th>
                    <th className="py-2 pr-3 font-medium">{ta.createdHeader}</th>
                    <th className="py-2 pr-3 font-medium">{ta.expiresHeader}</th>
                    <th className="py-2 pr-3 font-medium">{ta.lastUsedHeader}</th>
                    <th className="py-2 pr-3 font-medium">{ta.statusHeader}</th>
                    <th className="py-2 font-medium" aria-label={ta.statusHeader} />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => {
                    const s = status(key);
                    return (
                      <tr key={key.id} className="border-t border-border align-top">
                        <td className="py-2 pr-3">{key.label}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{key.prefix}…</td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : ta.never}
                        </td>
                        <td className={`py-2 pr-3 ${s.tone}`}>{s.label}</td>
                        <td className="py-2 text-right">
                          {!key.revokedAt && (
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={busyId === key.id}
                              onClick={() => void revoke(key.id)}
                            >
                              <Trash2 aria-hidden className="size-4" /> {ta.revoke}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
