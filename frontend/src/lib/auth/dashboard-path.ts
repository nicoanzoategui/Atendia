import type { AuthToken } from '@/lib/db/indexed-db';

export function dashboardPathForRole(role: string | undefined): string {
  if (!role) return '/login';
  if (role === 'admin' || role === 'admin_tenant' || role === 'admin_app') {
    return '/admin/courses';
  }
  if (role === 'teacher') return '/teacher/courses';
  if (role === 'student') return '/student/course';
  return '/login';
}

export function isAdminRole(user: AuthToken['user'] | null | undefined): boolean {
  const r = user?.role;
  return r === 'admin' || r === 'admin_tenant' || r === 'admin_app';
}
