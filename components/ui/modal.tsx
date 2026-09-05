'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional persistent description under the title (stays visible across content states). */
  description?: string;
  children: React.ReactNode;
  /** Panel width class, defaults to max-w-md. */
  width?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Minimal accessible modal: overlay, Escape-to-close, click-outside-to-close,
 * and a focus trap — focus enters the dialog on open, Tab cycles inside it,
 * and the previously focused element is restored on close.
 */
export function Modal({ open, onClose, title, description, children, width = 'max-w-md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Keep the latest close handler without re-arming the focus trap: an inline
  // (non-memoized) onClose gets a new identity on every parent render, which
  // would tear down and re-run the trap effect on each keystroke — stealing
  // focus back to the first focusable element mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      // Keep Tab cycling inside the dialog while it is open.
      if (e.key === 'Tab' && dialog) {
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !dialog.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
    // Deliberately [open] only — the onCloseRef above keeps the handler fresh
    // without re-arming the trap on parent re-renders (e.g. per keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${width} animate-pop`}
      >
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle id="modal-title">{title}</CardTitle>
                {description && <CardDescription className="mt-1">{description}</CardDescription>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded p-1 hover:bg-muted"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
