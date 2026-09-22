'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Menu, Search, LogOut, UserRound, KeyRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SidebarNav } from './sidebar';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { initials } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/labels';
import { NAV } from './nav';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fromNow } from '@/lib/utils';
import type { Paginated, Report, Survey } from '@/lib/types';

export function Topbar() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, can } = useAuth();
  const current = [...NAV].sort((a, b) => b.href.length - a.href.length).find((n) => pathname === n.href || pathname.startsWith(n.href + '/'));

  const [q, setQ] = React.useState('');
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/users?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 lg:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Menyu">
          <Menu className="size-5" />
        </Button>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b">
            <SheetTitle asChild>
              <Logo />
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <SidebarNav onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight lg:text-lg">{current?.label ?? 'TARGET INTERNATIONAL SCHOOL'}</h1>
      </div>

      {can('users.view') && (
        <form onSubmit={submitSearch} className="relative hidden md:block">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Xodim qidirish…" className="bg-muted/60 focus:bg-card focus:ring-ring/30 h-9 w-56 rounded-xl border border-transparent pl-9 pr-3 text-sm transition-all outline-none focus:w-72 focus:border-border focus:ring-[3px]" />
        </form>
      )}

      <AlertsBell />
      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="focus-visible:ring-ring/40 rounded-full outline-none focus-visible:ring-[3px]" aria-label="Profil">
            <Avatar>
              <AvatarImage src={user?.avatarUrl ?? undefined} />
              <AvatarFallback>{initials(user?.fullName)}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{user?.fullName}</div>
            <div className="text-muted-foreground text-xs">{user?.email}</div>
            <Badge variant="primary" className="mt-2">{user ? ROLE_LABELS[user.role.key] : ''}</Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/profile"><UserRound /> Profil</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/profile#password"><KeyRound /> Parolni o‘zgartirish</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => void logout()}><LogOut /> Chiqish</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function AlertsBell() {
  const { can } = useAuth();
  const reports = useQuery({
    queryKey: ['bell', 'reports'],
    queryFn: () => api.get<Paginated<Report>>('/api/reports', { status: 'PENDING', limit: 5 }),
    enabled: can('reports.view'),
    refetchInterval: 60_000,
  });
  const surveys = useQuery({
    queryKey: ['bell', 'surveys'],
    queryFn: () => api.get<Paginated<Survey>>('/api/surveys', { status: 'ACTIVE', limit: 5 }),
    enabled: can('surveys.view'),
    refetchInterval: 60_000,
  });
  const count = (reports.data?.total ?? 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Xabarlar">
          <Bell className="size-[18px]" />
          {count > 0 && <span className="bg-destructive absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-white">{count > 9 ? '9+' : count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">Diqqat talab qiladi</div>
        <div className="max-h-80 overflow-y-auto">
          {reports.data && reports.data.total > 0 && (
            <div className="px-2 py-2">
              <div className="text-muted-foreground px-2 pb-1 text-[11px] font-medium uppercase">Ko‘rilmagan hisobotlar · {reports.data.total}</div>
              {reports.data.items.map((r) => (
                <Link key={r.id} href={`/reports?id=${r.id}`} className="hover:bg-accent block rounded-lg px-2 py-1.5">
                  <div className="truncate text-sm">{r.title}</div>
                  <div className="text-muted-foreground text-xs">{r.author.fullName} · {fromNow(r.createdAt)}</div>
                </Link>
              ))}
            </div>
          )}
          {surveys.data && surveys.data.items.length > 0 && (
            <div className="border-t px-2 py-2">
              <div className="text-muted-foreground px-2 pb-1 text-[11px] font-medium uppercase">Faol so‘rovnomalar</div>
              {surveys.data.items.map((s) => (
                <Link key={s.id} href={`/surveys/${s.id}`} className="hover:bg-accent block rounded-lg px-2 py-1.5">
                  <div className="truncate text-sm">{s.title}</div>
                  <div className="text-muted-foreground text-xs">{s.stats?.completed ?? 0}/{s.stats?.assigned ?? 0} javob {s.deadline ? `· muddat ${fromNow(s.deadline)}` : ''}</div>
                </Link>
              ))}
            </div>
          )}
          {!reports.data?.total && !surveys.data?.items.length && <div className="text-muted-foreground px-4 py-8 text-center text-sm">Hozircha yangilik yo‘q</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
