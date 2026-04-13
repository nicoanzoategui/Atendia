'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronLeft, Wifi } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';

type SessionDetail = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
  learning_proposal_edition_id?: string;
};

type StudentRow = {
  student_id: string;
  student_name?: string | null;
  student_external_id?: string | null;
  attendance: { status?: string; method?: string; student_id?: string } | null;
  app_user?: { email?: string } | null;
};

function studentAppUserEmail(row: StudentRow): string | undefined {
  const u = row.app_user;
  if (u == null || Array.isArray(u)) return undefined;
  const e = u.email != null ? String(u.email).trim() : '';
  return e !== '' ? e : undefined;
}

/** Nombre visible: student_name, si falta student_external_id, luego email del alumno. */
function studentDisplayName(row: StudentRow): string {
  const n = row.student_name != null ? String(row.student_name).trim() : '';
  if (n !== '') return n;
  const ext = row.student_external_id != null ? String(row.student_external_id).trim() : '';
  if (ext !== '') return ext;
  const email = studentAppUserEmail(row);
  if (email) return email;
  return row.student_id;
}

/** Solo inicial de student_name (nunca email ni otros campos). */
function studentAvatarInitial(row: StudentRow): string {
  const name = row.student_name != null ? String(row.student_name).trim() : '';
  if (name === '') return '?';
  const ch = name.charAt(0);
  return ch !== '' ? ch.toUpperCase() : '?';
}

function studentIdLine(s: StudentRow): string {
  const ext = s.student_external_id != null ? String(s.student_external_id).trim() : '';
  return ext !== '' ? ext : s.student_id;
}

function attendanceBadge(status: string | undefined | null) {
  const st = status?.toLowerCase();
  if (!st) {
    return (
      <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#64748B]">
        SIN REGISTRO
      </span>
    );
  }
  if (st === 'present') {
    return (
      <span className="rounded-full bg-[#DCFCE7] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#16A34A]">
        PRESENTE
      </span>
    );
  }
  if (st === 'late') {
    return (
      <span className="rounded-full bg-[#FEF9C3] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#CA8A04]">
        TARDE
      </span>
    );
  }
  if (st === 'absent') {
    return (
      <span className="rounded-full bg-[#FEE2E2] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#DC2626]">
        AUSENTE
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#64748B]">
      SIN REGISTRO
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-white/80" />
      <div className="h-32 rounded-[20px] bg-white/80" />
    </div>
  );
}

export default function TeacherSessionDetailReadonlyPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const sessionPath = `/sessions/${encodeURIComponent(sessionId)}`;
        const studentsPath = `/sessions/${encodeURIComponent(sessionId)}/students`;
        const [s, data] = await Promise.all([
          apiClient<SessionDetail>(sessionPath),
          apiClient<StudentRow[]>(studentsPath),
        ]);
        // eslint-disable-next-line no-console -- debug roster shape from API
        console.log('Students response:', JSON.stringify(data, null, 2));
        if (!cancelled) {
          setSession(s);
          setStudents(Array.isArray(data) ? data : []);
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
  }, [user, sessionId]);

  const backHref =
    session?.learning_proposal_edition_id != null
      ? `/teacher/courses/${encodeURIComponent(session.learning_proposal_edition_id)}`
      : '/teacher/courses';

  if (loading) {
    return <Skeleton />;
  }
  if (error && !session) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  const recStatus = (s: StudentRow) => s.attendance?.status;

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <span className="atendee-badge-online">
          <Wifi className="h-3.5 w-3.5" strokeWidth={2.5} />
          En línea
        </span>
      </div>

      <header className="space-y-2">
        <Link
          href={backHref}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-[#8A9BB5] shadow-sm transition hover:bg-[#F8FAFC]"
          aria-label="Volver"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </Link>
        <h1 className="atendee-heading text-2xl md:text-3xl">DETALLE DE CLASE</h1>
        {session ? (
          <p className="text-sm font-bold text-[#8A9BB5]">
            {session.date}
            {session.start_time ? ` · ${session.start_time.slice(0, 5)} hs` : ''}
            {session.end_time ? ` – ${session.end_time.slice(0, 5)} hs` : ''}
          </p>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-[16px] border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {students.map((s) => {
          const initial = studentAvatarInitial(s);
          return (
            <li key={s.student_id} className="atendee-card flex items-center gap-4 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EEF2F7] text-sm font-black text-[#1B3FD8]">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#0D1B4B]">{studentDisplayName(s)}</p>
                <p className="atendee-muted mt-0.5 font-mono text-[10px] normal-case">
                  ID: {studentIdLine(s)}
                </p>
              </div>
              <div className="shrink-0">{attendanceBadge(recStatus(s))}</div>
            </li>
          );
        })}
      </ul>
      {students.length === 0 ? (
        <p className="text-sm font-semibold text-[#8A9BB5]">No hay alumnos en el roster.</p>
      ) : null}
    </div>
  );
}
