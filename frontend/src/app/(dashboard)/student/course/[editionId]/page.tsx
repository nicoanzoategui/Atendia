'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, MapPin } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';
import { formatCourseDisplayTitle } from '@/lib/course-display-name';
import { subscribeDashboardRefetch } from '@/lib/dashboard-refetch';
import { studentAttendanceShowsRegistered } from '@/lib/student-attendance';

type SessionRow = {
  id: string;
  date: string;
  start_time?: string;
  course_name?: string;
  location_campus?: string;
  location_building?: string;
  location_classroom?: string;
  classroom?: string;
  learning_proposal?: { name?: string } | { name?: string }[];
  learning_proposal_edition?: { name?: string } | { name?: string }[];
  my_attendance?: { status?: string; method?: string | null } | null;
};

type MyCourseResponse = {
  edition: { id: string } | null;
  sessions: SessionRow[];
};

function todayStrLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
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

function sessionTimeLabel(start?: string): string {
  if (!start) return '—';
  return `${start.slice(0, 5)} hs`;
}

function formatSessionLocationVenue(s: SessionRow): string {
  const campus = (s.location_campus || '').trim();
  const classroom = (s.location_classroom || s.classroom || '').trim();
  const building = (s.location_building || '').trim();
  const roomPart = classroom !== '' ? classroom : building;
  const aula = roomPart !== '' ? `AULA ${roomPart}` : '';
  if (campus !== '' && aula !== '') return `${campus} • ${aula}`;
  if (campus !== '') return campus;
  if (aula !== '') return aula;
  return '—';
}

function courseTitleFromSessions(sessions: SessionRow[]): string {
  if (sessions.length === 0) return 'CURSO';
  const s = sessions[0];
  const lp = s.learning_proposal;
  const le = s.learning_proposal_edition;
  const pn = Array.isArray(lp) ? lp[0]?.name : lp?.name;
  const en = Array.isArray(le) ? le[0]?.name : le?.name;
  const a = pn != null ? String(pn).trim() : '';
  const b = en != null ? String(en).trim() : '';
  const c = s.course_name?.trim() ?? '';
  return a || b || c || 'Curso sin nombre';
}

function mergeAttendance(fromEdition: SessionRow[], myCourseSessions: SessionRow[]): SessionRow[] {
  const map = new Map(myCourseSessions.map((s) => [s.id, s.my_attendance]));
  return fromEdition.map((s) => ({
    ...s,
    my_attendance: map.get(s.id) ?? s.my_attendance ?? null,
  }));
}

function attendanceBadgeClasses(status: string): { label: string; className: string } | null {
  const st = status.toLowerCase();
  if (st === 'present') return { label: 'PRESENTE', className: 'bg-[#DCFCE7] text-[#16A34A]' };
  if (st === 'late') return { label: 'TARDE', className: 'bg-[#FEF9C3] text-[#EAB308]' };
  if (st === 'absent') return { label: 'AUSENTE', className: 'bg-[#FEE2E2] text-[#DC2626]' };
  if (st === 'excused' || st === 'justified') {
    return { label: 'JUSTIFICADO', className: 'bg-[#F1F5F9] text-[#6B7280]' };
  }
  return null;
}

function allSessionsPast(sessions: SessionRow[], today: string): boolean {
  return sessions.every((s) => s.date < today);
}

export default function StudentCourseEditionPage() {
  const params = useParams();
  const editionId = params.editionId as string;
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => todayStrLocal(), []);

  const load = useCallback(async () => {
    if (!editionId) return;
    const list = await apiClient<SessionRow[]>(
      `/sessions/edition/${encodeURIComponent(editionId)}`,
    );
    const base = Array.isArray(list) ? list : [];
    let merged = base;
    try {
      const mc = await apiClient<MyCourseResponse | null>('/sessions/my-course');
      if (mc?.edition?.id === editionId && Array.isArray(mc.sessions)) {
        merged = mergeAttendance(base, mc.sessions);
      }
    } catch {
      /* sin merge si falla */
    }
    merged.sort((a, b) => {
      const c = a.date.localeCompare(b.date);
      if (c !== 0) return c;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });
    const deduped = merged.filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);
    setSessions(deduped);
  }, [editionId]);

  useEffect(() => {
    if (!user || !editionId) return;
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar clases');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, editionId, load]);

  useEffect(() => subscribeDashboardRefetch(() => void load()), [load]);

  const title = useMemo(() => formatCourseDisplayTitle(courseTitleFromSessions(sessions)), [sessions]);
  const estimatedDate = useMemo(() => addDaysToYmd(today, 7), [today]);
  const showEstimatedCard = useMemo(() => allSessionsPast(sessions, today), [sessions, today]);

  const nearestUpcomingSessionId = useMemo(() => {
    const upcoming = sessions.filter(
      (s) => s.date >= today && !studentAttendanceShowsRegistered(s.my_attendance, s.date, today),
    );
    if (upcoming.length === 0) return null;
    upcoming.sort((a, b) => {
      const c = a.date.localeCompare(b.date);
      if (c !== 0) return c;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });
    return upcoming[0]?.id ?? null;
  }, [sessions, today]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EEF2F7] px-4 py-6 pb-24">
        <div className="mx-auto max-w-lg animate-pulse space-y-4">
          <div className="h-10 w-10 rounded-full bg-[#F1F5F9]" />
          <div className="h-8 w-48 rounded-lg bg-[#F1F5F9]" />
          <div className="h-40 rounded-[20px] bg-[#F1F5F9]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#EEF2F7] px-4 py-6 pb-24">
        <div className="mx-auto max-w-lg">
          <Link
            href="/student/course"
            className="inline-flex rounded-full bg-[#F1F5F9] p-2 text-[#0D1B4B]"
            aria-label="Volver"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
          </Link>
          <p className="mt-4 text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF2F7] px-4 py-6 pb-24">
      <div className="mx-auto max-w-lg">
        <Link
          href="/student/course"
          className="inline-flex rounded-full bg-[#F1F5F9] p-2 text-[#0D1B4B]"
          aria-label="Volver"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </Link>

        <header className="mt-4">
          <h1 className="text-2xl font-black uppercase text-[#0D1B4B]">{title}</h1>
          <p className="mt-1 text-xs uppercase text-[#8A9BB5]">{sessions.length} CLASES</p>
        </header>

        <section className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#0D1B4B]">
              CALENDARIO DE CLASES
            </h2>
            <div className="h-px flex-1 bg-[#CBD5E1]" />
          </div>

          {sessions.map((s) => {
            const past = s.date < today;
            const upcoming = !past;
            const loc = formatSessionLocationVenue(s);
            const isNearestUpcoming = upcoming && nearestUpcomingSessionId === s.id;
            const att = s.my_attendance?.status;
            const hasAttendance = att != null && String(att).trim() !== '';
            const badge = att ? attendanceBadgeClasses(String(att)) : null;

            return (
              <div
                key={s.id}
                className={`relative mt-3 rounded-[20px] bg-white p-5 ${
                  upcoming ? 'border-2 border-[#1B3FD8]' : ''
                }`}
              >
                {past && hasAttendance ? (
                  <div className="absolute right-5 top-5">
                    <Check className="h-5 w-5 text-[#16A34A]" strokeWidth={3} />
                  </div>
                ) : null}

                <div
                  className={`flex flex-wrap items-start justify-between gap-2 ${past && hasAttendance ? 'pr-10' : ''}`}
                >
                  {past ? (
                    <span className="inline-flex rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold text-[#8A9BB5]">
                      CERRADA
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-[#1B3FD8] px-3 py-1 text-xs font-bold text-white">
                      PRÓXIMA
                    </span>
                  )}
                  <span className="text-xs text-[#8A9BB5]">{formatDayMonth(s.date)}</span>
                </div>

                <p className="mt-3 text-2xl font-black text-[#0D1B4B]">
                  {sessionTimeLabel(s.start_time)}
                </p>
                <p className="mt-1 text-sm font-bold leading-snug text-[#0D1B4B]">
                  {title} · {formatDayMonth(s.date)} · {sessionTimeLabel(s.start_time)}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#8A9BB5]">
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  {loc}
                </p>

                {past && badge ? (
                  <span
                    className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                ) : null}

                {upcoming ? (
                  studentAttendanceShowsRegistered(s.my_attendance, s.date, today) ? (
                    <p className="mt-3 rounded-[12px] bg-[#F0FDF4] py-3 text-center text-xs font-bold uppercase text-[#166534]">
                      Asistencia registrada
                    </p>
                  ) : isNearestUpcoming ? (
                    <Link
                      href="/student/scan"
                      className="mt-3 flex w-full items-center justify-center rounded-[12px] bg-[#1B3FD8] py-3 text-center text-sm font-bold uppercase text-white"
                    >
                      CONFIRMAR ASISTENCIA
                    </Link>
                  ) : (
                    <span
                      aria-disabled
                      className="mt-3 flex w-full cursor-not-allowed items-center justify-center rounded-[12px] bg-[#8A9BB5] py-3 text-center text-sm font-bold uppercase text-white opacity-50"
                    >
                      CONFIRMAR ASISTENCIA
                    </span>
                  )
                ) : null}
              </div>
            );
          })}

          {showEstimatedCard ? (
            <div className="relative mt-3 rounded-[20px] border-2 border-[#1B3FD8] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="inline-flex rounded-full bg-[#1B3FD8] px-3 py-1 text-xs font-bold text-white">
                  PRÓXIMA
                </span>
                <span className="text-xs text-[#8A9BB5]">{formatDayMonth(estimatedDate)}</span>
              </div>
              <p className="mt-3 text-2xl font-black text-[#0D1B4B]">—</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#8A9BB5]">
                <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                —
              </p>
              {nearestUpcomingSessionId == null ? (
                <Link
                  href="/student/scan"
                  className="mt-3 flex w-full items-center justify-center rounded-[12px] bg-[#1B3FD8] py-3 text-center text-sm font-bold uppercase text-white"
                >
                  CONFIRMAR ASISTENCIA
                </Link>
              ) : (
                <span
                  aria-disabled
                  className="mt-3 flex w-full cursor-not-allowed items-center justify-center rounded-[12px] bg-[#8A9BB5] py-3 text-center text-sm font-bold uppercase text-white opacity-50"
                >
                  CONFIRMAR ASISTENCIA
                </span>
              )}
              <p className="mt-2 text-center text-[10px] text-[#8A9BB5]">* Próxima clase estimada</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
