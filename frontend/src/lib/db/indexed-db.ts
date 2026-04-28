import { openDB, IDBPDatabase } from 'idb';

export interface AuthToken {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    tenant_id: string;
    external_id: string;
  };
  expiresAt: number;
}

const DB_NAME = 'atendee_db';
const DB_VERSION = 3;

export async function initDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('auth')) {
        db.createObjectStore('auth', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('cached_sessions')) {
        db.createObjectStore('cached_sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pending_attendance')) {
        db.createObjectStore('pending_attendance', { keyPath: 'offline_id' });
      }
      if (!db.objectStoreNames.contains('cached_students')) {
        db.createObjectStore('cached_students', { keyPath: 'id' });
      }
      // v2: pool de tokens QR pre-generados para modo offline del docente
      if (!db.objectStoreNames.contains('cached_qr_tokens')) {
        db.createObjectStore('cached_qr_tokens', { keyPath: 'session_id' });
      }
      // v3: POST /attendance/sheet-processed diferido (lista en papel sin red)
      if (!db.objectStoreNames.contains('pending_sheet_list')) {
        db.createObjectStore('pending_sheet_list', { keyPath: 'offline_id' });
      }
    },
  });
}

const LS_TOKEN_KEY = 'token';
const LS_USER_KEY = 'auth_user';

export async function setAuthToken(token: AuthToken) {
  const db = await initDB();
  await db.put('auth', { key: 'token', ...token });
  if (typeof window !== 'undefined') {
    localStorage.setItem(LS_TOKEN_KEY, token.accessToken);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(token.user));
  }
}

export async function getAuthToken(): Promise<AuthToken | null> {
  const db = await initDB();
  const fromDb = await db.get('auth', 'token');
  if (fromDb) return fromDb;
  if (typeof window !== 'undefined') {
    const accessToken = localStorage.getItem(LS_TOKEN_KEY);
    const rawUser = localStorage.getItem(LS_USER_KEY);
    if (accessToken && rawUser) {
      try {
        const user = JSON.parse(rawUser) as AuthToken['user'];
        return {
          accessToken,
          user,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        };
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export async function clearAuthToken() {
  const db = await initDB();
  await db.delete('auth', 'token');
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_USER_KEY);
  }
}
