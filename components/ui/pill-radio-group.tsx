'use client';

import { KeyboardEvent, ReactNode } from 'react';
import { cn, radioGroupKeyDown } from '@/lib/utils';

interface PillRadioGroupProps<T extends string> {
  /** Option ids in DOM order (arrow keys follow it). */
  ids: readonly T[];
  value: T;
  onChange: (id: T) => void;
  /** Id of the visible group caption, for the radiogroup's accessible name. */
  labelledBy: string;
  children: (id: T) => ReactNode;
}

/**
 * Single-choice pill group: radiogroup semantics with roving tabindex and
 * arrow-key navigation (lib/utils radioGroupKeyDown), styled like the app's
 * other pill buttons. The visible caption and description stay at the call
 * site — they differ per group.
 */
export function PillRadioGroup<T extends string>({
  ids,
  value,
  onChange,
  labelledBy,
  children,
}: PillRadioGroupProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => radioGroupKeyDown(e, ids, value, onChange)}
      className="flex flex-wrap gap-1.5"
    >
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          tabIndex={value === id ? 0 : -1}
          onClick={() => onChange(id)}
          className={cn(
            'h-10 sm:h-8 rounded-md border px-3 text-sm transition-[color,background-color,border-color,transform] active:scale-[0.97]',
            value === id
              ? 'border-ring bg-primary font-medium text-primary-foreground'
              : 'border-input hover:bg-muted',
          )}
        >
          {children(id)}
        </button>
      ))}
    </div>
  );
}
