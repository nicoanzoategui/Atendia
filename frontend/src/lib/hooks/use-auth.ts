'use client';

import { useState, useEffect } from 'react';
import { getAuthToken, setAuthToken, clearAuthToken, AuthToken } from '../db/indexed-db';
import { resetApiBaseUrlCache } from '../api/base-url';

export function useAuth() {
  const [user, setUser] = useState<AuthToken['user'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      const TIMEOUT_MS = 5000;
      const attempts = 3;

      for (let i = 0; i < attempts; i++) {
        try {
          const tokenData = await Promise.race([
            getAuthToken(),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('auth-read-timeout')), TIMEOUT_MS),
            ),
          ]);
          if (cancelled) return;
          if (tokenData && tokenData.expiresAt > Date.now()) {
            setUser(tokenData.user);
          } else {
            await clearAuthToken();
            setUser(null);
          }
          setLoading(false);
          return;
        } catch {
          if (cancelled) return;
          if (i < attempts - 1) {
            await new Promise((r) => setTimeout(r, 350 * (i + 1)));
            continue;
          }
          setUser(null);
          setLoading(false);
        }
      }
    }

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (token: string, userData: AuthToken['user']) => {
    const tokenData: AuthToken = {
      accessToken: token,
      user: userData,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };
    await setAuthToken(tokenData);
    setUser(userData);
  };

  const logout = async () => {
    resetApiBaseUrlCache();
    await clearAuthToken();
    setUser(null);
  };

  return { user, loading, login, logout };
}
