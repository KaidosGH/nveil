'use client';

import { useState } from 'react';
import { ExternalLink, KeyRound, Lock, QrCode, TriangleAlert } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/copy-button';
import { QrCodeModal } from '@/components/qr-code-modal';
import { Input } from '@/components/ui';
import { useI18n } from '@/components/i18n-provider';

export function SecretUrlDisplay({
  secretUrl,
  manageUrl,
  keyDelivery,
  keyString,
  onReset,
}: {
  secretUrl: string;
  manageUrl: string;
  keyDelivery: 'link' | 'separate' | 'password';
  /** Only set in separate-channel mode — the other modes never expose it. */
  keyString: string | null;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const [showManage, setShowManage] = useState(false);
  const [qrPayload, setQrPayload] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock aria-hidden className="size-4" /> {t.result.title}
          </CardTitle>
          <CardDescription>
            {keyDelivery === 'password'
              ? t.result.descPassword
              : keyDelivery === 'separate'
                ? t.result.descSeparate
                : t.result.desc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              readOnly
              aria-label={t.result.title}
              value={secretUrl}
              className="font-mono text-[13px] sm:text-xs"
              onFocus={(e) => e.target.select()}
            />
            {/* The QR encodes exactly the URL shown here — with the fragment key
                in link mode, keyless in separate/password mode. */}
            <Button variant="outline" onClick={() => setQrPayload(secretUrl)}>
              <QrCode aria-hidden className="size-4" /> {t.result.qrButton}
            </Button>
            <CopyButton value={secretUrl}>{t.common.copy}</CopyButton>
          </div>
          {keyDelivery === 'password' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound aria-hidden className="size-4" /> {t.result.passwordNote}
            </p>
          )}
          {keyString !== null && (
            <div className="flex flex-wrap gap-2">
              <Input
                readOnly
                aria-label={t.create.separateKeyLabel}
                value={keyString}
                className="font-mono text-[13px] sm:text-xs"
                onFocus={(e) => e.target.select()}
              />
              <CopyButton value={keyString}>{t.common.copy}</CopyButton>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={() => setShowManage((v) => !v)}>
          <KeyRound aria-hidden className="size-4" />
          {showManage ? t.result.manageHide : t.result.manageToggle}
        </Button>
        <Button onClick={onReset}>{t.result.createAnother}</Button>
      </div>

      {showManage && (
        <Card className="animate-fade-up border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive-foreground">
              <TriangleAlert aria-hidden className="size-4" /> {t.result.manageTitle}
            </CardTitle>
            <CardDescription>{t.result.manageWarning}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* flex-wrap: on narrow screens the copy button drops to a second
                row instead of squeezing the buttons. */}
            <div className="flex flex-wrap gap-2">
              <Input
                readOnly
                aria-label={t.result.manageTitle}
                value={manageUrl}
                className="font-mono text-[13px] sm:text-xs"
                onFocus={(e) => e.target.select()}
              />
              {/* New tab only: the result screen is the last place this link
                  exists, so navigating away could destroy an unsaved link. */}
              <a
                href={manageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonVariants({ variant: 'outline' })} shrink-0 whitespace-nowrap`}
              >
                <ExternalLink aria-hidden className="size-4" /> {t.result.manageNow}
              </a>
              <Button variant="outline" onClick={() => setQrPayload(manageUrl)}>
                <QrCode aria-hidden className="size-4" /> {t.result.qrButton}
              </Button>
              <CopyButton value={manageUrl}>{t.common.copy}</CopyButton>
            </div>
          </CardContent>
        </Card>
      )}

      <QrCodeModal
        open={qrPayload !== null}
        onClose={() => setQrPayload(null)}
        payload={qrPayload ?? ''}
        title={qrPayload === manageUrl ? t.result.qrManageTitle : t.result.qrSecretTitle}
      />
    </div>
  );
}
