'use client';

import { useId } from 'react';
import { EXPIRATION_PRESETS, type ExpirationChoice } from '@/lib/validation';
import { Input, PillRadioGroup } from '@/components/ui';
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
      <PillRadioGroup ids={PRESET_IDS} value={preset} onChange={onPresetChange} labelledBy={labelId}>
        {(p) => t.create.presets[p]}
      </PillRadioGroup>
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
