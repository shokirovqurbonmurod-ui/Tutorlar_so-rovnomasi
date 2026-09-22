'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Target, RefreshCw, Trophy, Settings2, Save, Medal } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { KpiMetric, KpiPeriod, Leaderboard, Branch, RoleKey } from '@/lib/types';
import { KPI_PERIODS, ROLE_LABELS } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/shared/stat-card';
import { FilterSelect } from '@/components/shared/filters';
import { UserCell } from '@/components/shared/user-cell';
import { EmptyState } from '@/components/shared/empty-state';
import { Bars, Gauge } from '@/components/charts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { fmtDate, cn } from '@/lib/utils';

export default function KpiPage() {
  const qc = useQueryClient();
  const { can, is } = useAuth();
  const [period, setPeriod] = React.useState<KpiPeriod>('WEEKLY');
  const [branchId, setBranchId] = React.useState('');
  const [role, setRole] = React.useState('');
  const [metricsOpen, setMetricsOpen] = React.useState(false);
  const branches = useQuery({ queryKey: ['branches', 'all'], queryFn: () => api.get<Branch[]>('/api/branches'), enabled: !is('DIRECTOR') });
  const metrics = useQuery({ queryKey: ['kpi', 'metrics'], queryFn: () => api.get<KpiMetric[]>('/api/kpi/metrics') });
  const lb = useQuery({ queryKey: ['kpi', 'leaderboard', period, branchId, role], queryFn: () => api.get<Leaderboard>('/api/kpi/leaderboard', { period, branchId: branchId || undefined, role: role || undefined, limit: 100 }) });
  const compute = useMutation({ mutationFn: () => api.post<{ computed: number }>('/api/kpi/compute', { period }), onSuccess: (r) => { toast.success(`KPI qayta hisoblandi (${r.computed ?? ''} xodim)`); void qc.invalidateQueries({ queryKey: ['kpi'] }); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });

  const items = lb.data?.items ?? [];
  const activeMetrics = (metrics.data ?? []).filter((m) => m.isActive);
  const metricAvg = activeMetrics.map((m) => ({ name: m.name, avg: items.length ? Math.round(items.reduce((s, r) => s + (r.metrics.find((x) => x.key === m.key)?.score ?? 0), 0) / items.length) : 0 }));
  const tiers = { high: items.filter((i) => i.total >= 70).length, mid: items.filter((i) => i.total >= 50 && i.total < 70).length, low: items.filter((i) => i.total < 50).length };

  return (
    <div>
      <PageHeader title="KPI" description="Xodimlar samaradorligi: so‘rovnoma bajarilishi, hisobotlar, davomat, o‘quvchi fikri va vazifalar" actions={<>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as KpiPeriod)}><TabsList>{(Object.keys(KPI_PERIODS) as KpiPeriod[]).map((p) => <TabsTrigger key={p} value={p}>{KPI_PERIODS[p]}</TabsTrigger>)}</TabsList></Tabs>
        {can('kpi.manage') && <Button variant="outline" onClick={() => setMetricsOpen(true)}><Settings2 /> Metrikalar</Button>}
        {can('kpi.manage') && <Button onClick={() => compute.mutate()} loading={compute.isPending}><RefreshCw /> Qayta hisoblash</Button>}
      </>} />

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard loading={lb.isLoading} label="O‘rtacha KPI" value={lb.data?.average ?? '—'} icon={Target} tone="primary" hint={lb.data ? `${fmtDate(lb.data.range.start)} — ${fmtDate(lb.data.range.end)}` : ''} />
        <StatCard loading={lb.isLoading} label="Yuqori (≥70)" value={tiers.high} icon={Trophy} tone="success" hint={`${lb.data?.count ?? 0} xodimdan`} />
        <StatCard loading={lb.isLoading} label="O‘rta (50–69)" value={tiers.mid} icon={Medal} tone="warning" />
        <StatCard loading={lb.isLoading} label="Past (<50)" value={tiers.low} icon={Target} tone="destructive" hint="e’tibor talab qiladi" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Umumiy ko‘rsatkich</CardTitle><CardDescription>{KPI_PERIODS[period]} o‘rtacha</CardDescription></CardHeader><CardContent>{lb.isLoading ? <Skeleton className="h-40" /> : <Gauge value={lb.data?.average ?? 0} label="o‘rtacha KPI" />}</CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Metrikalar bo‘yicha o‘rtacha</CardTitle><CardDescription>Har bir metrika 0–100 ball, og‘irlik bilan yig‘iladi</CardDescription></CardHeader><CardContent>{lb.isLoading ? <Skeleton className="h-40" /> : <Bars data={metricAvg} xKey="name" series={[{ key: 'avg', name: 'O‘rtacha ball' }]} horizontal height={Math.max(160, metricAvg.length * 34)} colorful />}</CardContent></Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Reyting</CardTitle><CardDescription>Xodimlar KPI bo‘yicha saralangan. Ustunlar — metrikalar balli.</CardDescription>
          <CardAction className="flex gap-2">
            <FilterSelect value={role} onChange={setRole} allLabel="Barcha rollar" options={[{ value: 'TUTOR', label: 'Tutorlar' }, { value: 'TEACHER', label: 'O‘qituvchilar' }]} className="sm:w-36" />
            {!is('DIRECTOR') && <FilterSelect value={branchId} onChange={setBranchId} allLabel="Barcha filiallar" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} className="sm:w-44" />}
          </CardAction>
        </CardHeader>
        <CardContent>
          {lb.isLoading ? <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}</div> : items.length === 0 ? <EmptyState icon={Target} title="Bu davr uchun KPI hisoblanmagan" description="«Qayta hisoblash» tugmasini bosing yoki avtomatik hisoblashni kuting (har yakshanba / oy oxiri)." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-muted-foreground border-b text-left text-xs uppercase"><th className="w-10 py-2 pr-2">#</th><th className="py-2 pr-3">Xodim</th>{activeMetrics.map((m) => <th key={m.key} className="hidden px-2 py-2 text-center lg:table-cell"><Tooltip><TooltipTrigger className="cursor-help underline decoration-dotted">{m.name}</TooltipTrigger><TooltipContent>{m.description ?? m.name} · og‘irlik {m.weight}%</TooltipContent></Tooltip></th>)}<th className="py-2 pl-3 text-right">KPI</th></tr></thead>
                <tbody className="divide-y">
                  {items.map((r, i) => (
                    <tr key={r.user.id} className="hover:bg-muted/40">
                      <td className="py-2 pr-2"><span className={cn('tabular flex size-6 items-center justify-center rounded-full text-xs font-semibold', i === 0 ? 'bg-amber-400/20 text-amber-600' : i === 1 ? 'bg-zinc-300/30 text-zinc-500' : i === 2 ? 'bg-orange-400/20 text-orange-600' : 'text-muted-foreground')}>{i + 1}</span></td>
                      <td className="py-2 pr-3"><Link href={`/users/${r.user.id}`}><UserCell name={r.user.fullName} sub={`${ROLE_LABELS[r.user.role.key as RoleKey]} · ${r.user.branch?.code ?? r.user.branch?.name ?? '—'}`} avatarUrl={r.user.avatarUrl} size="sm" /></Link></td>
                      {activeMetrics.map((m) => { const s = r.metrics.find((x) => x.key === m.key)?.score; return <td key={m.key} className="hidden px-2 py-2 lg:table-cell"><div className="mx-auto w-20"><Progress value={s ?? 0} className="h-1.5" indicatorClassName={s == null ? '' : s >= 75 ? 'bg-success' : s >= 50 ? 'bg-warning' : 'bg-destructive'} /><div className="tabular text-muted-foreground mt-0.5 text-center text-[11px]">{s ?? '—'}</div></div></td>; })}
                      <td className="py-2 pl-3 text-right"><Badge variant={r.total >= 70 ? 'success' : r.total >= 50 ? 'primary' : 'warning'} className="tabular text-sm">{r.total}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <MetricsDialog open={metricsOpen} onOpenChange={setMetricsOpen} metrics={metrics.data ?? []} />
    </div>
  );
}

function MetricsDialog({ open, onOpenChange, metrics }: { open: boolean; onOpenChange: (o: boolean) => void; metrics: KpiMetric[] }) {
  const qc = useQueryClient();
  const [rows, setRows] = React.useState<KpiMetric[]>([]);
  React.useEffect(() => { if (open) setRows(metrics.map((m) => ({ ...m }))); }, [open, metrics]);
  const total = rows.filter((r) => r.isActive).reduce((s, r) => s + Number(r.weight || 0), 0);
  const save = useMutation({
    mutationFn: async () => { for (const r of rows) { const orig = metrics.find((m) => m.id === r.id); if (!orig || orig.weight !== r.weight || orig.isActive !== r.isActive || orig.target !== r.target) await api.patch(`/api/kpi/metrics/${r.id}`, { weight: Number(r.weight), isActive: r.isActive, target: r.target === null ? null : Number(r.target) }); } },
    onSuccess: () => { toast.success('Metrikalar saqlandi'); void qc.invalidateQueries({ queryKey: ['kpi'] }); onOpenChange(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>KPI metrikalari</DialogTitle><DialogDescription>Og‘irliklar yig‘indisi 100% bo‘lishi tavsiya etiladi. Hozir: <b className={total === 100 ? 'text-success' : 'text-warning'}>{total}%</b></DialogDescription></DialogHeader>
        <div className="divide-y">
          {rows.map((m, i) => (
            <div key={m.id} className="grid grid-cols-[1fr_80px_80px_44px] items-center gap-3 py-2.5 text-sm">
              <div><div className="font-medium">{m.name}</div><div className="text-muted-foreground text-xs">{m.description}</div><div className="mt-1 flex gap-1">{m.appliesTo.map((r) => <Badge key={r} variant="muted" className="text-[10px]">{ROLE_LABELS[r]}</Badge>)}</div></div>
              <div><div className="text-muted-foreground text-[10px]">Og‘irlik %</div><Input type="number" min={0} max={100} value={m.weight} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, weight: Number(e.target.value) } : r)))} className="h-8" /></div>
              <div><div className="text-muted-foreground text-[10px]">Maqsad {m.unit ?? ''}</div><Input type="number" value={m.target ?? ''} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, target: e.target.value === '' ? null : Number(e.target.value) } : r)))} className="h-8" /></div>
              <Switch checked={m.isActive} onCheckedChange={(v) => setRows(rows.map((r, j) => (j === i ? { ...r, isActive: v } : r)))} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button onClick={() => save.mutate()} loading={save.isPending}><Save /> Saqlash</Button></div>
      </DialogContent>
    </Dialog>
  );
}
