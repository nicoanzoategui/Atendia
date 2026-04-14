'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { Camera, X } from 'lucide-react';

interface QrScannerProps {
  onScan: (text: string) => void;
  onClose: () => void;
}

/** Tokens del backend son base64 JSON; evita disparar con ruido corto del sensor. */
const MIN_QR_TOKEN_LENGTH = 24;

function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') return true;
  if (typeof e.message === 'string' && /permission denied/i.test(e.message)) return true;
  return false;
}

function mapCameraStartError(err: unknown): string {
  if (isPermissionDeniedError(err)) {
    return 'Permiso de cámara denegado. Permití el acceso en el navegador o probá en HTTPS.';
  }
  if (err instanceof DOMException) {
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'No se encontró ninguna cámara en este dispositivo.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'La cámara está en uso o no se puede abrir.';
    }
    if (err.name === 'SecurityError') {
      return 'El navegador bloqueó el acceso a la cámara (contexto no seguro).';
    }
  }
  return 'No se pudo acceder a la cámara';
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handledRef.current = false;
    const codeReader = new BrowserQRCodeReader();
    let cancelled = false;

    async function startScanner() {
      try {
        if (!videoRef.current) return;
        const ctrls = await codeReader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (cancelled || handledRef.current || !result) return;
            const text = result.getText().trim();
            if (text.length < MIN_QR_TOKEN_LENGTH) return;
            handledRef.current = true;
            try {
              ctrls.stop();
            } catch {
              /* ignore */
            }
            controlsRef.current = null;
            onScan(text);
          },
        );
        controlsRef.current = ctrls;
      } catch (err) {
        if (!isPermissionDeniedError(err)) {
          console.warn('[QrScanner]', err);
        }
        if (!cancelled) setError(mapCameraStartError(err));
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      handledRef.current = true;
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch {
          /* ignore */
        }
        controlsRef.current = null;
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="absolute top-0 z-10 flex w-full items-center justify-between bg-black/50 p-6 text-white">
        <h2 className="flex items-center gap-2 font-bold">
          <Camera className="h-5 w-5" />
          Escaneo en vivo
        </h2>
        <button type="button" onClick={onClose} aria-label="Cerrar escáner">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-black">
        {error ? (
          <div className="p-6 text-center text-white">
            <p>{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-lg bg-white px-6 py-2 text-black"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <video ref={videoRef} className="h-screen w-full object-cover" playsInline muted />
        )}

        <div className="pointer-events-none absolute inset-0 border-[3px] border-white/20">
          <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-3xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-0 animate-pulse rounded-3xl border-2 border-white/50" />
          </div>
        </div>
      </div>

      <div className="bg-black p-10 pb-20 text-center text-white">
        <p className="text-sm font-semibold tracking-wide text-white/90">
          Apuntá el QR dentro del recuadro: la cámara lee en vivo, no hace falta sacar una foto.
        </p>
      </div>
    </div>
  );
}
