import { getAuthToken } from '../db/indexed-db';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function apiClient<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const tokenData = await getAuthToken();
  const method = (options.method || 'GET').toUpperCase();
  const hasBody = options.body != null && method !== 'GET' && method !== 'HEAD';
  const headers: HeadersInit = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(tokenData?.accessToken ? { Authorization: `Bearer ${tokenData.accessToken}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const raw = (error as { message?: string | string[] }).message;
    const msg = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : 'API request failed';
    throw new Error(msg);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function apiDownloadBlob(endpoint: string): Promise<Blob> {
  const tokenData = await getAuthToken();
  const headers: HeadersInit = {
    ...(tokenData?.accessToken ? { Authorization: `Bearer ${tokenData.accessToken}` } : {}),
  };

  const response = await fetch(`${API_URL}${endpoint}`, { headers });
  if (!response.ok) {
    throw new Error('No se pudo descargar el archivo');
  }
  return response.blob();
}
