'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Users, ClipboardCheck, Star, Timer, EyeOff, Download, MessageSquareText, CalendarClock, CheckCircle2, Clock, XCircle, PlayCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { Survey, SurveyResults, SurveyStatus, User, Role, BranchRef } from '@/lib/types';
import { SURVEY_STATUS, AUDIENCE, QUESTION_TYPES, ROLE_LABELS } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { useBranches } from '@/lib/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/shared/status-badge';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { UserCell } from '@/components/shared/user-cell';
import { Rating } from '@/components/shared/rating';
import { FilterBar, FilterSelect } from '@/components/shared/filters';
import { SurveyActions } from '@/components/surveys/survey-actions';
import { Bars, AreaTrend, Donut, COLORS } from '@/components/charts';
import { DataTable, type Column } from '@/components/shared/data-table';
import { fmtDate, fmtDateTime, fromNow, dayjs, cn } from '@/lib/utils';
import { toast } from 'sonner';

type Assignment = { id: string; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED'; notifiedAt: string | null; startedAt: string | null; completedAt: string | null; remindedAt: string | null; user: { id: string; fullName: string; avatarUrl: string | null; role: Role; branch: BranchRef | null } };
type SurveyDetail = Survey & { assignments: Assignment[] };
type Results = Omit<SurveyResults, 'questions' | 'responses'> & {
  timeline: Array<{ date: string; count: number }>;
  questions: Array<{ id: string; order: number; type: string; text: string; answered: number; avg?: number | null; min?: number | null; max?: number | null; yesRate?: number; distribution?: Array<{ id?: string; label: string; count: number }>; texts?: Array<{ responseId: string; text: string }> }>;
  responses: Array<{ id: string; submittedAt: string; durationSec: number | null; avgRating: number | null; source: string; user: { id: string; fullName: string; avatarUrl?: string | null; role?: Role; branch?: BranchRef | null } | null; branchId: string | null; role: string | null; answers: Array<{ questionId: string; textValue: string | null; numberValue: number | null; boolValue: boolean | null; optionIds: string[] }> }>;
};

const A_STATUS = { PENDING: { label: 'Kutilmoqda', variant: 'muted', icon: Clock }, IN_PROGRESS: { label: 'Boshlagan', variant: 'info', icon: PlayCircle }, COMPLETED: { label: 'Bajarilgan', variant: 'success', icon: CheckCircle2 }, EXPIRED: { label: 'Muddati o‘tgan', variant: 'destructive', icon: XCircle } } as const;

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, is } = useAuth();
  const branches = useBranches(!is('DIRECTOR'));
  const [branchId, setBranchId] = React.useState('');
  const [role, setRole] = React.useState('');
  const [aStatus, setAStatus] = React.useState('');

  const { data: s, isLoading } = useQuery({ queryKey: ['survey', id], queryFn: () => api.get<SurveyDetail>(`/api/surveys/${id}`), refetchInterval: 60_000 });
  const results = useQuery({ queryKey: ['survey', id, 'results', branchId, role], queryFn: () => api.get<Results>(`/api/surveys/${id}/results`, { branchId: branchId || undefined, role: role || undefined }), enabled: can('surveys.results'), refetchInterval: 60_000 });

  if (isLoading || !s) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-32" /><div className="grid gap-3 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-80" /></div>;

  const r = results.data;
  const optionLabel = new Map<string, string>();
  for (const q of s.questions ?? []) for (const o of q.options) optionLabel.set(o.id, o.label);
  const assignments = s.assignments.filter((a) => !aStatus || a.status === aStatus);
  const aCounts = s.assignments.reduce((m, a) => ({ ...m, [a.status]: (m[a.status] ?? 0) + 1 }), {} as Record<string, number>);

  const exportAs = async (f: 'csv' | 'xlsx' | 'pdf') => { try { await api.download(`/api/surveys/${id}/export?format=${f}${branchId ? `&branchId=${branchId}` : ''}${role ? `&role=${role}` : ''}`); } catch (e) { toast.error(e instanceof Error ? e.message : 'Xatolik'); } };

  const respCols: Column<Results['responses'][number]>[] = [
    { key: 'user', header: 'Xodim', cell: (x) => x.user ? <UserCell name={x.user.fullName} sub={`${x.user.role ? ROLE_LABELS[x.user.role.key] : ''}${x.user.branch ? ' · ' + x.user.branch.name : ''}`} avatarUrl={x.user.avatarUrl} size="sm" /> : <span className="text-muted-foreground inline-flex items-center gap-1 text-sm"><EyeOff className="size-3.5" /> Anonim{x.role ? ` · ${ROLE_LABELS[x.role as keyof typeof ROLE_LABELS] ?? x.role}` : ''}</span> },
    { key: 'at', header: 'Vaqt', cell: (x) => <span className="text-xs">{fmtDateTime(x.submittedAt)}</span> },
    { key: 'dur', header: 'Davomiyligi', hideBelow: 'md', cell: (x) => <span className="text-muted-foreground text-xs">{x.durationSec ? `${Math.max(1, Math.round(x.durationSec / 60))} daq` : '—'}</span> },
    { key: 'rating', header: 'Baho', cell: (x) => <Rating value={x.avgRating} /> },
    ...(s.questions ?? []).slice(0, 4).map((q) => ({ key: q.id, header: <span title={q.text}>{q.order}. {q.text.slice(0, 18)}{q.text.length > 18 ? '…' : ''}</span>, hideBelow: 'xl' as const, cell: (x: Results['responses'][number]) => { const a = x.answers.find((z) => z.questionId === q.id); if (!a) return <span className="text-muted-foreground">—</span>; const v = a.numberValue ?? (a.boolValue === null ? null : a.boolValue ? 'Ha' : 'Yo‘q') ?? (a.optionIds.length ? a.optionIds.map((o) => optionLabel.get(o) ?? o).join(', ') : a.textValue); return <span className="block max-w-48 truncate text-xs" title={String(v ?? '')}>{String(v ?? '—')}</span>; } })),
  ];
  const aCols: Column<Assignment>[] = [
    { key: 'user', header: 'Xodim', cell: (a) => <UserCell name={a.user.fullName} sub={`${ROLE_LABELS[a.user.role.key]} · ${a.user.branch?.name ?? '—'}`} avatarUrl={a.user.avatarUrl} size="sm" /> },
    { key: 'status', header: 'Holat', cell: (a) => <StatusBadge value={a.status} map={A_STATUS} /> },
    { key: 'notified', header: 'Yuborilgan', hideBelow: 'md', cell: (a) => <span className="text-muted-foreground text-xs">{a.notifiedAt ? fromNow(a.notifiedAt) : '—'}</span> },
    { key: 'reminded', header: 'Eslatma', hideBelow: 'lg', cell: (a) => <span className="text-muted-foreground text-xs">{a.remindedAt ? fromNow(a.remindedAt) : '—'}</span> },
    { key: 'completed', header: 'Bajarilgan', cell: (a) => <span className="text-xs">{a.completedAt ? fmtDateTime(a.completedAt) : '—'}</span> },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push('/surveys')}><ArrowLeft /> So‘rovnomalar</Button>
        <SurveyActions survey={s} variant="bar" />
      </div>

      <Card className="gap-3">
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={s.status as SurveyStatus} map={SURVEY_STATUS} />
            <Badge variant="secondary"><Users /> {AUDIENCE[s.audience]}{s.branch ? ` · ${s.branch.name}` : ''}</Badge>
            {s.isAnonymous && <Badge variant="muted"><EyeOff /> Anonim</Badge>}
            {s.deadline && <Badge variant={s.status === 'ACTIVE' && dayjs(s.deadline).isBefore(dayjs().add(1, 'day')) ? 'destructive' : 'outline'}><CalendarClock /> Muddat: {fmtDate(s.deadline, 'DD.MM.YYYY HH:mm')}</Badge>}
            {s.status === 'SCHEDULED' && s.scheduledAt && <Badge variant="info"><CalendarClock /> Yuboriladi: {fmtDate(s.scheduledAt, 'DD.MM.YYYY HH:mm')}</Badge>}
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight lg:text-2xl">{s.title}</h2>
          {s.description && <p className="text-muted-foreground mt-1 text-sm">{s.description}</p>}
          <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>Yaratgan: <b className="text-foreground font-medium">{s.createdBy?.fullName ?? '—'}</b> · {fmtDate(s.createdAt)}</span>
            {s.sentAt && <span>Yuborilgan: {fmtDateTime(s.sentAt)}</span>}
            {s.closedAt && <span>Yopilgan: {fmtDateTime(s.closedAt)}</span>}
            <span>{s.questions?.length ?? 0} ta savol</span>
          </div>
        </CardContent>
      </Card>

      <div className="stagger mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tayinlangan" value={r?.summary.assigned ?? s._count?.assignments ?? 0} icon={Users} tone="primary" hint={`${aCounts.PENDING ?? 0} kutmoqda · ${aCounts.EXPIRED ?? 0} muddati o‘tgan`} />
        <StatCard label="Bajarilish" value={`${r?.summary.completionRate ?? s.stats?.completionRate ?? 0}%`} icon={ClipboardCheck} tone="success" hint={`${r?.summary.completed ?? s.stats?.completed ?? 0} ta yakunlangan`} />
        <StatCard label="O‘rtacha baho" value={r?.summary.avgRating?.toFixed(2) ?? '—'} icon={Star} tone="warning" hint="baholi savollar bo‘yicha" />
        <StatCard label="O‘rtacha vaqt" value={r?.summary.avgDurationSec ? `${Math.max(1, Math.round(r.summary.avgDurationSec / 60))} daq` : '—'} icon={Timer} tone="info" hint="to‘ldirish davomiyligi" />
      </div>

      <Tabs defaultValue="results" className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="results">Natijalar</TabsTrigger>
            <TabsTrigger value="responses">Javoblar {r && <span className="bg-muted-foreground/15 tabular ml-1 rounded-full px-1.5 text-[10px]">{r.responses.length}</span>}</TabsTrigger>
            <TabsTrigger value="assignments">Qamrov <span className="bg-muted-foreground/15 tabular ml-1 rounded-full px-1.5 text-[10px]">{s.assignments.length}</span></TabsTrigger>
            <TabsTrigger value="questions">Savollar</TabsTrigger>
          </TabsList>
          {can('surveys.results') && (
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => void exportAs('xlsx')}><Download /> Excel</Button>
              <Button variant="outline" size="sm" onClick={() => void exportAs('csv')}>CSV</Button>
              <Button variant="outline" size="sm" onClick={() => void exportAs('pdf')}>PDF</Button>
            </div>
          )}
        </div>

        <TabsContent value="results" className="space-y-4">
          <FilterBar className="mb-0">
            {!is('DIRECTOR') && <FilterSelect value={branchId} onChange={setBranchId} allLabel="Barcha filiallar" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />}
            <FilterSelect value={role} onChange={setRole} allLabel="Barcha rollar" options={[{ value: 'TUTOR', label: 'Tutorlar' }, { value: 'TEACHER', label: 'O‘qituvchilar' }]} />
          </FilterBar>
          {results.isLoading ? <Skeleton className="h-64" /> : !r || r.responses.length === 0 ? <Card><EmptyState icon={MessageSquareText} title="Hali javoblar yo‘q" description={s.status === 'DRAFT' ? 'So‘rovnomani yuboring — natijalar shu yerda paydo bo‘ladi' : 'Xodimlar javob berishi bilan natijalar yangilanadi'} /></Card> : (
            <>
              <Card>
                <CardHeader><CardTitle>Javoblar dinamikasi</CardTitle><CardDescription>Kunlik to‘ldirilgan so‘rovnomalar</CardDescription></CardHeader>
                <CardContent><AreaTrend data={r.timeline} xKey="date" series={[{ key: 'count', name: 'Javoblar' }]} height={180} /></CardContent>
              </Card>
              <div className="grid gap-4 lg:grid-cols-2">
                {r.questions.map((q) => (
                  <Card key={q.id} className="gap-3">
                    <CardHeader>
                      <CardDescription className="flex items-center gap-2"><Badge variant="muted">{q.order}</Badge> {QUESTION_TYPES[q.type as keyof typeof QUESTION_TYPES]?.icon} {QUESTION_TYPES[q.type as keyof typeof QUESTION_TYPES]?.label} · {q.answered} javob</CardDescription>
                      <CardTitle className="text-base leading-snug">{q.text}</CardTitle>
                      {q.avg != null && <CardAction><div className="text-right"><div className="tabular text-2xl font-semibold">{q.avg}</div><div className="text-muted-foreground text-[11px]">o‘rtacha</div></div></CardAction>}
                      {q.yesRate != null && <CardAction><div className="text-right"><div className="tabular text-2xl font-semibold">{q.yesRate}%</div><div className="text-muted-foreground text-[11px]">«Ha»</div></div></CardAction>}
                    </CardHeader>
                    <CardContent>
                      {q.type === 'RATING' && q.distribution && (
                        <div className="space-y-1.5">
                          {[...q.distribution].reverse().map((d) => { const p = q.answered ? Math.round((d.count / q.answered) * 100) : 0; return (
                            <div key={d.label} className="flex items-center gap-2 text-sm"><span className="w-8 shrink-0 text-amber-500">{'★'.repeat(1)}{d.label}</span><Progress value={p} className="h-2.5" indicatorClassName="bg-amber-400" /><span className="tabular text-muted-foreground w-16 shrink-0 text-right text-xs">{d.count} ({p}%)</span></div>
                          ); })}
                        </div>
                      )}
                      {q.type === 'NUMBER' && <div className="text-muted-foreground text-sm">Min <b className="text-foreground">{q.min ?? '—'}</b> · Maks <b className="text-foreground">{q.max ?? '—'}</b> · O‘rtacha <b className="text-foreground">{q.avg ?? '—'}</b></div>}
                      {q.type === 'YES_NO' && q.distribution && <Donut data={q.distribution.map((d, i) => ({ name: d.label, value: d.count, color: i === 0 ? 'var(--chart-2)' : 'var(--chart-4)' }))} height={180} innerRadius={48} outerRadius={70} centerLabel="javob" />}
                      {(q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE') && q.distribution && <Bars data={q.distribution} xKey="label" series={[{ key: 'count', name: 'Tanlaganlar' }]} horizontal height={Math.max(120, q.distribution.length * 36)} colorful />}
                      {q.texts && (
                        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                          {q.texts.length === 0 && <div className="text-muted-foreground text-sm">Javob yo‘q</div>}
                          {q.texts.map((t, i) => { const resp = r.responses.find((x) => x.id === t.responseId); return <div key={i} className="bg-muted/50 rounded-lg px-3 py-2 text-sm"><div>{t.text}</div>{resp?.user && <div className="text-muted-foreground mt-0.5 text-[11px]">— {resp.user.fullName}</div>}</div>; })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="responses">
          <DataTable columns={respCols} rows={r?.responses} rowKey={(x) => x.id} loading={results.isLoading} onRowClick={(x) => x.user && router.push(`/users/${x.user.id}`)} empty={<EmptyState title="Javoblar yo‘q" />} />
        </TabsContent>

        <TabsContent value="assignments">
          <FilterBar>
            <FilterSelect value={aStatus} onChange={setAStatus} allLabel="Barcha holatlar" options={Object.entries(A_STATUS).map(([k, v]) => ({ value: k, label: `${v.label} (${aCounts[k] ?? 0})` }))} />
          </FilterBar>
          <DataTable columns={aCols} rows={assignments} rowKey={(a) => a.id} onRowClick={(a) => router.push(`/users/${a.user.id}`)} empty={<EmptyState title="Hali hech kimga yuborilmagan" />} />
        </TabsContent>

        <TabsContent value="questions">
          <Card>
            <CardContent className="divide-y">
              {(s.questions ?? []).map((q) => (
                <div key={q.id} className="flex gap-3 py-3">
                  <Badge variant="muted" className="h-6 shrink-0">{q.order}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{q.text} {!q.isRequired && <span className="text-muted-foreground text-xs font-normal">(ixtiyoriy)</span>}</div>
                    {q.hint && <div className="text-muted-foreground text-xs">💡 {q.hint}</div>}
                    <div className="text-muted-foreground mt-1 text-xs">{QUESTION_TYPES[q.type].icon} {QUESTION_TYPES[q.type].label}{q.options.length ? ` · ${q.options.map((o) => o.label).join(' / ')}` : ''}{q.type === 'NUMBER' && (q.minValue != null || q.maxValue != null) ? ` · ${q.minValue ?? '…'}–${q.maxValue ?? '…'}` : ''}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
