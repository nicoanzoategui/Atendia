'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, CloudAlert } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { QrScanner } from '@/components/qr/qr-scanner';
import { getApiBaseUrl } from '@/lib/api/base-url';
import { requestDashboardRefetch } from '@/lib/dashboard-refetch';

type ScanState = 'scanning' | 'success' | 'error' | 'offline';

export default function StudentScanPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [errorMsg, setErrorMsg] = useState('');
  const [successRegisteredAt, setSuccessRegisteredAt] = useState<Date | null>(null);
  const [scannerKey, setScannerKey] = useState(0);
  const busyRef = useRef(false);

  const handleScan = useCallback(
    async (token: string) => {
      const t = token.trim();
      if (!t || busyRef.current || !user) return;
      busyRef.current = true;
      try {
        const authToken =
          typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const base = await getApiBaseUrl();
        const res = await fetch(`${base}/attendance/qr`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ token: t }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(data.message || 'QR inválido o expirado');
        }
        setSuccessRegisteredAt(new Date());
        setScanState('success');
        requestDashboardRefetch();
      } catch (err) {
        if (!navigator.onLine) {
          try {
            const { savePendingAttendance } = await import('@/lib/db/pending-attendance-store');
            await savePendingAttendance({
              offline_id: crypto.randomUUID(),
              student_id: user.id,
              class_session_id: '',
              qr_token: t,
              scanned_at: new Date().toISOString(),
              source: 'qr',
            });
          } catch {
            /* ignore */
          }
          setScanState('offline');
        } else {
          setErrorMsg(err instanceof Error ? err.message : 'Error al registrar');
          setScanState('error');
        }
      } finally {
        busyRef.current = false;
      }
    },
    [user],
  );

  return (
    <div className="min-h-screen bg-[#EEF2F7] px-4 py-6 pb-24">
      {scanState === 'scanning' ? (
        <>
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-between px-4 pt-6">
            <Link
              href="/student/course"
              className="pointer-events-auto inline-flex rounded-full bg-[#F1F5F9] p-2 text-[#0D1B4B]"
              aria-label="Volver"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            </Link>
            <div className="pointer-events-none text-right pr-2 pt-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white drop-shadow-md">
                REGISTRAR ASISTENCIA
              </p>
              <p className="text-lg font-black uppercase tracking-tight text-white drop-shadow-md">
                ESCANEAR QR
              </p>
            </div>
          </div>
          <QrScanner
            key={scannerKey}
            onScan={handleScan}
            onClose={() => router.push('/student/course')}
          />
          <p className="pointer-events-none fixed bottom-28 left-0 right-0 z-[60] px-6 text-center text-xs text-white drop-shadow-md">
            Escaneo en vivo: apuntá al QR del docente (no hace falta capturar una foto).
          </p>
        </>
      ) : (
        <div className="mx-auto max-w-lg">
          <div className="relative">
            <Link
              href="/student/course"
              className="absolute left-0 top-0 inline-flex rounded-full bg-[#F1F5F9] p-2 text-[#0D1B4B]"
              aria-label="Volver"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            </Link>
            <header className="pl-12 pr-2 pt-1">
              <h1 className="text-2xl font-black uppercase text-[#0D1B4B]">ESCANEAR QR</h1>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[#16A34A]">
                REGISTRAR ASISTENCIA
              </p>
            </header>
          </div>

          <div className="mt-10">
            {scanState === 'success' ? (
              <div className="rounded-[20px] bg-white p-8 text-center shadow-sm">
                <h2 className="text-3xl font-black uppercase text-[#16A34A]">¡PRESENTE!</h2>
                <p className="mt-2 text-sm text-[#8A9BB5]">
                  Tu asistencia fue registrada como PRESENTE
                </p>
                <div className="mt-4 flex justify-center">
                  <span className="rounded-full bg-[#DCFCE7] px-6 py-2 text-sm font-bold uppercase text-[#16A34A]">
                    PRESENTE
                  </span>
                </div>
                {successRegisteredAt ? (
                  <p className="mt-4 text-xs text-[#8A9BB5]">
                    {successRegisteredAt.toLocaleString('es-AR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                ) : null}
                <Link
                  href="/student/course"
                  className="mt-8 block w-full rounded-[12px] bg-[#1B3FD8] py-3 text-center text-sm font-bold uppercase text-white"
                >
                  VOLVER AL INICIO
                </Link>
              </div>
            ) : null}

            {scanState === 'error' ? (
              <div className="rounded-[20px] bg-white p-8 text-center shadow-sm">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#FEE2E2] text-5xl text-[#DC2626]">
                  ✗
                </div>
                <h2 className="text-2xl font-black uppercase text-[#0D1B4B]">
                  QR INVÁLIDO O EXPIRADO
                </h2>
                <p className="mt-2 text-sm text-[#8A9BB5]">{errorMsg}</p>
                <p className="mt-2 text-sm text-[#8A9BB5]">
                  Pedile al docente que regenere el código
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setScanState('scanning');
                    setScannerKey((k) => k + 1);
                  }}
                  className="mt-8 w-full rounded-[12px] bg-[#0D1B4B] py-3 text-sm font-bold uppercase text-white"
                >
                  INTENTAR DE NUEVO
                </button>
              </div>
            ) : null}

            {scanState === 'offline' ? (
              <div className="rounded-[20px] bg-white p-8 text-center shadow-sm">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#FEF9C3] text-[#EAB308]">
                  <span className="flex flex-col items-center leading-none">
                    <CloudAlert className="h-10 w-10" strokeWidth={2} />
                    <span className="text-lg font-black">!</span>
                  </span>
                </div>
                <h2 className="text-2xl font-black uppercase text-[#0D1B4B]">REGISTRADO OFFLINE</h2>
                <p className="mt-2 text-sm text-[#8A9BB5]">
                  Se sincronizará cuando vuelva la conexión
                </p>
                <Link
                  href="/student/course"
                  className="mt-8 block w-full rounded-[12px] bg-[#1B3FD8] py-3 text-center text-sm font-bold uppercase text-white"
                >
                  VOLVER AL INICIO
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
