'use client';

import { useEffect, useState } from 'react';

/**
 * A clock that ticks at the given interval — the shared time source for the
 * deletion countdowns. Mount it only where a countdown is actually rendered:
 * every tick re-renders the calling component.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
