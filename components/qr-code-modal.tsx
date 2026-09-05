'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/components/i18n-provider';

/**
 * Client-side QR modal for the creation result screen. The payload is the URL
 * already visible on that screen — nothing is sent anywhere. Standard black
 * modules on white with the spec-mandated quiet zone (4 modules), error
 * correction H so glare, prints and slight damage still scan.
 */
/** The module matrix returned by QRCode.create — typed via the factory since
 *  the default import binds to a namespace, which is not usable as a type. */
type QrMatrix = ReturnType<typeof QRCode.create>;

/**
 * Draws the QR onto a canvas: white with rounded corners (like the preview's
 * rounded card) and the spec-mandated 4-module quiet zone, black modules on
 * top. Contract: 12 px per module — total size scales with the payload as
 * (modules + 2*QUIET) * 12 (e.g. 732px for the 49-module QR of a typical
 * secret link), never a fixed dimension.
 */
async function drawRoundedQr(canvas: HTMLCanvasElement, qr: QrMatrix, done: () => void) {
  const QUIET = 4;
  const MODULES = qr.modules.size;
  const SCALE = 12;
  const SIZE = (MODULES + QUIET * 2) * SCALE;
  const RADIUS = 32; // matches rounded-xl of the preview card at this size

  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return done();

  // Roundrect needs a decode step for older browsers; simple arc-based
  // rounded rect keeps it dependency-free.
  const r = RADIUS;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(SIZE - r, 0);
  ctx.arcTo(SIZE, 0, SIZE, r, r);
  ctx.lineTo(SIZE, SIZE - r);
  ctx.arcTo(SIZE, SIZE, SIZE - r, SIZE, r);
  ctx.lineTo(r, SIZE);
  ctx.arcTo(0, SIZE, 0, SIZE - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = '#000000';
  for (let row = 0; row < MODULES; row++) {
    for (let col = 0; col < MODULES; col++) {
      if (qr.modules.get(row, col)) {
        ctx.fillRect(
          (col + QUIET) * SCALE,
          (row + QUIET) * SCALE,
          SCALE,
          SCALE,
        );
      }
    }
  }
  done();
}

export function QrCodeModal({
  open,
  onClose,
  payload,
  title,
}: {
  open: boolean;
  onClose: () => void;
  /** The URL to encode — never the raw key string (camera apps offer "search" on plain text). */
  payload: string;
  title: string;
}) {
  const { t } = useI18n();
  const [svg, setSvg] = useState('');
  const [pngHref, setPngHref] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Drop prior output before regenerating: the modal is reused across
    // payloads (secret vs manage link), so stale state would otherwise keep
    // showing — and stay downloadable — if the new generation fails.
    setSvg('');
    setPngHref('');
    // Payloads beyond QR capacity (version 40, ~1273 bytes at EC level H)
    // make QRCode.create throw. Secret URLs stay far below that (100 KB is
    // the content cap, the URL carries only id + key); if the cap is ever
    // raised past it, generation fails with a console error and the download
    // buttons stay disabled — the URL itself remains copyable.
    Promise.all([
      QRCode.toString(payload, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 4,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch((e) => {
        console.error('QR generation failed (payload too large?)', e);
        return '';
      }),
      // Rounded corners aren't a qrcode renderer option, so the PNG is drawn
      // manually from the module matrix (below) to match the preview card.
      // QRCode.create is synchronous; wrap so its throw lands in the catch.
      new Promise<NonNullable<ReturnType<typeof QRCode.create>>>((resolve, reject) => {
        try {
          resolve(QRCode.create(payload, { errorCorrectionLevel: 'H' }));
        } catch (e) {
          reject(e);
        }
      }).catch((e: unknown) => {
        console.error('QR generation failed (payload too large?)', e);
        return null;
      }),
    ]).then(async ([svgOut, qr]) => {
      if (cancelled || qr === null) return;
      const canvas = document.createElement('canvas');
      await new Promise<void>((resolve) => {
        drawRoundedQr(canvas, qr, () => resolve());
      });
      if (!cancelled) {
        setSvg(svgOut);
        setPngHref(canvas.toDataURL('image/png'));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, payload]);

  function downloadSvg() {
    const a = document.createElement('a');
    a.href = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    a.download = 'nveil-qr.svg';
    a.click();
  }

  function downloadPng() {
    const a = document.createElement('a');
    a.href = pngHref;
    a.download = 'nveil-qr.png';
    a.click();
  }

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-sm">
      <div className="space-y-4">
        <div className="flex items-center justify-center">
          {/* White rounded card so the QR stays scanner-correct on the dark theme;
              the 4-module quiet zone is part of the generated image itself, so
              the card adds only a little extra (p-1.5) to keep total border
              visibly tight. The SVG comes from the local library, encoding the
              on-screen URL. */}
          {/* aspect-square reserves the QR's box before the SVG arrives, so the
              modal doesn't grow from a 1px strip when generation finishes. */}
          <div className="aspect-square w-64 rounded-xl bg-white p-1.5 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
        <p className="text-center text-xs text-muted-foreground">{t.result.qrHint}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={downloadSvg} disabled={!svg}>
            {t.result.qrDownloadSvg}
          </Button>
          <Button variant="outline" onClick={downloadPng} disabled={!pngHref}>
            {t.result.qrDownloadPng}
          </Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={onClose}>
          {t.result.qrClose}
        </Button>
      </div>
    </Modal>
  );
}
