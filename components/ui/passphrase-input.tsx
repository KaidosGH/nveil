'use client';

import { forwardRef, InputHTMLAttributes, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/i18n-provider';

/**
 * Passphrase input: a text field with a show/hide toggle, deliberately NOT
 * type="password". The values unlock one-time secrets — they are not site
 * credentials — and password managers key their "save password?" capture on
 * password-typed fields; a plain text field (masked only by CSS where needed)
 * never triggers it. The eye toggle preserves the over-the-shoulder masking
 * that type=password provided.
 *
 * Masking is done with -webkit-text-security (Chromium/WebKit) and
 * text-security:disc (legacy) — Firefox lacks support and shows the value in
 * plain sight when "hidden"; that is an accepted trade-off versus the capture
 * prompt. Users on Firefox-lineage browsers see the passphrase while typing
 * unless they rely on their own environment.
 */
export const PassphraseInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PassphraseInput({ className, ...props }, ref) {
    const { t } = useI18n();
    const [revealed, setRevealed] = useState(false);
    const toggleId = useId();

    return (
      <div className="relative">
        <input
          ref={ref}
          type="text"
          // Disc/•-masking while "hidden" on engines that support it.
          style={revealed ? undefined : { WebkitTextSecurity: 'disc', textSecurity: 'disc' } as React.CSSProperties}
          className={cn(
            // text-base on mobile prevents iOS zoom-on-focus (inputs < 16px trigger it).
            'flex h-10 sm:h-9 w-full rounded-md border border-input bg-transparent px-3 pr-11 text-base sm:text-sm',
            'placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring',
            'disabled:opacity-50',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          id={toggleId}
          aria-label={revealed ? t.common.hidePassphrase : t.common.showPassphrase}
          aria-pressed={revealed}
          onClick={() => setRevealed((v) => !v)}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-[color,background-color,transform] hover:bg-muted active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-ring"
        >
          {revealed ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
        </button>
      </div>
    );
  },
);
