'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';

type HistoryRow = {
  id: string;
  date: string;
  class_display_id: string;
  course_name: string;
  teacher: string;
  status: string;
};

export default function AdminHistoryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient<HistoryRow[]>('/admin/history');
        if (!cancelled) setRows(data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar historial');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando historial…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-gray-900">Historial</h1>
      <p className="mt-1 text-sm text-gray-500">Clases cerradas y estado administrativo.</p>
      <ul className="mt-6 flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm"
          >
            <p className="font-semibold text-gray-900">{r.class_display_id}</p>
            <p className="text-gray-600">{r.course_name}</p>
            <p className="text-gray-500">
              {r.date} · {r.teacher} · {r.status}
            </p>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="mt-6 text-sm text-gray-500">Sin registros.</p> : null}
    </div>
  );
}
