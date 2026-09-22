'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Send, Trash2, UserX, UserCheck, Ban, Link2Off, Download } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Paginated, RoleKey, User, UserStatus } from '@/lib/types';
import { ROLE_LABELS, USER_STATUS } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { useBranches, useRoles } from '@/lib/queries';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar, FilterSelect, ResetFilters, SearchInput } from '@/components/shared/filters';
import { UserCell } from '@/components/shared/user-cell';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { UserFormDialog } from './user-form';
import { fromNow } from '@/lib/utils';
import { StatCard } from '@/components/shared/stat-card';
import { Users, Send as SendIcon, Activity, Clock } from 'lucide-react';

export function UsersTable({ role, title, description }: { role?: RoleKey; title: string; description: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { can, is } = useAuth();
  const branches = useBranches(!is('DIRECTOR'));

  const [search, setSearch] = React.useState(sp.get('q') ?? '');
  const [status, setStatus] = React.useState('');
  const [roleF, setRoleF] = React.useState<string>(role ?? '');
  const rolesQ = useRoles();
  const [branchId, setBranchId] = React.useState('');
  const [telegram, setTelegram] = React.useState('');
  const [page, setPage] = React.useState(1);
  const dq = useDebounce(search);
  React.useEffect(() => setPage(1), [dq, status, roleF, branchId, telegram]);
  React.useEffect(() => { setSearch(sp.get('q') ?? ''); }, [sp]);

  const params = { page, limit: 20, search: dq || undefined, status: status || undefined, role: role || undefined, roleId: !role && roleF ? roleF : undefined, branchId: branchId || undefined, telegram: telegram || undefined };
  const { data, isLoading } = useQuery({ queryKey: ['users', params], queryFn: () => api.get<Paginated<User>>('/api/users', params), placeholderData: (prev) => prev });
  const summary = useQuery({ queryKey: ['users', 'summary', role], queryFn: async () => {
    const [all, active, linked, pending] = await Promise.all([
      api.get<Paginated<User>>('/api/users', { limit: 1, role }),
      api.get<Paginated<User>>('/api/users', { limit: 1, role, status: 'ACTIVE' }),
      api.get<Paginated<User>>('/api/users', { limit: 1, role, telegram: 'linked' }),
      api.get<Paginated<User>>('/api/users', { limit: 1, role, status: 'PENDING' }),
    ]);
    return { all: all.total, active: active.total, linked: linked.total, pending: pending.total };
  } });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);
  const [del, setDel] = React.useState<User | null>(null);

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch<User>(`/api/users/${id}`, body),
    onSuccess: () => { toast.success('Yangilandi'); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/users/${id}`),
    onSuccess: () => { toast.success('Foydalanuvchi o‘chirildi'); setDel(null); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });
  const unlink = useMutation({
    mutationFn: (id: string) => api.post(`/api/users/${id}/unlink-telegram`),
    onSuccess: () => { toast.success('Telegram uzildi'); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });

  const exportCsv = () => {
    const rows = data?.items ?? [];
    const head = ['Ism', 'Rol', 'Email', 'Telefon', 'Filial', 'Bo‘lim', 'Lavozim', 'Holat', 'Telegram'];
    const body = rows.map((u) => [u.fullName, ROLE_LABELS[u.role.key], u.email ?? '', u.phone ?? '', u.branch?.name ?? '', u.department?.name ?? '', u.position ?? '', USER_STATUS[u.status].label, u.telegramUsername ? '@' + u.telegramUsername : u.telegramId ? 'ulangan' : '']);
    const csv = '\uFEFF' + [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${role?.toLowerCase() ?? 'users'}.csv`;
    a.click();
  };

  const columns: Column<User>[] = [
    { key: 'name', header: 'Xodim', cell: (u) => <UserCell name={u.fullName} sub={u.position ?? u.email ?? u.phone} avatarUrl={u.avatarUrl} /> },
    ...(!role ? [{ key: 'role', header: 'Rol', cell: (u: User) => <Badge variant="primary">{u.role.name || ROLE_LABELS[u.role.key]}</Badge> } as Column<User>] : []),
    { key: 'branch', header: 'Filial', hideBelow: 'md', cell: (u) => <span className="text-sm">{u.branch?.name ?? <span className="text-muted-foreground">—</span>}{u.department && <span className="text-muted-foreground block text-xs">{u.department.name}</span>}</span> },
    { key: 'contact', header: 'Aloqa', hideBelow: 'lg', cell: (u) => <span className="text-muted-foreground text-xs">{u.phone ?? '—'}<br />{u.email ?? ''}</span> },
    { key: 'tg', header: 'Telegram', hideBelow: 'sm', cell: (u) => u.telegramId ? <Badge variant="info"><Send /> {u.telegramUsername ? '@' + u.telegramUsername : 'ulangan'}</Badge> : <Badge variant="muted">ulanmagan</Badge> },
    { key: 'status', header: 'Holat', cell: (u) => <StatusBadge value={u.status} map={USER_STATUS} /> },
    { key: 'activity', header: 'Faollik', hideBelow: 'xl', cell: (u) => <span className="text-muted-foreground text-xs">{fromNow(u.lastActivityAt ?? u.lastLoginAt)}</span> },
    {
      key: 'actions', header: '', className: 'w-10 text-right', cell: (u) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {can('users.update') && <DropdownMenuItem onClick={() => { setEditing(u); setFormOpen(true); }}><Pencil /> Tahrirlash</DropdownMenuItem>}
              {can('users.update') && u.status !== 'ACTIVE' && <DropdownMenuItem onClick={() => patch.mutate({ id: u.id, body: { status: 'ACTIVE' } })}><UserCheck /> Faollashtirish</DropdownMenuItem>}
              {can('users.update') && u.status === 'ACTIVE' && <DropdownMenuItem onClick={() => patch.mutate({ id: u.id, body: { status: 'INACTIVE' } })}><UserX /> Nofaol qilish</DropdownMenuItem>}
              {can('users.update') && u.status !== 'BLOCKED' && <DropdownMenuItem onClick={() => patch.mutate({ id: u.id, body: { status: 'BLOCKED' } })}><Ban /> Bloklash</DropdownMenuItem>}
              {can('users.update') && u.telegramId && <DropdownMenuItem onClick={() => unlink.mutate(u.id)}><Link2Off /> Telegramni uzish</DropdownMenuItem>}
              {can('users.delete') && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setDel(u)}><Trash2 /> O‘chirish</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const hasFilters = !!(search || status || (!role && roleF) || branchId || telegram);

  return (
    <div>
      <PageHeader title={title} description={description} actions={<>
        <Button variant="outline" onClick={exportCsv}><Download /> CSV</Button>
        {can('users.create') && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus /> Qo‘shish</Button>}
      </>} />

      <div className="stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Jami" value={summary.data?.all ?? '—'} icon={Users} tone="primary" loading={summary.isLoading} />
        <StatCard label="Faol" value={summary.data?.active ?? '—'} icon={Activity} tone="success" loading={summary.isLoading} />
        <StatCard label="Telegramga ulangan" value={summary.data?.linked ?? '—'} icon={SendIcon} tone="info" loading={summary.isLoading} />
        <StatCard label="Tasdiqlash kutmoqda" value={summary.data?.pending ?? '—'} icon={Clock} tone="warning" loading={summary.isLoading} />
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Ism, email, telefon…" />
        {!role && <FilterSelect value={roleF} onChange={setRoleF} allLabel="Barcha rollar" options={(rolesQ.data ?? []).filter((r) => !['PARENT', 'STUDENT'].includes(r.key)).map((r) => ({ value: r.id, label: `${r.name} (${r._count.users})` }))} />}
        <FilterSelect value={status} onChange={setStatus} allLabel="Barcha holatlar" options={(Object.keys(USER_STATUS) as UserStatus[]).map((s) => ({ value: s, label: USER_STATUS[s].label }))} />
        {!is('DIRECTOR') && <FilterSelect value={branchId} onChange={setBranchId} allLabel="Barcha filiallar" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />}
        <FilterSelect value={telegram} onChange={setTelegram} allLabel="Telegram: barchasi" options={[{ value: 'linked', label: 'Ulangan' }, { value: 'unlinked', label: 'Ulanmagan' }]} className="sm:w-40" />
        <ResetFilters visible={hasFilters} onClick={() => { setSearch(''); setStatus(''); setRoleF(role ?? ''); setBranchId(''); setTelegram(''); }} />
      </FilterBar>

      <DataTable columns={columns} rows={data?.items} rowKey={(u) => u.id} loading={isLoading} onRowClick={(u) => router.push(`/users/${u.id}`)} page={data?.page} pages={data?.pages} total={data?.total} onPageChange={setPage} />

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} defaultRole={role} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Foydalanuvchini o‘chirish" description={<>«{del?.fullName}» o‘chiriladi. Uning javoblari va hisobotlari tarixda saqlanadi.</>} destructive confirmText="O‘chirish" loading={remove.isPending} onConfirm={() => { if (del) remove.mutate(del.id); }} />
    </div>
  );
}
