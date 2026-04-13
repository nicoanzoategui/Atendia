'use client';

import { useSyncStatus } from '@/lib/hooks/use-sync-status';
import { CloudOff, Check } from 'lucide-react';

export function SyncIndicator() {
  const { pendingCount, isOnline } = useSyncStatus();

  if (pendingCount === 0) return null;

  return (
    <div className={`
      fixed bottom-4 right-4 z-50
      flex items-center gap-2
      px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest
      shadow-md border
      ${isOnline
        ? 'bg-white border-[#E0E0E0] text-[#6B6B6B] animate-pulse'
        : 'bg-black text-white border-black'
      }
    `}>
      {isOnline ? (
        <>
          <Check className="w-3 h-3" />
          <span>Sincronizando {pendingCount}...</span>
        </>
      ) : (
        <>
          <CloudOff className="w-3 h-3" />
          <span>{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>
        </>
      )}
    </div>
  );
}
