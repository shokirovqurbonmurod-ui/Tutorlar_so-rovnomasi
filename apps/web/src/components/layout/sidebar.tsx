'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, LogOut, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV } from './nav';
import { Logo } from './logo';
import { useAuth } from '@/lib/auth';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/lib/labels';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/lib/utils';

export function useNavItems() {
  const { can } = useAuth();
  return React.useMemo(() => NAV.filter((n) => !n.perms || can(...n.perms)), [can]);
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = useNavItems();
  const groups = React.useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const it of items) {
      const g = it.group ?? '';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(it);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <nav className="flex flex-col gap-4">
      {groups.map(([group, list]) => (
        <div key={group || 'root'} className="space-y-0.5">
          {group && !collapsed && <div className="text-muted-foreground/70 px-3 pb-1 text-[11px] font-medium tracking-wider uppercase">{group}</div>}
          {group && collapsed && <div className="bg-border mx-3 my-2 h-px" />}
          {list.map((item) => {
            const active = pathname === item.href || (pathname.startsWith(item.href + '/') && !items.some((o) => o.href !== item.href && o.href.startsWith(item.href + '/') && (pathname === o.href || pathname.startsWith(o.href + '/'))));
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-sidebar-primary/10 text-sidebar-primary' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  collapsed && 'justify-center px-0',
                )}
              >
                {active && <span className="bg-sidebar-primary absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full" />}
                <item.icon className={cn('size-[18px] shrink-0', active ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, logout } = useAuth();
  return (
    <aside className={cn('bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 z-30 hidden flex-col border-r transition-[width] duration-300 lg:flex', collapsed ? 'w-[72px]' : 'w-64')}>
      <div className={cn('flex h-16 items-center border-b px-4', collapsed && 'justify-center px-0')}>
        <Link href="/dashboard">
          <Logo compact={collapsed} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className="border-t p-3">
        {!collapsed && user && (
          <div className="mb-2 flex items-center gap-3 rounded-xl px-2 py-1.5">
            <Avatar className="size-8">
              <AvatarImage src={user.avatarUrl ?? undefined} />
              <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.fullName}</div>
              <div className="text-muted-foreground truncate text-xs">{ROLE_LABELS[user.role.key]}{user.branch ? ` · ${user.branch.code ?? user.branch.name}` : ''}</div>
            </div>
          </div>
        )}
        <div className={cn('flex items-center gap-1', collapsed ? 'flex-col' : 'justify-between')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Yon panelni yig‘ish">
                <ChevronsLeft className={cn('size-4 transition-transform', collapsed && 'rotate-180')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? 'Kengaytirish' : 'Yig‘ish'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" asChild aria-label="Telegram bot">
                <a href="/settings#bot"><Send className="size-4" /></a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Telegram bot</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => void logout()} aria-label="Chiqish">
                <LogOut className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Chiqish</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
