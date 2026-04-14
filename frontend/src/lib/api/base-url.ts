let browserCachedBase: string | null = null;

/**
 * Base URL del backend. En el navegador, en imágenes Docker sin build-args,
 * NEXT_PUBLIC_* puede venir vacío en el bundle; leemos /api/runtime-config.
 */
export async function getApiBaseUrl(): Promise<string> {
  if (typeof window === 'undefined') {
    return (
      process.env.API_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      'http://localhost:3001'
    );
  }
  if (browserCachedBase) return browserCachedBase;
  try {
    const res = await fetch('/api/runtime-config', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { apiUrl?: string };
      const u = (data.apiUrl ?? '').trim();
      if (u) {
        browserCachedBase = u;
        return browserCachedBase;
      }
    }
  } catch {
    /* ignore */
  }
  browserCachedBase =
    process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
  return browserCachedBase;
}
