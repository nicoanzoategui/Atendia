'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck, History, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';

const navItems = [
  { name: 'ASISTENCIA', href: '/admin/courses', icon: ShieldCheck },
  { name: 'HISTORIAL', href: '/admin/history', icon: History },
];

export function AdminBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const isActive = (href: string) => {
    if (href === '/admin/courses') {
      return pathname.startsWith('/admin/courses') || pathname.startsWith('/admin/classes');
    }
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-56 bg-white border-r border-gray-200 flex-col py-8 px-4 z-50">
        <div className="mb-10 px-2">
          <span className="text-xl font-black text-gray-900 tracking-tight">Atendia</span>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors font-bold text-sm tracking-wide ${
                  active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white md:left-56">
        <div className="flex items-center justify-around px-2 py-3 sm:px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 transition-colors ${
                  active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="h-6 w-6 shrink-0" strokeWidth={active ? 2.5 : 2} />
                <span className="text-center text-[0.6rem] font-bold uppercase leading-tight tracking-widest sm:text-[0.65rem]">
                  {item.name}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 text-gray-400 transition-colors hover:text-gray-600"
          >
            <LogOut className="h-6 w-6 shrink-0" strokeWidth={2} />
            <span className="text-center text-[0.6rem] font-bold uppercase leading-tight tracking-widest sm:text-[0.65rem]">
              SALIR
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
