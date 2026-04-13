'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, CalendarCheck, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';

const navItems = [
  { name: 'ASISTENCIAS', href: '/teacher/courses', icon: CalendarCheck },
  { name: 'ESTADÍSTICAS', href: '/teacher/stats', icon: BarChart3 },
];

export function TeacherBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const isActive = (href: string) => {
    if (href === '/teacher/courses') {
      return (
        pathname.startsWith('/teacher/courses') ||
        pathname.startsWith('/teacher/sessions')
      );
    }
    if (href === '/teacher/stats') {
      return pathname.startsWith('/teacher/stats');
    }
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <>
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-56 flex-col border-r border-gray-100 bg-white py-8 pl-4 pr-3 md:flex">
        <div className="mb-10 px-2">
          <span className="text-xl font-black tracking-tight text-[#0D1B4B]">Atendia</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 rounded-[14px] px-3 py-3 text-xs font-black uppercase tracking-widest transition-colors ${
                  active
                    ? 'bg-[#EEF2F7] text-[#1B3FD8]'
                    : 'text-[#8A9BB5] hover:bg-[#F8FAFC] hover:text-[#0D1B4B]'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white md:left-56">
        <div className="flex items-center justify-around px-2 py-3 sm:px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 transition-colors ${
                  active ? 'text-[#1B3FD8]' : 'text-[#8A9BB5]'
                }`}
              >
                <Icon className="h-6 w-6 shrink-0" strokeWidth={active ? 2.5 : 2} />
                <span className="text-center text-[0.6rem] font-black uppercase leading-tight tracking-widest sm:text-[0.65rem]">
                  {item.name}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 text-[#8A9BB5] transition-colors hover:text-[#0D1B4B]"
          >
            <LogOut className="h-6 w-6 shrink-0" strokeWidth={2} />
            <span className="text-center text-[0.6rem] font-black uppercase leading-tight tracking-widest sm:text-[0.65rem]">
              SALIR
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
