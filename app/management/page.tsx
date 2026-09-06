'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, Settings as SettingsIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, PassphraseInput, Switch } from '@/components/ui';
import { CopyButton } from '@/components/copy-button';
import { useI18n } from '@/components/i18n-provider';

type TabId = 'keys' | 'settings' | 'branding';

type SettingsPayload = {
  supportLink: boolean;
  defaultLanguage: 'en' | 'de';
  accessKeysRequired: boolean;
};

type AccessKey = {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const STORAGE_KEY = 'nveil-management-key';

/**
 * Instance management shell (management-key gated): tabs for the access-key
 * gate and runtime instance settings, with brand customization reserved for
 * later. Per-tab features render only when their gate is enabled; the tab
 * bar is hidden entirely when only one area is available.
 */
export default function ManagementPage() {
  const { t } = useI18n();
  const tm = t.management;
  const ts = t.settings;
  const ta = t.accessKeysAdmin;

  const [booting, setBooting] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [tab, setTab] = useState<TabId>('keys');

  // Access-keys tab state
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newExpires, setNewExpires] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Settings tab state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [supportLinkDraft, setSupportLinkDraft] = useState(true);
  const [languageDraft, setLanguageDraft] = useState<'en' | 'de'>('en');

  const authedFetch = useCallback(
    (path: string, init?: RequestInit) => {
      const key = sessionStorage.getItem(STORAGE_KEY) ?? '';
      return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), 'x-management-key': key } });
    },
    [],
  );

  const loadKeys = useCallback(async () => {
    setKeysError(null);
    try {
      const response = await authedFetch('/api/access-keys');
      if (!response.ok) {
        setKeysError(ta.unreachable);
        return;
      }
      const data = (await response.json()) as { keys: AccessKey[] };
      setKeys(data.keys);
    } catch {
      setKeysError(ta.unreachable);
    }
  }, [authedFetch, ta.unreachable]);

  const loadSettings = useCallback(async () => {
    const response = await authedFetch('/api/settings');
    if (!response.ok) return false;
    const data = (await response.json()) as SettingsPayload;
    setSettings(data);
    setSupportLinkDraft(data.supportLink);
    setLanguageDraft(data.defaultLanguage);
    return true;
  }, [authedFetch]);

  // Boot: a stored management key is validated against the settings API —
  // 200 means unlocked (and delivers the current settings), 401 means the
  // key must be re-entered. The access-keys list is reloaded here too —
  // otherwise a refresh showed an empty table despite valid keys.
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setBooting(false);
      return;
    }
    (async () => {
      const ok = await loadSettings();
      if (!ok) sessionStorage.removeItem(STORAGE_KEY);
      setUnlocked(ok);
      setBooting(false);
      if (ok) void loadKeys();
    })();
  }, [loadSettings, loadKeys]);

  async function unlock() {
    setUnlockError(null);
    // The typed key is sent directly — it lands in sessionStorage only after
    // this request succeeds (authedFetch reads from there, which would send
    // an empty header on the very first unlock).
    const response = await fetch('/api/settings', {
      headers: { 'x-management-key': keyInput },
    });
    if (!response.ok) {
      setUnlockError(tm.invalidKey);
      return;
    }
    const data = (await response.json()) as SettingsPayload;
    sessionStorage.setItem(STORAGE_KEY, keyInput);
    setSettings(data);
    setSupportLinkDraft(data.supportLink);
    setLanguageDraft(data.defaultLanguage);
    setUnlocked(true);
    if (data.accessKeysRequired) void loadKeys();
  }

  async function createKey() {
    if (!newLabel.trim()) return;
    setCreating(true);
    setKeysError(null);
    try {
      const response = await authedFetch('/api/access-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel.trim(),
          expiresAt: newExpires ? new Date(newExpires + 'T23:59:59').toISOString() : null,
        }),
      });
      if (!response.ok) {
        setKeysError(ta.actionFailed);
        return;
      }
      const data = (await response.json()) as { key: string };
      setCreatedRaw(data.key);
      setNewLabel('');
      setNewExpires('');
      await loadKeys();
    } catch {
      setKeysError(ta.unreachable);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setBusyId(id);
    setKeysError(null);
    try {
      const response = await authedFetch(`/api/access-keys/${id}`, { method: 'DELETE' });
      if (response.ok) await loadKeys();
      else setKeysError(ta.actionFailed);
    } catch {
      setKeysError(ta.unreachable);
    } finally {
      setBusyId(null);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setSaved(false);
    try {
      const response = await authedFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supportLink: supportLinkDraft ? 'true' : 'false',
          defaultLanguage: languageDraft,
        }),
      });
      if (!response.ok) {
        // A 401 means the management key was rotated out from under this
        // session; anything else (e.g. a database hiccup) is transient.
        setUnlockError(response.status === 401 ? tm.invalidKey : tm.unreachable);
        return;
      }
      setSettings((await response.json()) as SettingsPayload);
      setSaved(true);
    } catch {
      setUnlockError(tm.unreachable);
    } finally {
      setSaving(false);
    }
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

  if (!unlocked) {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="sr-only">{tm.title}</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon aria-hidden className="size-5" /> {tm.title}
            </CardTitle>
            <CardDescription>{tm.unlockDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="management-key">{tm.keyLabel}</Label>
              <PassphraseInput
                id="management-key"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && keyInput) void unlock();
                }}
                autoFocus
              />
              {unlockError && <p className="text-sm text-destructive-foreground">{unlockError}</p>}
            </div>
            <Button type="button" className="w-full" disabled={!keyInput} onClick={() => void unlock()}>
              {tm.unlock}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const tabs: { id: TabId; label: string; visible: boolean }[] = [
    { id: 'keys', label: tm.tabs.keys, visible: settings?.accessKeysRequired ?? false },
    { id: 'settings', label: tm.tabs.settings, visible: true },
    { id: 'branding', label: tm.tabs.branding, visible: true },
  ];
  const visibleTabs = tabs.filter((t) => t.visible);
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0].id;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="sr-only">{tm.title}</h1>

      {visibleTabs.length > 1 && (
        <nav className="mb-6 flex flex-wrap gap-1.5" aria-label={tm.title}>
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={activeTab === t.id ? 'page' : undefined}
              className={
                'h-9 rounded-md border px-3 text-sm transition-[color,background-color] ' +
                (activeTab === t.id
                  ? 'border-white/15 bg-primary text-primary-foreground'
                  : 'border-input hover:bg-muted')
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {activeTab === 'keys' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound aria-hidden className="size-5" /> {tm.tabs.keys}
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
                  maxLength={100}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  placeholder={ta.newKeyLabel}
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

            {keysError && <p className="text-sm text-destructive-foreground">{keysError}</p>}

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
                      const revoked = key.revokedAt !== null;
                      const expired =
                        key.expiresAt !== null && new Date(key.expiresAt).getTime() <= Date.now();
                      const statusLabel = revoked
                        ? ta.status.revoked
                        : expired
                          ? ta.status.expired
                          : ta.status.active;
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
                          <td
                            className={
                              'py-2 pr-3 ' +
                              (revoked || expired ? 'text-muted-foreground' : 'text-foreground')
                            }
                          >
                            {statusLabel}
                          </td>
                          <td className="py-2 text-right">
                            {!revoked && (
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
      )}

      {activeTab === 'settings' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon aria-hidden className="size-5" /> {tm.tabs.settings}
            </CardTitle>
            <CardDescription>{ts.desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="setting-support-link">{ts.supportLinkLabel}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{ts.supportLinkDesc}</p>
              </div>
              <Switch
                id="setting-support-link"
                checked={supportLinkDraft}
                onCheckedChange={(checked) => {
                  setSupportLinkDraft(checked);
                  setSaved(false);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setting-default-language">{ts.defaultLanguageLabel}</Label>
              <p className="text-xs text-muted-foreground">{ts.defaultLanguageDesc}</p>
              <select
                id="setting-default-language"
                value={languageDraft}
                onChange={(e) => {
                  setLanguageDraft(e.target.value as 'en' | 'de');
                  setSaved(false);
                }}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
            <Button type="button" loading={saving} onClick={() => void saveSettings()}>
              {ts.save}
            </Button>
            {saved && (
              <p role="status" className="text-sm text-muted-foreground">
                {ts.saved}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'branding' && (
        <Card>
          <CardHeader>
            <CardTitle>{tm.tabs.branding}</CardTitle>
            <CardDescription>{tm.brandingSoon}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}
