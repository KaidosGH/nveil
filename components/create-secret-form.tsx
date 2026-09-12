'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, PassphraseInput, Textarea } from '@/components/ui';
import { ExpirationPicker } from '@/components/expiration-picker';
import { SecretUrlDisplay } from '@/components/secret-url-display';
import { useI18n } from '@/components/i18n-provider';
import {
  encrypt,
  generateCreatorToken,
  generateKey,
  keyChecksum,
  tokenHash,
  wrapKeyWithPassword,
} from '@/lib/crypto';
import { EXPIRATION_PRESETS, MAX_CONTENT_BYTES, type ExpirationChoice } from '@/lib/validation';
import { cn, radioGroupKeyDown } from '@/lib/utils';

type FormValues = {
  content: string;
};

/** How the recipient obtains the decryption key. */
type KeyDelivery = 'link' | 'separate' | 'password';

/** When the secret dies: on first read, after N views, or only on expiry. */
type Destruction = 'burn' | 'v3' | 'v5' | 'never';
const DESTRUCTION_MODES: Destruction[] = ['burn', 'v3', 'v5', 'never'];

type Result = {
  secretUrl: string;
  manageUrl: string;
  keyDelivery: KeyDelivery;
  keyString: string | null;
};

const KEY_DELIVERY: KeyDelivery[] = ['link', 'separate', 'password'];

export function CreateSecretForm() {
  const { t } = useI18n();
  const keyDeliveryLabelId = useId();
  const destructionLabelId = useId();
  const [preset, setPreset] = useState<ExpirationChoice>('24h');
  const [customMinutes, setCustomMinutes] = useState(60);
  const [keyDelivery, setKeyDelivery] = useState<KeyDelivery>('link');
  // 'burn' keeps the atomic burn-after-read path; v3/v5 map to maxViews;
  // 'never' relies on the expiry alone.
  const [destruction, setDestruction] = useState<Destruction>('burn');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // Access-key gate (managed instances): when the server demands an access
  // key, the form collects it once, swaps it for an httpOnly cookie via the
  // verify endpoint, and retries — the key itself is never kept in state.
  const [needsKey, setNeedsKey] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [accessKeyError, setAccessKeyError] = useState(false);
  // Which key is active in this browser (display prefix + label only — the
  // httpOnly cookie is unreadable by design). Surfaced in the Advanced
  // section together with replace/forget actions.
  const [activeKeyInfo, setActiveKeyInfo] = useState<{ prefix: string; label: string } | null>(null);
  const [showReplace, setShowReplace] = useState(false);

  // Validation messages are locale-dependent, so the schema is built per render.
  const formSchema = useMemo(
    () =>
      z.object({
        content: z
          .string()
          .min(1, t.create.errorRequired)
          .refine((s) => new TextEncoder().encode(s).byteLength <= MAX_CONTENT_BYTES, {
            message: t.create.errorTooLarge,
          }),
      }),
    [t],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { content: '' },
  });

  // Which access key is active in this browser, if any: surfaced in Advanced
  // (404 = gate off or no key on this browser → nothing to show).
  const refreshActiveKey = useCallback(async () => {
    try {
      const response = await fetch('/api/access-keys/session');
      setActiveKeyInfo(response.ok ? ((await response.json()) as { prefix: string; label: string }) : null);
    } catch {
      setActiveKeyInfo(null);
    }
  }, []);

  useEffect(() => {
    void refreshActiveKey();
  }, [refreshActiveKey]);

  /**
   * The card is formless (no <form> — see the comment at the layout), so
   * there is no implicit error display: zod failures surface through this
   * onInvalid handler, password-mode checks through the same serverError
   * slot. Both must set the message explicitly or the user gets no hint.
   */
  const submit = form.handleSubmit(
    async (values) => {
      setServerError(null);
      if (keyDelivery === 'password') {
        if (password.length < 8) {
          setServerError(t.create.errorPasswordTooShort);
          return;
        }
        if (password !== passwordConfirm) {
          setServerError(t.create.errorPasswordMismatch);
          return;
        }
      }
      await onSubmit(values);
    },
    // Validation failed (empty/oversized content): show the first message
    // in the same alert slot instead of silently doing nothing.
    (errors) => setServerError(errors.content?.message ?? t.create.errorGeneric),
  );

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const { key, keyString } = await generateKey();
      const token = generateCreatorToken();
      const { ciphertext, iv } = await encrypt(key, values.content);

      const minutes = preset === 'custom' ? customMinutes : EXPIRATION_PRESETS[preset] / 60000;
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 30 * 24 * 60) {
        throw new Error(t.create.errorInvalidExpiry);
      }

      // Password mode wraps the content key with a password-derived key; the
      // link stays keyless. The other modes send the raw checksum fields.
      const passwordEnvelope = keyDelivery === 'password' ? await wrapKeyWithPassword(keyString, password) : {};

      // 'burn' uses the server's atomic burn path; view limits map to
      // maxViews (1 view ≡ burn, so the UI never sends that combination).
      const burnAfterRead = destruction === 'burn';
      const maxViews = destruction === 'v3' ? 3 : destruction === 'v5' ? 5 : null;

      const response = await fetch('/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ciphertext,
          iv,
          keyChecksum: await keyChecksum(keyString),
          creatorTokenHash: await tokenHash(token),
          burnAfterRead,
          maxViews,
          expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
          ...passwordEnvelope,
        }),
      });
      if (response.status === 403) {
        // Access-key gate: collect the access key once, swap it for an
        // httpOnly cookie via the verify endpoint, then retry the creation.
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        if (data?.error === 'access_key_required') {
          setNeedsKey(true);
          setSubmitting(false);
          return;
        }
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? t.create.errorRejected);
      }

      const { id } = (await response.json()) as { id: string };
      const origin = window.location.origin;
      // Password mode keeps the link keyless like separate mode: the key is
      // recovered from the password envelope, not from the URL.
      const keyless = keyDelivery !== 'link';
      setResult({
        secretUrl: keyless ? `${origin}/secret/${id}` : `${origin}/secret/${id}#${keyString}`,
        manageUrl: `${origin}/manage/${id}#${token}`,
        keyDelivery,
        // Separate mode displays the key; link mode needs it for nothing after
        // this (it lives in the link); password mode never exposes it.
        keyString: keyDelivery === 'separate' ? keyString : null,
      });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t.create.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  /** Validates the pasted key and moves it into the httpOnly cookie. */
  async function verifyAccessKey(): Promise<boolean> {
    const response = await fetch('/api/access-keys/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: accessKey.trim() }),
    });
    if (!response.ok) {
      setAccessKeyError(true);
      return false;
    }
    // Refresh the Advanced display of the active key.
    setAccessKey('');
    void refreshActiveKey();
    return true;
  }

  // 403-retry path: verify, then re-run the creation.
  async function unlockAccessKey() {
    if (await verifyAccessKey()) {
      setNeedsKey(false);
      await submit();
    }
  }

  // Advanced replace path: verify only — no creation.
  async function replaceAccessKey() {
    if (await verifyAccessKey()) setShowReplace(false);
  }

  async function forgetAccessKey() {
    await fetch('/api/access-keys/session', { method: 'DELETE' }).catch(() => {});
    setActiveKeyInfo(null);
    setShowReplace(false);
  }

  if (result) {
    return (
      <div className="animate-fade-up">
        <SecretUrlDisplay
          secretUrl={result.secretUrl}
          manageUrl={result.manageUrl}
          keyDelivery={result.keyDelivery}
          keyString={result.keyString}
          onReset={() => {
            setResult(null);
            setPassword('');
            setPasswordConfirm('');
            form.reset();
          }}
        />
      </div>
    );
  }

  const content = form.watch('content');
  const contentBytes = new TextEncoder().encode(content ?? '').byteLength;
  const contentError = form.formState.errors.content?.message;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.create.title}</CardTitle>
        <CardDescription>{t.create.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* No <form>: Firefox-lineage password capture hooks into form
            submission, and the password-mode fields live in this same card —
            so a formless, button-driven layout keeps "Create Secret" from
            triggering the save-password prompt. Ctrl/Cmd+Enter submits. */}
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="content">{t.create.contentLabel}</Label>
            <Textarea
              id="content"
              rows={8}
              className="bg-background/40 font-mono"
              placeholder={t.create.contentPlaceholder}
              aria-invalid={contentError ? true : undefined}
              aria-describedby={contentError ? 'content-error' : undefined}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !submitting) {
                  submit();
                }
              }}
              {...form.register('content')}
            />
            <div className="flex items-start justify-between gap-4 text-xs text-muted-foreground">
              <p id="content-error">{contentError}</p>
              <span className="whitespace-nowrap tabular-nums">
                {(contentBytes / 1024).toFixed(1)} / 100 KB
              </span>
            </div>
          </div>

          <ExpirationPicker
            preset={preset}
            onPresetChange={setPreset}
            customMinutes={customMinutes}
            onCustomMinutesChange={setCustomMinutes}
          />

          <div className="space-y-2">
            <span id={destructionLabelId} className="text-sm font-medium leading-none">
              {t.create.destructionLabel}
            </span>
            <p className="text-xs text-muted-foreground">{t.create.destructionDesc}</p>
            <div
              role="radiogroup"
              aria-labelledby={destructionLabelId}
              onKeyDown={(e) => radioGroupKeyDown(e, DESTRUCTION_MODES, destruction, setDestruction)}
              className="flex flex-wrap gap-1.5"
            >
              {DESTRUCTION_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={destruction === mode}
                  tabIndex={destruction === mode ? 0 : -1}
                  onClick={() => setDestruction(mode)}
                  className={cn(
                    'h-10 sm:h-8 rounded-md border px-3 text-sm transition-[color,background-color,border-color,transform] active:scale-[0.97]',
                    destruction === mode
                      ? 'border-ring bg-primary font-medium text-primary-foreground'
                      : 'border-input hover:bg-muted',
                  )}
                >
                  {mode === 'burn'
                    ? t.create.destructionBurn
                    : mode === 'v3'
                      ? t.create.destructionViews3
                      : mode === 'v5'
                        ? t.create.destructionViews5
                        : t.create.destructionNever}
                </button>
              ))}
            </div>
          </div>

          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              {t.create.advanced}
            </summary>
            {/* Enter-only disclosure animation (reduced-motion: opacity only);
                a native <details> hides its content with display:none, so the
                transition is supplied by @starting-style in globals.css. */}
            <div className="disclosure mt-4 space-y-3">
              {activeKeyInfo && (
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <p className="text-sm font-medium leading-none">{t.create.accessKeyActive}</p>
                  <p className="text-xs text-muted-foreground">{t.create.accessKeyActiveDesc}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                      {activeKeyInfo.prefix}…
                    </code>
                    <span className="text-xs text-muted-foreground">{activeKeyInfo.label}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowReplace((v) => !v)}
                    >
                      {t.create.accessKeyReplace}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void forgetAccessKey()}>
                      {t.create.accessKeyForget}
                    </Button>
                  </div>
                  {showReplace && (
                    <div className="space-y-2">
                      <Label htmlFor="replace-access-key">{t.create.accessKeyLabel}</Label>
                      <PassphraseInput
                        id="replace-access-key"
                        name="replace_access_key"
                        value={accessKey}
                        onChange={(e) => setAccessKey(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && accessKey.trim()) void replaceAccessKey();
                        }}
                      />
                      {accessKeyError && (
                        <p role="alert" className="text-sm text-destructive-foreground">
                          {t.create.accessKeyInvalid}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <span id={keyDeliveryLabelId} className="text-sm font-medium leading-none">{t.create.keyDeliveryLabel}</span>
                <div
                  role="radiogroup"
                  aria-labelledby={keyDeliveryLabelId}
                  onKeyDown={(e) => radioGroupKeyDown(e, KEY_DELIVERY, keyDelivery, setKeyDelivery)}
                  className="flex flex-wrap gap-1.5"
                >
                  {KEY_DELIVERY.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={keyDelivery === mode}
                      tabIndex={keyDelivery === mode ? 0 : -1}
                      onClick={() => setKeyDelivery(mode)}
                      className={cn(
                        'h-10 sm:h-8 rounded-md border px-3 text-sm transition-[color,background-color,border-color,transform] active:scale-[0.97]',
                        keyDelivery === mode
                          ? 'border-ring bg-primary font-medium text-primary-foreground'
                          : 'border-input hover:bg-muted',
                      )}
                    >
                      {mode === 'link'
                        ? t.create.keyDeliveryLink
                        : mode === 'separate'
                          ? t.create.keyDeliverySeparate
                          : t.create.keyDeliveryPassword}
                    </button>
                  ))}
                </div>
                {keyDelivery === 'separate' && (
                  <p className="text-xs text-muted-foreground">{t.create.separateKeyDesc}</p>
                )}
              </div>

              {keyDelivery === 'password' && (
                <div className="space-y-3 rounded-md border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">{t.create.passwordDesc}</p>
                  <div className="space-y-2">
                    <Label htmlFor="secret-passphrase">{t.create.passwordLabel}</Label>
                    {/* PassphraseInput (text + eye toggle): the value is a
                        one-time secret passphrase, not a site credential;
                        password managers key their "save password?" capture on
                        type=password fields, which this is not. */}
                    <PassphraseInput
                      id="secret-passphrase"
                      name="secret_passphrase"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && password && password === passwordConfirm && !submitting) {
                          submit();
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secret-passphrase-confirm">{t.create.passwordConfirmLabel}</Label>
                    <PassphraseInput
                      id="secret-passphrase-confirm"
                      name="secret_passphrase_confirm"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && password && password === passwordConfirm && !submitting) {
                          submit();
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </details>

          {serverError && (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive-foreground">
              <TriangleAlert aria-hidden className="size-4" /> {serverError}
            </p>
          )}

          {needsKey && (
            <div className="space-y-3 rounded-md border border-border/60 p-3">
              <div className="space-y-2">
                <Label htmlFor="instance-access-key">{t.create.accessKeyLabel}</Label>
                <PassphraseInput
                  id="instance-access-key"
                  name="instance_access_key"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && accessKey.trim()) void unlockAccessKey();
                  }}
                  autoFocus
                />
                {accessKeyError && (
                  <p role="alert" className="text-sm text-destructive-foreground">
                    {t.create.accessKeyInvalid}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{t.create.accessKeyDesc}</p>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={() => void unlockAccessKey()}>
                {t.create.accessKeyUnlock}
              </Button>
            </div>
          )}

          <Button
            type="button"
            size="lg"
            className="w-full"
            loading={submitting}
            // While the access-key prompt is open, creation is gated: Unlock
            // verifies the key and auto-retries, so this button stays out of
            // the way until then.
            disabled={submitting || needsKey}
            onClick={() => submit()}
          >
            {submitting ? t.create.encrypting : t.create.create}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
