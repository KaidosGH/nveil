import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          // text-base on mobile prevents iOS zoom-on-focus (inputs < 16px trigger it).
          'flex h-10 sm:h-9 w-full rounded-md border border-input bg-transparent px-3 text-base sm:text-sm',
          'placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring',
          'disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
