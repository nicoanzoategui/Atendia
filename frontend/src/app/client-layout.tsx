'use client';

import { useAuth } from '@/lib/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { OfflineBanner } from '@/components/offline/offline-banner';
import { SyncIndicator } from '@/components/offline/sync-indicator';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user && window.location.pathname !== '/login') {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 bg-[#F5F5F5] animate-pulse rounded"></div>
      </div>
    );
  }

  if (!user && typeof window !== 'undefined' && window.location.pathname !== '/login') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 bg-[#F5F5F5] animate-pulse rounded"></div>
      </div>
    );
  }

  return (
    <>
      <OfflineBanner />
      <SyncIndicator />
      {children}
    </>
  );
}
