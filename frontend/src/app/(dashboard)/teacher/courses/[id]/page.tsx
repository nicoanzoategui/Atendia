'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { CheckCircle2, ChevronLeft, MapPin, Wifi } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';

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

type SessionStudentRow = {
  student_name?: string | null;
  student_external_id?: string | null;
  student_id?: string | null;
};

function courseNameForPdf(session: ClassRow, fallbackTitle: string): string {
  return (
    rawProposalName(session) ??
    rawEditionName(session) ??
    rawCourseNameField(session) ??
    fallbackTitle
  );
}

function formatDateDDMMYYYY(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map((x) => Number(x));
  if (!y || !m || !d) return isoDate;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function timeRange(session: ClassRow): string {
  const a = session.start_time?.slice(0, 5) ?? '—';
  const b = session.end_time?.slice(0, 5) ?? '—';
  return `${a} - ${b}`;
}

function teacherDisplayFromUser(
  user: { email?: string; full_name?: string; name?: string } | null,
): string {
  if (!user) return '—';
  const n = (user.full_name ?? user.name ?? '').trim();
  if (n) return n;
  return (user.email ?? '—').trim() || '—';
}

async function generateAttendancePDF(
  session: ClassRow,
  courseTitle: string,
  teacherLabel: string,
): Promise<void> {
  const students = await apiClient<SessionStudentRow[]>(
    `/sessions/${encodeURIComponent(session.id)}/students`,
  );
  const list = Array.isArray(students) ? students : [];

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const pageBottom = pageH - 24;
  let y = 18;

  const courseLine = courseNameForPdf(session, courseTitle);
  const dateStr = formatDateDDMMYYYY(session.date);
  const horario = timeRange(session);
  const aula = session.location_classroom || session.classroom || '—';
  const sede = session.location_campus || '—';

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('LISTA DE ASISTENCIA', margin, y);
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  for (const line of [
    `Curso: ${courseLine}`,
    `Fecha: ${dateStr}`,
    `Horario: ${horario}`,
    `Aula: ${aula}`,
    `Sede: ${sede}`,
    `Docente: ${teacherLabel}`,
  ]) {
    doc.text(line, margin, y);
    y += 5.5;
  }
  y += 5;

  const col = { num: 20, name: 80, id: 40, p: 30, a: 30, j: 35 } as const;
  const sum = col.num + col.name + col.id + col.p + col.a + col.j;
  const scale = contentW / sum;
  const W = {
    num: col.num * scale,
    name: col.name * scale,
    id: col.id * scale,
    p: col.p * scale,
    a: col.a * scale,
    j: col.j * scale,
  };
  const rowH = 7;
  const headerH = 8;
  const headerLabels: [string, number][] = [
    ['N°', W.num],
    ['Nombre', W.name],
    ['ID', W.id],
    ['Presente', W.p],
    ['Ausente', W.a],
    ['Justificado', W.j],
  ];

  const drawHeaderRow = (top: number) => {
    doc.setFillColor(230, 235, 245);
    doc.setDrawColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    let cx = margin;
    for (const [label, w] of headerLabels) {
      doc.rect(cx, top, w, headerH, 'FD');
      doc.text(label, cx + 1, top + 5.2);
      cx += w;
    }
    doc.setFont('helvetica', 'normal');
    return top + headerH;
  };

  y = drawHeaderRow(y);

  const studentLabel = (s: SessionStudentRow, i: number) => {
    const ext = s.student_external_id != null ? String(s.student_external_id) : '';
    const nm =
      s.student_name != null && String(s.student_name).trim() !== ''
        ? String(s.student_name).trim()
        : ext
          ? `Alumno ${ext}`
          : `Alumno ${i + 1}`;
    return { nm, ext: ext || '—' };
  };

  list.forEach((s, i) => {
    if (y + rowH > pageBottom) {
      doc.addPage();
      y = 18;
      y = drawHeaderRow(y);
    }
    const { nm, ext } = studentLabel(s, i);
    doc.setDrawColor(60, 60, 60);
    doc.setFontSize(8);
    let cx = margin;
    doc.rect(cx, y, W.num, rowH, 'S');
    doc.text(String(i + 1), cx + 1.5, y + 4.8);
    cx += W.num;
    doc.rect(cx, y, W.name, rowH, 'S');
    doc.text(nm, cx + 1, y + 4.8, { maxWidth: W.name - 2 });
    cx += W.name;
    doc.rect(cx, y, W.id, rowH, 'S');
    doc.text(ext, cx + 1, y + 4.8, { maxWidth: W.id - 2 });
    cx += W.id;
    doc.rect(cx, y, W.p, rowH, 'S');
    cx += W.p;
    doc.rect(cx, y, W.a, rowH, 'S');
    cx += W.a;
    doc.rect(cx, y, W.j, rowH, 'S');
    y += rowH;
  });

  y += 8;
  if (y + 22 > pageBottom) {
    doc.addPage();
    y = 18;
  }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total alumnos: ${list.length}`, margin, y);
  y += 7;
  doc.text('Firma del docente: ________________', margin, y);
  y += 7;
  const genAt = new Date().toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Generado por Atendee · ${genAt}`, margin, y);

  doc.save(`lista-asistencia-${session.date}.pdf`);
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
  return (
    pick(rawProposalName(s)) ??
    pick(rawEditionName(s)) ??
    pick(rawCourseNameField(s)) ??
    'Curso sin nombre'
  );
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

function todayStrLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSessionDatePast(sessionDate: string): boolean {
  return sessionDate < todayStrLocal();
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

function formatShortDate(isoDate: string) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
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

  const locationLine = (row: ClassRow) => {
    const parts = [row.location_campus, row.location_classroom || row.classroom].filter(Boolean);
    return (parts.length ? parts.join(' • ') : '—').toUpperCase();
  };

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
                {row.status !== 'cancelled' ? (
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
