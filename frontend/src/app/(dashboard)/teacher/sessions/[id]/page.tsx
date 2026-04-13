'use client';

import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cloud,
  Link2,
  Loader2,
  MessageCircle,
  QrCode,
  Share2,
  Wifi,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { apiClient } from '@/lib/api/client';
import { getAuthToken } from '@/lib/db/indexed-db';
import { useQrRotation } from '@/lib/hooks/use-qr-rotation';
import { useRealtimeAttendance } from '@/lib/hooks/use-realtime-attendance';
import { getPendingAttendance, savePendingAttendance } from '@/lib/db/pending-attendance-store';
import { SyncManager } from '@/lib/sync/sync-manager';

type SessionDetail = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
  status: string;
  class_display_id?: string;
  course_name?: string;
  learning_proposal_edition?: { name?: string } | { name?: string }[];
};

type StudentRow = {
  student_id: string;
  student_name?: string | null;
  student_external_id?: string | null;
  attendance: {
    status?: string;
    method?: string;
    student_id?: string;
    payload_jsonb?: { justification_note?: string; notes?: string };
  } | null;
  app_user?: { email?: string } | { email?: string }[];
};

/** Valores en UI de lista manual (JUST → excused hasta confirmar POST como justified). */
type ManualSelectedStatus = 'present' | 'absent' | 'excused';

function strField(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Solo campos de alumno del roster; soporta snake_case y camelCase del API. */
function rosterFields(s: StudentRow): { name: string; ext: string; id: string } {
  const r = s as unknown as Record<string, unknown>;
  const name =
    strField(s.student_name) ||
    strField(r.studentName) ||
    '';
  const ext =
    strField(s.student_external_id) ||
    strField(r.studentExternalId) ||
    '';
  const id = strField(s.student_id) || strField(r.studentId) || s.student_id;
  return { name, ext, id };
}

/** Id por alumno para `selected` / edición JUST (prioriza student_id como pidió la UI). */
function manualListStudentId(s: StudentRow): string {
  const sid = strField(s.student_id);
  if (sid !== '') return sid;
  const ext = strField(s.student_external_id);
  if (ext !== '') return ext;
  return strField(rosterFields(s).id);
}

/** Solo present / absent / excused; sin TARDE en botones (late no pre-selecciona). */
function attendanceStatusToSelectedValue(status: string | undefined | null): ManualSelectedStatus | null {
  if (status == null) return null;
  const x = String(status).toLowerCase();
  if (x === 'excused' || x === 'justified') return 'excused';
  if (x === 'present') return 'present';
  if (x === 'absent') return 'absent';
  return null;
}

/** Nombre visible solo desde datos de alumno (roster), sin app_user ni otros campos del docente. */
function rosterStudentName(s: StudentRow): string {
  const { name, ext, id } = rosterFields(s);
  if (name !== '') return name;
  if (ext !== '') return ext;
  return id;
}

function rosterStudentInitial(s: StudentRow): string {
  const { name, ext } = rosterFields(s);
  if (name !== '') {
    const ch = name.charAt(0);
    return ch !== '' ? ch.toUpperCase() : '?';
  }
  if (ext !== '') {
    const ch = ext.charAt(0);
    return ch !== '' ? ch.toUpperCase() : '?';
  }
  return '?';
}

function displayStudent(s: StudentRow) {
  return rosterStudentName(s);
}

function manualJustStorageKey(sessionId: string, studentId: string) {
  return `atendee:manual-just:${sessionId}:${studentId}`;
}

function readJustificationFromPayload(att: StudentRow['attendance']): string {
  const j = att?.payload_jsonb;
  const t = (j?.justification_note ?? j?.notes ?? '').trim();
  return t;
}

function readJustificationNote(sessionId: string, studentId: string, att: StudentRow['attendance']): string {
  const fromPayload = readJustificationFromPayload(att);
  if (fromPayload !== '') return fromPayload;
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(manualJustStorageKey(sessionId, studentId))?.trim() ?? '';
  } catch {
    return '';
  }
}

type TabId = 'qr' | 'hoja' | 'manual';

type PhotoAnalyzeRow = {
  student_external_id: string;
  student_name: string;
  status: 'present' | 'absent' | 'excused';
  confidence: number;
};

type PhotoAnalyzeResponse = {
  results: PhotoAnalyzeRow[];
  unmatched: unknown[];
  total: number;
  sessionId: string;
};

type FinalizedScreenState =
  | { source: 'qr'; scannedCount: number }
  | { source: 'manual'; markedCount: number };

function sessionRules(status: string) {
  const s = status;
  return {
    showOpen: s === 'scheduled',
    showClose: s === 'attendance_open',
    showCancel: s === 'scheduled' || s === 'attendance_open',
  };
}

function formatCountdown(ms: number) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function editionNameFromSession(s: SessionDetail): string {
  const le = s.learning_proposal_edition;
  const en = Array.isArray(le) ? le[0]?.name : le?.name;
  return (en || '').toUpperCase();
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="mx-auto h-6 w-32 rounded-full bg-white/80" />
      <div className="h-10 w-56 rounded-xl bg-white/80" />
      <div className="h-64 rounded-[20px] bg-white/80" />
    </div>
  );
}

export default function TeacherSessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('qr');
  const [method, setMethod] = useState<TabId | null>(null);
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [manualCloseModalOpen, setManualCloseModalOpen] = useState(false);
  const [finalizedScreen, setFinalizedScreen] = useState<FinalizedScreenState | null>(null);
  const [search, setSearch] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [justEditingKey, setJustEditingKey] = useState<string | null>(null);
  const [justInput, setJustInput] = useState('');
  const [justSavedNote, setJustSavedNote] = useState<Record<string, string>>({});
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const linkCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrAutoKickoffRef = useRef(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [photoResults, setPhotoResults] = useState<PhotoAnalyzeRow[]>([]);
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, 'present' | 'absent' | 'excused'>>({});
  const [photoSaving, setPhotoSaving] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const [s, st] = await Promise.all([
      apiClient<SessionDetail>(`/sessions/${encodeURIComponent(sessionId)}`),
      apiClient<StudentRow[]>(`/sessions/${encodeURIComponent(sessionId)}/students`),
    ]);
    setSession(s);
    const list = Array.isArray(st) ? st : [];
    setStudents(list);
    const pending = await getPendingAttendance();
    const manualPending = pending.filter(
      (p) =>
        !p.synced &&
        p.source === 'manual' &&
        p.class_session_id === sessionId,
    );
    setPendingIds(new Set(manualPending.map((p) => p.student_id)));
  }, [sessionId]);

  useEffect(() => {
    if (!user || !sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, sessionId, load]);

  useEffect(() => {
    // eslint-disable-next-line no-console -- debug roster payload from GET /sessions/:id/students
    console.log('students raw:', JSON.stringify(students, null, 2));
  }, [students]);

  const initialAttendance = useMemo(
    () =>
      students
        .filter((s) => s.attendance)
        .map((s) => ({
          ...s.attendance,
          student_id: s.student_id,
        })) as Record<string, unknown>[],
    [students],
  );

  const liveAttendance = useRealtimeAttendance(sessionId, initialAttendance);

  const rules = session ? sessionRules(session.status) : null;

  const generateQr = useCallback(() => {
    setTab('hoja');
    queueMicrotask(() => setTab('qr'));
  }, []);

  const { token, loading: qrLoading, timeLeft, isOffline } = useQrRotation(
    sessionId,
    method === 'qr',
  );

  useEffect(() => {
    return () => {
      if (linkCopiedTimeoutRef.current) clearTimeout(linkCopiedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!sharePanelOpen) {
      setLinkCopied(false);
      if (linkCopiedTimeoutRef.current) {
        clearTimeout(linkCopiedTimeoutRef.current);
        linkCopiedTimeoutRef.current = null;
      }
    }
  }, [sharePanelOpen]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (method !== 'hoja') {
      setPhotoFile(null);
      setPhotoResults([]);
      setPhotoOverrides({});
      setPhotoAnalyzing(false);
      setPhotoSaving(false);
    }
  }, [method]);

  useEffect(() => {
    if (method !== 'qr') {
      qrAutoKickoffRef.current = false;
      setSharePanelOpen(false);
      setLinkCopied(false);
      if (linkCopiedTimeoutRef.current) {
        clearTimeout(linkCopiedTimeoutRef.current);
        linkCopiedTimeoutRef.current = null;
      }
      return;
    }
    if (qrAutoKickoffRef.current) return;
    qrAutoKickoffRef.current = true;
    queueMicrotask(() => generateQr());
  }, [method, generateQr]);

  useEffect(() => {
    if (session?.status === 'attendance_open' && navigator.onLine) {
      void SyncManager.preCacheSession(sessionId);
    }
  }, [session?.status, sessionId]);

  useEffect(() => {
    setMethod(null);
  }, [sessionId]);

  useEffect(() => {
    setFinalizedScreen(null);
  }, [sessionId]);

  useEffect(() => {
    setManualCloseModalOpen(false);
  }, [sessionId]);

  useEffect(() => {
    setJustEditingKey(null);
    setJustInput('');
    setJustSavedNote({});
    setSelected({});
  }, [sessionId]);

  useEffect(() => {
    if (!session || session.id !== sessionId) return;
    if (students.length === 0) {
      setSelected({});
      return;
    }
    const init: Record<string, string> = {};
    for (const s of students) {
      const id = manualListStudentId(s);
      if (!id) continue;
      const raw = s.attendance?.status;
      if (!raw) continue;
      const v = attendanceStatusToSelectedValue(String(raw));
      if (v) init[id] = v;
    }
    setSelected(init);
  }, [students, session, sessionId]);

  async function patchAction(path: string, body?: object): Promise<boolean> {
    setActionLoading(path);
    setError(null);
    try {
      await apiClient(`/sessions/${encodeURIComponent(sessionId)}${path}`, {
        method: 'PATCH',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      return false;
    } finally {
      setActionLoading(null);
    }
  }

  async function cancelSession() {
    const comment =
      typeof window !== 'undefined' ? window.prompt('Motivo de cancelación', '') : '';
    await patchAction('/cancel', { comment: comment ?? '' });
  }

  const scannedCount = useMemo(() => {
    const seen = new Set<string>();
    for (const a of liveAttendance as { student_id?: string; method?: string }[]) {
      if (a.method === 'qr' && a.student_id) seen.add(a.student_id);
    }
    return seen.size;
  }, [liveAttendance]);

  const recentQrStudents = useMemo(() => {
    const seen = new Set<string>();
    const out: StudentRow[] = [];
    for (const a of liveAttendance as { student_id?: string; method?: string }[]) {
      if (a.method !== 'qr' || !a.student_id || seen.has(a.student_id)) continue;
      seen.add(a.student_id);
      const st = students.find((x) => x.student_id === a.student_id);
      if (st) out.push(st);
    }
    return out;
  }, [liveAttendance, students]);

  async function postAttendance(s: StudentRow, uiStatus: string, notes?: string) {
    const externalId =
      strField(s.student_external_id) || strField(s.student_id) || String(s.student_external_id ?? s.student_id ?? '');
    if (!externalId) {
      setError('No se pudo identificar al alumno.');
      return;
    }
    const apiStatus = uiStatus === 'excused' ? 'justified' : uiStatus;
    if (apiStatus !== 'present' && apiStatus !== 'absent' && apiStatus !== 'justified') return;

    const storageKey = manualListStudentId(s);
    if (apiStatus === 'justified' && notes != null && notes.trim() !== '') {
      try {
        sessionStorage.setItem(manualJustStorageKey(sessionId, storageKey), notes.trim());
      } catch {
        /* ignore */
      }
    }

    if (!navigator.onLine) {
      await savePendingAttendance({
        offline_id: crypto.randomUUID(),
        student_id: externalId,
        class_session_id: sessionId,
        qr_token: '',
        scanned_at: new Date().toISOString(),
        source: 'manual',
        manual_status: apiStatus as 'present' | 'absent' | 'justified',
      });
      setPendingIds((prev) => new Set(prev).add(externalId));
      return;
    }
    try {
      await apiClient('/attendance/manual', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          studentExternalId: externalId,
          status: apiStatus,
          method: 'manual_teacher',
        }),
      });
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(externalId);
        return next;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
      await savePendingAttendance({
        offline_id: crypto.randomUUID(),
        student_id: externalId,
        class_session_id: sessionId,
        qr_token: '',
        scanned_at: new Date().toISOString(),
        source: 'manual',
        manual_status: apiStatus as 'present' | 'absent' | 'justified',
      });
      setPendingIds((prev) => new Set(prev).add(externalId));
    }
  }

  function handleSelect(studentId: string, status: string) {
    setSelected((prev) => ({
      ...prev,
      [studentId]: status,
    }));
    const s = students.find((st) => manualListStudentId(st) === studentId);
    if (!s) return;
    if (status !== 'excused') {
      setJustEditingKey(null);
      setJustInput('');
      void postAttendance(s, status);
      return;
    }
    setJustEditingKey(studentId);
    setJustInput(readJustificationNote(sessionId, studentId, s.attendance));
  }

  function manualBtnClass(active: boolean, kind: ManualSelectedStatus): string {
    const base =
      'rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-wider transition';
    if (!active) return `${base} bg-gray-100 text-gray-500`;
    if (kind === 'present') return `${base} bg-green-500 text-white`;
    if (kind === 'absent') return `${base} bg-red-500 text-white`;
    return `${base} bg-gray-700 text-white`;
  }

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const { name, ext, id } = rosterFields(s);
      const label = rosterStudentName(s).toLowerCase();
      return (
        label.includes(q) ||
        name.toLowerCase().includes(q) ||
        ext.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [students, search]);

  const markedStudentsCount = useMemo(() => {
    let c = 0;
    for (const s of students) {
      const k = manualListStudentId(s);
      if (k && selected[k]) c += 1;
    }
    return c;
  }, [students, selected]);

  if (loading) {
    return <Skeleton />;
  }
  if (error && !session) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (finalizedScreen) {
    const isQr = finalizedScreen.source === 'qr';
    const n = isQr ? finalizedScreen.scannedCount : finalizedScreen.markedCount;
    const title = isQr ? 'SESIÓN FINALIZADA' : 'ASISTENCIA REGISTRADA';
    const subtitle = isQr
      ? 'La asistencia fue registrada correctamente'
      : 'Los estados fueron guardados correctamente';
    const summary = isQr
      ? n === 1
        ? '1 alumno escaneado'
        : `${n} alumnos escaneados`
      : n === 1
        ? '1 alumno marcado'
        : `${n} alumnos marcados`;
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-10 text-center">
        <div
          className="mb-8 flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[#DCFCE7] text-[#16A34A]"
          aria-hidden
        >
          <CheckCircle2 className="h-14 w-14" strokeWidth={2.25} />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-wide text-[#0D1B4B] md:text-3xl">
          {title}
        </h1>
        <p className="atendee-muted mt-3 max-w-sm text-sm font-semibold leading-relaxed">{subtitle}</p>
        <p className="mt-6 text-base font-bold tabular-nums text-[#0D1B4B]">{summary}</p>
        <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
          <Link
            href={`/teacher/sessions/${encodeURIComponent(sessionId)}/detail`}
            className="inline-flex w-full items-center justify-center rounded-[14px] border-2 border-gray-200 bg-white px-4 py-3.5 text-xs font-black uppercase tracking-widest text-[#0D1B4B] transition hover:bg-gray-50"
          >
            VER DETALLE
          </Link>
          <Link
            href="/teacher/courses"
            className="inline-flex w-full items-center justify-center rounded-[14px] bg-[#1B3FD8] px-4 py-3.5 text-xs font-black uppercase tracking-widest text-white transition hover:opacity-95"
          >
            VOLVER A MIS CLASES
          </Link>
        </div>
      </div>
    );
  }

  if (!session || !rules) {
    return null;
  }

  type UiMode = TabId | 'selection';
  const uiMode: UiMode = method === null ? 'selection' : method;
  const showQrPanel = method === 'qr';
  const showHojaPanel = method === 'hoja';
  const showManualPanel = method === 'manual';
  const tabs: { id: TabId; label: string; title: string; desc: string; Icon: typeof QrCode }[] = [
    { id: 'qr', label: 'QR', title: 'CÓDIGO QR', desc: 'ESCANEO DE PANTALLA', Icon: QrCode },
    {
      id: 'hoja',
      label: 'HOJA',
      title: 'LISTA EN PAPEL',
      desc: 'FOTO DE LISTA COMPLETADA',
      Icon: Camera,
    },
    {
      id: 'manual',
      label: 'MANUAL',
      title: 'LISTA MANUAL',
      desc: 'REGISTRO TRADICIONAL',
      Icon: ClipboardList,
    },
  ];

  let headerTitle = session.class_display_id || session.course_name || 'Sesión';
  let headerSubtitle: ReactNode = (
    <>
      {session.date}
      {session.start_time ? ` · ${session.start_time.slice(0, 5)}` : ''} · {session.status}
    </>
  );
  let subtitleClass = 'atendee-muted mt-1';
  let showSessionMetaUnderHeader = true;

  if (uiMode === 'selection') {
    headerTitle = 'TOMAR ASISTENCIA';
    headerSubtitle = 'SELECCIONAR MÉTODO';
    subtitleClass = 'atendee-muted mt-1';
    showSessionMetaUnderHeader = false;
  } else if (uiMode === 'manual') {
    headerTitle = 'LISTA MANUAL';
    headerSubtitle = 'REGISTRO POR SELECCIÓN';
    subtitleClass = 'atendee-subtitle mt-1';
    showSessionMetaUnderHeader = false;
  } else if (uiMode === 'hoja') {
    headerTitle = 'LISTA EN PAPEL';
    headerSubtitle = 'ANALIZAR FOTO CON IA';
    subtitleClass = 'atendee-subtitle mt-1';
    showSessionMetaUnderHeader = false;
  } else if (uiMode === 'qr') {
    headerTitle = 'CÓDIGO QR';
    headerSubtitle = 'ESCANEO EN CURSO';
    subtitleClass = 'atendee-subtitle mt-1 text-xs font-bold uppercase tracking-widest text-[#16A34A]';
    showSessionMetaUnderHeader = false;
  }

  const commissionLabel = editionNameFromSession(session) || 'COMISIÓN';

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <span className="atendee-badge-online">
          <Wifi className="h-3.5 w-3.5" strokeWidth={2.5} />
          En línea
        </span>
      </div>

      <header className="space-y-1">
        {method !== null ? (
          <button
            type="button"
            onClick={() => setMethod(null)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-[#8A9BB5] shadow-sm transition hover:bg-[#F8FAFC]"
            aria-label="Volver a selección de método"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
          </button>
        ) : (
          <Link
            href="/teacher/courses"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-[#8A9BB5] shadow-sm transition hover:bg-[#F8FAFC]"
            aria-label="Volver"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
          </Link>
        )}
        <h1 className="atendee-heading text-2xl tracking-tight md:text-3xl">{headerTitle}</h1>
        <p className={subtitleClass}>{headerSubtitle}</p>
        {showSessionMetaUnderHeader ? (
          <p className="atendee-muted mt-2 border-t border-gray-100 pt-2">
            {session.date}
            {session.start_time ? ` · ${session.start_time.slice(0, 5)}` : ''} · {session.status}
          </p>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-[16px] border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {method !== null && method !== 'manual' && method !== 'qr' && rules.showOpen ? (
          <button
            type="button"
            disabled={!!actionLoading}
            onClick={() => patchAction('/open')}
            className="rounded-[14px] bg-[#16A34A] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
          >
            {actionLoading === '/open' ? '…' : 'Abrir asistencia'}
          </button>
        ) : null}
        {rules.showClose && !showQrPanel ? (
          <button
            type="button"
            disabled={!!actionLoading}
            onClick={() => patchAction('/close')}
            className="rounded-[14px] bg-[#0D1B4B] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
          >
            {actionLoading === '/close' ? '…' : 'Cerrar asistencia'}
          </button>
        ) : null}
        {method !== null && method !== 'manual' && method !== 'qr' && rules.showCancel ? (
          <button
            type="button"
            disabled={!!actionLoading}
            onClick={cancelSession}
            className="rounded-[14px] border-2 border-red-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-red-600 disabled:opacity-50"
          >
            Cancelar clase
          </button>
        ) : null}
      </div>

      {method === null ? (
        <div className="flex flex-col gap-3">
          {tabs.map((t) => {
            const Icon = t.Icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMethod(t.id)}
                className="atendee-card flex w-full cursor-pointer items-center gap-4 p-5 text-left transition hover:bg-gray-50"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2F7] text-[#1B3FD8]">
                  <Icon className="h-7 w-7" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black uppercase tracking-wide text-[#0D1B4B]">
                    {t.title}
                  </p>
                  <p className="atendee-muted mt-0.5">{t.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-[#CBD5E1]" />
              </button>
            );
          })}
        </div>
      ) : null}

      {showQrPanel ? (
        <div className="space-y-4">
          <div className="rounded-[20px] bg-white p-6 shadow-sm">
            <div className="flex justify-center">
              {qrLoading && !token ? (
                <div className="h-[240px] w-[240px] animate-pulse rounded-lg bg-[#F1F5F9]" />
              ) : (
                <QRCodeSVG
                  value={token || 'ATENDIA'}
                  size={240}
                  level="M"
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
              )}
            </div>
            <p className="mt-4 text-center text-xs font-bold uppercase tracking-widest text-[#8A9BB5]">
              MUESTRA ESTE CÓDIGO A TUS ALUMNOS
            </p>
            <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-wider text-[#8A9BB5]">
              ⚙ SIMULAR INGRESOS MASIVOS
            </p>
            <p className="mt-2 text-center text-xs font-semibold text-[#8A9BB5]">
              Rotación en <span className="tabular-nums">{formatCountdown(timeLeft)}</span>
            </p>
            {isOffline ? (
              <p className="mt-2 text-center text-xs font-bold text-amber-700">
                Modo offline · token en caché
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setSharePanelOpen((o) => !o)}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-gray-200 py-2.5 text-sm font-bold uppercase text-[#0D1B4B] outline outline-1 outline-gray-200"
          >
            <Share2 className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
            COMPARTIR QR
          </button>

          {sharePanelOpen ? (
            <div className="mt-3 rounded-[16px] border border-gray-100 bg-white p-4">
              <button
                type="button"
                disabled={!token}
                onClick={() => {
                  if (!token) return;
                  const qrToken = token;
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(
                      'Código QR para registrar tu asistencia:\n\n' +
                        qrToken +
                        '\n\nIngresá a la app y escaneá el código.',
                    )}`,
                    '_blank',
                    'noopener,noreferrer',
                  );
                }}
                className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#25D366] py-3 font-bold text-white transition hover:bg-[#20bd5a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MessageCircle className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden />
                Compartir por WhatsApp
              </button>
              <button
                type="button"
                disabled={!token}
                onClick={async () => {
                  if (!token) return;
                  const qrToken = token;
                  const url = `${window.location.origin}/student/scan?token=${encodeURIComponent(qrToken)}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    setLinkCopied(true);
                    if (linkCopiedTimeoutRef.current) clearTimeout(linkCopiedTimeoutRef.current);
                    linkCopiedTimeoutRef.current = setTimeout(() => {
                      setLinkCopied(false);
                      linkCopiedTimeoutRef.current = null;
                    }, 2000);
                  } catch {
                    setLinkCopied(false);
                  }
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#F1F5F9] py-3 font-bold text-[#0D1B4B] transition hover:bg-[#E2E8F0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Link2 className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden />
                {linkCopied ? '¡Copiado!' : 'Copiar link'}
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!!actionLoading || qrLoading}
              onClick={generateQr}
              className="flex items-center justify-center gap-2 rounded-[14px] border-2 border-gray-200 bg-white py-3.5 text-xs font-black uppercase tracking-widest text-[#0D1B4B] transition hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="text-base" aria-hidden>
                ↺
              </span>
              REGENERAR
            </button>
            <button
              type="button"
              onClick={() => setMethod('manual')}
              className="flex items-center justify-center gap-2 rounded-[14px] border-2 border-gray-200 bg-white py-3.5 text-xs font-black uppercase tracking-widest text-[#0D1B4B] transition hover:bg-gray-50"
            >
              <span className="text-base font-bold" aria-hidden>
                ≡
              </span>
              LISTA
            </button>
          </div>

          <button
            type="button"
            disabled={!!actionLoading}
            onClick={() => setFinalizeModalOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-red-600 py-4 text-xs font-black uppercase tracking-widest text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            FINALIZAR SESIÓN <span aria-hidden>⊗</span>
          </button>

          <div className="atendee-card p-5">
            <p className="atendee-muted mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#1B3FD8]" />
              REGISTROS RECIENTES
            </p>
            <p className="mb-3 text-xs font-bold text-[#8A9BB5]">
              Escaneados:{' '}
              <span className="text-lg font-black text-[#0D1B4B]">{scannedCount}</span> /{' '}
              {students.length}
            </p>
            <ul className="flex flex-col gap-3">
              {recentQrStudents.map((s, i) => {
                const { id: rid } = rosterFields(s);
                const initial = displayStudent(s).charAt(0).toUpperCase() || '?';
                return (
                  <li
                    key={rid !== '' ? `${rid}-${i}` : `qr-recent-${i}`}
                    className="flex items-center gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF2F7] text-sm font-black text-[#1B3FD8]">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[#0D1B4B]">{displayStudent(s)}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#8A9BB5]">
                      <Cloud className="h-3.5 w-3.5" />
                      Sincronizado
                    </span>
                  </li>
                );
              })}
            </ul>
            {recentQrStudents.length === 0 ? (
              <p className="text-xs font-semibold text-[#CBD5E1]">
                Aún no hay escaneos en esta sesión.
              </p>
            ) : null}
          </div>

          {finalizeModalOpen ? (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={() => setFinalizeModalOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="finalize-session-title"
                className="w-full max-w-sm rounded-[20px] bg-white p-6 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="finalize-session-title" className="text-lg font-black text-[#0D1B4B]">
                  ¿Finalizar la sesión?
                </h3>
                <p className="mt-2 text-sm font-semibold text-[#8A9BB5]">
                  Esta acción cerrará la toma de asistencia
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:justify-end">
                  <button
                    type="button"
                    disabled={!!actionLoading}
                    onClick={async () => {
                      const countSnapshot = scannedCount;
                      const ok = await patchAction('/close');
                      if (ok) {
                        setFinalizeModalOpen(false);
                        setFinalizedScreen({ source: 'qr', scannedCount: countSnapshot });
                      }
                    }}
                    className="rounded-[14px] bg-red-600 px-4 py-3 text-sm font-black uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setFinalizeModalOpen(false)}
                    className="rounded-[14px] border-2 border-gray-200 bg-white px-4 py-3 text-sm font-black uppercase tracking-wider text-[#0D1B4B]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showHojaPanel ? (
        <div className="space-y-4">
          <div className="atendee-card border border-gray-100 p-5 shadow-sm">
            <label className="block cursor-pointer">
              <input
                type="file"
                accept="image/*,capture=camera"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPhotoResults([]);
                  setPhotoOverrides({});
                  setPhotoFile(f ?? null);
                  e.target.value = '';
                }}
              />
              <div className="flex min-h-[160px] flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-8 text-center transition hover:border-[#94A3B8]">
                {photoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- preview from object URL
                  <img
                    src={photoPreviewUrl}
                    alt="Vista previa de la lista"
                    className="max-h-64 w-full max-w-sm rounded-[12px] object-contain"
                  />
                ) : (
                  <>
                    <Camera className="mx-auto mb-3 h-12 w-12 text-[#8A9BB5]" strokeWidth={1.5} />
                    <p className="text-sm font-bold text-[#0D1B4B]">Tocá para elegir o sacar foto</p>
                  </>
                )}
              </div>
            </label>
            <p className="atendee-muted mt-3 text-center text-xs font-semibold">
              Sacá una foto a la lista completada
            </p>
          </div>

          {photoFile ? (
            <button
              type="button"
              disabled={photoAnalyzing}
              onClick={async () => {
                if (!photoFile) return;
                setPhotoAnalyzing(true);
                setError(null);
                try {
                  const tokenData = await getAuthToken();
                  const fd = new FormData();
                  fd.append('photo', photoFile);
                  fd.append('sessionId', sessionId);
                  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
                  const res = await fetch(`${base}/attendance/analyze-photo`, {
                    method: 'POST',
                    headers: tokenData?.accessToken
                      ? { Authorization: `Bearer ${tokenData.accessToken}` }
                      : {},
                    body: fd,
                  });
                  const raw = await res.text();
                  if (!res.ok) {
                    let msg = 'Error al analizar la imagen';
                    try {
                      const j = JSON.parse(raw) as { message?: string | string[] };
                      const m = j.message;
                      msg = Array.isArray(m) ? m.join(', ') : typeof m === 'string' ? m : msg;
                    } catch {
                      /* ignore */
                    }
                    throw new Error(msg);
                  }
                  const data = JSON.parse(raw) as PhotoAnalyzeResponse;
                  setPhotoResults(Array.isArray(data.results) ? data.results : []);
                  setPhotoOverrides({});
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Error al analizar');
                } finally {
                  setPhotoAnalyzing(false);
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#1B3FD8] py-3.5 text-sm font-black uppercase tracking-widest text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {photoAnalyzing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Analizando…
                </>
              ) : (
                'ANALIZAR CON IA'
              )}
            </button>
          ) : null}

          {photoResults.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-[16px] border border-gray-100 bg-white shadow-sm">
                <ul className="divide-y divide-gray-100">
                  {photoResults.map((row) => {
                    const ext = row.student_external_id;
                    const effective =
                      photoOverrides[ext] ??
                      (row.status === 'present' || row.status === 'absent' || row.status === 'excused'
                        ? row.status
                        : 'absent');
                    const low = row.confidence < 0.7;
                    const badge =
                      effective === 'present'
                        ? 'bg-green-100 text-green-800'
                        : effective === 'excused'
                          ? 'bg-slate-200 text-slate-800'
                          : 'bg-red-100 text-red-800';
                    const pct = Math.round(row.confidence * 100);
                    return (
                      <li key={ext || row.student_name} className="px-4 py-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-black uppercase tracking-wide text-[#0D1B4B]">
                              {row.student_name}
                            </p>
                            <p className="atendee-muted mt-0.5 font-mono text-xs">ID: {ext || '—'}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${badge}`}
                            >
                              {effective === 'present'
                                ? 'Presente'
                                : effective === 'excused'
                                  ? 'Justificado'
                                  : 'Ausente'}
                            </span>
                            <span className="text-xs font-bold text-[#64748B]">{pct}% conf.</span>
                          </div>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                          <div
                            className="h-full rounded-full bg-[#1B3FD8] transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {low ? (
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPhotoOverrides((prev) => ({ ...prev, [ext]: 'present' }))
                              }
                              className="flex-1 rounded-[10px] border border-green-200 bg-green-50 py-2 text-[10px] font-black uppercase text-green-800"
                            >
                              P
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPhotoOverrides((prev) => ({ ...prev, [ext]: 'absent' }))
                              }
                              className="flex-1 rounded-[10px] border border-red-200 bg-red-50 py-2 text-[10px] font-black uppercase text-red-800"
                            >
                              A
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPhotoOverrides((prev) => ({ ...prev, [ext]: 'excused' }))
                              }
                              className="flex-1 rounded-[10px] border border-slate-300 bg-slate-100 py-2 text-[10px] font-black uppercase text-slate-800"
                            >
                              J
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <button
                type="button"
                disabled={photoSaving}
                onClick={async () => {
                  if (photoResults.length === 0) return;
                  setPhotoSaving(true);
                  setError(null);
                  try {
                    for (const row of photoResults) {
                      const ext = row.student_external_id;
                      const st =
                        photoOverrides[ext] ??
                        (row.status === 'present' || row.status === 'absent' || row.status === 'excused'
                          ? row.status
                          : 'absent');
                      const s = students.find(
                        (x) =>
                          strField(x.student_external_id) === ext || strField(x.student_id) === ext,
                      );
                      if (!s) continue;
                      const ui = st === 'excused' ? 'excused' : st === 'present' ? 'present' : 'absent';
                      await postAttendance(s, ui);
                    }
                    setFinalizedScreen({ source: 'manual', markedCount: photoResults.length });
                    setPhotoFile(null);
                    setPhotoResults([]);
                    setPhotoOverrides({});
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Error al guardar');
                  } finally {
                    setPhotoSaving(false);
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#16A34A] py-4 text-xs font-black uppercase tracking-widest text-white transition hover:bg-green-700 disabled:opacity-50"
              >
                {photoSaving ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Guardando…
                  </>
                ) : (
                  'CONFIRMAR Y GUARDAR ASISTENCIAS'
                )}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showManualPanel ? (
        <>
          <div className="space-y-4 pb-28">
            <div className="rounded-[20px] border border-gray-100 bg-white px-5 py-4 shadow-sm">
              <p className="atendee-muted text-sm font-bold uppercase tracking-wider">
                COMISIÓN {commissionLabel}
              </p>
            </div>
            <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm">
              <input
                type="search"
                placeholder="Buscar por nombre o ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-[14px] border border-gray-100 bg-[#F8FAFC] px-4 py-3 text-sm font-semibold text-[#0D1B4B] outline-none focus:border-[#BFDBFE]"
              />
            </div>
            <div className="atendee-card overflow-hidden p-0">
              <ul className="flex flex-col">
                {filteredStudents.map((s, rowIndex) => {
                  const { id: rosterId, ext: idExt } = rosterFields(s);
                  const rowKey = rosterId !== '' ? `${rosterId}-${rowIndex}` : `row-${rowIndex}`;
                  const studentId = manualListStudentId(s);
                  const sel = selected[studentId];
                  const showJustInput = sel === 'excused' && justEditingKey === studentId;
                  const noteBelow =
                    sel === 'excused' && !showJustInput
                      ? (justSavedNote[studentId] || readJustificationFromPayload(s.attendance)).trim()
                      : '';
                  return (
                    <li key={rowKey} className="border-b border-gray-100 px-4 py-4 last:border-0">
                      <div className="flex min-w-0 flex-1 gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-sm font-black text-[#8A9BB5]">
                          {rosterStudentInitial(s)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-black uppercase tracking-wide text-[#0D1B4B]">
                            {rosterStudentName(s)}
                          </p>
                          <p className="atendee-muted mt-0.5 font-mono normal-case">
                            ID: {idExt !== '' ? idExt : s.student_id}
                          </p>
                          {noteBelow !== '' ? (
                            <p className="mt-1 text-[11px] font-medium italic leading-snug text-[#8A9BB5]">
                              {noteBelow}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            handleSelect(studentId, 'present');
                          }}
                          className={manualBtnClass(sel === 'present', 'present')}
                        >
                          PRES
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleSelect(studentId, 'absent');
                          }}
                          className={manualBtnClass(sel === 'absent', 'absent')}
                        >
                          AUS
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (sel === 'excused' && justEditingKey === studentId) {
                              setJustEditingKey(null);
                              return;
                            }
                            handleSelect(studentId, 'excused');
                          }}
                          className={manualBtnClass(sel === 'excused', 'excused')}
                        >
                          JUST
                        </button>
                      </div>
                      {showJustInput ? (
                        <div className="mt-3 space-y-2">
                          <input
                            type="text"
                            placeholder="Escribí el motivo de la justificación..."
                            value={justInput}
                            onChange={(e) => setJustInput(e.target.value)}
                            className="w-full rounded-[12px] bg-[#F1F5F9] px-3 py-2 text-sm text-[#0D1B4B] outline-none placeholder:text-[#8A9BB5]"
                          />
                          <button
                            type="button"
                            disabled={justInput.trim() === ''}
                            onClick={async () => {
                              const note = justInput.trim();
                              if (note === '') return;
                              await postAttendance(s, 'excused', note);
                              setJustSavedNote((prev) => ({ ...prev, [studentId]: note }));
                              setJustEditingKey(null);
                              setJustInput('');
                            }}
                            className="rounded-[12px] bg-[#0D1B4B] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            CONFIRMAR
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                </ul>
            </div>
          </div>

          <div
            className="fixed bottom-0 left-0 right-0 z-[90] border-t border-gray-200/90 bg-[#EEF2F7]/95 p-4 backdrop-blur-sm"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
          >
            <button
              type="button"
              onClick={() => setManualCloseModalOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-red-600 py-4 text-sm font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-red-700"
            >
              CERRAR ASISTENCIA <span aria-hidden>⊗</span>
            </button>
          </div>

          {manualCloseModalOpen ? (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={() => setManualCloseModalOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="manual-close-attendance-title"
                className="w-full max-w-sm rounded-[20px] bg-white p-6 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h3
                  id="manual-close-attendance-title"
                  className="text-lg font-black text-[#0D1B4B]"
                >
                  ¿Cerrar la asistencia?
                </h3>
                <p className="mt-2 text-sm font-semibold text-[#8A9BB5]">
                  Se registrarán todos los estados marcados
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:justify-end">
                  <button
                    type="button"
                    disabled={!!actionLoading}
                    onClick={async () => {
                      const countSnapshot = markedStudentsCount;
                      const ok = await patchAction('/close');
                      if (ok) {
                        setManualCloseModalOpen(false);
                        setFinalizedScreen({ source: 'manual', markedCount: countSnapshot });
                      }
                    }}
                    className="rounded-[14px] bg-red-600 px-4 py-3 text-sm font-black uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    CONFIRMAR
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualCloseModalOpen(false)}
                    className="rounded-[14px] border-2 border-gray-200 bg-white px-4 py-3 text-sm font-black uppercase tracking-wider text-[#0D1B4B]"
                  >
                    CANCELAR
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
