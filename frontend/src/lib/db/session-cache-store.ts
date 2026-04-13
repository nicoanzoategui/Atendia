import { initDB } from './indexed-db';

export interface CachedToken {
  token: string;
  expires_at: number;
  used: boolean;
}

export interface CachedStudent {
  id: string;
  external_id: string;
  email: string;
  status: string | null;
}

export interface SessionCache {
  session_id: string;
  tokens: CachedToken[];
  students: CachedStudent[];
  cached_at: number;
}

export async function saveSessionCache(cache: SessionCache): Promise<void> {
  const db = await initDB();
  await db.put('cached_qr_tokens', cache);
}

export async function getSessionCache(sessionId: string): Promise<SessionCache | null> {
  const db = await initDB();
  return (await db.get('cached_qr_tokens', sessionId)) ?? null;
}

/** Devuelve el próximo token válido del pool y lo marca como usado. */
export async function popNextToken(sessionId: string): Promise<CachedToken | null> {
  const db = await initDB();
  const cache: SessionCache | undefined = await db.get('cached_qr_tokens', sessionId);
  if (!cache) return null;

  const now = Date.now();
  const margin = 5 * 60 * 1000; // ±5 min según spec
  const idx = cache.tokens.findIndex(t => !t.used && t.expires_at + margin > now);
  if (idx === -1) return null;

  cache.tokens[idx].used = true;
  await db.put('cached_qr_tokens', cache);
  return cache.tokens[idx];
}

export async function clearSessionCache(sessionId: string): Promise<void> {
  const db = await initDB();
  await db.delete('cached_qr_tokens', sessionId);
}
