'use client';
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Send, RefreshCw, CheckCircle2, XCircle, Clock, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Notification, Paginated, RoleKey } from '@/lib/types';
import { NOTIF_TYPES } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { useBranches } from '@/lib/queries';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar, FilterSelect } from '@/components/shared/filters';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { UserCell } from '@/components/shared/user-cell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtDateTime, fromNow } from '@/lib/utils';

const N_STATUS = { QUEUED: { label: 'Navbatda', variant: 'muted' }, SENT: { label: 'Yuborilgan', variant: 'success' }, FAILED: { label: 'Xato', variant: 'destructive' }, READ: { label: 'O‘qilgan', variant: 'info' } } as const;
type Resp = Paginated<Notification> & { counts: Record<string, number> };

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [status, setStatus] = React.useState('');
  const [type, setType] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['notifications', status, type, page], queryFn: () => api.get<Resp>('/api/notifications', { status: status || undefined, type: type || undefined, page, limit: 25 }), refetchInterval: 30_000 });
  const retry = useMutation({ mutationFn: () => api.post<{ retried: number }>('/api/notifications/retry'), onSuccess: (r) => { toast.success(`${r.retried ?? 0} ta xabar qayta yuborildi`); void qc.invalidateQueries({ queryKey: ['notifications'] }); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });
  const c = data?.counts ?? {};

  const cols: Column<Notification>[] = [
    { key: 'user', header: 'Qabul qiluvchi', cell: (n) => n.user ? <UserCell name={n.user.fullName} size="sm" /> : <span className="text-muted-foreground">—</span> },
    { key: 'type', header: 'Turi', cell: (n) => <Badge variant="secondary">{NOTIF_TYPES[n.type] ?? n.type}</Badge> },
    { key: 'title', header: 'Xabar', cell: (n) => <div className="min-w-0"><div className="max-w-80 truncate text-sm font-medium">{n.title}</div><div className="text-muted-foreground max-w-80 truncate text-xs">{n.body}</div></div> },
    { key: 'status', header: 'Holat', cell: (n) => <div><StatusBadge value={n.status as keyof typeof N_STATUS} map={N_STATUS} />{n.error && <div className="text-destructive mt-0.5 max-w-48 truncate text-[11px]" title={n.error}>{n.error}</div>}</div> },
    { key: 'channel', header: 'Kanal', hideBelow: 'lg', cell: (n) => <span className="text-muted-foreground text-xs">{n.channel}</span> },
    { key: 'at', header: 'Vaqt', cell: (n) => <span className="text-xs" title={fmtDateTime(n.sentAt ?? n.createdAt)}>{fromNow(n.sentAt ?? n.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Bildirishnomalar" description="Telegram orqali yuborilgan barcha xabarlar jurnali va ommaviy xabar yuborish" actions={<>
        {can('notifications.send') && <Button variant="outline" onClick={() => retry.mutate()} loading={retry.isPending}><RefreshCw /> Xatolarni qayta yuborish</Button>}
        {can('notifications.send') && <Button onClick={() => setOpen(true)}><Radio /> Ommaviy xabar</Button>}
      </>} />
      <div className="stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Yuborilgan" value={c.SENT ?? 0} icon={CheckCircle2} tone="success" loading={isLoading} />
        <StatCard label="Navbatda" value={c.QUEUED ?? 0} icon={Clock} tone="info" loading={isLoading} hint="bot ishga tushganda yuboriladi" />
        <StatCard label="Xato" value={c.FAILED ?? 0} icon={XCircle} tone="destructive" loading={isLoading} />
        <StatCard label="O‘qilgan" value={c.READ ?? 0} icon={Bell} tone="primary" loading={isLoading} />
      </div>
      <FilterBar>
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} allLabel="Barcha holatlar" options={Object.entries(N_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
        <FilterSelect value={type} onChange={(v) => { setType(v); setPage(1); }} allLabel="Barcha turlar" options={Object.entries(NOTIF_TYPES).map(([k, v]) => ({ value: k, label: v }))} />
      </FilterBar>
      <DataTable columns={cols} rows={data?.items} rowKey={(n) => n.id} loading={isLoading} page={data?.page} pages={data?.pages} total={data?.total} onPageChange={setPage} />
      <BroadcastDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function BroadcastDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { is } = useAuth();
  const branches = useBranches(!is('DIRECTOR'));
  const [f, setF] = React.useState({ title: '', body: '', roles: ['TUTOR', 'TEACHER'] as RoleKey[], branchId: '' });
  const m = useMutation({ mutationFn: () => api.post<{ recipients: number; sent: number }>('/api/notifications/broadcast', { title: f.title.trim(), body: f.body.trim(), roles: f.roles, branchId: f.branchId || undefined }), onSuccess: (r) => { toast.success(`${r.sent ?? r.recipients} xodimga yuborildi`); void qc.invalidateQueries({ queryKey: ['notifications'] }); onOpenChange(false); setF({ title: '', body: '', roles: ['TUTOR', 'TEACHER'], branchId: '' }); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });
  const toggle = (r: RoleKey) => setF((s) => ({ ...s, roles: s.roles.includes(r) ? s.roles.filter((x) => x !== r) : [...s.roles, r] }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="size-4" /> Ommaviy xabar</DialogTitle><DialogDescription>Admin xabari sifatida tanlangan xodimlarga Telegram orqali yuboriladi.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1.5"><Label>Sarlavha *</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={2} /></div>
          <div className="space-y-1.5"><Label>Matn *</Label><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required minLength={2} className="min-h-28" /></div>
          <div className="space-y-1.5"><Label>Kimga</Label><div className="flex flex-wrap gap-3">{(['TUTOR', 'TEACHER', 'HR_ADMIN', 'DIRECTOR'] as RoleKey[]).map((r) => <label key={r} className="flex items-center gap-2 text-sm"><Checkbox checked={f.roles.includes(r)} onCheckedChange={() => toggle(r)} /> {{ TUTOR: 'Tutorlar', TEACHER: 'O‘qituvchilar', HR_ADMIN: 'HR', DIRECTOR: 'Direktorlar' }[r as string]}</label>)}</div></div>
          {!is('DIRECTOR') && <div className="space-y-1.5"><Label>Filial</Label><Select value={f.branchId || '__all'} onValueChange={(v) => setF({ ...f, branchId: v === '__all' ? '' : v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all">Barcha filiallar</SelectItem>{branches.data?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button type="submit" loading={m.isPending} disabled={f.roles.length === 0}><Send /> Yuborish</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
