'use client';

import { useState, useEffect } from 'react';
import { getAuthToken, setAuthToken, clearAuthToken, AuthToken } from '../db/indexed-db';
import { resetApiBaseUrlCache } from '../api/base-url';

export function useAuth() {
  const [user, setUser] = useState<AuthToken['user'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const tokenData = await getAuthToken();
      if (tokenData && tokenData.expiresAt > Date.now()) {
        setUser(tokenData.user);
      } else {
        await clearAuthToken();
        setUser(null);
      }
      setLoading(false);
    }
    checkAuth();
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
