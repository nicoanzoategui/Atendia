/** El alumno ya tiene un estado de asistencia registrado para esa sesión. */
export function studentAttendanceIsRegistered(status: string | undefined | null): boolean {
  if (status == null) return false;
  const x = String(status).toLowerCase().trim();
  return ['present', 'late', 'absent', 'justified', 'excused'].includes(x);
}
