'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { NotebookPen, Plus, Clock, CheckCircle2, Paperclip } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Homework } from '@/lib/school';
import { fmtDateTime, fromNow, cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { FilterBar, FilterSelect } from '@/components/shared/filters';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { BranchFilter, GroupFilter, SubjectFilter } from '@/components/school/pickers';
import { HomeworkDialog } from '@/components/school/homework-dialog';

export default function HomeworkPage() {
  return <React.Suspense><HomeworkInner /></React.Suspense>;
}

function HomeworkInner() {
  const sp = useSearchParams();
  const { can } = useAuth();
  const [branchId, setBranchId] = React.useState('');
  const [groupId, setGroupId] = React.useState(sp.get('groupId') ?? '');
  const [subjectId, setSubjectId] = React.useState('');
  const [status, setStatus] = React.useState('open');
  const [open, setOpen] = React.useState(false);
  const list = useQuery({ queryKey: ['homework', { groupId, subjectId, status, branchId }], queryFn: () => api.get<Homework[]>('/api/homework', { groupId: groupId || undefined, subjectId: subjectId || undefined, status: status || undefined, limit: 200 }) });
  const items = (list.data ?? []).filter((h) => !branchId || true);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Uy vazifalari" description="O'qituvchi/tutor beradi, o'quvchi bot orqali topshiradi, o'qituvchi tekshiradi. Ota-ona holatni botda ko'radi." actions={can('homework.manage') && <Button onClick={() => setOpen(true)}><Plus /> Vazifa berish</Button>} />
      <FilterBar>
        <BranchFilter value={branchId} onChange={(v) => { setBranchId(v); setGroupId(''); }} />
        <GroupFilter value={groupId} onChange={setGroupId} branchId={branchId || undefined} />
        <SubjectFilter value={subjectId} onChange={setSubjectId} />
        <FilterSelect value={status} onChange={setStatus} allLabel="Barchasi" options={[{ value: 'open', label: 'Faol (muddati kelmagan)' }, { value: 'closed', label: 'Yopilgan' }]} className="sm:w-52" />
      </FilterBar>
      {list.isLoading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
        : !items.length ? <EmptyState icon={NotebookPen} title="Uy vazifalari yo'q" action={can('homework.manage') && <Button onClick={() => setOpen(true)}><Plus /> Vazifa berish</Button>} />
        : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((h) => {
              const total = Object.values(h.stats ?? {}).reduce((s, n) => s + n, 0) || h._count?.submissions || 0;
              const done = (h.stats?.ACCEPTED ?? 0) + (h.stats?.GRADED ?? 0);
              const pending = h.stats?.SUBMITTED ?? 0;
              const overdue = dayjs(h.deadline).isBefore(dayjs());
              return (
                <Link key={h.id} href={`/homework/${h.id}`}>
                  <Card className="hover:border-primary/40 h-full p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: h.subject.color ?? 'var(--primary)' }} /><span className="text-muted-foreground text-xs">{h.subject.name} · {h.group.name}</span></div>
                      {pending > 0 && <Badge variant="warning">{pending} tekshirish</Badge>}
                    </div>
                    <div className="mt-2 line-clamp-2 font-semibold">{h.title}</div>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{h.task}</p>
                    <div className="mt-3"><Progress value={total ? (done / total) * 100 : 0} className="h-1.5" /><div className="text-muted-foreground mt-1 flex justify-between text-[11px]"><span><CheckCircle2 className="mr-1 inline size-3 text-success" />{done}/{total} bajardi</span>{h.fileUrl && <span><Paperclip className="inline size-3" /> fayl</span>}</div></div>
                    <div className={cn('mt-3 flex items-center gap-1 text-xs', overdue ? 'text-muted-foreground' : dayjs(h.deadline).diff(dayjs(), 'hour') < 24 ? 'text-destructive' : 'text-muted-foreground')}><Clock className="size-3.5" /> Muddat: {fmtDateTime(h.deadline)} · {fromNow(h.deadline)}</div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      {open && <HomeworkDialog open onOpenChange={setOpen} defaultGroupId={groupId} defaultSubjectId={subjectId} />}
    </div>
  );
}
