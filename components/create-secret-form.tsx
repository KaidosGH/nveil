'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, PassphraseInput, Switch, Textarea } from '@/components/ui';
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
import { cn } from '@/lib/utils';

type FormValues = {
  content: string;
  burnAfterRead: boolean;
};

/** How the recipient obtains the decryption key. */
type KeyDelivery = 'link' | 'separate' | 'password';

type Result = {
  secretUrl: string;
  manageUrl: string;
  keyDelivery: KeyDelivery;
  keyString: string | null;
};

const KEY_DELIVERY: KeyDelivery[] = ['link', 'separate', 'password'];

export function CreateSecretForm() {
  const { t } = useI18n();
  const [preset, setPreset] = useState<ExpirationChoice>('24h');
  const [customMinutes, setCustomMinutes] = useState(60);
  const [keyDelivery, setKeyDelivery] = useState<KeyDelivery>('link');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

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
        burnAfterRead: z.boolean(),
      }),
    [t],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { content: '', burnAfterRead: true },
  });

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

      const response = await fetch('/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ciphertext,
          iv,
          keyChecksum: await keyChecksum(keyString),
          creatorTokenHash: await tokenHash(token),
          burnAfterRead: values.burnAfterRead,
          expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
          ...passwordEnvelope,
        }),
      });
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
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !submitting) {
                  submit();
                }
              }}
              {...form.register('content')}
            />
            <div className="flex items-start justify-between gap-4 text-xs text-muted-foreground">
              <p>{form.formState.errors.content?.message}</p>
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

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="burn">{t.create.burnLabel}</Label>
              <p className="text-xs text-muted-foreground">{t.create.burnDesc}</p>
            </div>
            <Switch
              id="burn"
              checked={form.watch('burnAfterRead')}
              onCheckedChange={(checked) => form.setValue('burnAfterRead', checked)}
            />
          </div>

          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              {t.create.advanced}
            </summary>
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label>{t.create.keyDeliveryLabel}</Label>
                <div role="radiogroup" aria-label={t.create.keyDeliveryLabel} className="flex flex-wrap gap-1.5">
                  {KEY_DELIVERY.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={keyDelivery === mode}
                      onClick={() => setKeyDelivery(mode)}
                      className={cn(
                        'h-10 sm:h-8 rounded-md border px-3 text-sm transition-[color,background-color,border-color,box-shadow,transform] active:scale-[0.97]',
                        keyDelivery === mode
                          ? 'border-white/15 bg-primary text-primary-foreground ring-1 ring-inset ring-white/10'
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

          <Button
            type="button"
            size="lg"
            className="w-full"
            loading={submitting}
            disabled={submitting}
            onClick={() => submit()}
          >
            {submitting ? t.create.encrypting : t.create.create}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
