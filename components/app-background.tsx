'use client';

// Background effect: ThreeUI "Ribbon Field" (Predictive Arc family), ported
// verbatim from github.com/MengTo/threeui (src/shaders/ribbon-field/) — see
// components/effects/ribbon-field/ (color grading moved into the shader for
// Firefox performance). Disabled entirely by prefers-reduced-motion or the
// operator/user "effects off" toggle; the fallback is a static CSS gradient.
import { useCallback, useEffect, useState } from 'react';
import { RibbonFieldBackground } from '@/components/effects/ribbon-field/RibbonFieldBackground';
import '@/components/effects/ribbon-field/ribbon-field.css';

const EFFECTS_KEY = 'nveil-effects';

export function AppBackground() {
  const [enabled, setEnabled] = useState(false);

  const apply = useCallback(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEnabled(!reduced && localStorage.getItem(EFFECTS_KEY) !== 'off');
  }, []);

  useEffect(() => {
    apply();
    window.addEventListener('nveil-effects-changed', apply);
    return () => window.removeEventListener('nveil-effects-changed', apply);
  }, [apply]);

  if (!enabled) {
    // Static fallback: dark gray with a faint centered glow, no animation.
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,#17171b_0%,#0b0b0d_75%)]"
      />
    );
  }

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <RibbonFieldBackground
        className="h-full w-full"
        speed={0.8}
        // Near-monochrome: the app's identity is grey + white; the field stays
        // an ambient texture, not a colored gradient backdrop.
        saturation={0.18}
        brightness={0.85}
        opacity={0.9}
        // Low backing resolution + browser upscaling = a naturally soft/blurry
        // dot field, without any CSS filter (which Gecko repainting penalizes).
        maxPixelRatio={0.6}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_45%,rgba(11,11,13,0.72)_0%,rgba(11,11,13,0.35)_55%,transparent_80%)]" />
    </div>
  );
}

export { EFFECTS_KEY };

