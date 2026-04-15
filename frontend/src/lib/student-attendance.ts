export type StudentMyAttendance = {
  status?: string | null;
  method?: string | null;
} | null | undefined;

function normStatus(attendance: StudentMyAttendance): string {
  return String(attendance?.status ?? '')
    .trim()
    .toLowerCase();
}

function normMethod(attendance: StudentMyAttendance): string {
  return String(attendance?.method ?? '')
    .trim()
    .toLowerCase();
}

const NEGATIVE = ['absent', 'excused', 'justified'] as const;
const POSITIVE = ['present', 'late'] as const;

/**
 * Próxima sesión en la que el alumno aún debe usar el flujo de QR.
 * - Presente/tarde con method qr: ya registró por escaneo → no pedir de nuevo.
 * - Presente/tarde sin qr (admin, etc.): sigue haciendo falta el flujo del alumno.
 * - Ausencia / justificado: no ofrecemos escaneo para marcar presente.
 */
export function studentSessionNeedsQrScanFlow(
  attendance: StudentMyAttendance | undefined,
  sessionDate: string,
  todayYmd: string,
): boolean {
  if (sessionDate < todayYmd) return false;
  const st = normStatus(attendance);
  if ((NEGATIVE as readonly string[]).includes(st)) return false;
  if ((POSITIVE as readonly string[]).includes(st)) {
    return normMethod(attendance) !== 'qr';
  }
  return true;
}

/** Asistencia confirmada por el propio alumno vía QR (sesión hoy o futura en el calendario). */
export function studentUpcomingQrPresenceConfirmed(
  attendance: StudentMyAttendance | undefined,
  sessionDate: string,
  todayYmd: string,
): boolean {
  if (sessionDate < todayYmd) return false;
  const st = normStatus(attendance);
  if (!(POSITIVE as readonly string[]).includes(st)) return false;
  return normMethod(attendance) === 'qr';
}

/** Une my_attendance de /sessions/edition y /sessions/my-course: gana el detalle de edition (evita pisar method). */
export function mergeStudentMyAttendance(
  editionAttendance: StudentMyAttendance,
  myCourseAttendance: StudentMyAttendance,
): StudentMyAttendance {
  if (!editionAttendance && !myCourseAttendance) return null;
  if (!editionAttendance) return myCourseAttendance ?? null;
  if (!myCourseAttendance) return editionAttendance ?? null;
  return { ...myCourseAttendance, ...editionAttendance };
}
