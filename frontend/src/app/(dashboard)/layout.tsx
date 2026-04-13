'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/use-auth';
import { AdminBottomNav } from '@/components/layout/admin-bottom-nav';
import { TeacherBottomNav } from '@/components/layout/teacher-bottom-nav';
import { StudentBottomNav } from '@/components/layout/student-bottom-nav';
import { isAdminRole } from '@/lib/auth/dashboard-path';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (pathname.startsWith('/admin') && !isAdminRole(user)) {
      router.replace('/');
    } else if (pathname.startsWith('/teacher') && user.role !== 'teacher') {
      router.replace('/');
    } else if (pathname.startsWith('/student') && user.role !== 'student') {
      router.replace('/');
    }
  }, [loading, user, pathname, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#EEF2F7]">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-white/80" />
      </div>
    );
  }

  const nav =
    isAdminRole(user) ? (
      <AdminBottomNav />
    ) : user.role === 'teacher' ? (
      <TeacherBottomNav />
    ) : user.role === 'student' ? (
      <StudentBottomNav />
    ) : null;

  return (
    <div className="min-h-screen bg-[#EEF2F7] text-[#0D1B4B]">
      {nav}
      <div className="md:pl-56 pb-28">
        <div className="atendee-page mx-auto max-w-3xl px-4 py-6 md:max-w-5xl">{children}</div>
      </div>
    </div>
  );
}
