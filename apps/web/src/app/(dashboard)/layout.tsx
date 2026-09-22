'use client';
import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/layout/logo';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    const v = window.localStorage.getItem('ts_sidebar');
    if (v === '1') setCollapsed(true);
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      window.localStorage.setItem('ts_sidebar', c ? '0' : '1');
      return !c;
    });
  };

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <Logo />
        <div className="bg-primary/20 relative h-1 w-40 overflow-hidden rounded-full">
          <div className="bg-primary absolute inset-y-0 w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full" />
        </div>
        <style>{`@keyframes slide{0%{left:-33%}100%{left:100%}}`}</style>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className={cn('flex min-h-dvh flex-col transition-[padding] duration-300', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <Topbar />
        <main className="flex-1 px-4 pt-5 pb-24 lg:px-6 lg:pb-8">
          <div className="mx-auto w-full max-w-[1440px] animate-fade-in">{children}</div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
