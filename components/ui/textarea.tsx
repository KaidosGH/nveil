import { forwardRef, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          // text-base on mobile prevents iOS zoom-on-focus (inputs < 16px trigger it).
          'flex min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base sm:text-sm',
          'placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring',
          'disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
