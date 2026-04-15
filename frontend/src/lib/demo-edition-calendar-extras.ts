/** Weekly placeholder slots for demo accounts (*@demo.*) so the cursada calendar looks complete. */
export const DEMO_EDITION_CALENDAR_EXTRA_SLOTS = 5;

export function isDemoCalendarAccount(user: { email?: string } | null): boolean {
  return (user?.email?.toLowerCase().includes('@demo.') ?? false) === true;
}

export function addCalendarDays(ymd: string, deltaDays: number): string {
  const [y, mo, d] = ymd.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export type DemoCalendarPlaceholderSlot = { key: string; date: string; start_time?: string };

export function buildDemoEditionFuturePlaceholders(
  sortedSessions: { date: string }[],
  firstFutureSession: { date: string; start_time?: string } | undefined,
  isDemo: boolean,
): DemoCalendarPlaceholderSlot[] {
  if (!isDemo || !firstFutureSession) return [];
  const taken = new Set(sortedSessions.map((s) => s.date));
  const out: DemoCalendarPlaceholderSlot[] = [];
  let offset = 7;
  while (out.length < DEMO_EDITION_CALENDAR_EXTRA_SLOTS && offset <= 7 * 52) {
    const candidate = addCalendarDays(firstFutureSession.date, offset);
    if (!taken.has(candidate)) {
      taken.add(candidate);
      out.push({
        key: `__demo_calendar_extra_${candidate}`,
        date: candidate,
        start_time: firstFutureSession.start_time,
      });
    }
    offset += 7;
  }
  return out;
}

export function isDemoEditionCalendarExtraId(id: string): boolean {
  return id.startsWith('__demo_calendar_extra_');
}
