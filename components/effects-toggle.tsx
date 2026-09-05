'use client';

import { Gauge } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/i18n-provider';

const EFFECTS_KEY = 'nveil-effects';

/** Toggles the animated background (persisted; live-updates AppBackground). */
export function EffectsToggle() {
  const { t } = useI18n();
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(localStorage.getItem(EFFECTS_KEY) !== 'off');
  }, []);

  function toggle() {
    const next = !on;
    localStorage.setItem(EFFECTS_KEY, next ? 'on' : 'off');
    window.dispatchEvent(new Event('nveil-effects-changed'));
    setOn(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={on ? t.perf.effectsOffHint : t.perf.effectsOnHint}
      aria-pressed={!on}
      className="flex h-8 items-center gap-1.5 rounded border border-border/60 px-2.5 hover:bg-muted"
    >
      <Gauge aria-hidden className="size-3.5" />
      {on ? t.perf.effectsOn : t.perf.effectsOff}
    </button>
  );
}
