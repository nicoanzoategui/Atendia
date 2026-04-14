export type StudentMyAttendance = {
  status?: string | null;
  method?: string | null;
} | null | undefined;

const TERMINAL_STATUSES = ['present', 'late', 'absent', 'justified', 'excused'] as const;

/**
 * Si la UI debe mostrar la sesión como "asistencia ya registrada" para el alumno.
 * - Sesiones pasadas: cualquier estado terminal cuenta.
 * - Hoy o futuro: ausencias / justificados cuentan; **presente/tarde solo si method === 'qr'**
 *   (evita mostrar "ya registramos" al loguear con datos seed o carga manual del docente).
 */
export function studentAttendanceShowsRegistered(
  attendance: StudentMyAttendance | undefined,
  sessionDate: string,
  todayYmd: string,
): boolean {
  const status = attendance?.status;
  if (status == null || String(status).trim() === '') return false;
  const x = String(status).toLowerCase().trim();
  if (!(TERMINAL_STATUSES as readonly string[]).includes(x)) return false;

  if (sessionDate < todayYmd) {
    return true;
  }

  if (x === 'present' || x === 'late') {
    const m = String(attendance?.method ?? '').toLowerCase().trim();
    return m === 'qr';
  }

  return true;
}
