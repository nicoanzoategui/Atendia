'use client';

import { useState, useEffect } from 'react';
import { getPendingAttendance } from '../db/pending-attendance-store';
import { getAllPendingSheetProcessed } from '../db/pending-sheet-list-store';
import { useConnectivity } from '../sync/connectivity';

export function useSyncStatus() {
  const [pendingCount, setPendingCount] = useState(0);
  const isOnline = useConnectivity();

  const refresh = async () => {
    try {
      const [records, sheetRows] = await Promise.all([
        getPendingAttendance(),
        getAllPendingSheetProcessed(),
      ]);
      const n = records.filter((r) => !r.synced).length + sheetRows.length;
      setPendingCount(n);
    } catch {
      // IDB no disponible (ej: SSR)
    }
  };

  // Refrescar al cambiar conectividad y al montar
  useEffect(() => {
    refresh();
  }, [isOnline]);

  // Polling liviano cada 10 segundos para reflejar cambios en tiempo real
  useEffect(() => {
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, []);

  return { pendingCount, isOnline };
}
