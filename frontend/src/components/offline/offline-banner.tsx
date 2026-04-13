'use client';

import { useConnectivity } from '@/lib/sync/connectivity';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const isOnline = useConnectivity();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-black text-white px-4 py-2 z-[100] flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
      <WifiOff className="w-4 h-4" />
      <span className="text-xs font-bold uppercase tracking-widest">Modo Offline Activo</span>
    </div>
  );
}
