'use client';

import { useId } from 'react';
import { EXPIRATION_PRESETS, type ExpirationChoice } from '@/lib/validation';
import { cn, radioGroupKeyDown } from '@/lib/utils';
import { Input } from '@/components/ui';
import { useI18n } from '@/components/i18n-provider';

// Derived from the preset table so an added/removed preset can't drift.
const PRESET_IDS: ExpirationChoice[] = [...Object.keys(EXPIRATION_PRESETS), 'custom'] as ExpirationChoice[];

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
  const labelId = useId();

  return (
    <div className="space-y-2">
      <span id={labelId} className="text-sm font-medium leading-none">{t.create.expiryLabel}</span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={(e) => radioGroupKeyDown(e, PRESET_IDS, preset, onPresetChange)}
        className="flex flex-wrap gap-1.5"
      >
        {PRESET_IDS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={preset === p}
            tabIndex={preset === p ? 0 : -1}
            onClick={() => onPresetChange(p)}
            className={cn(
              'h-10 sm:h-8 rounded-md border px-3 text-sm transition-[color,background-color,border-color,transform] active:scale-[0.97]',
              preset === p
                ? 'border-ring bg-primary font-medium text-primary-foreground'
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
            aria-label={t.create.customUnit}
          />
          <span className="text-sm text-muted-foreground">{t.create.customUnit}</span>
        </div>
      )}
    </div>
  );
}
