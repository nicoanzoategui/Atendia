/** Disparar tras registrar asistencia (QR, foto, manual) para refrescar portales alumno/docente. */
export const DASHBOARD_REFETCH_EVENT = 'atendee:dashboard-refetch';

export function requestDashboardRefetch(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_REFETCH_EVENT));
}

export function subscribeDashboardRefetch(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const fn = () => handler();
  window.addEventListener(DASHBOARD_REFETCH_EVENT, fn);
  return () => window.removeEventListener(DASHBOARD_REFETCH_EVENT, fn);
}
