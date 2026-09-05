'use client';

import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useI18n } from '@/components/i18n-provider';

export function CopyButton({
  value,
  children,
  ...props
}: { value: string; children?: ButtonProps['children'] } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // navigator.clipboard needs a secure context; fall back for old
      // browsers and plain-HTTP deployments.
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        if (!document.execCommand('copy')) throw new Error('copy rejected');
      } catch {
        setState('failed');
        setTimeout(() => setState('idle'), 2000);
        return;
      } finally {
        textarea.remove();
      }
    }
    setState('copied');
    setTimeout(() => setState('idle'), 1500);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="whitespace-nowrap"
      aria-live="polite"
      onClick={copy}
      {...props}
    >
      {/* key remounts the content on state change so the swap pops. */}
      <span key={state} className="flex items-center gap-2 animate-pop">
        {state === 'copied' ? (
          <Check aria-hidden className="size-4" />
        ) : state === 'failed' ? (
          <X aria-hidden className="size-4" />
        ) : (
          <Copy aria-hidden className="size-4" />
        )}
        {state === 'copied'
          ? t.common.copied
          : state === 'failed'
            ? t.common.copyFailed
            : (children ?? t.common.copy)}
      </span>
    </Button>
  );
}
