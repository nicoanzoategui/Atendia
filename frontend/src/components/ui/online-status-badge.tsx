'use client';

import { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export function OnlineStatusBadge() {
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const isActuallyOffline = !online || simulatedOffline;

  if (!isActuallyOffline) {
    return (
      <button 
        onClick={() => setSimulatedOffline(true)}
        className="flex items-center gap-2 bg-[#E8F8EE] text-[#059669] border border-[#A7F3D0] px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-sm transition-all hover:scale-105 active:scale-95"
      >
        <Wifi className="w-3.5 h-3.5" />
        En línea 
      </button>
    );
  }

  return (
    <button 
      onClick={() => setSimulatedOffline(false)}
      className="flex items-center gap-2 bg-red-600 text-white border border-red-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-lg shadow-red-100 transition-all hover:scale-105 active:scale-95 animate-pulse"
    >
      <WifiOff className="w-3.5 h-3.5" />
      Modo Offline
    </button>
  );
}
