'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient, apiDownloadBlob } from '@/lib/api/client';

type ClassDetail = {
  class_session: {
    id: string;
    date: string;
    start_time?: string;
    status: string;
    course_name?: string;
    class_display_id?: string;
  };
  teacher: string;
  students: {
    student_id: string;
    name: string;
    email: string;
    status: string;
  }[];
};

const STATUSES = ['present', 'late', 'absent', 'justified'] as const;

export default function AdminClassDetailPage() {
  const params = useParams();
  const classId = params.id as string;
  const { user } = useAuth();
  const [data, setData] = useState<ClassDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) return;
    const d = await apiClient<ClassDetail>(`/admin/classes/${encodeURIComponent(classId)}`);
    setData(d);
  }, [classId]);

  useEffect(() => {
    if (!user || !classId) return;
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar la clase');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, classId, load]);

  async function handleExport() {
    if (!classId) return;
    setExporting(true);
    try {
      const blob = await apiDownloadBlob(`/admin/classes/${encodeURIComponent(classId)}/export?type=students`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clase-${classId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setExporting(false);
    }
  }

  async function updateStatus(studentId: string, status: string) {
    if (!classId) return;
    setUpdatingId(studentId);
    setError(null);
    try {
      await apiClient(`/admin/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando…</p>;
  }
  if (error && !data) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!data) {
    return null;
  }

  const session = data.class_session;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900">
            {session.class_display_id || session.course_name || 'Clase'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {session.date}
            {session.start_time ? ` · ${session.start_time.slice(0, 5)}` : ''} · {session.status}
          </p>
          <p className="text-sm text-gray-600">Docente: {data.teacher}</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {exporting ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <h2 className="mt-8 text-xs font-bold uppercase tracking-wider text-gray-500">Estudiantes</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {data.students.map((s) => (
          <li
            key={s.student_id}
            className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold text-gray-900">{s.name || s.email}</p>
              <p className="text-xs text-gray-500">{s.email}</p>
              <p className="text-xs text-gray-500">Estado: {s.status}</p>
            </div>
            <select
              className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
              value={s.status === 'excused' ? 'justified' : s.status}
              disabled={updatingId === s.student_id}
              onChange={(e) => updateStatus(s.student_id, e.target.value)}
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
