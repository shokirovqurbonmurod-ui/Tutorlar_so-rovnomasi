'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Mail, Phone, Send, Building2, Briefcase, CalendarDays, Clock, ClipboardCheck, FileText, Target, Link2Off, KeyRound, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { User, Report, KpiPeriod } from '@/lib/types';
import { ROLE_LABELS, USER_STATUS, REPORT_STATUS, REPORT_TYPES } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/status-badge';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Rating } from '@/components/shared/rating';
import { UserFormDialog } from '@/components/users/user-form';
import { LineTrend, Bars } from '@/components/charts';
import { fmtDate, fmtDateTime, fromNow, initials, dayjs } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface UserDetail extends User {
  tutorGroups: Array<{ id: string; name: string; subject: string | null; studentCount: number | null }>;
  teacherGroups: Array<{ id: string; name: string; subject: string | null; studentCount: number | null }>;
  kpiResults: Array<{ id: string; period: KpiPeriod; periodStart: string; value: number; score: number; metric: { key: string; name: string; weight: number } }>;
  recentResponses: Array<{ id: string; submittedAt: string; avgRating: number | null; durationSec: number | null; survey: { id: string; title: string } }>;
  recentReports: Report[];
  auditTrail: Array<{ id: string; action: string; entity: string; createdAt: string; source: string }>;
  _count: { assignments: number; reports: number; responses: number };
}
interface KpiHistory { key: string; period: KpiPeriod; periodStart: string; total: number; metrics: Array<{ key: string; name: string; score: number; value: number; weight: number }> }

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [edit, setEdit] = React.useState(false);

  const { data: u, isLoading } = useQuery({ queryKey: ['user', id], queryFn: () => api.get<UserDetail>(`/api/users/${id}`) });
  const kpi = useQuery({ queryKey: ['kpi', 'user', id], queryFn: () => api.get<KpiHistory[]>(`/api/kpi/user/${id}`), enabled: can('kpi.view') });

  const unlink = useMutation({
    mutationFn: () => api.post(`/api/users/${id}/unlink-telegram`),
    onSuccess: () => { toast.success('Telegram uzildi'); void qc.invalidateQueries({ queryKey: ['user', id] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });

  if (isLoading || !u) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40" />
        <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      </div>
    );
  }

  const groups = [...(u.tutorGroups ?? []), ...(u.teacherGroups ?? [])];
  const weekly = (kpi.data ?? []).filter((k) => k.period === 'WEEKLY').slice(0, 10).reverse();
  const latest = kpi.data?.[0];
  const completion = u._count.assignments ? Math.round((u._count.responses / u._count.assignments) * 100) : null;
  const avgRating = u.recentResponses.filter((r) => r.avgRating != null).reduce((s, r, _, arr) => s + (r.avgRating ?? 0) / arr.length, 0) || null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft /> Orqaga</Button>
      </div>

      <Card className="overflow-hidden py-0">
        <div className="h-24 bg-linear-to-r from-indigo-500/80 via-sky-500/70 to-emerald-400/70" />
        <CardContent className="-mt-10 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar className="ring-card size-20 ring-4">
                <AvatarImage src={u.avatarUrl ?? undefined} />
                <AvatarFallback className="text-xl">{initials(u.fullName)}</AvatarFallback>
              </Avatar>
              <div className="pb-1">
                <h2 className="text-xl font-semibold tracking-tight">{u.fullName}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="primary">{ROLE_LABELS[u.role.key]}</Badge>
                  <StatusBadge value={u.status} map={USER_STATUS} />
                  {u.position && <span className="text-muted-foreground text-sm">{u.position}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {can('users.update') && u.telegramId && <Button variant="outline" size="sm" onClick={() => unlink.mutate()} loading={unlink.isPending}><Link2Off /> Telegramni uzish</Button>}
              {can('users.update') && <Button size="sm" onClick={() => setEdit(true)}><Pencil /> Tahrirlash</Button>}
            </div>
          </div>
          <div className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info icon={Mail} label="Email" value={u.email} />
            <Info icon={Phone} label="Telefon" value={u.phone} />
            <Info icon={Send} label="Telegram" value={u.telegramId ? (u.telegramUsername ? `@${u.telegramUsername}` : `ID ${u.telegramId}`) : 'Ulanmagan'} />
            <Info icon={Building2} label="Filial / bo‘lim" value={[u.branch?.name, u.department?.name].filter(Boolean).join(' · ') || null} />
            <Info icon={Briefcase} label="Lavozim" value={u.position} />
            <Info icon={CalendarDays} label="Ishga kirgan" value={fmtDate(u.joinDate)} />
            <Info icon={Clock} label="So‘nggi faollik" value={fromNow(u.lastActivityAt ?? u.lastLoginAt)} />
            <Info icon={KeyRound} label="So‘nggi kirish" value={fmtDateTime(u.lastLoginAt)} />
          </div>
          {u.notes && <div className="bg-muted/50 mt-4 rounded-xl p-3 text-sm"><span className="text-muted-foreground">Izoh: </span>{u.notes}</div>}
        </CardContent>
      </Card>

      <div className="stagger mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="So‘rovnomalar" value={`${u._count.responses}/${u._count.assignments}`} icon={ClipboardCheck} tone="primary" hint={completion !== null ? `${completion}% bajarilgan` : 'Tayinlanmagan'} />
        <StatCard label="Hisobotlar" value={u._count.reports} icon={FileText} tone="info" hint={`${u.recentReports.filter((r) => r.status === 'PENDING').length} ta kutilmoqda`} />
        <StatCard label="O‘rtacha baho" value={avgRating ? avgRating.toFixed(2) : '—'} icon={Target} tone="warning" hint="so‘nggi javoblar" />
        <StatCard label="KPI" value={latest ? latest.total : '—'} icon={Target} tone="success" hint={latest ? `${latest.period === 'WEEKLY' ? 'Hafta' : 'Oy'} · ${fmtDate(latest.periodStart)}` : 'Hisoblanmagan'} />
      </div>

      <Tabs defaultValue="kpi" className="mt-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="kpi">KPI</TabsTrigger>
          <TabsTrigger value="responses">Javoblar</TabsTrigger>
          <TabsTrigger value="reports">Hisobotlar</TabsTrigger>
          <TabsTrigger value="groups">Guruhlar</TabsTrigger>
          {can('audit.view') && <TabsTrigger value="audit">Audit</TabsTrigger>}
        </TabsList>

        <TabsContent value="kpi">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Haftalik KPI dinamikasi</CardTitle><CardDescription>Umumiy ball (0–100)</CardDescription></CardHeader>
              <CardContent>{weekly.length ? <LineTrend data={weekly} xKey="periodStart" series={[{ key: 'total', name: 'KPI' }]} yDomain={[0, 100]} /> : <EmptyState title="KPI hali hisoblanmagan" className="py-8" />}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Metrikalar</CardTitle><CardDescription>{latest ? `${latest.period === 'WEEKLY' ? 'Hafta' : 'Oy'} · ${fmtDate(latest.periodStart)}` : ''}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {latest?.metrics.map((m) => (
                  <div key={m.key}>
                    <div className="mb-1 flex items-center justify-between text-sm"><span>{m.name}</span><span className="tabular font-medium">{m.score}</span></div>
                    <Progress value={m.score} className="h-1.5" indicatorClassName={m.score >= 75 ? 'bg-success' : m.score >= 50 ? 'bg-warning' : 'bg-destructive'} />
                  </div>
                )) ?? <EmptyState className="py-6" />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="responses">
          <Card>
            <CardHeader><CardTitle>So‘nggi javoblar</CardTitle></CardHeader>
            <CardContent>
              {u.recentResponses.length ? (
                <ul className="divide-y">
                  {u.recentResponses.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/surveys/${r.survey.id}`} className="truncate text-sm font-medium hover:underline">{r.survey.title}</Link>
                        <div className="text-muted-foreground text-xs">{fmtDateTime(r.submittedAt)}{r.durationSec ? ` · ${Math.round(r.durationSec / 60)} daq` : ''}</div>
                      </div>
                      <Rating value={r.avgRating} />
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="Javoblar yo‘q" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader><CardTitle>So‘nggi hisobotlar</CardTitle><CardAction><Button variant="ghost" size="sm" asChild><Link href={`/reports?authorId=${u.id}`}>Barchasi</Link></Button></CardAction></CardHeader>
            <CardContent>
              {u.recentReports.length ? (
                <ul className="divide-y">
                  {u.recentReports.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-2.5">
                      <span className="text-lg">{REPORT_TYPES[r.type]?.icon}</span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/reports?id=${r.id}`} className="truncate text-sm font-medium hover:underline">{r.title}</Link>
                        <div className="text-muted-foreground text-xs">{REPORT_TYPES[r.type]?.label} · {fmtDateTime(r.createdAt)}</div>
                      </div>
                      <StatusBadge value={r.status} map={REPORT_STATUS} />
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="Hisobotlar yo‘q" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups">
          <Card>
            <CardHeader><CardTitle>Biriktirilgan guruhlar</CardTitle></CardHeader>
            <CardContent>
              {groups.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groups.map((g) => (
                    <div key={g.id} className="rounded-xl border p-3">
                      <div className="font-medium">{g.name}</div>
                      <div className="text-muted-foreground text-xs">{g.subject ?? '—'} · {g.studentCount ?? 0} o‘quvchi</div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="Guruh biriktirilmagan" />}
            </CardContent>
          </Card>
        </TabsContent>

        {can('audit.view') && (
          <TabsContent value="audit">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="size-4" /> Audit jurnali</CardTitle></CardHeader>
              <CardContent>
                {u.auditTrail.length ? (
                  <ul className="divide-y text-sm">
                    {u.auditTrail.map((a) => (
                      <li key={a.id} className="flex items-center justify-between py-2">
                        <span><code className="bg-muted rounded px-1.5 py-0.5 text-xs">{a.action}</code> <span className="text-muted-foreground ml-2 text-xs">{a.entity} · {a.source}</span></span>
                        <span className="text-muted-foreground text-xs">{fmtDateTime(a.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState title="Yozuvlar yo‘q" />}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <UserFormDialog open={edit} onOpenChange={setEdit} user={u} />
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg"><Icon className="size-3.5" /></span>
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="truncate font-medium">{value || '—'}</div>
      </div>
    </div>
  );
}
