'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, MapPin, Wifi } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';
import { formatCourseDisplayTitle } from '@/lib/course-display-name';
import { generateAttendancePDF } from '@/lib/teacher-attendance-pdf';
import {
  formatShortDate,
  isSessionDatePast,
  locationLine,
  teacherDisplayFromUser,
} from '@/lib/teacher-session-display';

const TEACHER_DEMO_EXTRA_SESSIONS = 5;

function isTeacherDemoCalendarUser(user: { email?: string } | null): boolean {
  return (user?.email?.toLowerCase().includes('@demo.') ?? false) === true;
}

function addCalendarDays(ymd: string, deltaDays: number): string {
  const [y, mo, d] = ymd.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function isSameLocalCalendarDay(ymd: string, when = new Date()): boolean {
  const yy = when.getFullYear();
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  const dd = String(when.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}` === ymd;
}

/** Habilita CTAs el día de la clase desde 8 h antes del horario de inicio (hora local). */
function demoLockedSessionActionsEnabled(
  dateYmd: string,
  startTime: string | undefined,
  nowMs: number,
): boolean {
  if (!startTime || startTime.length < 5) return false;
  const [y, mo, d] = dateYmd.split('-').map(Number);
  const [hh, mm] = startTime.slice(0, 5).split(':').map(Number);
  const classStartMs = new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();
  const opensMs = classStartMs - 8 * 60 * 60 * 1000;
  return nowMs >= opensMs && isSameLocalCalendarDay(dateYmd, new Date(nowMs));
}

type ClassRow = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
  status: string;
  class_display_id?: string;
  course_name?: string;
  name?: string;
  subject?: string;
  location_classroom?: string;
  classroom?: string;
  location_campus?: string;
  learning_proposal_edition?: { name?: string } | { name?: string }[];
  learning_proposal?: { name?: string } | { name?: string }[];
  class_session_teacher?: ClassSessionTeacherRow[] | ClassSessionTeacherRow | null;
};

type TeacherAppUser = { email?: string; full_name?: string; name?: string };

type ClassSessionTeacherRow = {
  teacher_id?: string;
  teacher_external_id?: string;
  app_user?: TeacherAppUser | TeacherAppUser[];
};

function rawProposalName(s: ClassRow): string | undefined {
  const lp = s.learning_proposal;
  const pn = Array.isArray(lp) ? lp[0]?.name : lp?.name;
  if (pn == null) return undefined;
  const t = String(pn).trim();
  return t === '' ? undefined : String(pn);
}

function rawEditionName(s: ClassRow): string | undefined {
  const le = s.learning_proposal_edition;
  const en = Array.isArray(le) ? le[0]?.name : le?.name;
  if (en == null) return undefined;
  const t = String(en).trim();
  return t === '' ? undefined : String(en);
}

function rawCourseNameField(s: ClassRow): string | undefined {
  const cn = s.course_name ?? s.name ?? s.subject;
  if (cn == null) return undefined;
  const t = String(cn).trim();
  return t === '' ? undefined : String(cn);
}

function isUnusableCourseTitle(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return true;
  if (/^CLASE\s+\d{4}-\d{2}-\d{2}\s*$/i.test(t)) return true;
  if (/^CLASE[^\w\u00C0-\u024F]*\d{4}-\d{2}-\d{2}/i.test(t)) return true;
  return false;
}

function coursePageTitle(rows: ClassRow[]): string {
  const s = rows[0];
  if (!s) return 'Curso sin nombre';
  const pick = (v: string | undefined) => {
    if (v == null) return undefined;
    const t = v.trim();
    if (!t || isUnusableCourseTitle(t)) return undefined;
    return v;
  };
  const raw =
    pick(rawProposalName(s)) ??
    pick(rawEditionName(s)) ??
    pick(rawCourseNameField(s)) ??
    'Curso sin nombre';
  return formatCourseDisplayTitle(raw);
}

function normalizeTeachers(raw: ClassRow['class_session_teacher']): ClassSessionTeacherRow[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function teacherRowLabel(row: ClassSessionTeacherRow): string | null {
  const u = row.app_user;
  const email = Array.isArray(u) ? u[0]?.email : u?.email;
  const fullName = Array.isArray(u) ? u[0]?.full_name ?? u[0]?.name : u?.full_name ?? u?.name;
  const name = fullName != null && String(fullName).trim() !== '' ? String(fullName).trim() : null;
  if (name) return name;
  if (email != null && String(email).trim() !== '') return String(email).trim();
  return null;
}

function teachersSubtitle(rows: ClassRow[]): string {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const session of rows) {
    for (const t of normalizeTeachers(session.class_session_teacher)) {
      const label = teacherRowLabel(t);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
  }
  if (labels.length === 0) return 'Docente';
  return labels.join(' · ');
}

function sessionSortKey(r: ClassRow) {
  return `${r.date}T${(r.start_time || '00:00').slice(0, 5)}`;
}

/** YYYY-MM-DD local, hoy + `days`. */
function datePlusDaysLocal(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="mx-auto h-6 w-28 rounded-full bg-white/80" />
      <div className="h-10 w-48 rounded-xl bg-white/80" />
      <div className="h-24 rounded-[20px] bg-white/80" />
      <div className="h-24 rounded-[20px] bg-white/80" />
    </div>
  );
}

export default function TeacherCourseEditionPage() {
  const params = useParams();
  const editionId = params.id as string;
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [demoNowMs, setDemoNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setDemoNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user || !editionId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient<ClassRow[]>(
          `/sessions/edition/${encodeURIComponent(editionId)}`,
        );
        if (!cancelled) setClasses(data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, editionId]);

  const title = useMemo(() => coursePageTitle(classes), [classes]);
  const teachersLine = useMemo(() => teachersSubtitle(classes), [classes]);
  const teacherForPdf = useMemo(() => teacherDisplayFromUser(user), [user]);

  const sorted = useMemo(
    () => [...classes].sort((a, b) => sessionSortKey(a).localeCompare(sessionSortKey(b))),
    [classes],
  );

  const allSessionsClosed =
    sorted.length > 0 && sorted.every((row) => isSessionDatePast(row.date));
  const lastSessionForDemo = sorted[sorted.length - 1];
  const firstSessionIdForFlow = sorted[0]?.id;
  const estimatedNextDate = datePlusDaysLocal(7);

  const firstFutureSession = useMemo(
    () => sorted.find((r) => !isSessionDatePast(r.date)),
    [sorted],
  );

  const demoLockedFuturePlaceholders = useMemo(() => {
    if (!isTeacherDemoCalendarUser(user) || !firstFutureSession) return [];
    const taken = new Set(sorted.map((s) => s.date));
    const out: { key: string; date: string; start_time?: string }[] = [];
    let offset = 7;
    while (out.length < TEACHER_DEMO_EXTRA_SESSIONS && offset <= 7 * 52) {
      const candidate = addCalendarDays(firstFutureSession.date, offset);
      if (!taken.has(candidate)) {
        taken.add(candidate);
        out.push({
          key: `__demo_locked_${out.length}_${candidate}`,
          date: candidate,
          start_time: firstFutureSession.start_time,
        });
      }
      offset += 7;
    }
    return out;
  }, [sorted, user, firstFutureSession]);

  const flowSessionForDemoExtras = firstFutureSession ?? sorted[0];

  if (loading) {
    return <Skeleton />;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <span className="atendee-badge-online">
          <Wifi className="h-3.5 w-3.5" strokeWidth={2.5} />
          En línea
        </span>
      </div>

      <header className="space-y-2">
        <Link
          href="/teacher/courses"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-[#8A9BB5] shadow-sm transition hover:bg-[#F8FAFC]"
          aria-label="Volver"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </Link>
        <h1 className="text-2xl font-black uppercase tracking-wide text-[#0D1B4B]">{title}</h1>
        <p className="atendee-muted">{teachersLine}</p>
      </header>

      <div className="flex items-center gap-3">
        <h2 className="atendee-heading text-sm">CALENDARIO DE CLASES</h2>
        <div className="h-px flex-1 bg-[#CBD5E1]" />
      </div>

      <ul className="flex flex-col gap-4">
        {sorted.map((row) => {
          const cerrada = isSessionDatePast(row.date);
          const proxima = !cerrada;
          return (
            <li
              key={row.id}
              className={`atendee-card relative p-5 ${
                proxima ? 'ring-2 ring-[#1B3FD8] ring-offset-2 ring-offset-[#EEF2F7]' : ''
              }`}
            >
              {cerrada ? (
                <div className="absolute right-4 top-4 text-[#16A34A]">
                  <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
                </div>
              ) : null}
              <div className="flex flex-wrap items-start gap-3 pr-10">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                    proxima ? 'bg-[#1B3FD8] text-white' : 'bg-[#E2E8F0] text-[#64748B]'
                  }`}
                >
                  {proxima ? 'PRÓXIMA' : 'CERRADA'}
                </span>
                <span className="text-sm font-semibold text-[#8A9BB5]">
                  {formatShortDate(row.date)}
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-[#0D1B4B]">
                {row.start_time?.slice(0, 5) ?? '—'} hs
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#8A9BB5]">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {locationLine(row)}
              </p>
              <div className="mt-4 flex w-full flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  {proxima ? (
                    <Link
                      href={`/teacher/sessions/${encodeURIComponent(row.id)}`}
                      className="inline-flex flex-1 items-center justify-center rounded-[12px] bg-[#1B3FD8] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white sm:flex-none sm:min-w-[180px]"
                    >
                      TOMAR ASISTENCIA
                    </Link>
                  ) : (
                    <Link
                      href={`/teacher/sessions/${encodeURIComponent(row.id)}/detail`}
                      className="inline-flex flex-1 items-center justify-center rounded-[12px] border-2 border-gray-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#0D1B4B] transition hover:bg-gray-50 sm:flex-none sm:min-w-[160px]"
                    >
                      VER DETALLE
                    </Link>
                  )}
                </div>
                {proxima && String(row.status ?? '').toLowerCase() !== 'cancelled' ? (
                  <button
                    type="button"
                    disabled={pdfLoadingId === row.id}
                    className="mt-2 w-full rounded-[12px] border border-[#1B3FD8] py-2 text-xs font-bold uppercase text-[#1B3FD8] outline outline-1 outline-[#1B3FD8] transition hover:bg-[#1B3FD8]/5 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      void (async () => {
                        setPdfLoadingId(row.id);
                        try {
                          await generateAttendancePDF(row, title, teacherForPdf);
                        } finally {
                          setPdfLoadingId(null);
                        }
                      })();
                    }}
                  >
                    {pdfLoadingId === row.id ? 'Generando...' : '↓ Descargar lista'}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
        {demoLockedFuturePlaceholders.map((demo) => {
          const actionsOn = demoLockedSessionActionsEnabled(demo.date, demo.start_time, demoNowMs);
          const flowId = flowSessionForDemoExtras?.id;
          const locRow = flowSessionForDemoExtras ?? lastSessionForDemo;
          return (
            <li key={demo.key} className="atendee-card relative p-5">
              <div className="flex flex-wrap items-start gap-3 pr-10">
                <span className="rounded-full bg-[#E2E8F0] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#64748B]">
                  PRÓXIMA
                </span>
                <span className="text-sm font-semibold text-[#8A9BB5]">
                  {formatShortDate(demo.date)}
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-[#0D1B4B]">
                {demo.start_time?.slice(0, 5) ?? '—'} hs
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#8A9BB5]">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {locRow ? locationLine(locRow) : '—'}
              </p>
              <div className="mt-4 flex w-full flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  {actionsOn && flowId ? (
                    <Link
                      href={`/teacher/sessions/${encodeURIComponent(flowId)}`}
                      className="inline-flex flex-1 items-center justify-center rounded-[12px] bg-[#1B3FD8] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white sm:flex-none sm:min-w-[180px]"
                    >
                      TOMAR ASISTENCIA
                    </Link>
                  ) : (
                    <span
                      className="inline-flex flex-1 cursor-not-allowed items-center justify-center rounded-[12px] bg-[#1B3FD8]/35 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white/90 sm:flex-none sm:min-w-[180px]"
                      aria-disabled
                    >
                      TOMAR ASISTENCIA
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!actionsOn || pdfLoadingId === demo.key || !flowId}
                  className={`mt-2 w-full rounded-[12px] border py-2 text-xs font-bold uppercase outline outline-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    actionsOn
                      ? 'border-[#1B3FD8] text-[#1B3FD8] outline-[#1B3FD8] hover:bg-[#1B3FD8]/5'
                      : 'border-[#CBD5E1] text-[#94A3B8] outline-[#E2E8F0]'
                  }`}
                  onClick={() => {
                    if (!actionsOn || !flowSessionForDemoExtras) return;
                    void (async () => {
                      setPdfLoadingId(demo.key);
                      try {
                        await generateAttendancePDF(
                          flowSessionForDemoExtras,
                          title,
                          teacherForPdf,
                        );
                      } finally {
                        setPdfLoadingId(null);
                      }
                    })();
                  }}
                >
                  {pdfLoadingId === demo.key ? 'Generando...' : '↓ Descargar lista'}
                </button>
                {!actionsOn ? (
                  <p className="atendee-muted mt-2 text-center text-[10px] font-semibold leading-tight">
                    Se habilitan desde 8 h antes del inicio, el día de la clase (vista demo).
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
        {allSessionsClosed && firstSessionIdForFlow && lastSessionForDemo ? (
          <>
            <li
              key="__estimated_next_class__"
              className="atendee-card relative p-5 ring-2 ring-[#1B3FD8] ring-offset-2 ring-offset-[#EEF2F7]"
            >
              <div className="flex flex-wrap items-start gap-3 pr-10">
                <span className="rounded-full bg-[#1B3FD8] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  PRÓXIMA
                </span>
                <span className="text-sm font-semibold text-[#8A9BB5]">
                  {formatShortDate(estimatedNextDate)}
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-[#0D1B4B]">
                {lastSessionForDemo.start_time?.slice(0, 5) ?? '—'} hs
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#8A9BB5]">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {locationLine(lastSessionForDemo)}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href={`/teacher/sessions/${encodeURIComponent(firstSessionIdForFlow)}`}
                  className="inline-flex flex-1 items-center justify-center rounded-[12px] bg-[#1B3FD8] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white sm:flex-none sm:min-w-[180px]"
                >
                  TOMAR ASISTENCIA
                </Link>
              </div>
            </li>
            <li key="__estimated_next_class_note__" className="list-none p-0">
              <p className="text-center text-[10px] font-semibold leading-tight text-[#94A3B8]">
                * Próxima clase estimada
              </p>
            </li>
          </>
        ) : null}
      </ul>
      {classes.length === 0 ? (
        <p className="text-sm font-semibold text-[#8A9BB5]">No hay clases en esta cursada.</p>
      ) : null}
    </div>
  );
}
