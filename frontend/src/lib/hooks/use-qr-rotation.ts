'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { popNextToken } from '../db/session-cache-store';

export function useQrRotation(sessionId: string, active: boolean) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isOffline, setIsOffline] = useState(false);

  const refreshToken = useCallback(async () => {
    if (!sessionId || !active) return;
    setLoading(true);
    try {
      if (!navigator.onLine) {
        // Sin red: consumir siguiente token del pool pre-cacheado en IDB
        const cached = await popNextToken(sessionId);
        if (cached) {
          setToken(cached.token);
          setExpiresAt(cached.expires_at);
          setIsOffline(true);
        }
        return;
      }

      const data = (await apiClient(`/qr-tokens/session/${sessionId}`, {
        method: 'POST',
      })) as { token: string; expiresAt: number };
      setToken(data.token);
      setExpiresAt(data.expiresAt);
      setIsOffline(false);
    } catch (e) {
      // Error de red → fallback al pool cacheado
      const cached = await popNextToken(sessionId);
      if (cached) {
        setToken(cached.token);
        setExpiresAt(cached.expires_at);
        setIsOffline(true);
      }
      console.error('[useQrRotation] Error rotando token:', e);
    } finally {
      setLoading(false);
    }
  }, [sessionId, active]);

  useEffect(() => {
    if (active) {
      refreshToken();
    } else {
      setToken(null);
      setIsOffline(false);
    }
  }, [active, refreshToken]);

  useEffect(() => {
    if (!expiresAt || !active) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setTimeLeft(remaining);

      // Rotar cuando falten 5 segundos para expirar
      if (remaining < 5000) {
        refreshToken();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, active, refreshToken]);

  return { token, loading, timeLeft, isOffline };
}
