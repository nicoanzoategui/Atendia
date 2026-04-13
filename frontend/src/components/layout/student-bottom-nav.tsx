'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart2, Home, LogOut, QrCode } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';

const navItems: {
  name: string;
  href: string;
  icon: typeof Home;
}[] = [
  { name: 'INICIO', href: '/student/course', icon: Home },
  { name: 'ESCANEAR', href: '/student/scan', icon: QrCode },
  { name: 'ESTADÍSTICAS', href: '/student/history', icon: BarChart2 },
];

export function StudentBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const isActive = (href: string) => {
    if (href === '/student/course') {
      return pathname.startsWith('/student/course');
    }
    if (href === '/student/scan') {
      return pathname.startsWith('/student/scan');
    }
    if (href === '/student/history') {
      return pathname.startsWith('/student/history');
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
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex items-center gap-3 rounded-[14px] px-3 py-3 text-xs font-black uppercase tracking-widest text-[#8A9BB5] transition-colors hover:bg-[#F8FAFC] hover:text-[#0D1B4B]"
          >
            <LogOut className="h-5 w-5 shrink-0" strokeWidth={2} />
            SALIR
          </button>
        </nav>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-gray-100 bg-white px-4 py-3 md:left-56">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex cursor-pointer flex-col items-center gap-1 ${
                active ? 'text-[#1B3FD8]' : 'text-[#8A9BB5]'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[9px] font-bold uppercase tracking-widest">{item.name}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex cursor-pointer flex-col items-center gap-1 text-[#8A9BB5] transition-colors hover:text-[#0D1B4B]"
        >
          <LogOut className="h-5 w-5 shrink-0" strokeWidth={2} />
          <span className="text-[9px] font-bold uppercase tracking-widest">SALIR</span>
        </button>
      </nav>
    </>
  );
}
