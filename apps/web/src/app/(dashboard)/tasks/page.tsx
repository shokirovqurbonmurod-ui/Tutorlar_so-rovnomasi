'use client';
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckSquare, Trash2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Paginated, Task, User } from '@/lib/types';
import { TASK_STATUS } from '@/lib/labels';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar, FilterSelect } from '@/components/shared/filters';
import { StatusBadge } from '@/components/shared/status-badge';
import { UserCell } from '@/components/shared/user-cell';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dayjs, fmtDateTime, fromNow, cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';

export default function TasksPage() {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['tasks', status, page], queryFn: () => api.get<Paginated<Task>>('/api/tasks', { status: status || undefined, page, limit: 20 }) });
  const counts = useQuery({ queryKey: ['tasks', 'counts'], queryFn: async () => Object.fromEntries(await Promise.all(Object.keys(TASK_STATUS).map(async (s) => [s, (await api.get<Paginated<Task>>('/api/tasks', { limit: 1, status: s })).total]))) as Record<string, number> });
  const inv = () => { void qc.invalidateQueries({ queryKey: ['tasks'] }); };
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/api/tasks/${id}`, body), onSuccess: () => { toast.success('Yangilandi'); inv(); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/api/tasks/${id}`), onSuccess: () => { toast.success('O‘chirildi'); inv(); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });

  const cols: Column<Task>[] = [
    { key: 'title', header: 'Vazifa', cell: (t) => <div className="min-w-0"><div className="max-w-80 truncate font-medium">{t.title}</div>{t.description && <div className="text-muted-foreground max-w-80 truncate text-xs">{t.description}</div>}</div> },
    { key: 'assignee', header: 'Ijrochi', cell: (t) => <UserCell name={t.assignee.fullName} size="sm" /> },
    { key: 'status', header: 'Holat', cell: (t) => <StatusBadge value={t.status} map={TASK_STATUS} /> },
    { key: 'due', header: 'Muddat', cell: (t) => t.dueAt ? <span className={cn('text-xs', t.status !== 'DONE' && dayjs(t.dueAt).isBefore(dayjs()) && 'text-destructive font-medium')}>{fmtDateTime(t.dueAt)}</span> : <span className="text-muted-foreground">—</span> },
    { key: 'created', header: 'Berilgan', hideBelow: 'lg', cell: (t) => <span className="text-muted-foreground text-xs">{t.createdBy?.fullName} · {fromNow(t.createdAt)}</span> },
    { key: 'actions', header: '', className: 'text-right', cell: (t) => <div className="flex justify-end gap-1">{t.status !== 'DONE' && t.status !== 'CANCELLED' && <Button variant="ghost" size="icon-sm" title="Bajarildi" onClick={() => patch.mutate({ id: t.id, body: { status: 'DONE' } })}><CheckCircle2 className="text-success" /></Button>}<Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => remove.mutate(t.id)}><Trash2 /></Button></div> },
  ];
  const overdue = (data?.items ?? []).filter((t) => t.dueAt && t.status !== 'DONE' && t.status !== 'CANCELLED' && dayjs(t.dueAt).isBefore(dayjs())).length;

  return (
    <div>
      <PageHeader title="Vazifalar" description="Xodimlarga topshiriqlar berish — Telegram orqali xabar va eslatma yuboriladi" actions={<Button onClick={() => setOpen(true)}><Plus /> Vazifa berish</Button>} />
      <div className="stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ochiq" value={counts.data?.OPEN ?? '—'} icon={Clock} tone="info" loading={counts.isLoading} />
        <StatCard label="Jarayonda" value={counts.data?.IN_PROGRESS ?? '—'} icon={CheckSquare} tone="warning" loading={counts.isLoading} />
        <StatCard label="Bajarilgan" value={counts.data?.DONE ?? '—'} icon={CheckCircle2} tone="success" loading={counts.isLoading} />
        <StatCard label="Kechikkan (sahifada)" value={overdue} icon={AlertTriangle} tone="destructive" />
      </div>
      <FilterBar><FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} allLabel="Barcha holatlar" options={Object.entries(TASK_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} /></FilterBar>
      <DataTable columns={cols} rows={data?.items} rowKey={(t) => t.id} loading={isLoading} page={data?.page} pages={data?.pages} total={data?.total} onPageChange={setPage} />
      <TaskForm open={open} onOpenChange={setOpen} />
    </div>
  );
}

function TaskForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ title: '', description: '', assigneeId: '', dueAt: '' });
  const [search, setSearch] = React.useState('');
  const dq = useDebounce(search);
  const users = useQuery({ queryKey: ['users', 'pick', dq], queryFn: () => api.get<Paginated<User>>('/api/users', { limit: 50, status: 'ACTIVE', search: dq || undefined }), enabled: open });
  React.useEffect(() => { if (open) setF({ title: '', description: '', assigneeId: '', dueAt: dayjs().add(1, 'day').hour(18).minute(0).format('YYYY-MM-DDTHH:mm') }); }, [open]);
  const m = useMutation({ mutationFn: () => api.post('/api/tasks', { title: f.title.trim(), description: f.description.trim() || null, assigneeId: f.assigneeId, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null }), onSuccess: () => { toast.success('Vazifa yuborildi'); void qc.invalidateQueries({ queryKey: ['tasks'] }); onOpenChange(false); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Yangi vazifa</DialogTitle><DialogDescription>Ijrochiga Telegram orqali xabar boradi; u botda «Bajarildi» tugmasini bosadi.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1.5"><Label>Sarlavha *</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} /></div>
          <div className="space-y-1.5"><Label>Tavsif</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-20" /></div>
          <div className="space-y-1.5"><Label>Ijrochi *</Label><Input placeholder="Qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-1" /><Select value={f.assigneeId} onValueChange={(v) => setF({ ...f, assigneeId: v })}><SelectTrigger className="w-full"><SelectValue placeholder="Xodimni tanlang" /></SelectTrigger><SelectContent>{users.data?.items.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName} — {u.role.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Muddat</Label><Input type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button type="submit" loading={m.isPending} disabled={!f.assigneeId}>Yuborish</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
