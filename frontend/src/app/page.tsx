'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/use-auth';
import { dashboardPathForRole } from '@/lib/auth/dashboard-path';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    router.replace(dashboardPathForRole(user.role));
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-gray-50">
      <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-200" />
    </div>
  );
}
