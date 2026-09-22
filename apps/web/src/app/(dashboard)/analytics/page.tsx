'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Download, TrendingUp, Users, ClipboardCheck, Star, FileText, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { DashboardData, Performer, Branch } from '@/lib/types';
import { REPORT_STATUS, REPORT_TYPES, ROLE_LABELS } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/shared/stat-card';
import { FilterSelect } from '@/components/shared/filters';
import { AreaTrend, Bars, LineTrend, Donut, ChartLegend, COLORS, Gauge } from '@/components/charts';
import { DataTable, type Column } from '@/components/shared/data-table';
import { UserCell } from '@/components/shared/user-cell';
import { Rating } from '@/components/shared/rating';
import { EmptyState } from '@/components/shared/empty-state';
import { dayjs, pct } from '@/lib/utils';
import { toast } from 'sonner';

const RANGES = [{ value: '7d', label: '7 kun' }, { value: '30d', label: '30 kun' }, { value: '90d', label: '90 kun' }, { value: '12m', label: '12 oy' }];

export default function AnalyticsPage() {
  const { is, can } = useAuth();
  const [range, setRange] = React.useState('90d');
  const [branchId, setBranchId] = React.useState('');
  const [role, setRole] = React.useState('');
  const branches = useQuery({ queryKey: ['branches', 'all'], queryFn: () => api.get<Branch[]>('/api/branches'), enabled: !is('DIRECTOR') });
  const { data, isLoading } = useQuery({ queryKey: ['dashboard', range, branchId], queryFn: () => api.get<DashboardData>('/api/analytics/dashboard', { range, branchId: branchId || undefined }) });
  const performers = useQuery({ queryKey: ['performers', range, branchId, role], queryFn: () => api.get<Performer[]>('/api/analytics/performers', { range, branchId: branchId || undefined, role: role || undefined, limit: 50 }) });
  const o = data?.overview;

  const exportCsv = () => {
    if (!performers.data) return;
    const head = ['Xodim', 'Rol', 'Filial', 'Tayinlangan', 'Bajarilgan', 'Bajarilish %', 'Hisobotlar', 'O‘rtacha baho', 'KPI'];
    const rows = performers.data.map((p) => [p.fullName, ROLE_LABELS[p.role.key], p.branch?.name ?? '', p.assigned, p.completed, p.completionRate ?? '', p.reports, p.avgRating ?? '', p.kpiScore ?? '']);
    const csv = '\uFEFF' + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `analitika-${range}.csv`; a.click();
    toast.success('CSV yuklab olindi');
  };

  const weeklyReports = (data?.reports.weekly ?? []).map((w) => ({ ...w, week: w.week }));
  const statusData = (data?.reports.byStatus ?? []).map((s) => ({ name: REPORT_STATUS[s.status].label, value: s.count, color: { PENDING: 'var(--chart-3)', APPROVED: 'var(--chart-2)', REJECTED: 'var(--chart-4)', NEEDS_REVISION: 'var(--chart-1)' }[s.status] }));
  const approved = data?.reports.byStatus.find((s) => s.status === 'APPROVED')?.count ?? 0;
  const totalReports = data?.reports.byStatus.reduce((s, x) => s + x.count, 0) ?? 0;

  const cols: Column<Performer>[] = [
    { key: 'rank', header: '#', className: 'w-10', cell: (p) => <span className="tabular text-muted-foreground text-xs">{(performers.data?.indexOf(p) ?? 0) + 1}</span> },
    { key: 'user', header: 'Xodim', cell: (p) => <UserCell name={p.fullName} sub={`${ROLE_LABELS[p.role.key]} · ${p.branch?.name ?? '—'}`} avatarUrl={p.avatarUrl} size="sm" /> },
    { key: 'assigned', header: 'So‘rovnomalar', hideBelow: 'md', cell: (p) => <span className="tabular text-sm">{p.completed}/{p.assigned}</span> },
    { key: 'rate', header: 'Bajarilish', cell: (p) => <div className="flex items-center gap-2"><div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full"><div className="bg-primary h-full" style={{ width: `${p.completionRate ?? 0}%` }} /></div><span className="tabular text-xs">{pct(p.completionRate)}</span></div> },
    { key: 'reports', header: 'Hisobotlar', hideBelow: 'lg', cell: (p) => <span className="tabular text-sm">{p.reports}</span> },
    { key: 'rating', header: 'Baho', hideBelow: 'sm', cell: (p) => <Rating value={p.avgRating} /> },
    { key: 'kpi', header: 'KPI', cell: (p) => <Badge variant={p.kpiScore != null && p.kpiScore >= 70 ? 'success' : p.kpiScore != null && p.kpiScore >= 50 ? 'primary' : 'warning'} className="tabular">{p.kpiScore ?? '—'}</Badge> },
  ];

  return (
    <div>
      <PageHeader title="Analitika" description="So‘rovnomalar, hisobotlar va xodimlar faolligi bo‘yicha chuqur tahlil" actions={<>
        {!is('DIRECTOR') && <FilterSelect value={branchId} onChange={setBranchId} allLabel="Barcha filiallar" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} className="sm:w-48" />}
        <Tabs value={range} onValueChange={setRange}><TabsList>{RANGES.map((r) => <TabsTrigger key={r.value} value={r.value} className="px-2.5 text-xs sm:px-3 sm:text-sm">{r.label}</TabsTrigger>)}</TabsList></Tabs>
        {can('analytics.export') && <Button variant="outline" onClick={exportCsv}><Download /> CSV</Button>}
      </>} />

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard loading={isLoading} label="Bajarilish darajasi" value={pct(o?.completionRate)} icon={ClipboardCheck} tone="success" delta={o?.completionRateDelta} />
        <StatCard loading={isLoading} label="Javoblar" value={o?.surveysCompleted ?? 0} icon={TrendingUp} tone="primary" hint={`${o?.surveysAssigned ?? 0} tayinlangan · ${o?.overdueAssignments ?? 0} kechikkan`} />
        <StatCard loading={isLoading} label="Hisobotlar" value={o?.reportsThisPeriod ?? 0} icon={FileText} tone="info" delta={o?.reportsDelta} hint={`${o?.pendingReports ?? 0} kutilmoqda`} />
        <StatCard loading={isLoading} label="O‘rtacha baho" value={o?.avgRating?.toFixed(2) ?? '—'} icon={Star} tone="warning" hint={`${o?.activeUsers ?? 0} faol xodim`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader><CardTitle>So‘rovnoma bajarilishi</CardTitle><CardDescription>Tayinlangan va bajarilgan — kunlik</CardDescription><CardAction><ChartLegend items={[{ name: 'Tayinlangan', color: COLORS[0] }, { name: 'Bajarilgan', color: COLORS[1] }]} /></CardAction></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[260px]" /> : <AreaTrend data={data?.completion ?? []} xKey="date" series={[{ key: 'assigned', name: 'Tayinlangan' }, { key: 'completed', name: 'Bajarilgan' }]} />}</CardContent></Card>
        <Card><CardHeader><CardTitle>Tasdiqlash darajasi</CardTitle><CardDescription>Hisobotlarning tasdiqlangan ulushi</CardDescription></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[160px]" /> : <Gauge value={totalReports ? (approved / totalReports) * 100 : 0} label={`${approved} / ${totalReports} hisobot`} color="var(--chart-2)" />}<div className="mt-2"><ChartLegend items={statusData.map((s) => ({ name: s.name, color: s.color!, value: s.value }))} /></div></CardContent></Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>O‘rtacha baho dinamikasi</CardTitle><CardDescription>Haftalik, javoblar soni bilan</CardDescription></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[240px]" /> : data?.rating.length ? <LineTrend data={data.rating} xKey="week" series={[{ key: 'avg', name: 'Baho', color: 'var(--chart-3)' }]} yDomain={[1, 5]} height={240} formatter={(v) => v.toFixed(2)} /> : <EmptyState className="py-8" />}</CardContent></Card>
        <Card><CardHeader><CardTitle>Haftalik hisobotlar</CardTitle><CardDescription>Topshirilgan hisobotlar soni</CardDescription></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[240px]" /> : weeklyReports.length ? <Bars data={weeklyReports} xKey="week" xFormat={(v) => dayjs(v).format('DD.MM')} series={[{ key: 'count', name: 'Hisobotlar', color: 'var(--chart-5)' }]} height={240} /> : <EmptyState className="py-8" />}</CardContent></Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Hisobot turlari</CardTitle></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[220px]" /> : <Donut data={(data?.reports.byType ?? []).map((t) => ({ name: REPORT_TYPES[t.type].label, value: t.count }))} centerLabel="hisobot" />}</CardContent></Card>
        <Card><CardHeader><CardTitle>Kunlik faollik</CardTitle><CardDescription>Faol tutor va o‘qituvchilar</CardDescription></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[220px]" /> : <Bars data={data?.activity ?? []} xKey="date" xFormat={(v) => dayjs(v).format('DD.MM')} series={[{ key: 'tutors', name: 'Tutorlar' }, { key: 'teachers', name: 'O‘qituvchilar', color: 'var(--chart-5)' }]} stacked height={220} />}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4" /> Filiallar</CardTitle><CardDescription>Bajarilish va KPI</CardDescription></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[220px]" /> : <Bars data={(data?.branches ?? []).map((b) => ({ name: b.code, 'Bajarilish': b.completionRate ?? 0, KPI: b.kpiScore ?? 0 }))} xKey="name" series={[{ key: 'Bajarilish', name: 'Bajarilish %' }, { key: 'KPI', name: 'KPI' }]} height={220} />}</CardContent></Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" /> Xodimlar reytingi</CardTitle><CardDescription>Davr bo‘yicha faollik va KPI</CardDescription><CardAction><FilterSelect value={role} onChange={setRole} allLabel="Barcha rollar" options={[{ value: 'TUTOR', label: 'Tutorlar' }, { value: 'TEACHER', label: 'O‘qituvchilar' }]} className="sm:w-40" /></CardAction></CardHeader>
        <CardContent><DataTable className="border-0 shadow-none" columns={cols} rows={performers.data} rowKey={(p) => p.id} loading={performers.isLoading} onRowClick={(p) => (window.location.href = `/users/${p.id}`)} /></CardContent>
      </Card>
      <p className="text-muted-foreground mt-3 text-center text-xs">Batafsil KPI hisoboti uchun <Link href="/kpi" className="text-primary hover:underline">KPI sahifasiga</Link> o‘ting</p>
    </div>
  );
}
