'use client';

import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';

/**
 * Warns when the app is served over plain HTTP on a non-localhost origin:
 * browsers only expose crypto.subtle in secure contexts, so creating and
 * decrypting secrets would fail with no visible reason. HTTPS or localhost
 * makes this banner disappear.
 */
export function InsecureContextWarning() {
  const { t } = useI18n();
  const [insecure, setInsecure] = useState(false);

  useEffect(() => {
    setInsecure(!window.isSecureContext);
  }, []);

  if (!insecure) return null;

  return (
    <div role="alert" className="border-b border-destructive/40 bg-destructive/15">
      <p className="mx-auto flex max-w-2xl items-start gap-2 px-4 py-3 text-sm">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive-foreground" />
        <span>{t.insecureContext.message}</span>
      </p>
    </div>
  );
}
