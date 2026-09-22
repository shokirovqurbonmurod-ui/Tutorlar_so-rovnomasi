'use client';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { FlaskConical, Plus, Pencil, Trash2, Send, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { today, type Exam } from '@/lib/school';
import { EXAM_STATUS } from '@/lib/labels';
import { fmtDate, cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { FilterBar, FilterSelect } from '@/components/shared/filters';
import { StatusBadge } from '@/components/shared/status-badge';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { BranchFilter, Field, FormSelect, GroupFilter, GroupSelect, SubjectSelect } from '@/components/school/pickers';

type ExamDetail = Exam & { roster: Array<{ student: { id: string; fullName: string; studentCode: string }; result: { score: number; grade: number | null; comment: string | null } | null }>; avg: number | null; max: number | null; min: number | null };

export default function ExamsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [branchId, setBranchId] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [editing, setEditing] = React.useState<Exam | null | 'new'>(null);
  const [results, setResults] = React.useState<Exam | null>(null);
  const [del, setDel] = React.useState<Exam | null>(null);
  const list = useQuery({ queryKey: ['exams', { groupId, status }], queryFn: () => api.get<Exam[]>('/api/exams', { groupId: groupId || undefined, status: status || undefined }) });
  const rm = useMutation({ mutationFn: (id: string) => api.delete(`/api/exams/${id}`), onSuccess: () => { toast.success("Imtihon o'chirildi"); qc.invalidateQueries({ queryKey: ['exams'] }); setDel(null); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <div className="animate-fade-up">
      <PageHeader title="Imtihonlar" description="Rejalashtirish, natijalarni kiritish. Natijalar ota-onaga Telegram orqali yuboriladi." actions={can('exams.manage') && <Button onClick={() => setEditing('new')}><Plus /> Imtihon qo'shish</Button>} />
      <FilterBar>
        <BranchFilter value={branchId} onChange={(v) => { setBranchId(v); setGroupId(''); }} />
        <GroupFilter value={groupId} onChange={setGroupId} branchId={branchId || undefined} />
        <FilterSelect value={status} onChange={setStatus} placeholder="Holat" allLabel="Barcha holatlar" options={Object.entries(EXAM_STATUS).map(([value, m]) => ({ value, label: m.label }))} className="sm:w-44" />
      </FilterBar>
      <DataTable<Exam>
        rows={list.data} loading={list.isLoading} rowKey={(e) => e.id} onRowClick={(e) => setResults(e)}
        columns={[
          { key: 'date', header: 'Sana', cell: (e) => <span className={cn('text-sm tabular-nums', dayjs(e.date).isSame(dayjs(), 'day') && 'text-primary font-semibold')}>{fmtDate(e.date)}</span> },
          { key: 'title', header: 'Imtihon', cell: (e) => <div><div className="font-medium">{e.title}</div><div className="text-muted-foreground text-xs">{e.subject.name}</div></div> },
          { key: 'group', header: 'Guruh', cell: (e) => <Link href={`/groups/${e.groupId}`} onClick={(ev) => ev.stopPropagation()}><Badge variant="primary">{e.group.name}</Badge></Link> },
          { key: 'res', header: 'Natijalar', hideBelow: 'sm', cell: (e) => <span className="text-sm">{e._count?.results ?? 0} ta{e.avg !== null && e.avg !== undefined ? ` · o'rt. ${e.avg}` : ''}</span> },
          { key: 'max', header: 'Maks', hideBelow: 'md', cell: (e) => <span className="text-muted-foreground text-sm">{e.maxScore}</span> },
          { key: 'status', header: 'Holat', cell: (e) => <StatusBadge value={e.status} map={EXAM_STATUS} /> },
          { key: 'x', header: '', cell: (e) => can('exams.manage') ? <div className="flex justify-end" onClick={(ev) => ev.stopPropagation()}><Button variant="ghost" size="icon-sm" onClick={() => setEditing(e)}><Pencil /></Button><Button variant="ghost" size="icon-sm" onClick={() => setDel(e)}><Trash2 className="text-destructive" /></Button></div> : null },
        ]}
        empty={<EmptyState icon={FlaskConical} title="Imtihonlar yo'q" />}
      />
      {editing !== null && <ExamDialog open onOpenChange={(v) => !v && setEditing(null)} exam={editing === 'new' ? null : editing} defaultGroupId={groupId} />}
      {results && <ResultsDialog open onOpenChange={(v) => !v && setResults(null)} examId={results.id} />}
      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(null)} title="Imtihonni o'chirish" description={del?.title} confirmText="O'chirish" destructive loading={rm.isPending} onConfirm={() => { if (del) rm.mutate(del.id); }} />
    </div>
  );
}

function ExamDialog({ open, onOpenChange, exam, defaultGroupId }: { open: boolean; onOpenChange: (v: boolean) => void; exam: Exam | null; defaultGroupId?: string }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ title: exam?.title ?? '', groupId: exam?.groupId ?? defaultGroupId ?? '', subjectId: exam?.subjectId ?? '', date: exam ? dayjs(exam.date).format('YYYY-MM-DD') : today(), maxScore: String(exam?.maxScore ?? 100), status: exam?.status ?? 'PLANNED', note: exam?.note ?? '' });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const mut = useMutation({ mutationFn: () => { const body = { ...f, maxScore: Number(f.maxScore) || 100, note: f.note.trim() || null }; return exam ? api.patch(`/api/exams/${exam.id}`, body) : api.post('/api/exams', body); }, onSuccess: () => { toast.success(exam ? 'Saqlandi' : "Imtihon rejalashtirildi. Guruhga xabar yuborildi."); qc.invalidateQueries({ queryKey: ['exams'] }); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{exam ? 'Imtihonni tahrirlash' : 'Yangi imtihon'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nomi *" className="sm:col-span-2"><Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="1-chorak nazorat ishi" /></Field>
          <Field label="Guruh *"><GroupSelect value={f.groupId} onChange={(v) => set('groupId', v)} noneLabel={null} disabled={!!exam} /></Field>
          <Field label="Fan *"><SubjectSelect value={f.subjectId} onChange={(v) => set('subjectId', v)} noneLabel={null} /></Field>
          <Field label="Sana *"><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Maksimal ball"><Input type="number" min={1} value={f.maxScore} onChange={(e) => set('maxScore', e.target.value)} /></Field>
          <Field label="Holat"><FormSelect value={f.status} onChange={(v) => set('status', v)} noneLabel={null} options={Object.entries(EXAM_STATUS).map(([value, m]) => ({ value, label: m.label }))} /></Field>
          <Field label="Izoh" className="sm:col-span-2"><Textarea rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={f.title.trim().length < 2 || !f.groupId || !f.subjectId} loading={mut.isPending} onClick={() => mut.mutate()}>Saqlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultsDialog({ open, onOpenChange, examId }: { open: boolean; onOpenChange: (v: boolean) => void; examId: string }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const e = useQuery({ queryKey: ['exam', examId], queryFn: () => api.get<ExamDetail>(`/api/exams/${examId}`) });
  const [rows, setRows] = React.useState<Record<string, { score: string; comment: string }>>({});
  React.useEffect(() => { if (e.data) setRows(Object.fromEntries(e.data.roster.map((r) => [r.student.id, { score: r.result?.score?.toString() ?? '', comment: r.result?.comment ?? '' }]))); }, [e.data]);
  const items = Object.entries(rows).filter(([, r]) => r.score !== '').map(([studentId, r]) => ({ studentId, score: Number(r.score), comment: r.comment || null }));
  const mut = useMutation({ mutationFn: () => api.post<{ notified?: number }>(`/api/exams/${examId}/results`, { items }), onSuccess: (d) => { toast.success(`Natijalar saqlandi${d?.notified ? ` · ${d.notified} ota-onaga yuborildi` : ''}`); qc.invalidateQueries({ queryKey: ['exams'] }); qc.invalidateQueries({ queryKey: ['exam', examId] }); onOpenChange(false); }, onError: (err: Error) => toast.error(err.message) });
  const ex = e.data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Trophy className="text-warning size-5" /> {ex?.title ?? 'Imtihon'}</DialogTitle><DialogDescription>{ex ? `${ex.group.name} · ${ex.subject.name} · ${fmtDate(ex.date)} · maks ${ex.maxScore} ball` : ''}</DialogDescription></DialogHeader>
        {!ex ? <Skeleton className="h-64" /> : (
          <>
            {ex.avg !== null && <div className="grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-xl border p-2"><div className="text-muted-foreground text-xs">O'rtacha</div><div className="font-semibold">{ex.avg}</div></div><div className="rounded-xl border p-2"><div className="text-muted-foreground text-xs">Eng yuqori</div><div className="font-semibold">{ex.max}</div></div><div className="rounded-xl border p-2"><div className="text-muted-foreground text-xs">Eng past</div><div className="font-semibold">{ex.min}</div></div></div>}
            <div className="divide-y rounded-xl border">
              {ex.roster.map((r, i) => (
                <div key={r.student.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-muted-foreground w-5 text-xs">{i + 1}</span><span className="flex-1 text-sm font-medium">{r.student.fullName}</span>
                  {r.result?.grade && <Badge variant="secondary">{r.result.grade}</Badge>}
                  <Input type="number" min={0} max={ex.maxScore} disabled={!can('exams.manage')} value={rows[r.student.id]?.score ?? ''} onChange={(ev) => setRows((x) => ({ ...x, [r.student.id]: { ...(x[r.student.id] ?? { score: '', comment: '' }), score: ev.target.value } }))} className="h-8 w-20 text-center text-sm" />
                  <Input disabled={!can('exams.manage')} value={rows[r.student.id]?.comment ?? ''} onChange={(ev) => setRows((x) => ({ ...x, [r.student.id]: { ...(x[r.student.id] ?? { score: '', comment: '' }), comment: ev.target.value } }))} className="hidden h-8 w-32 text-xs sm:block" placeholder="Izoh" />
                </div>
              ))}
            </div>
          </>
        )}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Yopish</Button>{can('exams.manage') && <Button disabled={!items.length} loading={mut.isPending} onClick={() => mut.mutate()}><Send /> Natijalarni saqlash</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
