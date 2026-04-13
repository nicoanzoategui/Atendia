'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';

type SessionRow = {
  id: string;
  date: string;
  start_time?: string;
  status: string;
  class_display_id?: string;
  course_name?: string;
  learning_proposal_edition_id?: string;
};

function SessionsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const editionFilter = searchParams.get('editionId');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient<SessionRow[]>('/sessions/today');
        if (!cancelled) setSessions(data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar sesiones');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const filtered = useMemo(() => {
    let list = sessions;
    if (editionFilter) {
      list = list.filter((s) => s.learning_proposal_edition_id === editionFilter);
    }
    const todayOnes = list.filter((s) => s.date === todayStr);
    return { todayOnes, rest: list.filter((s) => s.date !== todayStr) };
  }, [sessions, editionFilter, todayStr]);

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando sesiones…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  function renderList(items: SessionRow[], title: string) {
    if (items.length === 0) return null;
    return (
      <>
        <h2 className="mt-8 text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((s) => (
            <li key={s.id}>
              <Link
                href={`/teacher/sessions/${encodeURIComponent(s.id)}`}
                className="flex flex-col rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:border-gray-300 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-semibold text-gray-900">
                  {s.class_display_id || s.course_name || 'Clase'}
                </span>
                <span className="text-sm text-gray-500">
                  {s.date}
                  {s.start_time ? ` · ${s.start_time.slice(0, 5)}` : ''} · {s.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-gray-900">Sesiones</h1>
      {editionFilter ? (
        <p className="mt-1 text-sm text-gray-500">Filtrado por cursada · {editionFilter}</p>
      ) : (
        <p className="mt-1 text-sm text-gray-500">Hoy: {todayStr}</p>
      )}
      {renderList(filtered.todayOnes, 'Hoy')}
      {renderList(filtered.rest, editionFilter ? 'Otras fechas' : 'Otras fechas')}
      {sessions.length === 0 ? <p className="mt-6 text-sm text-gray-500">No hay sesiones.</p> : null}
      {sessions.length > 0 && filtered.todayOnes.length === 0 && filtered.rest.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">Nada que mostrar con este filtro.</p>
      ) : null}
    </div>
  );
}

export default function TeacherSessionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Cargando…</p>}>
      <SessionsContent />
    </Suspense>
  );
}
