export function todayStrLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isSessionDatePast(sessionDate: string): boolean {
  return sessionDate < todayStrLocal();
}

export function formatShortDate(isoDate: string) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export type TeacherSessionLocationRow = {
  location_campus?: string;
  location_classroom?: string;
  classroom?: string;
};

export function locationLine(row: TeacherSessionLocationRow): string {
  const parts = [row.location_campus, row.location_classroom || row.classroom].filter(Boolean);
  return (parts.length ? parts.join(' • ') : '—').toUpperCase();
}

export function teacherDisplayFromUser(
  user: { email?: string; full_name?: string; name?: string } | null,
): string {
  if (!user) return '—';
  const n = (user.full_name ?? user.name ?? '').trim();
  if (n) return n;
  return (user.email ?? '—').trim() || '—';
}
