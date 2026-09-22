'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Star, Plus, Send, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolGroups, useSubjects, useGroup, gradeTone, today, type Grade } from '@/lib/school';
import { GRADE_KIND } from '@/lib/labels';
import { fmtDate, cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { FilterBar, FilterSelect } from '@/components/shared/filters';
import { DataTable } from '@/components/shared/data-table';
import { UserCell } from '@/components/shared/user-cell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { BranchFilter, Field, FormSelect, GroupFilter, SubjectFilter } from '@/components/school/pickers';

type SheetResp = { dates: string[]; rows: Array<{ student: { id: string; fullName: string; studentCode: string }; cells: Record<string, Array<{ id: string; value: number; maxValue: number; kind: string }>>; avg: number | null }> };

export default function GradesPage() {
  return <React.Suspense><GradesInner /></React.Suspense>;
}

function GradesInner() {
  const sp = useSearchParams();
  const { can } = useAuth();
  const [branchId, setBranchId] = React.useState('');
  const [groupId, setGroupId] = React.useState(sp.get('groupId') ?? '');
  const [subjectId, setSubjectId] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const groups = useSchoolGroups(branchId || undefined);
  const subjects = useSubjects();
  const group = useGroup(groupId || undefined);
  React.useEffect(() => { if (!groupId && groups.data?.length) setGroupId(groups.data[0].id); }, [groups.data, groupId]);
  React.useEffect(() => {
    if (subjectId) return;
    const first = group.data?.teachers?.[0]?.subjectId ?? subjects.data?.[0]?.id;
    if (first) setSubjectId(first);
  }, [group.data, subjects.data, subjectId]);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Baholar" description="Guruh jurnali: kun, fan, baho, o'qituvchi. Har bir yangi baho ota-onaga Telegram orqali yuboriladi." actions={can('grades.manage') && groupId && <Button onClick={() => setOpen(true)}><Plus /> Baho qo'yish</Button>} />
      <FilterBar>
        <BranchFilter value={branchId} onChange={(v) => { setBranchId(v); setGroupId(''); }} />
        <GroupFilter value={groupId} onChange={setGroupId} branchId={branchId || undefined} allLabel={null} />
        <SubjectFilter value={subjectId} onChange={setSubjectId} allLabel={null} />
      </FilterBar>
      <Tabs defaultValue="sheet">
        <TabsList><TabsTrigger value="sheet">Jurnal</TabsTrigger><TabsTrigger value="list">Ro'yxat</TabsTrigger></TabsList>
        <TabsContent value="sheet" className="mt-4">{groupId && subjectId ? <Sheet groupId={groupId} subjectId={subjectId} /> : <EmptyState icon={Star} title="Guruh va fanni tanlang" />}</TabsContent>
        <TabsContent value="list" className="mt-4"><GradesList groupId={groupId} subjectId={subjectId} /></TabsContent>
      </Tabs>
      {open && <GradeDialog open onOpenChange={setOpen} groupId={groupId} subjectId={subjectId} />}
    </div>
  );
}

function Sheet({ groupId, subjectId }: { groupId: string; subjectId: string }) {
  const [from, setFrom] = React.useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [to, setTo] = React.useState(today());
  const s = useQuery({ queryKey: ['grade-sheet', groupId, subjectId, from, to], queryFn: () => api.get<SheetResp>('/api/grades/sheet', { groupId, subjectId, from, to }) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-card w-40" /><span className="text-muted-foreground text-xs">—</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-card w-40" /></div>
      {s.isLoading ? <Skeleton className="h-96 rounded-2xl" /> : !s.data?.rows.length ? <EmptyState title="Guruhda o'quvchi yo'q" /> : (
        <div className="bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50 text-muted-foreground text-xs"><th className="sticky left-0 z-10 bg-inherit px-3 py-2 text-left font-medium">O'quvchi</th>{s.data.dates.map((d) => <th key={d} className="px-2 py-2 text-center font-medium whitespace-nowrap">{dayjs(d).format('DD.MM')}</th>)}<th className="px-3 py-2 text-center font-medium">O'rtacha</th></tr></thead>
            <tbody className="divide-y">
              {s.data.rows.map((r, i) => (
                <tr key={r.student.id} className="hover:bg-accent/40">
                  <td className="bg-card sticky left-0 z-10 px-3 py-1.5 font-medium whitespace-nowrap"><span className="text-muted-foreground mr-2 text-xs">{i + 1}</span><Link href={`/students/${r.student.id}`} className="hover:underline">{r.student.fullName}</Link></td>
                  {s.data!.dates.map((d) => <td key={d} className="px-2 py-1.5 text-center"><div className="flex justify-center gap-0.5">{(r.cells[d] ?? []).map((c) => <span key={c.id} title={GRADE_KIND[c.kind]} className={cn('inline-flex size-7 items-center justify-center rounded-md text-xs font-semibold', gradeTone(c.maxValue === 5 ? c.value : Math.round((c.value / c.maxValue) * 5)))}>{c.value}</span>)}</div></td>)}
                  <td className="px-3 py-1.5 text-center font-semibold">{r.avg ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!s.data.dates.length && <p className="text-muted-foreground p-4 text-center text-xs">Bu davrda baho yo'q</p>}
        </div>
      )}
    </div>
  );
}

function GradesList({ groupId, subjectId }: { groupId: string; subjectId: string }) {
  const qc = useQueryClient();
  const { can, user } = useAuth();
  const [period, setPeriod] = React.useState('week');
  const [kind, setKind] = React.useState('');
  const [del, setDel] = React.useState<Grade | null>(null);
  const list = useQuery({ queryKey: ['grades', { groupId, subjectId, period, kind }], queryFn: () => api.get<{ items: Grade[]; avg: number | null; count: number }>('/api/grades', { groupId: groupId || undefined, subjectId: subjectId || undefined, period, kind: kind || undefined, limit: 500 }), enabled: !!groupId });
  const rm = useMutation({ mutationFn: (id: string) => api.delete(`/api/grades/${id}`), onSuccess: () => { toast.success("Baho o'chirildi"); qc.invalidateQueries({ queryKey: ['grades'] }); qc.invalidateQueries({ queryKey: ['grade-sheet'] }); setDel(null); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect value={period} onChange={setPeriod} allLabel={null} options={[{ value: 'day', label: 'Bugun' }, { value: 'week', label: 'Bu hafta' }, { value: 'month', label: 'Bu oy' }, { value: 'quarter', label: 'Chorak' }]} className="sm:w-36" />
        <FilterSelect value={kind} onChange={setKind} placeholder="Turi" allLabel="Barcha turlar" options={Object.entries(GRADE_KIND).map(([value, label]) => ({ value, label }))} className="sm:w-40" />
        {list.data && <Badge variant="secondary" className="ml-auto">{list.data.count} ta baho · o'rtacha {list.data.avg ?? '—'}</Badge>}
      </div>
      <DataTable<Grade>
        rows={list.data?.items} loading={list.isLoading} rowKey={(g) => g.id}
        columns={[
          { key: 'date', header: 'Sana', cell: (g) => <span className="text-sm tabular-nums">{fmtDate(g.date)}</span> },
          { key: 'student', header: "O'quvchi", cell: (g) => <Link href={`/students/${g.studentId}`} className="hover:underline"><UserCell name={g.student?.fullName ?? ''} sub={g.student?.studentCode} size="sm" /></Link> },
          { key: 'subject', header: 'Fan', hideBelow: 'sm', cell: (g) => <span className="inline-flex items-center gap-1.5 text-sm"><span className="size-2 rounded-full" style={{ background: g.subject.color ?? 'var(--primary)' }} />{g.subject.name}</span> },
          { key: 'value', header: 'Baho', cell: (g) => <span className={cn('inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-bold', gradeTone(g.maxValue === 5 ? g.value : Math.round((g.value / g.maxValue) * 5)))}>{g.value}{g.maxValue !== 5 && <span className="text-[10px] opacity-60">/{g.maxValue}</span>}</span> },
          { key: 'kind', header: 'Turi', hideBelow: 'md', cell: (g) => <Badge variant="secondary">{GRADE_KIND[g.kind]}</Badge> },
          { key: 'teacher', header: "O'qituvchi", hideBelow: 'lg', cell: (g) => <span className="text-muted-foreground text-sm">{g.teacher?.fullName ?? '—'}</span> },
          { key: 'comment', header: 'Izoh', hideBelow: 'xl', cell: (g) => <span className="text-muted-foreground line-clamp-1 text-xs">{g.comment ?? ''}</span> },
          { key: 'x', header: '', cell: (g) => can('grades.manage') && (!user || user.role.key !== 'TEACHER' || g.teacherId === user.id) ? <Button variant="ghost" size="icon-sm" onClick={() => setDel(g)}><Trash2 className="text-destructive" /></Button> : null },
        ]}
        empty={<EmptyState icon={Star} title="Baholar yo'q" />}
      />
      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(null)} title="Bahoni o'chirish" description={del ? `${del.student?.fullName} · ${del.subject.name} · ${del.value}` : ''} confirmText="O'chirish" destructive loading={rm.isPending} onConfirm={() => { if (del) rm.mutate(del.id); }} />
    </div>
  );
}

function GradeDialog({ open, onOpenChange, groupId, subjectId: initialSubject }: { open: boolean; onOpenChange: (v: boolean) => void; groupId: string; subjectId: string }) {
  const qc = useQueryClient();
  const group = useGroup(groupId);
  const subjects = useSubjects();
  const [subjectId, setSubjectId] = React.useState(initialSubject);
  const [date, setDate] = React.useState(today());
  const [kind, setKind] = React.useState('LESSON');
  const [maxValue, setMaxValue] = React.useState('5');
  const [rows, setRows] = React.useState<Record<string, { value: string; comment: string }>>({});
  const students = group.data?.students ?? [];
  const setRow = (id: string, patch: Partial<{ value: string; comment: string }>) => setRows((r) => ({ ...r, [id]: { ...(r[id] ?? { value: '', comment: '' }), ...patch } }));
  const items = Object.entries(rows).filter(([, r]) => r.value !== '' && !Number.isNaN(Number(r.value))).map(([studentId, r]) => ({ studentId, value: Number(r.value), maxValue: Number(maxValue), comment: r.comment || null }));
  const mut = useMutation({
    mutationFn: () => api.post<{ created: number; notified: number }>('/api/grades', { groupId, subjectId, date, kind, items }),
    onSuccess: (d) => { toast.success(`${d.created ?? items.length} ta baho qo'yildi${d.notified ? ` · ${d.notified} ota-onaga xabar yuborildi` : ''}`); qc.invalidateQueries({ queryKey: ['grades'] }); qc.invalidateQueries({ queryKey: ['grade-sheet'] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const max = Number(maxValue) || 5;
  const quick = max === 5 ? [5, 4, 3, 2] : max === 10 ? [10, 9, 8, 7, 6, 5] : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Baho qo'yish — {group.data?.name}</DialogTitle><DialogDescription>Bir vaqtning o'zida butun guruhga. Bo'sh qoldirilgan o'quvchilarga baho qo'yilmaydi.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Fan"><FormSelect value={subjectId} onChange={setSubjectId} noneLabel={null} options={(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label="Sana"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Turi"><FormSelect value={kind} onChange={setKind} noneLabel={null} options={Object.entries(GRADE_KIND).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="Maksimal"><FormSelect value={maxValue} onChange={setMaxValue} noneLabel={null} options={[{ value: '5', label: '5 ballik' }, { value: '10', label: '10 ballik' }, { value: '100', label: '100 ballik' }]} /></Field>
        </div>
        <div className="divide-y rounded-xl border">
          {students.map((s, i) => {
            const r = rows[s.id] ?? { value: '', comment: '' };
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="text-muted-foreground w-5 text-xs">{i + 1}</span><span className="min-w-[140px] flex-1 text-sm font-medium">{s.fullName}</span>
                {quick.length > 0 && <div className="flex gap-1">{quick.map((v) => <button key={v} type="button" onClick={() => setRow(s.id, { value: r.value === String(v) ? '' : String(v) })} className={cn('size-8 rounded-lg border text-sm font-semibold transition-colors', r.value === String(v) ? gradeTone(max === 5 ? v : Math.round((v / max) * 5)) + ' border-transparent ring-2 ring-primary/40' : 'hover:bg-accent')}>{v}</button>)}</div>}
                <Input type="number" min={0} max={max} value={r.value} onChange={(e) => setRow(s.id, { value: e.target.value })} className="h-8 w-16 text-center text-sm" placeholder="—" />
                <Input value={r.comment} onChange={(e) => setRow(s.id, { comment: e.target.value })} className="h-8 w-36 text-xs" placeholder="Izoh" />
              </div>
            );
          })}
          {!students.length && <p className="text-muted-foreground p-4 text-center text-sm">{group.isLoading ? 'Yuklanmoqda…' : "Guruhda o'quvchi yo'q"}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!items.length || !subjectId} loading={mut.isPending} onClick={() => mut.mutate()}><Send /> {items.length} ta bahoni saqlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
