'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users, GraduationCap, ClipboardCheck, FileClock, Star, Send, ArrowRight, Clock, CheckCircle2, FileText, UserPlus, Megaphone, ClipboardList, Building2, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import type { DashboardData, Branch } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AreaTrend, Bars, Donut, ChartLegend, COLORS, LineTrend } from '@/components/charts';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { REPORT_STATUS, REPORT_TYPES, ROLE_LABELS } from '@/lib/labels';
import { fromNow, dayjs, cn, pct } from '@/lib/utils';
import { UserCell } from '@/components/shared/user-cell';
import { Rating } from '@/components/shared/rating';
import { FilterSelect } from '@/components/shared/filters';
import { EmptyState } from '@/components/shared/empty-state';

const RANGES = [
  { value: '7d', label: '7 kun' },
  { value: '30d', label: '30 kun' },
  { value: '90d', label: '90 kun' },
  { value: '12m', label: '12 oy' },
];

const KIND_ICON = { response: ClipboardCheck, report: FileText, user: UserPlus, survey: ClipboardList, announcement: Megaphone } as const;
const KIND_LABEL = { response: "So'rovnoma to'ldirdi", report: 'Hisobot topshirdi', user: "Ro'yxatdan o'tdi", survey: "So'rovnoma yuborildi", announcement: "E'lon chiqdi" } as const;

export default function DashboardPage() {
  const { user, is } = useAuth();
  const [range, setRange] = React.useState('30d');
  const [branchId, setBranchId] = React.useState('');
  const canPickBranch = !is('DIRECTOR');

  const branches = useQuery({ queryKey: ['branches', 'all'], queryFn: () => api.get<Branch[]>('/api/branches'), enabled: canPickBranch });
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', range, branchId],
    queryFn: () => api.get<DashboardData>('/api/analytics/dashboard', { range, branchId: branchId || undefined }),
    refetchInterval: 120_000,
  });
  const o = data?.overview;
  const greeting = React.useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Xayrli tong' : h < 18 ? 'Xayrli kun' : 'Xayrli kech';
  }, []);

  const statusData = (data?.reports.byStatus ?? []).map((s, i) => ({ name: REPORT_STATUS[s.status]?.label ?? s.status, value: s.count, color: { PENDING: 'var(--chart-3)', APPROVED: 'var(--chart-2)', REJECTED: 'var(--chart-4)', NEEDS_REVISION: 'var(--chart-1)' }[s.status] ?? COLORS[i] }));
  const typeData = (data?.reports.byType ?? []).map((t) => ({ name: REPORT_TYPES[t.type]?.label ?? t.type, count: t.count }));

  return (
    <div>
      <PageHeader
        title={<span>{greeting}, {user?.fullName.split(' ')[0]} 👋</span>}
        description={`${dayjs(data?.scope.from).format('DD MMM')} — ${dayjs(data?.scope.to).format('DD MMM YYYY')} · ${user?.branch && is('DIRECTOR') ? user.branch.name : branchId ? branches.data?.find((b) => b.id === branchId)?.name : 'Barcha filiallar'}`}
        actions={
          <>
            {canPickBranch && <FilterSelect value={branchId} onChange={setBranchId} allLabel="Barcha filiallar" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} className="sm:w-48" />}
            <Tabs value={range} onValueChange={setRange}>
              <TabsList>
                {RANGES.map((r) => (
                  <TabsTrigger key={r.value} value={r.value} className="px-2.5 text-xs sm:px-3 sm:text-sm">{r.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </>
        }
      />

      {/* KPI cards */}
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 lg:gap-4">
        <StatCard loading={isLoading} label="Tutorlar" value={o?.totalTutors ?? 0} icon={GraduationCap} tone="primary" hint={`${o?.activeUsers ?? 0} faol xodim`} />
        <StatCard loading={isLoading} label="O‘qituvchilar" value={o?.totalTeachers ?? 0} icon={Users} tone="violet" hint={`${o?.telegramLinked ?? 0} ta Telegramga ulangan`} />
        <StatCard loading={isLoading} label="Yuborilgan so‘rovnomalar" value={o?.surveysSent ?? 0} icon={Send} tone="info" hint={`${o?.activeSurveys ?? 0} ta hozir faol`} />
        <StatCard loading={isLoading} label="Bajarilish darajasi" value={pct(o?.completionRate)} icon={ClipboardCheck} tone="success" delta={o?.completionRateDelta} />
        <StatCard loading={isLoading} label="Kutilayotgan hisobotlar" value={o?.pendingReports ?? 0} icon={FileClock} tone="warning" delta={o?.reportsDelta} deltaLabel="hisobotlar oqimi" />
        <StatCard loading={isLoading} label="O‘rtacha baho" value={o?.avgRating ? o.avgRating.toFixed(2) : '—'} icon={Star} tone="destructive" hint={`${o?.surveysCompleted ?? 0} ta javob asosida`} />
      </div>

      {/* Row: completion + rating */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>So‘rovnoma bajarilishi</CardTitle>
            <CardDescription>Kunlik tayinlangan va bajarilgan so‘rovnomalar</CardDescription>
            <CardAction>
              <ChartLegend items={[{ name: 'Tayinlangan', color: COLORS[0] }, { name: 'Bajarilgan', color: COLORS[1] }]} />
            </CardAction>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[260px]" /> : <AreaTrend data={data?.completion ?? []} xKey="date" series={[{ key: 'assigned', name: 'Tayinlangan' }, { key: 'completed', name: 'Bajarilgan' }]} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>O‘rtacha baho dinamikasi</CardTitle>
            <CardDescription>Haftalik, 1–5 shkala</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[260px]" /> : (data?.rating.length ?? 0) > 0 ? <LineTrend data={data?.rating ?? []} xKey="week" series={[{ key: 'avg', name: 'O‘rtacha baho', color: 'var(--chart-3)' }]} yDomain={[1, 5]} formatter={(v) => v.toFixed(2)} /> : <EmptyState title="Baholar yo‘q" className="py-10" />}
          </CardContent>
        </Card>
      </div>

      {/* Row: branches + activity */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Filiallar bo‘yicha ko‘rsatkichlar</CardTitle>
            <CardDescription>Bajarilish, hisobotlar va KPI taqqoslash</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild><Link href="/branches">Barchasi <ArrowRight /></Link></Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data?.branches.map((b) => (
                  <Link key={b.id} href={`/branches/${b.id}`} className="hover:bg-accent/50 group rounded-xl border p-4 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl"><Building2 className="size-4" /></span>
                        <div>
                          <div className="font-medium">{b.name}</div>
                          <div className="text-muted-foreground text-xs">{b.staff} xodim · {b.students ?? 0} o‘quvchi</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tabular text-lg font-semibold">{b.kpiScore ?? '—'}</div>
                        <div className="text-muted-foreground text-[11px]">KPI</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground mb-1">Bajarilish</div>
                        <Progress value={b.completionRate ?? 0} className="h-1.5" />
                        <div className="tabular mt-1 font-medium">{pct(b.completionRate)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Tasdiqlangan</div>
                        <Progress value={b.approvedRate ?? 0} className="h-1.5" indicatorClassName="bg-success" />
                        <div className="tabular mt-1 font-medium">{pct(b.approvedRate)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Baho</div>
                        <Rating value={b.avgRating} showValue={false} />
                        <div className="tabular mt-1 font-medium">{b.avgRating?.toFixed(2) ?? '—'}</div>
                      </div>
                    </div>
                  </Link>
                ))}
                {data?.branches.length === 0 && <EmptyState title="Filial topilmadi" className="md:col-span-2" />}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Faollik</CardTitle>
            <CardDescription>Kunlik faol tutor va o‘qituvchilar</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[260px]" /> : <Bars data={data?.activity ?? []} xKey="date" xFormat={(v) => dayjs(v).format('DD.MM')} series={[{ key: 'tutors', name: 'Tutorlar' }, { key: 'teachers', name: 'O‘qituvchilar', color: 'var(--chart-5)' }]} stacked />}
          </CardContent>
        </Card>
      </div>

      {/* Row: reports + top + recent */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Hisobotlar holati</CardTitle>
            <CardDescription>Davr bo‘yicha ko‘rib chiqish natijalari</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[220px]" /> : statusData.length ? <Donut data={statusData} centerLabel="hisobot" /> : <EmptyState title="Hisobot yo‘q" className="py-8" />}
            <div className="mt-2"><ChartLegend items={statusData.map((s) => ({ name: s.name, color: s.color, value: s.value }))} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hisobot turlari</CardTitle>
            <CardDescription>Qaysi turdagi hisobotlar ko‘p</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[220px]" /> : <Bars data={typeData} xKey="name" series={[{ key: 'count', name: 'Soni' }]} height={230} horizontal colorful />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="size-4 text-amber-500" /> Eng faol xodimlar</CardTitle>
            <CardDescription>KPI bo‘yicha yetakchilar</CardDescription>
            <CardAction><Button variant="ghost" size="sm" asChild><Link href="/kpi">KPI <ArrowRight /></Link></Button></CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9" />) : data?.top.slice(0, 6).map((t, i) => (
              <Link key={t.id} href={`/users/${t.id}`} className="hover:bg-accent/50 -mx-2 flex items-center gap-2 rounded-lg px-2 py-1 transition-colors">
                <span className={cn('tabular w-5 text-center text-xs font-semibold', i === 0 ? 'text-amber-500' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-orange-600' : 'text-muted-foreground')}>{i + 1}</span>
                <div className="min-w-0 flex-1"><UserCell name={t.fullName} sub={`${ROLE_LABELS[t.role.key]} · ${t.branch?.name ?? '—'}`} avatarUrl={t.avatarUrl} size="sm" /></div>
                <Badge variant="primary" className="tabular">{t.kpiScore ?? '—'}</Badge>
              </Link>
            ))}
            {!isLoading && data?.top.length === 0 && <EmptyState title="Ma’lumot yo‘q" className="py-6" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="size-4 text-primary" /> Yaqin muddatlar</CardTitle>
            <CardDescription>Faol so‘rovnomalar tugash muddati</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />) : data?.deadlines.map((d) => {
              const p = d.assigned ? Math.round((d.completed / d.assigned) * 100) : 0;
              const soon = dayjs(d.deadline).diff(dayjs(), 'hour') < 24;
              return (
                <Link key={d.id} href={`/surveys/${d.id}`} className="hover:bg-accent/50 -mx-2 block rounded-lg px-2 py-1.5 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium">{d.title}</div>
                    <Badge variant={soon ? 'destructive' : 'muted'} className="shrink-0">{fromNow(d.deadline)}</Badge>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Progress value={p} className="h-1.5" indicatorClassName={p >= 80 ? 'bg-success' : p >= 50 ? 'bg-warning' : 'bg-destructive'} />
                    <span className="tabular text-muted-foreground shrink-0 text-xs">{d.completed}/{d.assigned}</span>
                  </div>
                </Link>
              );
            })}
            {!isLoading && data?.deadlines.length === 0 && <EmptyState icon={CheckCircle2} title="Yaqin muddat yo‘q" className="py-6" />}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>So‘nggi faollik</CardTitle>
          <CardDescription>Xodimlarning real vaqtdagi harakatlari</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <ul className="divide-y">
              {data?.recent.map((r) => {
                const Icon = KIND_ICON[r.kind] ?? ClipboardCheck;
                const href = r.kind === 'response' && r.meta?.surveyId ? `/surveys/${r.meta.surveyId}` : r.kind === 'report' ? `/reports?id=${r.id.replace(/^r-|^rep-/, '')}` : r.user ? `/users/${r.user.id}` : '#';
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg"><Icon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm"><span className="font-medium">{r.user?.fullName ?? 'Tizim'}</span> <span className="text-muted-foreground">{KIND_LABEL[r.kind] ?? r.kind}</span></div>
                      <Link href={href} className="text-muted-foreground hover:text-foreground block truncate text-xs">{r.title}</Link>
                    </div>
                    {typeof r.meta?.rating === 'number' && <Rating value={r.meta.rating as number} showValue={false} />}
                    <span className="text-muted-foreground shrink-0 text-xs">{fromNow(r.at)}</span>
                  </li>
                );
              })}
              {data?.recent.length === 0 && <EmptyState title="Faollik yo‘q" className="py-8" />}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
