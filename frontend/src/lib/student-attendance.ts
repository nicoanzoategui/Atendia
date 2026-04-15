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
 * Próxima sesión en la que el alumno aún debe (o puede) usar el flujo de QR:
 * - Futuro: siempre true salvo ausencia/justificado marcado por docente.
 * - Hoy con presente/tarde y method qr: ya escaneó → false.
 * - Hoy con presente/tarde sin qr (admin/seed): true.
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
    if (normMethod(attendance) !== 'qr') return true;
    // presente por QR: solo damos el flujo por cerrado el **día** de esa clase (no días antes).
    return sessionDate > todayYmd;
  }
  return true;
}

/**
 * Mensaje verde "asistencia por QR": solo el día de la clase (o después) y con registro QR.
 * Nunca en fechas futuras aunque el backend devuelva present+qr (seed).
 */
export function studentUpcomingQrPresenceConfirmed(
  attendance: StudentMyAttendance | undefined,
  sessionDate: string,
  todayYmd: string,
): boolean {
  if (sessionDate > todayYmd) return false;
  const st = normStatus(attendance);
  if (!(POSITIVE as readonly string[]).includes(st)) return false;
  return normMethod(attendance) === 'qr';
}
