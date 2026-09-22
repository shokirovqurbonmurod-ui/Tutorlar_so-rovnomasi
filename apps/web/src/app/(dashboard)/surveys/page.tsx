'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, ClipboardList, Users, Clock, EyeOff, Building2, Star } from 'lucide-react';
import { api } from '@/lib/api';
import type { Paginated, Survey, SurveyStatus, SurveyAudience } from '@/lib/types';
import { SURVEY_STATUS, AUDIENCE } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { useBranches } from '@/lib/queries';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/shared/page-header';
import { FilterBar, FilterSelect, ResetFilters, SearchInput } from '@/components/shared/filters';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/empty-state';
import { SurveyActions } from '@/components/surveys/survey-actions';
import { fmtDate, fromNow, dayjs, cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const TABS: Array<{ value: string; label: string }> = [{ value: '', label: 'Barchasi' }, { value: 'ACTIVE', label: 'Faol' }, { value: 'SCHEDULED', label: 'Rejada' }, { value: 'DRAFT', label: 'Qoralama' }, { value: 'COMPLETED', label: 'Yakunlangan' }, { value: 'ARCHIVED', label: 'Arxiv' }];

export default function SurveysPage() {
  const router = useRouter();
  const { can, is } = useAuth();
  const branches = useBranches(!is('DIRECTOR'));
  const [status, setStatus] = React.useState('');
  const [audience, setAudience] = React.useState('');
  const [branchId, setBranchId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const dq = useDebounce(search);
  React.useEffect(() => setPage(1), [dq, status, audience, branchId]);

  const params = { page, limit: 12, search: dq || undefined, status: status || undefined, audience: audience || undefined, branchId: branchId || undefined };
  const { data, isLoading } = useQuery({ queryKey: ['surveys', params], queryFn: () => api.get<Paginated<Survey>>('/api/surveys', params), placeholderData: (p) => p });
  const counts = useQuery({ queryKey: ['surveys', 'counts'], queryFn: async () => Object.fromEntries(await Promise.all(TABS.filter((t) => t.value).map(async (t) => [t.value, (await api.get<Paginated<Survey>>('/api/surveys', { limit: 1, status: t.value })).total]))) as Record<string, number> });

  return (
    <div>
      <PageHeader title="So‘rovnomalar" description="Yarating, yuboring va natijalarni real vaqtda kuzating" actions={can('surveys.create') && <Button asChild><Link href="/surveys/new"><Plus /> Yangi so‘rovnoma</Link></Button>} />

      <Tabs value={status} onValueChange={setStatus} className="mb-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-fit">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="flex-none">
              {t.label}
              {t.value && counts.data?.[t.value] !== undefined && <span className="bg-muted-foreground/15 tabular ml-1 rounded-full px-1.5 text-[10px]">{counts.data[t.value]}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Sarlavha bo‘yicha…" />
        <FilterSelect value={audience} onChange={setAudience} allLabel="Barcha auditoriya" options={(Object.keys(AUDIENCE) as SurveyAudience[]).map((a) => ({ value: a, label: AUDIENCE[a] }))} />
        {!is('DIRECTOR') && <FilterSelect value={branchId} onChange={setBranchId} allLabel="Barcha filiallar" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />}
        <ResetFilters visible={!!(search || audience || branchId)} onClick={() => { setSearch(''); setAudience(''); setBranchId(''); }} />
      </FilterBar>

      {isLoading && !data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : data?.items.length ? (
        <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((s) => {
            const p = s.stats?.completionRate ?? 0;
            const soon = s.status === 'ACTIVE' && s.deadline && dayjs(s.deadline).diff(dayjs(), 'hour') < 24;
            return (
              <Card key={s.id} onClick={() => router.push(`/surveys/${s.id}`)} className="card-hover cursor-pointer gap-3 py-4">
                <div className="flex items-start justify-between gap-2 px-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge value={s.status as SurveyStatus} map={SURVEY_STATUS} />
                      {s.isAnonymous && <Badge variant="muted"><EyeOff /> Anonim</Badge>}
                    </div>
                    <h3 className="mt-2 line-clamp-2 leading-snug font-semibold">{s.title}</h3>
                  </div>
                  <SurveyActions survey={s} />
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-4 text-xs">
                  <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {AUDIENCE[s.audience]}{s.branch ? ` · ${s.branch.code ?? s.branch.name}` : ''}</span>
                  <span className="inline-flex items-center gap-1"><ClipboardList className="size-3.5" /> {s._count?.questions ?? 0} savol</span>
                  {s.stats?.avgRating != null && <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-amber-400 text-amber-400" /> {s.stats.avgRating.toFixed(1)}</span>}
                </div>
                <div className="px-4">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{s.stats?.completed ?? 0} / {s.stats?.assigned ?? 0} javob</span>
                    <span className="tabular font-medium">{p}%</span>
                  </div>
                  <Progress value={p} className="h-1.5" indicatorClassName={cn(p >= 80 ? 'bg-success' : p >= 50 ? 'bg-primary' : 'bg-warning')} />
                </div>
                <div className="text-muted-foreground flex items-center justify-between border-t px-4 pt-3 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {s.status === 'SCHEDULED' && s.scheduledAt ? `Yuboriladi: ${fmtDate(s.scheduledAt, 'DD.MM HH:mm')}` : s.deadline ? <span className={cn(soon && 'text-destructive font-medium')}>Muddat: {fmtDate(s.deadline, 'DD.MM HH:mm')}</span> : `Yaratilgan: ${fmtDate(s.createdAt)}`}
                  </span>
                  <span>{s.sentAt ? `yuborilgan ${fromNow(s.sentAt)}` : s.createdBy?.fullName}</span>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><EmptyState icon={ClipboardList} title="So‘rovnoma topilmadi" description="Filtrlarni o‘zgartiring yoki yangi so‘rovnoma yarating" action={can('surveys.create') && <Button asChild><Link href="/surveys/new"><Plus /> Yaratish</Link></Button>} /></Card>
      )}

      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">Jami {data.total} ta · {data.page}/{data.pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
            <Button variant="outline" size="icon-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
