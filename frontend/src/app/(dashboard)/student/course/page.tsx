'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Clock,
  MapPin,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';
import { formatCourseDisplayTitle } from '@/lib/course-display-name';
import { subscribeDashboardRefetch } from '@/lib/dashboard-refetch';
import { studentAttendanceIsRegistered } from '@/lib/student-attendance';

type MyCourseResponse = {
  edition: {
    id: string;
    name: string;
    learning_proposal?: { name?: string } | { name?: string }[];
  } | null;
  sessions: EditionSession[];
};

type EditionSession = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  course_name?: string;
  location_campus?: string;
  location_building?: string;
  location_classroom?: string;
  classroom?: string;
  my_attendance?: { status?: string } | null;
};

type CourseMeta = {
  id: string;
  name: string;
  edition_name: string;
  proposal_name: string;
  location_campus: string;
  location_building: string;
};

function todayStrLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function proposalNameFromEdition(ed: MyCourseResponse['edition']): string {
  if (!ed) return '';
  const lp = ed.learning_proposal;
  const n = Array.isArray(lp) ? lp[0]?.name : lp?.name;
  return n != null ? String(n).trim() : '';
}

function buildCourseMeta(ed: NonNullable<MyCourseResponse['edition']>, sessions: EditionSession[]): CourseMeta {
  const proposal_name = proposalNameFromEdition(ed);
  const edition_name = ed.name?.trim() || '';
  const name =
    proposal_name ||
    edition_name ||
    sessions[0]?.course_name?.trim() ||
    'Curso sin nombre';
  let location_campus = '';
  let location_building = '';
  for (const s of sessions) {
    if (!location_campus && s.location_campus) location_campus = s.location_campus;
    if (!location_building && s.location_building) location_building = s.location_building;
  }
  return {
    id: ed.id,
    name,
    edition_name,
    proposal_name,
    location_campus,
    location_building,
  };
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

function displayGreeting(user: { email?: string } | null): string {
  if (!user?.email) return 'ALUMNO';
  return user.email.split('@')[0]?.toUpperCase() || 'ALUMNO';
}

function sessionTimeLabel(start?: string): string {
  if (!start) return '—';
  return `${start.slice(0, 5)} hs`;
}

function isCancelled(s: EditionSession): boolean {
  return String(s.status ?? '').toLowerCase() === 'cancelled';
}

function mergeAttendance(
  fromApi: EditionSession[],
  myCourseSessions: EditionSession[],
): EditionSession[] {
  const map = new Map(myCourseSessions.map((s) => [s.id, s.my_attendance]));
  return fromApi.map((s) => ({
    ...s,
    my_attendance: map.get(s.id) ?? s.my_attendance ?? null,
  }));
}

function pickNextSession(sessions: EditionSession[], today: string): EditionSession | null {
  const usable = sessions.filter((s) => !isCancelled(s));
  const upcoming = usable
    .filter((s) => s.date >= today)
    .filter((s) => !studentAttendanceIsRegistered(s.my_attendance?.status))
    .sort((a, b) => {
      const c = a.date.localeCompare(b.date);
      if (c !== 0) return c;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });
  return upcoming[0] ?? null;
}

export default function StudentCoursePage() {
  const { user } = useAuth();
  const [myCourse, setMyCourse] = useState<MyCourseResponse | null>(null);
  const [editionSessions, setEditionSessions] = useState<EditionSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => todayStrLocal(), []);

  const load = useCallback(async () => {
    const mc = await apiClient<MyCourseResponse | null>('/sessions/my-course');
    setMyCourse(mc);
    if (!mc?.edition?.id) {
      setEditionSessions([]);
      return;
    }
    const eid = mc.edition.id;
    let list: EditionSession[] = [...(mc.sessions ?? [])];
    try {
      await apiClient<unknown>('/sessions/today');
    } catch {
      /* alumno: suele ser 403 */
    }
    try {
      const ed = await apiClient<EditionSession[]>(`/sessions/edition/${encodeURIComponent(eid)}`);
      if (Array.isArray(ed) && ed.length > 0) {
        list = mergeAttendance(ed, mc.sessions ?? []);
      }
    } catch {
      list = mc.sessions ?? [];
    }
    list.sort((a, b) => {
      const c = a.date.localeCompare(b.date);
      if (c !== 0) return c;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });
    setEditionSessions(list);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar el curso');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, load]);

  useEffect(() => subscribeDashboardRefetch(() => void load()), [load]);

  const courseMeta = useMemo(() => {
    if (!myCourse?.edition) return null;
    return buildCourseMeta(myCourse.edition, editionSessions.length ? editionSessions : (myCourse.sessions ?? []));
  }, [myCourse, editionSessions]);

  const nextClass = useMemo(
    () => pickNextSession(editionSessions.length ? editionSessions : (myCourse?.sessions ?? []), today),
    [editionSessions, myCourse, today],
  );

  const hasAnyUpcomingSession = useMemo(() => {
    const list = editionSessions.length ? editionSessions : (myCourse?.sessions ?? []);
    return list.some((s) => !isCancelled(s) && s.date >= today);
  }, [editionSessions, myCourse, today]);

  const nextLocLine = useMemo(() => {
    if (!nextClass) return '';
    const location =
      nextClass.location_campus || courseMeta?.location_campus || 'Ver detalle';
    const classroom = nextClass.location_classroom || nextClass.classroom || '';
    return classroom ? `${location} · ${classroom}` : location;
  }, [nextClass, courseMeta]);

  const sessionList = editionSessions.length ? editionSessions : (myCourse?.sessions ?? []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EEF2F7] px-4 py-6 pb-24">
        <div className="mx-auto max-w-lg space-y-4 animate-pulse">
          <div className="mx-auto h-7 w-28 rounded-full bg-[#F1F5F9]" />
          <div className="h-12 w-full rounded-xl bg-[#F1F5F9]" />
          <div className="h-40 rounded-[20px] bg-[#F1F5F9]" />
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

  if (!myCourse?.edition || !courseMeta) {
    return (
      <div className="min-h-screen bg-[#EEF2F7] px-4 py-6 pb-24">
        <div className="mx-auto flex max-w-lg flex-col items-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-bold text-[#16A34A]">
            <Wifi className="h-3.5 w-3.5" strokeWidth={2.5} />
            En línea
          </span>
        </div>
        <header className="mx-auto mt-4 max-w-lg">
          <h1 className="text-4xl font-black uppercase tracking-tight text-[#0D1B4B]">
            HOLA, {displayGreeting(user)}
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[#8A9BB5]">
            PORTAL DEL ALUMNO
          </p>
        </header>
        <div className="mx-auto mt-6 max-w-lg rounded-[20px] bg-white p-5 text-center text-sm text-[#8A9BB5]">
          No estás inscripto en ninguna cursada todavía.
        </div>
      </div>
    );
  }

  const displayCourseTitle = formatCourseDisplayTitle(courseMeta.name);

  return (
    <div className="min-h-screen bg-[#EEF2F7] px-4 py-6 pb-24">
      <div className="mx-auto max-w-lg">
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-bold text-[#16A34A]">
            <Wifi className="h-3.5 w-3.5" strokeWidth={2.5} />
            En línea
          </span>
        </div>

        <header className="mt-4">
          <h1 className="text-4xl font-black uppercase tracking-tight text-[#0D1B4B]">
            HOLA, {displayGreeting(user)}
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[#8A9BB5]">
            PORTAL DEL ALUMNO
          </p>
        </header>

        {/* Próxima clase */}
        {nextClass ? (
          <section className="mt-6 rounded-[20px] border border-[#E8EEF7] bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1B3FD8] p-1 text-white">
                <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              <span className="text-xs font-bold uppercase text-[#1B3FD8]">
                PRÓXIMA CLASE · {formatDayMonth(nextClass.date)}
              </span>
            </div>
            <p className="mt-3 text-xl font-bold text-[#0D1B4B]">{displayCourseTitle}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-[#8A9BB5]">
              <MapPin className="h-4 w-4 shrink-0 text-[#1B3FD8]" strokeWidth={2} />
              {nextLocLine}
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#8A9BB5]">
              <Clock className="h-4 w-4 shrink-0 text-[#1B3FD8]" strokeWidth={2} />
              {sessionTimeLabel(nextClass.start_time)}
            </p>
            <Link
              href="/student/scan"
              className="mt-4 flex w-full items-center justify-center rounded-[12px] bg-[#1B3FD8] py-3 text-center text-sm font-bold uppercase text-white"
            >
              CONFIRMAR ASISTENCIA
              <ChevronRight className="ml-1 h-4 w-4" strokeWidth={2.5} />
            </Link>
          </section>
        ) : hasAnyUpcomingSession ? (
          <section className="mt-6 rounded-[20px] border border-[#DCFCE7] bg-[#F0FDF4] p-5 text-center text-sm font-semibold text-[#166534]">
            Ya registramos tu asistencia para la próxima clase programada. Podés revisar el detalle en &quot;Ver
            clases&quot;.
          </section>
        ) : (
          <section className="mt-6 rounded-[20px] bg-white p-5 text-center text-sm text-[#8A9BB5]">
            No hay clases próximas programadas
          </section>
        )}

        {/* Mi cursada */}
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#0D1B4B]">MIS CURSOS</h2>
            <div className="h-px flex-1 bg-[#CBD5E1]" />
          </div>

          <div className="rounded-[20px] bg-white p-5">
            <p className="text-lg font-black uppercase text-[#0D1B4B]">{displayCourseTitle}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold text-[#8A9BB5]">
                <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                {sessionList.length} CLASES
              </span>
              {courseMeta.location_campus ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold text-[#8A9BB5]">
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  {courseMeta.location_campus}
                </span>
              ) : null}
            </div>
            <Link
              href={`/student/course/${encodeURIComponent(courseMeta.id)}`}
              className="mt-4 flex w-full items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-white py-3 text-center text-sm font-bold uppercase text-[#0D1B4B]"
            >
              VER CLASES
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
