'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, KeyRound, LockKeyhole, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/copy-button';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { ReportAbuseDialog } from '@/components/report-abuse-dialog';
import { Input, Label, PassphraseInput } from '@/components/ui';
import { useI18n } from '@/components/i18n-provider';
import { useNow } from '@/components/use-now';
import { decrypt, keyChecksum, unwrapKeyWithPassword } from '@/lib/crypto';
import type { ApiMessageCode } from '@/lib/i18n/index';
import { countdownTo, format } from '@/lib/i18n/index';

type Meta = {
  ciphertext: string;
  iv: string;
  burnAfterRead: boolean;
  hasPassword?: boolean;
  wrappedKey?: string;
  wrapIv?: string;
  wrapSalt?: string;
  expiresAt?: string;
};
type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'needs-key'; burn: boolean }
  | { phase: 'needs-password'; burn: boolean; wrapped: { wrappedKey: string; wrapIv: string; wrapSalt: string } }
  | { phase: 'confirm-burn'; key: string }
  | { phase: 'ready'; content: string; expiresAt?: string };

type ProbeResult =
  | { ok: true; burn: boolean; hasPassword: boolean; wrapped?: { wrappedKey: string; wrapIv: string; wrapSalt: string } }
  | { ok: false; code?: string; message?: string };

/**
 * View flow: the key arrives via the URL fragment (never sent to the server).
 * Burn-after-read secrets require an explicit "reveal" click — the consumption
 * happens server-side on that fetch, so opening or refreshing the link alone
 * destroys nothing. The hash is scrubbed from the address bar once read.
 */
export function ViewSecret({
  id,
  showAbuseReport,
}: {
  id: string;
  /** Renders the "Report abuse" entry below the decrypted secret; the report
   *  is then witness-verified via the in-scope key checksum. */
  showAbuseReport?: boolean;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [pastedKey, setPastedKey] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [wrongPassword, setWrongPassword] = useState(false);
  // Rendering mode for the revealed secret. Plain text is the default: what
  // you see is the exact stored text, no interpretation. Deliberately not
  // persisted — every view starts plain.
  const [renderMode, setRenderMode] = useState<'plain' | 'markdown'>('plain');
  const burnRef = useRef(false);
  const checksumRef = useRef<string | null>(null);

  const localizedError = useCallback(
    (code: string | undefined, fallback: string | undefined): string => {
      if (code && code in t.api) return t.api[code as ApiMessageCode];
      return fallback ?? t.view.fetchFallback;
    },
    [t],
  );

  // Latest-value refs: the mount effect below must run exactly once per id —
  // not again on a locale change (router.refresh keeps component state but
  // swaps the dict, changing t-identity) — and the localized helpers must
  // stay current for later fetches. Both patterns mirror Modal's onCloseRef.
  const localizedErrorRef = useRef(localizedError);
  localizedErrorRef.current = localizedError;
  const tRef = useRef(t);
  tRef.current = t;

  const probe = useCallback(async (): Promise<ProbeResult> => {
    const response = await fetch(`/api/secrets/${id}?meta=1`);
    const data = (await response.json().catch(() => null)) as
      | {
          error?: string;
          message?: string;
          burnAfterRead?: boolean;
          hasPassword?: boolean;
          wrappedKey?: string;
          wrapIv?: string;
          wrapSalt?: string;
        }
      | null;
    if (!response.ok) {
      return { ok: false, code: data?.error, message: data?.message };
    }
    if (data?.hasPassword && data.wrappedKey && data.wrapIv && data.wrapSalt) {
      return {
        ok: true,
        burn: !!data?.burnAfterRead,
        hasPassword: true,
        wrapped: { wrappedKey: data.wrappedKey, wrapIv: data.wrapIv, wrapSalt: data.wrapSalt },
      };
    }
    return { ok: true, burn: !!data?.burnAfterRead, hasPassword: false };
  }, [id]);

  /** Full fetch: presents the key checksum — this consumes burn secrets. */
  const open = useCallback(
    async (keyString: string) => {
      setState({ phase: 'loading' });

      let checksum: string;
      try {
        checksum = await keyChecksum(keyString);
      } catch {
        setState({ phase: 'error', message: t.view.malformedKey });
        return;
      }

      let meta: Meta;
      try {
        const response = await fetch(`/api/secrets/${id}`, {
          headers: { 'x-key-checksum': checksum },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setState({
            phase: 'error',
            message: localizedErrorRef.current(data?.error, data?.message),
          });
          return;
        }
        meta = data as Meta;
      } catch {
        setState({ phase: 'error', message: tRef.current.view.unreachable });
        return;
      }

      try {
        const content = await decrypt(keyString, meta.iv, meta.ciphertext);
        window.history.replaceState(null, '', window.location.pathname);
        // Kept for the witness-verified abuse report (renderBelow).
        checksumRef.current = checksum;
        setState({ phase: 'ready', content, expiresAt: meta.burnAfterRead ? undefined : meta.expiresAt });
      } catch {
        setState({ phase: 'error', message: tRef.current.view.decryptFailed });
      }
    },
    [id],
  );

  /** Decides the next step: password secrets gate first, burn secrets wait for
   *  an explicit reveal. */
  const begin = useCallback(
    async (keyString: string) => {
      const meta = await probe();
      if (!meta.ok) {
        setState({ phase: 'error', message: localizedErrorRef.current(meta.code, meta.message) });
        return;
      }
      burnRef.current = meta.burn;
      if (meta.hasPassword && meta.wrapped) {
        // The gate sits before any consuming fetch: a wrong password fails
        // client-side GCM auth and never burns the secret.
        setState({ phase: 'needs-password', burn: meta.burn, wrapped: meta.wrapped });
        return;
      }
      if (meta.burn) {
        setState({ phase: 'confirm-burn', key: keyString });
        return;
      }
      await open(keyString);
    },
    [probe, localizedError, open],
  );

  /** Password gate: unwrap the content key, then continue the normal flow. */
  const submitPassword = useCallback(
    async (password: string, wrapped: NonNullable<Extract<ProbeResult, { ok: true }>['wrapped']>) => {
      setState({ phase: 'loading' });
      let keyString: string;
      try {
        keyString = await unwrapKeyWithPassword(password, wrapped.wrappedKey, wrapped.wrapIv, wrapped.wrapSalt);
      } catch {
        // GCM auth failed — wrong password, nothing was sent to the server.
        setWrongPassword(true);
        setState({ phase: 'needs-password', burn: burnRef.current, wrapped });
        return;
      }
      if (burnRef.current) {
        setState({ phase: 'confirm-burn', key: keyString });
        return;
      }
      await open(keyString);
    },
    [open],
  );

  // Runs exactly once per id: a locale change re-renders (new dict identity)
  // but must not re-run the flow — the fragment is scrubbed after the first
  // read, so a re-run would probe with empty key material and clobber the
  // decrypted state. begin/probe stay in a ref so the effect sees the latest
  // without listing them as deps.
  const beginRef = useRef(begin);
  beginRef.current = begin;
  const probeRef = useRef(probe);
  probeRef.current = probe;
  const initializedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (initializedForRef.current === id) return;
    initializedForRef.current = id;

    const hash = window.location.hash.slice(1);
    if (hash) {
      void beginRef.current(hash);
      return;
    }
    // No key in the fragment (separate-key or password mode): still ask the
    // server whether the secret exists, so expired/burned/deleted links show
    // their real error instead of a decryption prompt.
    (async () => {
      const meta = await probeRef.current();
      if (!meta.ok) {
        setState({ phase: 'error', message: localizedErrorRef.current(meta.code, meta.message) });
        return;
      }
      burnRef.current = meta.burn;
      if (meta.hasPassword && meta.wrapped) {
        setState({ phase: 'needs-password', burn: meta.burn, wrapped: meta.wrapped });
        return;
      }
      setState({ phase: 'needs-key', burn: meta.burn });
    })();
  }, [id]);

  if (state.phase === 'loading') {
    return (
      <Card>
        {/* role=status announces async decrypt/unwrap progress (WCAG 4.1.3). */}
        <CardContent
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 p-10 text-muted-foreground"
        >
          <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          {t.view.decrypting}
        </CardContent>
      </Card>
    );
  }

  if (state.phase === 'error') {
    return (
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive-foreground">
            <TriangleAlert aria-hidden className="size-5" /> {t.view.errorTitle}
          </CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state.phase === 'needs-key') {
    return (
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound aria-hidden className="size-5" /> {t.view.needsKeyTitle}
          </CardTitle>
          <CardDescription>{t.view.needsKeyDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pastedKey.trim()) void begin(pastedKey.trim());
            }}
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label htmlFor="key">{t.view.keyLabel}</Label>
              <Input
                id="key"
                value={pastedKey}
                onChange={(e) => setPastedKey(e.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit">{t.view.decrypt}</Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (state.phase === 'needs-password') {
    return (
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockKeyhole aria-hidden className="size-5" /> {t.view.needsPasswordTitle}
          </CardTitle>
          <CardDescription>{t.view.needsPasswordDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* No <form>: Firefox-lineage password capture hooks into form
              submission, so a formless, button-driven dialog never triggers
              the "save password" prompt for this one-time decrypt password.
              Enter still submits via the input's onKeyDown. */}
          <div className="space-y-3" aria-describedby={wrongPassword ? 'wrong-password-alert' : undefined}>
            <div className="space-y-2">
              <Label htmlFor="secret-passphrase">{t.view.passwordLabel}</Label>
              {/* PassphraseInput: text-typed with an eye toggle — password
                  managers key "save password?" capture on type=password
                  fields, and this value is a one-time secret passphrase, not
                  a site credential. No <form> either: Firefox-lineage capture
                  also hooks into form submission. Enter still submits. */}
              <PassphraseInput
                id="secret-passphrase"
                name="secret_passphrase"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && passwordInput) {
                    setWrongPassword(false);
                    void submitPassword(passwordInput, state.wrapped);
                  }
                }}
                autoFocus
                required
              />
            </div>
            {wrongPassword && (
              <p id="wrong-password-alert" role="alert" className="text-sm text-destructive-foreground">
                {t.view.wrongPassword}
              </p>
            )}
            <Button
              type="button"
              onClick={() => {
                if (!passwordInput) return;
                setWrongPassword(false);
                void submitPassword(passwordInput, state.wrapped);
              }}
            >
              {t.view.unlock}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.phase === 'confirm-burn') {
    return (
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive-foreground">
            <TriangleAlert aria-hidden className="size-5" /> {t.view.burnTitle}
          </CardTitle>
          <CardDescription>{t.view.burnWarning}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => void open(state.key)}>
            <Eye aria-hidden className="size-4" /> {t.view.reveal}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle>{t.view.readyTitle}</CardTitle>
        <CardDescription>{t.view.readyDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {renderMode === 'plain' ? t.view.renderPlainHint : t.view.renderMarkdownHint}
          </p>
          <button
            type="button"
            // The visible label already names the mode this button switches
            // to; pairing it with aria-pressed would contradict that name.
            onClick={() => setRenderMode(renderMode === 'plain' ? 'markdown' : 'plain')}
            className="h-8 shrink-0 rounded border border-border/60 px-2.5 font-mono text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            {renderMode === 'plain' ? t.view.renderPlain : t.view.renderMarkdown}
          </button>
        </div>
        {renderMode === 'plain' ? (
          // font-mono: secrets are passwords/keys/code; mono makes
          // character-counting reliable and matches the creator's textarea.
          // animate-crossfade: the mode swap overlaps two states, so a blur
          // bridges them into one perceived morph.
          <div className="animate-crossfade whitespace-pre-wrap break-words rounded-md border border-input bg-background/40 px-4 py-3 font-mono text-sm leading-relaxed">
            {state.content}
          </div>
        ) : (
          <div className="animate-crossfade rounded-md border border-input bg-background/40 px-4 py-3">
            <MarkdownRenderer content={state.content} />
          </div>
        )}
        {state.expiresAt && <ValidUntil expiresAt={state.expiresAt} />}
        <CopyButton value={state.content}>{t.view.copyClipboard}</CopyButton>
        {showAbuseReport && checksumRef.current && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <ReportAbuseDialog prefillUrl keyChecksum={checksumRef.current} />
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The expiry line of the ready card, with its own 30s tick (useNow) — mounted
 * only when an expiry is actually shown, so burn secrets (which die on read
 * and have no countdown) and earlier phases never pay for the timer.
 */
function ValidUntil({ expiresAt }: { expiresAt: string }) {
  const { t, locale } = useI18n();
  const now = useNow();
  return (
    <p className="text-sm text-muted-foreground">
      {format(t.view.validUntil, {
        time: countdownTo(new Date(expiresAt).getTime(), locale, now),
        date: new Date(expiresAt).toLocaleString(locale),
      })}
    </p>
  );
}
