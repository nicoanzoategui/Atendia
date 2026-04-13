'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';

type ClassRow = {
  id: string;
  date: string;
  start_time?: string;
  status: string;
  class_display_id?: string;
  course_name?: string;
  name?: string;
  subject?: string;
};

export default function AdminCourseClassesPage() {
  const params = useParams();
  const editionId = params.id as string;
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !editionId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient<ClassRow[]>(`/admin/courses/${encodeURIComponent(editionId)}/classes`);
        if (!cancelled) setClasses(data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar clases');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, editionId]);

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando clases…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-gray-900">Clases</h1>
      <p className="mt-1 text-sm text-gray-500">Cursada: {editionId}</p>
      <ul className="mt-6 flex flex-col gap-2">
        {classes.map((row) => (
          <li key={row.id}>
            <Link
              href={`/admin/classes/${encodeURIComponent(row.id)}`}
              className="flex flex-col rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:border-gray-300 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-semibold text-gray-900">
                {row.class_display_id || row.name || row.subject || 'Clase'}
              </span>
              <span className="text-sm text-gray-500">
                {row.date}
                {row.start_time ? ` · ${row.start_time.slice(0, 5)}` : ''} · {row.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {classes.length === 0 ? <p className="mt-6 text-sm text-gray-500">No hay clases en esta cursada.</p> : null}
    </div>
  );
}
