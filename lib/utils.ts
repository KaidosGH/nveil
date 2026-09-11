import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { KeyboardEvent } from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Arrow-key handling for an ARIA radiogroup (down/right = next, up/left =
 * previous, wrapping). Moves the selection and focuses the newly selected
 * radio, matching the roving tabindex the radios use. Shared by the
 * expiration and key-delivery groups so they behave alike.
 */
export function radioGroupKeyDown<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  ids: readonly T[],
  current: T,
  select: (id: T) => void,
): void {
  const step =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0;
  if (step === 0) return;
  event.preventDefault();
  const nextIndex = (ids.indexOf(current) + step + ids.length) % ids.length;
  select(ids[nextIndex]);
  event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[nextIndex]?.focus();
}
