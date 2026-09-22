'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, GraduationCap, UserCheck, Wallet, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

const ITEMS = [
  { href: '/dashboard', label: 'Bosh', icon: LayoutDashboard, perm: 'dashboard.view' },
  { href: '/students', label: "O'quvchi", icon: GraduationCap, perm: 'students.view' },
  { href: '/attendance', label: 'Davomat', icon: UserCheck, perm: 'attendance.view' },
  { href: '/grades', label: 'Baholar', icon: Star, perm: 'grades.view' },
  { href: '/finance', label: 'Moliya', icon: Wallet, perm: 'finance.view' },
];

export function MobileNav() {
  const pathname = usePathname();
  const { can } = useAuth();
  const items = ITEMS.filter((i) => can(i.perm));
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + '/');
          return (
            <Link key={it.href} href={it.href} className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors', active ? 'text-primary' : 'text-muted-foreground')}>
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-primary/12')}>
                <it.icon className="size-[18px]" />
              </span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
