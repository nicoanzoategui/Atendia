'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';

type CourseRow = { id: string; name: string };

export default function AdminCoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient<CourseRow[]>('/admin/courses');
        if (!cancelled) setCourses(data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar cursos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando cursos…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-gray-900">Cursos</h1>
      <p className="mt-1 text-sm text-gray-500">Seleccioná una cursada para ver las clases.</p>
      <ul className="mt-6 flex flex-col gap-2">
        {courses.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/courses/${encodeURIComponent(c.id)}`}
              className="block rounded-xl border border-gray-200 bg-white px-4 py-4 font-semibold text-gray-900 shadow-sm transition hover:border-gray-300"
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
      {courses.length === 0 ? <p className="mt-6 text-sm text-gray-500">No hay cursos disponibles.</p> : null}
    </div>
  );
}
