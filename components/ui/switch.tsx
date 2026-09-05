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
        'inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-[color,background-color,border-color,box-shadow,transform] active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted ring-1 ring-input',
      )}
    >
      <span
        className={cn(
          'block size-4 rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
