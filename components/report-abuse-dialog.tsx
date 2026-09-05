'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/components/i18n-provider';

/**
 * "Report abuse" dialog, rendered by the footer, and (with prefillUrl) below a
 * decrypted secret. Uniform success response — the reporter never learns
 * whether the reported ID exists.
 *
 * When rendered below a decrypted secret, keyChecksum (the value the server
 * already stores) is sent as x-key-checksum so the operator queue can mark the
 * report witness-verified: proof the reporter held the decryption key.
 */
export function ReportAbuseDialog({ prefillUrl, keyChecksum }: { prefillUrl?: boolean; keyChecksum?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Post-decryption the key fragment is already scrubbed from the address bar,
  // so the pre-filled link never carries the decryption key to the server.
  function openDialog() {
    setUrl(prefillUrl ? window.location.href : '');
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setUrl('');
    setReason('');
    setStatus('idle');
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    try {
      const response = await fetch('/api/abuse-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Present only when filed from below a decrypted secret.
          ...(keyChecksum ? { 'x-key-checksum': keyChecksum } : {}),
        },
        body: JSON.stringify({ url, reason: reason || undefined }),
      });
      if (response.status === 202) {
        setStatus('done');
        return;
      }
      const data = await response.json().catch(() => null);
      setError(
        response.status === 429
          ? t.abuseDialog.errRate
          : (data?.error === 'invalid_url' ? t.api.invalid_url : (data?.message ?? t.abuseDialog.errFallback)),
      );
      setStatus('idle');
    } catch {
      setError(t.abuseDialog.errUnreachable);
      setStatus('idle');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded px-1 py-1.5 underline-offset-4 hover:underline"
      >
        {t.abuseDialog.footerLink}
      </button>

      <Modal
        open={open}
        onClose={close}
        title={t.abuseDialog.title}
        description={t.abuseDialog.description}
        width="max-w-lg"
      >
        {status === 'done' ? (
          <p className="text-sm">{t.abuseDialog.received}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="abuse-url">{t.abuseDialog.urlLabel}</Label>
              <Input
                id="abuse-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t.abuseDialog.urlPlaceholder}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="abuse-reason">{t.abuseDialog.reasonLabel}</Label>
              <Textarea
                id="abuse-reason"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t.abuseDialog.reasonPlaceholder}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}
            <Button type="submit" loading={status === 'sending'} className="w-full">
              {t.abuseDialog.send}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
