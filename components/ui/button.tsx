import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive' | 'link';
type Size = 'default' | 'sm' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  default: 'bg-foreground text-background ring-1 ring-inset ring-white/20 hover:bg-foreground/90',
  outline: 'border border-input bg-transparent hover:bg-muted',
  ghost: 'hover:bg-muted',
  destructive: 'bg-destructive text-white ring-1 ring-inset ring-white/10 hover:opacity-90',
  link: 'text-foreground underline-offset-4 hover:underline',
};

const sizes: Record<Size, string> = {
  // Mobile-first touch targets (>= 40px); tighten to the compact sizes on larger screens.
  default: 'h-10 sm:h-9 px-4 text-sm',
  sm: 'h-9 sm:h-8 px-3 text-sm',
  lg: 'h-12 sm:h-11 px-6 text-base',
  icon: 'h-10 sm:h-9 w-10 sm:w-9',
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-[color,background-color,border-color,box-shadow,transform] active:scale-[0.97] ' +
  'focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50';

export function buttonVariants({ variant = 'default', size = 'default' }: { variant?: Variant; size?: Size } = {}) {
  return cn(base, variants[variant], sizes[size]);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/**
 * Minimal shadcn-style button.
 * ponytail: hand-rolled instead of the full shadcn/Radix stack; if more
 * complex primitives (dialogs, selects) are ever needed, adopt shadcn/ui.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'default', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
});
