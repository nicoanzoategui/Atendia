'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock,
  MapPin,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';

type SessionRow = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
  learning_proposal_edition_id?: string;
  course_name?: string;
  class_display_id?: string;
  location_classroom?: string;
  classroom?: string;
  location_campus?: string;
  learning_proposal_edition?: { name?: string; external_id?: string } | { name?: string; external_id?: string }[];
  learning_proposal?: { name?: string } | { name?: string }[];
  class_session_student?: { count?: number }[] | unknown;
};

function editionName(s: SessionRow): string {
  const le = s.learning_proposal_edition;
  const lp = s.learning_proposal;
  const en = Array.isArray(le) ? le[0]?.name : le?.name;
  const pn = Array.isArray(lp) ? lp[0]?.name : lp?.name;
  return s.course_name || en || pn || 'Curso';
}

function rawProposalName(s: SessionRow): string | undefined {
  const lp = s.learning_proposal;
  const pn = Array.isArray(lp) ? lp[0]?.name : lp?.name;
  if (pn == null) return undefined;
  const t = String(pn).trim();
  return t === '' ? undefined : String(pn);
}

function rawEditionName(s: SessionRow): string | undefined {
  const le = s.learning_proposal_edition;
  const en = Array.isArray(le) ? le[0]?.name : le?.name;
  if (en == null) return undefined;
  const t = String(en).trim();
  return t === '' ? undefined : String(en);
}

function rawCourseNameField(s: SessionRow): string | undefined {
  const cn = s.course_name;
  if (cn == null) return undefined;
  const t = String(cn).trim();
  return t === '' ? undefined : String(cn);
}

/** Evita usar fechas o placeholders del backend como título de curso. */
function isUnusableCourseTitle(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return true;
  if (/^CLASE\s+\d{4}-\d{2}-\d{2}\s*$/i.test(t)) return true;
  if (/^CLASE[^\w\u00C0-\u024F]*\d{4}-\d{2}-\d{2}/i.test(t)) return true;
  return false;
}

function courseCardName(s: SessionRow): string {
  const proposal_name = rawProposalName(s);
  const edition_name = rawEditionName(s);
  const name = rawCourseNameField(s);
  const pick = (v: string | undefined) => {
    if (v == null) return undefined;
    const t = v.trim();
    if (!t || isUnusableCourseTitle(t)) return undefined;
    return v;
  };
  const courseName =
    pick(proposal_name) ?? pick(edition_name) ?? pick(name) ?? 'Curso sin nombre';
  return courseName;
}

function rosterCount(s: SessionRow): number {
  const cs = s.class_session_student;
  if (Array.isArray(cs) && cs[0] && typeof (cs[0] as { count?: number }).count === 'number') {
    return (cs[0] as { count: number }).count;
  }
  return 0;
}

function editionDisplayId(eid: string, sample: SessionRow): string {
  const le = sample.learning_proposal_edition;
  const ext = Array.isArray(le) ? le[0]?.external_id : le?.external_id;
  const t = ext != null ? String(ext).trim() : '';
  if (t !== '') return t;
  return eid.replace(/-/g, '').slice(0, 10).toUpperCase();
}

function formatCourseStartDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '—';
  const dt = new Date(y, m - 1, d);
  return dt
    .toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
    .replace(/\.$/, '')
    .toUpperCase();
}

function todayStrLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function displayName(user: { email?: string; external_id?: string } | null): string {
  if (!user?.email) return 'Docente';
  const local = user.email.split('@')[0];
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length === 0) return local;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

function profLastNameUpper(user: { email?: string } | null): string {
  const full = displayName(user);
  const parts = full.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? full;
  return last.toUpperCase();
}

function formatCountdownMs(ms: number) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function countdownToClassStart(session: SessionRow, today: string): string {
  if (session.date !== today || !session.start_time) return '--:--';
  const [h, m] = session.start_time.slice(0, 5).split(':').map(Number);
  const [y, mo, d] = session.date.split('-').map(Number);
  const start = new Date(y, mo - 1, d, h, m, 0, 0);
  const diff = start.getTime() - Date.now();
  if (diff <= 0) return '00:00';
  return formatCountdownMs(diff);
}

function isCancelledSession(s: SessionRow): boolean {
  return String((s as { status?: string }).status ?? '').toLowerCase() === 'cancelled';
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="mx-auto h-6 w-32 rounded-full bg-white/80" />
      <div className="h-10 w-full max-w-md rounded-xl bg-white/80" />
      <div className="h-40 rounded-[20px] bg-white/80" />
      <div className="h-28 rounded-[20px] bg-white/80" />
      <div className="h-28 rounded-[20px] bg-white/80" />
    </div>
  );
}

export default function TeacherCoursesPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const today = useMemo(() => todayStrLocal(), []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const todayList = await apiClient<SessionRow[]>('/sessions/today');

        const editionIds = new Set<string>();
        for (const s of todayList ?? []) {
          if (s.learning_proposal_edition_id) editionIds.add(s.learning_proposal_edition_id);
        }

        const byId = new Map<string, SessionRow>();
        await Promise.all(
          [...editionIds].map(async (eid) => {
            try {
              const rows = await apiClient<SessionRow[]>(
                `/sessions/edition/${encodeURIComponent(eid)}`,
              );
              for (const s of rows ?? []) {
                if (s.id) byId.set(s.id, s);
              }
            } catch {
              /* sin acceso a esa cursada */
            }
          }),
        );

        for (const s of todayList ?? []) {
          if (s.id) byId.set(s.id, { ...byId.get(s.id), ...s });
        }

        if (!cancelled) setSessions([...byId.values()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const { nextClass, courseCards } = useMemo(() => {
    const futureSessions = sessions
      .filter((s) => !isCancelledSession(s))
      .filter((s) => s.date >= today)
      .sort((a, b) => {
        const c = a.date.localeCompare(b.date);
        if (c !== 0) return c;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

    const next = futureSessions[0] ?? null;

    const byEdition = new Map<
      string,
      { id: string; name: string; students: number; sessionSample: SessionRow; firstDate: string }
    >();
    for (const s of sessions) {
      const eid = s.learning_proposal_edition_id;
      if (!eid) continue;
      const name = courseCardName(s);
      const cnt = rosterCount(s);
      const prev = byEdition.get(eid);
      if (!prev) {
        byEdition.set(eid, {
          id: eid,
          name,
          students: cnt,
          sessionSample: s,
          firstDate: s.date,
        });
      } else {
        const firstDate = s.date < prev.firstDate ? s.date : prev.firstDate;
        byEdition.set(eid, {
          ...prev,
          students: Math.max(prev.students, cnt),
          firstDate,
        });
      }
    }

    return {
      nextClass: next,
      courseCards: [...byEdition.values()],
    };
  }, [sessions, today]);

  const nextBannerTime = useMemo(() => {
    if (!nextClass) return '--:--';
    if (nextClass.date === today) return countdownToClassStart(nextClass, today);
    return formatCourseStartDay(nextClass.date);
  }, [nextClass, today, tick]);

  if (loading) {
    return <Skeleton />;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  const aula = (s: SessionRow) => {
    const campus = s.location_campus?.trim();
    const room = (s.location_classroom || s.classroom)?.trim();
    if (campus && room) return `${campus} · ${room}`;
    if (campus) return campus;
    if (room) return room;
    return '—';
  };

  const sede = (s: SessionRow) => s.location_campus || s.location_classroom || '—';

  const nextClassIsToday = nextClass?.date === today;

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <span className="atendee-badge-online">
          <Wifi className="h-3.5 w-3.5" strokeWidth={2.5} />
          En línea
        </span>
      </div>

      <header>
        <h1 className="text-4xl font-black uppercase tracking-tight text-[#0D1B4B]">
          HOLA, PROF. {profLastNameUpper(user)}
        </h1>
        <p className="atendee-muted mt-2">PORTAL DEL DOCENTE</p>
      </header>

      {nextClass ? (
        <section className="atendee-card border-2 border-dashed border-[#BFDBFE] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-black uppercase tracking-wider text-[#1B3FD8]">
                <Zap className="h-3.5 w-3.5" />
                {nextClassIsToday
                  ? `SIGUIENTE CLASE EN ${nextBannerTime}`
                  : `SIGUIENTE CLASE · ${nextBannerTime}`}
              </span>
              <p className="mt-4 text-2xl font-black tracking-tight text-[#0D1B4B]">
                {editionName(nextClass)}
              </p>
              <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#8A9BB5]">
                <MapPin className="h-4 w-4 shrink-0 text-[#1B3FD8]" />
                {aula(nextClass)}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#8A9BB5]">
                <Clock className="h-4 w-4 shrink-0 text-[#1B3FD8]" />
                {nextClassIsToday
                  ? `Hoy a las ${nextClass.start_time?.slice(0, 5) ?? '—'} hs`
                  : `${formatCourseStartDay(nextClass.date)} a las ${nextClass.start_time?.slice(0, 5) ?? '—'} hs`}
              </p>
              <Link
                href={`/teacher/sessions/${encodeURIComponent(nextClass.id)}`}
                className="mt-5 inline-flex w-full items-center justify-center rounded-[14px] bg-[#1B3FD8] py-3.5 text-sm font-black uppercase tracking-widest text-white md:w-auto md:px-8"
              >
                Tomar asistencia
              </Link>
            </div>
            <div className="hidden shrink-0 text-[#E2E8F0] sm:block" aria-hidden>
              <CalendarDays className="h-24 w-24" strokeWidth={1} />
            </div>
          </div>
        </section>
      ) : (
        <section className="atendee-card border-2 border-dashed border-gray-200 p-6 text-center text-sm font-semibold text-[#8A9BB5]">
          No hay clases próximas en tu agenda.
        </section>
      )}

      <section>
        <div className="flex items-center gap-3">
          <h2 className="atendee-heading text-sm">MIS CURSOS</h2>
          <div className="h-px flex-1 bg-[#CBD5E1]" />
        </div>
        <ul className="mt-4 flex flex-col gap-4">
          {courseCards.map((c) => (
            <li key={c.id} className="atendee-card p-6">
              <p className="text-lg font-black uppercase tracking-wide text-[#0D1B4B]">
                {c.name}
              </p>
              <p className="atendee-muted mt-2 font-mono text-xs font-semibold normal-case">
                ID: {editionDisplayId(c.id, c.sessionSample)}
              </p>
              <p className="atendee-muted mt-1 text-xs font-semibold normal-case">
                Inicio: {formatCourseStartDay(c.firstDate)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#8A9BB5]">
                  <Users className="h-3.5 w-3.5" />
                  {c.students} ALUMNOS
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#8A9BB5]">
                  <MapPin className="h-3.5 w-3.5" />
                  {sede(c.sessionSample)}
                </span>
              </div>
              <Link
                href={`/teacher/courses/${encodeURIComponent(c.id)}`}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-[14px] border-2 border-gray-200 bg-white py-3.5 text-sm font-black uppercase tracking-widest text-[#0D1B4B] transition hover:bg-[#F8FAFC]"
              >
                VER DETALLE
              </Link>
            </li>
          ))}
        </ul>
        {courseCards.length === 0 ? (
          <p className="mt-4 text-sm font-semibold text-[#8A9BB5]">No hay cursadas asignadas.</p>
        ) : null}
      </section>
    </div>
  );
}
