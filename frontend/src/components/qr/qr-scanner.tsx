'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { Camera, X } from 'lucide-react';

interface QrScannerProps {
  onScan: (text: string) => void;
  onClose: () => void;
}

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const codeReader = new BrowserQRCodeReader();

    async function startScanner() {
      try {
        if (videoRef.current) {
          const controls = await codeReader.decodeFromVideoDevice(
            undefined, // use default device
            videoRef.current,
            (result, err) => {
              if (result) {
                onScan(result.getText());
              }
            }
          );
          controlsRef.current = controls;
        }
      } catch (err) {
        if (!isPermissionDeniedError(err)) {
          console.warn('[QrScanner]', err);
        }
        setError(mapCameraStartError(err));
      }
    }

    startScanner();

    return () => {
      if (controlsRef.current) {
        controlsRef.current.stop();
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center p-6 text-white bg-black/50 absolute top-0 w-full z-10">
        <h2 className="font-bold flex items-center gap-2">
          <Camera className="w-5 h-5" />
          Escanea el QR
        </h2>
        <button onClick={onClose}>
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center relative bg-black">
        {error ? (
          <div className="text-white text-center p-6">
            <p>{error}</p>
            <button onClick={onClose} className="mt-4 px-6 py-2 bg-white text-black rounded-lg">Cerrar</button>
          </div>
        ) : (
          <video 
            ref={videoRef} 
            className="w-full h-screen object-cover"
          />
        )}
        
        {/* Scanner Overlay UI */}
        <div className="absolute inset-0 border-[3px] border-white/20 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-white rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-0 animate-pulse border-2 border-white/50 rounded-3xl" />
          </div>
        </div>
      </div>
      
      <div className="p-10 bg-black text-white text-center pb-20">
        <p className="text-sm opacity-70 italic tracking-wide">Apunta al QR del docente para marcar tu asistencia</p>
      </div>
    </div>
  );
}
