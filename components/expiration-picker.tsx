'use client';

import { EXPIRATION_PRESETS, type ExpirationChoice } from '@/lib/validation';
import { cn } from '@/lib/utils';
import { Input, Label } from '@/components/ui';
import { useI18n } from '@/components/i18n-provider';

const PRESET_IDS: ExpirationChoice[] = ['5m', '1h', '24h', '7d', '30d', 'custom'];

interface ExpirationPickerProps {
  preset: ExpirationChoice;
  onPresetChange: (preset: ExpirationChoice) => void;
  customMinutes: number;
  onCustomMinutesChange: (minutes: number) => void;
}

export function ExpirationPicker({
  preset,
  onPresetChange,
  customMinutes,
  onCustomMinutesChange,
}: ExpirationPickerProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      <Label>{t.create.expiryLabel}</Label>
      <div role="radiogroup" aria-label={t.create.expiryLabel} className="flex flex-wrap gap-1.5">
        {PRESET_IDS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={preset === p}
            onClick={() => onPresetChange(p)}
            className={cn(
              'h-10 sm:h-8 rounded-md border px-3 text-sm transition-[color,background-color,border-color,box-shadow,transform] active:scale-[0.97]',
              preset === p
                ? 'border-white/15 bg-primary text-primary-foreground ring-1 ring-inset ring-white/10'
                : 'border-input hover:bg-muted',
            )}
          >
            {t.create.presets[p]}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={30 * 24 * 60}
            value={customMinutes}
            onChange={(e) => onCustomMinutesChange(Number(e.target.value))}
            className="w-28"
            aria-label={t.create.expiryLabel}
          />
          <span className="text-sm text-muted-foreground">{t.create.customUnit}</span>
        </div>
      )}
    </div>
  );
}
