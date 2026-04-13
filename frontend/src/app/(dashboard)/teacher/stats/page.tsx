'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';

type SessionRow = {
  learning_proposal_edition_id?: string;
  course_name?: string;
  name?: string;
  subject?: string;
  learning_proposal_edition?: { name?: string } | { name?: string }[];
  learning_proposal?: { name?: string } | { name?: string }[];
};

type AdminCourseItem = { id: string; name: string };

type MyCourseEdition = {
  id: string;
  name: string;
  external_id?: string | null;
  learning_proposal?: { name?: string } | { name?: string }[];
};

type MyCourseResponse = {
  edition: MyCourseEdition | null;
  sessions: unknown[];
};

function isUnusableCourseTitle(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return true;
  if (/^CLASE\s+\d{4}-\d{2}-\d{2}\s*$/i.test(t)) return true;
  if (/^CLASE[^\w\u00C0-\u024F]*\d{4}-\d{2}-\d{2}/i.test(t)) return true;
  return false;
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
  const cn = s.course_name ?? s.name ?? s.subject;
  if (cn == null) return undefined;
  const t = String(cn).trim();
  return t === '' ? undefined : String(cn);
}

function courseDisplayTitle(s: SessionRow): string {
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

function titleFromAdminCourse(c: AdminCourseItem): string {
  const pick = (v: string | undefined) => {
    if (v == null) return undefined;
    const t = v.trim();
    if (!t || isUnusableCourseTitle(t)) return undefined;
    return v;
  };
  return pick(c.name) ?? 'Curso sin nombre';
}

function titleFromMyCourseEdition(ed: MyCourseEdition): string {
  const lp = ed.learning_proposal;
  const proposal = Array.isArray(lp) ? lp[0]?.name : lp?.name;
  const pick = (v: string | undefined) => {
    if (v == null) return undefined;
    const t = v.trim();
    if (!t || isUnusableCourseTitle(t)) return undefined;
    return v;
  };
  return pick(typeof proposal === 'string' ? proposal : undefined) ?? pick(ed.name) ?? 'Curso sin nombre';
}

function shortEditionId(id: string, externalId?: string | null): string {
  const ext = externalId != null ? String(externalId).trim() : '';
  if (ext !== '') return ext;
  return id.replace(/-/g, '').slice(0, 10).toUpperCase();
}

export default function TeacherStatsHubPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<{ id: string; name: string; displayId: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        let list: { id: string; name: string; displayId: string }[] = [];

        try {
          const adminList = await apiClient<AdminCourseItem[]>('/admin/courses');
          if (Array.isArray(adminList) && adminList.length > 0) {
            list = adminList
              .filter((c) => c.id)
              .map((c) => ({
                id: String(c.id),
                name: titleFromAdminCourse(c),
                displayId: shortEditionId(String(c.id)),
              }));
          }
        } catch {
          /* docente suele no tener rol admin */
        }

        if (list.length === 0) {
          try {
            const my = await apiClient<MyCourseResponse | null>('/sessions/my-course');
            if (my?.edition?.id) {
              const ed = my.edition;
              list = [
                {
                  id: ed.id,
                  name: titleFromMyCourseEdition(ed),
                  displayId: shortEditionId(ed.id, ed.external_id),
                },
              ];
            }
          } catch {
            /* rol student-only */
          }
        }

        if (list.length === 0) {
          const sessions = await apiClient<SessionRow[]>('/sessions/today');
          const map = new Map<string, string>();
          for (const s of sessions ?? []) {
            const eid = s.learning_proposal_edition_id;
            if (!eid) continue;
            if (!map.has(eid)) map.set(eid, courseDisplayTitle(s));
          }
          list = [...map.entries()].map(([id, name]) => ({
            id,
            name,
            displayId: shortEditionId(id),
          }));
        }

        if (!cancelled) setCourses(list);
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

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-8 w-48 rounded-lg bg-gray-200" />
        <div className="h-20 rounded-2xl border border-gray-200 bg-gray-100" />
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/teacher/courses"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:bg-gray-50"
          aria-label="Volver a mis clases"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-gray-900">Estadísticas</h1>
        <p className="text-sm text-gray-500">Elegí un curso (cursada) para ver el detalle por alumno.</p>
      </header>
      <ul className="flex flex-col gap-3">
        {courses.map((c) => (
          <li key={c.id}>
            <Link
              href={`/teacher/stats/${encodeURIComponent(c.id)}`}
              className="block rounded-2xl border border-gray-200 bg-white px-4 py-4 font-semibold tracking-tight text-gray-900 shadow-sm transition hover:border-gray-300"
            >
              ID: {c.displayId} · {c.name}
            </Link>
          </li>
        ))}
      </ul>
      {courses.length === 0 ? (
        <p className="text-sm text-gray-500">No hay cursos disponibles para estadísticas.</p>
      ) : null}
    </div>
  );
}
