import { cn } from '@/lib/utils';

interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/** ponytail: minimal switch instead of the Radix primitive; same API shape. */
export function Switch({ id, checked, onCheckedChange, disabled, 'aria-label': ariaLabel }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-[color,background-color,border-color,transform] active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
        // The track boundary must stay >= 3:1 in both states (WCAG 1.4.11);
        // on/off is conveyed by the knob's position as well as the fill.
        'ring-1 ring-input',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          // Near-white knob: clear against both track fills.
          'block size-4 rounded-full bg-foreground shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
