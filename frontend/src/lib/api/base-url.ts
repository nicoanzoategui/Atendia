let browserCachedBase: string | null = null;

export function resetApiBaseUrlCache(): void {
  browserCachedBase = null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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
  for (let attempt = 0; attempt < 4; attempt++) {
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
    if (attempt < 3) await sleep(300 * (attempt + 1));
  }
  browserCachedBase =
    process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
  return browserCachedBase;
}
