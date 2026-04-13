'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';

type EditionSession = {
  id: string;
  status: string;
  course_name?: string;
  name?: string;
  subject?: string;
  learning_proposal_edition?: { name?: string; external_id?: string } | { name?: string; external_id?: string }[];
  learning_proposal?: { name?: string } | { name?: string }[];
};

type SessionStudentRow = {
  student_id: string;
  student_name?: string | null;
  student_external_id?: string | null;
  attendance: { status?: string } | null;
};

type AggregatedStatRow = {
  student_id: string;
  student_external_id: string;
  name: string;
  present: number;
  late: number;
  absent: number;
  justified: number;
  totalSessions: number;
  percentage: number;
};

function isUnusableCourseTitle(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return true;
  if (/^CLASE\s+\d{4}-\d{2}-\d{2}\s*$/i.test(t)) return true;
  if (/^CLASE[^\w\u00C0-\u024F]*\d{4}-\d{2}-\d{2}/i.test(t)) return true;
  return false;
}

function rawProposalName(s: EditionSession): string | undefined {
  const lp = s.learning_proposal;
  const pn = Array.isArray(lp) ? lp[0]?.name : lp?.name;
  if (pn == null) return undefined;
  const t = String(pn).trim();
  return t === '' ? undefined : String(pn);
}

function rawEditionName(s: EditionSession): string | undefined {
  const le = s.learning_proposal_edition;
  const en = Array.isArray(le) ? le[0]?.name : le?.name;
  if (en == null) return undefined;
  const t = String(en).trim();
  return t === '' ? undefined : String(en);
}

function rawCourseNameField(s: EditionSession): string | undefined {
  const cn = s.course_name ?? s.name ?? s.subject;
  if (cn == null) return undefined;
  const t = String(cn).trim();
  return t === '' ? undefined : String(cn);
}

function editionHeaderId(editionId: string, s: EditionSession | undefined): string {
  if (!s) return editionId.replace(/-/g, '').slice(0, 10).toUpperCase();
  const le = s.learning_proposal_edition;
  const ext = Array.isArray(le) ? le[0]?.external_id : le?.external_id;
  const t = ext != null ? String(ext).trim() : '';
  if (t !== '') return t;
  return editionId.replace(/-/g, '').slice(0, 10).toUpperCase();
}

function courseDisplayTitle(s: EditionSession): string {
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

function isClosedSessionStatus(status: string): boolean {
  const s = String(status).toLowerCase();
  return ['attendance_closed', 'finalized', 'closed', 'synced'].includes(s);
}

function strField(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function rosterStudentLabel(row: SessionStudentRow): string {
  const r = row as unknown as Record<string, unknown>;
  const n =
    strField(row.student_name) ||
    strField(r.studentName) ||
    '';
  const ext =
    strField(row.student_external_id) ||
    strField(r.studentExternalId) ||
    '';
  const id = strField(row.student_id) || strField(r.studentId) || row.student_id;
  if (n !== '') return n;
  if (ext !== '') return ext;
  return id;
}

function aggregateEditionStats(rosters: SessionStudentRow[][]): AggregatedStatRow[] {
  type Acc = {
    name: string;
    student_external_id: string;
    present: number;
    late: number;
    absent: number;
    justified: number;
    sessionsEnrolled: number;
  };

  const map = new Map<string, Acc>();

  for (const roster of rosters) {
    for (const row of roster) {
      const r = row as unknown as Record<string, unknown>;
      const sid =
        strField(row.student_id) || strField(r.studentId) || row.student_id;
      const ext =
        strField(row.student_external_id) || strField(r.studentExternalId) || '';
      if (!map.has(sid)) {
        map.set(sid, {
          name: rosterStudentLabel(row),
          student_external_id: ext,
          present: 0,
          late: 0,
          absent: 0,
          justified: 0,
          sessionsEnrolled: 0,
        });
      }
      const agg = map.get(sid)!;
      if (ext !== '' && agg.student_external_id === '') agg.student_external_id = ext;
      agg.sessionsEnrolled += 1;
      const st = strField(row.attendance?.status).toLowerCase();
      if (st === 'present') agg.present += 1;
      else if (st === 'late') agg.late += 1;
      else if (st === 'absent') agg.absent += 1;
      else if (st === 'excused' || st === 'justified') agg.justified += 1;
      else agg.absent += 1;
    }
  }

  return [...map.entries()]
    .map(([student_id, a]) => {
      const denom = a.sessionsEnrolled;
      const pct =
        denom > 0 ? Math.round(((a.present + a.late) / denom) * 100) : 0;
      return {
        student_id,
        student_external_id: a.student_external_id || student_id,
        name: a.name,
        present: a.present,
        late: a.late,
        absent: a.absent,
        justified: a.justified,
        totalSessions: a.sessionsEnrolled,
        percentage: pct,
      };
    })
    .sort((x, y) => y.percentage - x.percentage);
}

function slugifyFilePart(name: string): string {
  const t = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return t || 'curso';
}

function csvEscapeCell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadStatsCsv(rows: AggregatedStatRow[], courseSlug: string) {
  const date = new Date().toISOString().slice(0, 10);
  const headers = [
    'Nombre',
    'ID',
    'Presentes',
    'Tardes',
    'Ausentes',
    'Justificados',
    '% Asistencia',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscapeCell(r.name),
        csvEscapeCell(r.student_external_id),
        r.present,
        r.late,
        r.absent,
        r.justified,
        r.percentage,
      ].join(','),
    );
  }
  const blob = new Blob([`\ufeff${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estadisticas-${courseSlug}-${date}.csv`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-gray-200" />
      <div className="h-40 rounded-2xl border border-gray-200 bg-gray-100" />
    </div>
  );
}

export default function TeacherEditionStatsPage() {
  const params = useParams();
  const editionId = params.editionId as string;
  const { user } = useAuth();
  const [rows, setRows] = useState<AggregatedStatRow[]>([]);
  const [courseTitle, setCourseTitle] = useState('Curso sin nombre');
  const [editionSample, setEditionSample] = useState<EditionSession | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!editionId) return;
    const sessions = await apiClient<EditionSession[]>(
      `/sessions/edition/${encodeURIComponent(editionId)}`,
    );
    const list = Array.isArray(sessions) ? sessions : [];
    if (list.length > 0) {
      setCourseTitle(courseDisplayTitle(list[0]));
      setEditionSample(list[0]);
    } else {
      setEditionSample(undefined);
      setCourseTitle('Curso sin nombre');
    }
    const closed = list.filter((s) => isClosedSessionStatus(s.status));
    if (closed.length === 0) {
      setRows([]);
      return;
    }
    const rosters = await Promise.all(
      closed.map((s) =>
        apiClient<SessionStudentRow[]>(`/sessions/${encodeURIComponent(s.id)}/students`),
      ),
    );
    const valid = rosters.map((r) => (Array.isArray(r) ? r : []));
    setRows(aggregateEditionStats(valid));
  }, [editionId]);

  useEffect(() => {
    if (!user || !editionId) return;
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar estadísticas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, editionId, load]);

  const fileSlug = useMemo(() => slugifyFilePart(courseTitle), [courseTitle]);
  const headerIdLabel = useMemo(
    () => editionHeaderId(editionId, editionSample),
    [editionId, editionSample],
  );

  if (loading) {
    return <Skeleton />;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/teacher/stats"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:bg-gray-50"
          aria-label="Volver"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-gray-900">
          ID: {headerIdLabel} · {courseTitle}
        </h1>
        <p className="text-sm text-gray-500">
          Asistencia por alumno · clases cerradas de la cursada
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => downloadStatsCsv(rows, fileSlug)}
          className="rounded-[14px] border-2 border-gray-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          DESCARGAR LISTADO
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Alumno</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">% asistencia</th>
              <th className="px-4 py-3">Presentes</th>
              <th className="px-4 py-3">Tardes</th>
              <th className="px-4 py-3">Ausentes</th>
              <th className="px-4 py-3">Justificados</th>
              <th className="px-4 py-3">Total clases</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student_id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-semibold tracking-tight text-gray-900">{r.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {r.student_external_id}
                </td>
                <td className="px-4 py-3 font-bold tabular-nums text-gray-900">{r.percentage}%</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{r.present}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{r.late}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{r.absent}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{r.justified}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{r.totalSessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          No hay clases cerradas para calcular estadísticas en esta cursada.
        </p>
      ) : null}
    </div>
  );
}
