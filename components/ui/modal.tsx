'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/components/i18n-provider';

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
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Keep the node mounted through the exit animation: the parent flips `open`
  // to false and this delays the unmount by the exit duration. Reopening
  // within that window cancels the timer, so the dialog never flickers out.
  const [mounted, setMounted] = useState(open);
  // Keep the latest close handler without re-arming the focus trap: an inline
  // (non-memoized) onClose gets a new identity on every parent render, which
  // would tear down and re-run the trap effect on each keystroke — stealing
  // focus back to the first focusable element mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), 140);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    // The dialog portals to <body>, so its overlay is a direct body child:
    // mark every sibling inert to take the rest of the page out of the tab
    // order and the accessibility tree. aria-modal alone is not honored by
    // every AT, and a focus trap does not stop virtual-cursor navigation.
    const overlay = dialog?.parentElement;
    const siblings = Array.from(document.body.children).filter((el) => el !== overlay);
    for (const el of siblings) el.setAttribute('inert', '');

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
      for (const el of siblings) el.removeAttribute('inert');
      previouslyFocused?.focus();
    };
    // Deliberately [open] only — the onCloseRef above keeps the handler fresh
    // without re-arming the trap on parent re-renders (e.g. per keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 ${open ? 'animate-fade' : 'animate-fade-out'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${width} ${open ? 'animate-pop' : 'animate-pop-out'}`}
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
                aria-label={t.common.close}
                className="rounded p-1 hover:bg-muted"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
