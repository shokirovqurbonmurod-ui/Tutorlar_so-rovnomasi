'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, ListChecks, Sparkles, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Paginated, Survey, QuestionType } from '@/lib/types';
import { QUESTION_TYPES, SURVEY_STATUS, AUDIENCE } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/shared/page-header';
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filters';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { TEMPLATES } from '@/components/surveys/survey-builder';
import { Donut } from '@/components/charts';

export default function QuestionsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = React.useState('');
  const [type, setType] = React.useState('');
  const dq = useDebounce(search);

  // Question bank = all questions across surveys (fetch details for the latest 60 surveys)
  const list = useQuery({ queryKey: ['surveys', 'bank'], queryFn: () => api.get<Paginated<Survey>>('/api/surveys', { limit: 60 }) });
  const details = useQuery({
    queryKey: ['surveys', 'bank', 'details', list.data?.items.map((s) => s.id).join(',')],
    queryFn: async () => Promise.all((list.data?.items ?? []).map((s) => api.get<Survey>(`/api/surveys/${s.id}`))),
    enabled: !!list.data,
  });
  const questions = React.useMemo(() => {
    const rows: Array<{ id: string; text: string; type: QuestionType; hint: string | null; options: string[]; survey: Survey; isRequired: boolean }> = [];
    for (const s of details.data ?? []) for (const q of s.questions ?? []) rows.push({ id: q.id, text: q.text, type: q.type, hint: q.hint, options: q.options.map((o) => o.label), survey: s, isRequired: q.isRequired });
    return rows.filter((q) => (!type || q.type === type) && (!dq || q.text.toLowerCase().includes(dq.toLowerCase())));
  }, [details.data, type, dq]);
  const byType = React.useMemo(() => { const m: Record<string, number> = {}; for (const s of details.data ?? []) for (const q of s.questions ?? []) m[q.type] = (m[q.type] ?? 0) + 1; return Object.entries(m).map(([k, v]) => ({ name: QUESTION_TYPES[k as QuestionType].label, value: v })); }, [details.data]);

  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success('Nusxalandi'); };

  return (
    <div>
      <PageHeader title="Savollar banki" description="Barcha so‘rovnomalardagi savollar, turlari va tayyor shablonlar" actions={can('surveys.create') && <Button asChild><Link href="/surveys/new"><Plus /> Yangi so‘rovnoma</Link></Button>} />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="text-primary size-4" /> Tayyor shablonlar</CardTitle><CardDescription>Bir bosishda so‘rovnoma yaratish</CardDescription></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" onClick={() => router.push(`/surveys/new?template=${t.id}`)} className="hover:border-primary hover:bg-primary/5 rounded-xl border p-3 text-left transition-colors">
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">{t.description}</div>
                <div className="mt-2 flex flex-wrap gap-1">{t.questions.map((q, i) => <span key={i} className="bg-muted rounded px-1.5 py-0.5 text-[11px]">{QUESTION_TYPES[q.type].icon} {QUESTION_TYPES[q.type].label}</span>)}</div>
                <div className="text-muted-foreground mt-2 text-[11px]">{t.questions.length} savol · {AUDIENCE[t.audience]}</div>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Savol turlari</CardTitle><CardDescription>Bankdagi taqsimot</CardDescription></CardHeader>
          <CardContent>{details.isLoading ? <Skeleton className="h-52" /> : byType.length ? <Donut data={byType} centerLabel="savol" height={200} /> : <EmptyState className="py-6" />}</CardContent>
        </Card>
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Savol matni…" />
        <FilterSelect value={type} onChange={setType} allLabel="Barcha turlar" options={(Object.keys(QUESTION_TYPES) as QuestionType[]).map((t) => ({ value: t, label: `${QUESTION_TYPES[t].icon} ${QUESTION_TYPES[t].label}` }))} />
        <span className="text-muted-foreground ml-auto text-xs">{questions.length} ta savol</span>
      </FilterBar>

      {details.isLoading ? <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}</div> : questions.length === 0 ? <Card><EmptyState icon={ListChecks} title="Savol topilmadi" /></Card> : (
        <Card><CardContent className="divide-y">
          {questions.map((q) => (
            <div key={q.id} className="flex items-start gap-3 py-3">
              <span className="text-lg leading-none">{QUESTION_TYPES[q.type].icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{q.text} {!q.isRequired && <span className="text-muted-foreground text-xs font-normal">(ixtiyoriy)</span>}</div>
                {q.hint && <div className="text-muted-foreground text-xs">💡 {q.hint}</div>}
                {q.options.length > 0 && <div className="text-muted-foreground mt-0.5 text-xs">{q.options.join(' · ')}</div>}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="secondary">{QUESTION_TYPES[q.type].label}</Badge>
                  <Link href={`/surveys/${q.survey.id}`} className="text-muted-foreground hover:text-foreground truncate hover:underline">{q.survey.title}</Link>
                  <StatusBadge value={q.survey.status} map={SURVEY_STATUS} />
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => copy(q.text)} title="Matnni nusxalash"><Copy /></Button>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  );
}
