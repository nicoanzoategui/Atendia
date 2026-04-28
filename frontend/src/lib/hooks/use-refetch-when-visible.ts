'use client';

import { useEffect, useRef } from 'react';

/**
 * Ejecuta onRefetch cuando el usuario vuelve a la pestaña (tras QR, foto u otro tab).
 */
export function useRefetchWhenVisible(onRefetch: () => void, enabled = true): void {
  const saved = useRef(onRefetch);
  saved.current = onRefetch;

  useEffect(() => {
    if (!enabled) return;
    const run = () => saved.current();
    const onVis = () => {
      if (document.visibilityState === 'visible') run();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) run();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [enabled]);
}
