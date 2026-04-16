'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Users, Wifi } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';
import { formatCourseDisplayTitle } from '@/lib/course-display-name';
import { subscribeDashboardRefetch } from '@/lib/dashboard-refetch';
import { generateAttendancePDF } from '@/lib/teacher-attendance-pdf';
import {
  datePlusDaysLocal,
  formatShortDate,
  isSessionDatePast,
  locationLine,
  teacherDisplayFromUser,
  todayStrLocal,
} from '@/lib/teacher-session-display';

type SessionRow = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  learning_proposal_edition_id?: string;
  course_name?: string;
  name?: string;
  subject?: string;
  class_display_id?: string;
  location_classroom?: string;
  classroom?: string;
  location_campus?: string;
  learning_proposal_edition?: { name?: string; external_id?: string } | { name?: string; external_id?: string }[];
  learning_proposal?: { name?: string } | { name?: string }[];
  class_session_student?: { count?: number }[] | unknown;
};

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
  const cn = s.course_name ?? s.name ?? s.subject;
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
  return formatCourseDisplayTitle(courseName);
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

function isCancelledSession(s: SessionRow): boolean {
  return String(s.status ?? '').toLowerCase() === 'cancelled';
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
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const today = useMemo(() => todayStrLocal(), []);

  const fetchMergedSessions = useCallback(async (): Promise<SessionRow[]> => {
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
    return [...byId.values()];
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const merged = await fetchMergedSessions();
        if (!cancelled) {
          setSessions(merged);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, fetchMergedSessions]);

  useEffect(() => {
    if (!user) return () => {};
    return subscribeDashboardRefetch(() => {
      void fetchMergedSessions()
        .then((merged) => setSessions(merged))
        .catch(() => {});
    });
  }, [user, fetchMergedSessions]);

  const { nextClass, nextClassIsEstimated, courseCards } = useMemo(() => {
    const futureSessions = sessions
      .filter((s) => !isCancelledSession(s))
      .filter((s) => s.date >= today)
      .sort((a, b) => {
        const c = a.date.localeCompare(b.date);
        if (c !== 0) return c;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

    // Siempre la próxima por fecha (como en el detalle de cursada). Si ya está cerrada,
    // el CTA pasa a "Ver detalle" — no ocultar el banner entero.
    let next: SessionRow | null = futureSessions[0] ?? null;
    let nextIsEstimated = false;

    // Igual que en `/teacher/courses/[id]`: si no hay fechas futuras en el calendario pero
    // una cursada tiene todas las clases ya pasadas, mostrar próxima estimada (hoy + 7).
    if (!next && sessions.length > 0) {
      const editionRows = new Map<string, SessionRow[]>();
      for (const s of sessions) {
        const eid = s.learning_proposal_edition_id;
        if (!eid || isCancelledSession(s)) continue;
        const list = editionRows.get(eid);
        if (list) list.push(s);
        else editionRows.set(eid, [s]);
      }
      type Cand = { sorted: SessionRow[] };
      const candidates: Cand[] = [];
      for (const rows of editionRows.values()) {
        const sorted = [...rows].sort((a, b) => {
          const c = a.date.localeCompare(b.date);
          if (c !== 0) return c;
          return (a.start_time || '').localeCompare(b.start_time || '');
        });
        if (sorted.length === 0) continue;
        const allPast = sorted.every((r) => isSessionDatePast(r.date));
        if (!allPast) continue;
        candidates.push({ sorted });
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          const la = a.sorted[a.sorted.length - 1]!.date;
          const lb = b.sorted[b.sorted.length - 1]!.date;
          return lb.localeCompare(la);
        });
        const pick = candidates[0]!;
        const sorted = pick.sorted;
        const last = sorted[sorted.length - 1]!;
        const first = sorted[0]!;
        const estimatedDate = datePlusDaysLocal(7);
        next = {
          ...last,
          id: first.id,
          date: estimatedDate,
        };
        nextIsEstimated = true;
      }
    }

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
      nextClassIsEstimated: nextIsEstimated,
      courseCards: [...byEdition.values()],
    };
  }, [sessions, today]);

  const teacherForPdf = useMemo(() => teacherDisplayFromUser(user), [user]);

  if (loading) {
    return <Skeleton />;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  const sede = (s: SessionRow) => s.location_campus || s.location_classroom || '—';

  const nextClassProxima = nextClass ? !isSessionDatePast(nextClass.date) : false;

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
        <section
          className={`atendee-card relative p-5 ${
            nextClassProxima ? 'ring-2 ring-[#1B3FD8] ring-offset-2 ring-offset-[#EEF2F7]' : ''
          }`}
        >
          <div className="flex flex-wrap items-start gap-3 pr-10">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                nextClassProxima ? 'bg-[#1B3FD8] text-white' : 'bg-[#E2E8F0] text-[#64748B]'
              }`}
            >
              {nextClassProxima ? 'PRÓXIMA' : 'CERRADA'}
            </span>
            <span className="text-sm font-semibold text-[#8A9BB5]">{formatShortDate(nextClass.date)}</span>
          </div>
          <p className="mt-3 text-3xl font-black tabular-nums text-[#0D1B4B]">
            {nextClass.start_time?.slice(0, 5) ?? '—'} hs
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#8A9BB5]">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {locationLine(nextClass)}
          </p>
          <div className="mt-4 flex w-full flex-col">
            <div className="flex flex-wrap items-center gap-2">
              {nextClassProxima ? (
                <Link
                  href={`/teacher/sessions/${encodeURIComponent(nextClass.id)}`}
                  className="inline-flex flex-1 items-center justify-center rounded-[12px] bg-[#1B3FD8] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white sm:flex-none sm:min-w-[180px]"
                >
                  TOMAR ASISTENCIA
                </Link>
              ) : (
                <Link
                  href={`/teacher/sessions/${encodeURIComponent(nextClass.id)}/detail`}
                  className="inline-flex flex-1 items-center justify-center rounded-[12px] border-2 border-gray-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#0D1B4B] transition hover:bg-gray-50 sm:flex-none sm:min-w-[160px]"
                >
                  VER DETALLE
                </Link>
              )}
            </div>
            {nextClassProxima && !isCancelledSession(nextClass) && !nextClassIsEstimated ? (
              <button
                type="button"
                disabled={pdfLoadingId === nextClass.id}
                className="mt-2 w-full rounded-[12px] border border-[#1B3FD8] py-2 text-xs font-bold uppercase text-[#1B3FD8] outline outline-1 outline-[#1B3FD8] transition hover:bg-[#1B3FD8]/5 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  void (async () => {
                    setPdfLoadingId(nextClass.id);
                    try {
                      await generateAttendancePDF(
                        nextClass,
                        courseCardName(nextClass),
                        teacherForPdf,
                      );
                    } finally {
                      setPdfLoadingId(null);
                    }
                  })();
                }}
              >
                {pdfLoadingId === nextClass.id ? 'Generando...' : '↓ Descargar lista'}
              </button>
            ) : null}
          </div>
          {nextClassIsEstimated ? (
            <p className="mt-3 text-center text-[10px] font-semibold leading-tight text-[#94A3B8]">
              * Próxima clase estimada
            </p>
          ) : null}
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
