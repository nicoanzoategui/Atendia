'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { getAuthToken } from '@/lib/db/indexed-db';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

type HistoryApiRecord = {
  id: string;
  status?: string | null;
  class_session?: {
    id: string;
    date?: string;
    start_time?: string;
    end_time?: string;
    name?: string;
    subject?: string;
    classroom?: string;
    location_classroom?: string;
    location_campus?: string;
    location_building?: string;
  } | null;
};

type HistoryResponse = {
  records: HistoryApiRecord[];
  summary?: unknown[];
};

type FlatRecord = {
  recordId: string;
  session_id: string;
  session_date: string;
  session_start_time: string;
  session_end_time: string;
  location_campus: string;
  location_building: string;
  course_name: string;
  status: 'present' | 'late' | 'absent' | 'excused' | null;
};

function normalizeRecords(records: HistoryApiRecord[]): FlatRecord[] {
  return records.map((r) => {
    const cs = r.class_session;
    const st = r.status;
    let status: FlatRecord['status'] = null;
    if (st === 'present' || st === 'late' || st === 'absent' || st === 'excused') {
      status = st;
    } else if (st === 'justified') {
      status = 'excused';
    }
    return {
      recordId: r.id,
      session_id: cs?.id ?? r.id,
      session_date: cs?.date ?? '',
      session_start_time: cs?.start_time ?? '',
      session_end_time: cs?.end_time ?? '',
      location_campus: cs?.location_campus ?? '',
      location_building: cs?.location_building ?? '',
      course_name: cs?.subject || cs?.name || 'Clase',
      status,
    };
  });
}

function formatDayMonth(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  return dt
    .toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
    .replace(/\.$/, '')
    .toUpperCase();
}

function timeHs(start?: string): string {
  if (!start) return '—';
  return `${start.slice(0, 5)} hs`;
}

function statusBadge(st: FlatRecord['status']): { label: string; className: string } {
  switch (st) {
    case 'present':
      return { label: 'PRESENTE', className: 'bg-[#DCFCE7] text-[#16A34A]' };
    case 'late':
      return { label: 'TARDE', className: 'bg-[#FEF9C3] text-[#EAB308]' };
    case 'absent':
      return { label: 'AUSENTE', className: 'bg-[#FEE2E2] text-[#DC2626]' };
    case 'excused':
      return { label: 'JUSTIFICADO', className: 'bg-[#F1F5F9] text-[#6B7280]' };
    default:
      return { label: 'SIN REGISTRO', className: 'bg-[#F1F5F9] text-[#8A9BB5]' };
  }
}

function attendanceBadgeLabel(pct: number): { label: string; className: string } {
  if (pct >= 75) return { label: 'REGULAR', className: 'bg-[#DCFCE7] text-[#16A34A]' };
  if (pct >= 50) return { label: 'EN RIESGO', className: 'bg-[#FEF9C3] text-[#EAB308]' };
  return { label: 'CRÍTICO', className: 'bg-[#FEE2E2] text-[#DC2626]' };
}

export default function StudentHistoryPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<FlatRecord[]>([]);
  const [courseTitle, setCourseTitle] = useState('Mi cursada');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const tokenData = await getAuthToken();
        const token = tokenData?.accessToken;
        const res = await fetch(`${API_URL}/attendance/my-history`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message || 'Error al cargar historial');
        }
        const data = (await res.json()) as HistoryResponse;
        const flat = normalizeRecords(data.records ?? []);
        if (!cancelled) {
          setRecords(flat);
          const first = flat[0];
          if (first?.course_name) setCourseTitle(first.course_name);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar historial');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const { presentes, tardes, ausentes, justificados, total, pct } = useMemo(() => {
    const presentes = records.filter((r) => r.status === 'present').length;
    const tardes = records.filter((r) => r.status === 'late').length;
    const ausentes = records.filter((r) => r.status === 'absent').length;
    const justificados = records.filter((r) => r.status === 'excused').length;
    const total = records.length;
    const pct = total > 0 ? Math.round(((presentes + tardes) / total) * 100) : 0;
    return { presentes, tardes, ausentes, justificados, total, pct };
  }, [records]);

  const summaryBadge = attendanceBadgeLabel(pct);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EEF2F7] px-4 py-6 pb-24">
        <div className="mx-auto max-w-lg space-y-3">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-[#F1F5F9]" />
          <div className="h-4 w-32 animate-pulse rounded bg-[#F1F5F9]" />
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-[16px] bg-[#F1F5F9]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#EEF2F7] px-4 py-6 pb-24">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF2F7] px-4 py-6 pb-24">
      <div className="mx-auto max-w-lg">
        <header>
          <h1 className="text-3xl font-black uppercase tracking-tight text-[#0D1B4B]">
            MIS ESTADÍSTICAS
          </h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-[#8A9BB5]">{courseTitle}</p>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-[16px] bg-white p-4">
            <p className="text-3xl font-black text-[#16A34A]">{presentes}</p>
            <p className="text-xs uppercase tracking-widest text-[#8A9BB5]">PRESENTES</p>
          </div>
          <div className="rounded-[16px] bg-white p-4">
            <p className="text-3xl font-black text-[#EAB308]">{tardes}</p>
            <p className="text-xs uppercase tracking-widest text-[#8A9BB5]">TARDES</p>
          </div>
          <div className="rounded-[16px] bg-white p-4">
            <p className="text-3xl font-black text-[#DC2626]">{ausentes}</p>
            <p className="text-xs uppercase tracking-widest text-[#8A9BB5]">AUSENTES</p>
          </div>
          <div className="rounded-[16px] bg-white p-4">
            <p className="text-3xl font-black text-[#6B7280]">{justificados}</p>
            <p className="text-xs uppercase tracking-widest text-[#8A9BB5]">JUSTIFICADOS</p>
          </div>
        </div>

        <div className="mt-3 flex gap-4 rounded-[20px] bg-white p-5">
          <div className="min-w-0 flex-1">
            <p className="text-5xl font-black text-[#0D1B4B]">{pct}%</p>
            <p className="text-xs uppercase text-[#8A9BB5]">ASISTENCIA TOTAL</p>
            <span
              className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${summaryBadge.className}`}
            >
              {summaryBadge.label}
            </span>
          </div>
          <div className="flex w-4 shrink-0 items-end justify-center pb-1">
            <div className="relative h-28 w-3 overflow-hidden rounded-full bg-[#EEF2F7]">
              <div
                className="absolute bottom-0 left-0 right-0 rounded-full bg-[#1B3FD8] transition-all"
                style={{ height: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
        </div>

        <section className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#0D1B4B]">
              HISTORIAL DE CLASES
            </h2>
            <div className="h-px flex-1 bg-[#CBD5E1]" />
          </div>

          {records.length === 0 ? (
            <div className="rounded-[16px] bg-white p-8 text-center text-sm text-[#8A9BB5]">
              No hay clases registradas todavía
            </div>
          ) : (
            <ul className="flex flex-col">
              {records.map((r) => {
                const badge = statusBadge(r.status);
                const locParts = [r.location_campus, r.location_building].filter(Boolean);
                const loc = locParts.length ? locParts.join(' • ') : '—';
                return (
                  <li key={r.recordId} className="mt-2 rounded-[16px] bg-white p-4 first:mt-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-[#8A9BB5]">{formatDayMonth(r.session_date)}</span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-[#0D1B4B]">
                      {timeHs(r.session_start_time)}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#8A9BB5]">
                      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                      {loc}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
