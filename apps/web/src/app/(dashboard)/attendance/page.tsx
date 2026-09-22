'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { UserCheck, ChevronLeft, ChevronRight, Send, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSchoolGroups, today, type Attendance } from '@/lib/school';
import { ATTENDANCE } from '@/lib/labels';
import { fmtDate, initials, cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { FilterBar, FilterSelect } from '@/components/shared/filters';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { StatCard } from '@/components/shared/stat-card';
import { UserCell } from '@/components/shared/user-cell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AreaTrend } from '@/components/charts';
import { BranchFilter, GroupFilter } from '@/components/school/pickers';

type Row = { student: { id: string; fullName: string; studentCode: string; avatarUrl: string | null }; status: string | null; lateMinutes: number | null; reason: string | null };
type Sheet = { date: string; lessons: Array<{ id: string; startTime: string; endTime: string; subject: { name: string } }>; items: Row[] };
const ORDER = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

export default function AttendancePage() {
  return <React.Suspense><AttendanceInner /></React.Suspense>;
}

function AttendanceInner() {
  const sp = useSearchParams();
  const { can } = useAuth();
  const [branchId, setBranchId] = React.useState('');
  const [groupId, setGroupId] = React.useState(sp.get('groupId') ?? '');
  const groups = useSchoolGroups(branchId || undefined);
  React.useEffect(() => { if (!groupId && groups.data?.length) setGroupId(groups.data[0].id); }, [groups.data, groupId]);
  const stats = useQuery({ queryKey: ['att-stats', branchId, groupId], queryFn: () => api.get<{ rate: number | null; total: number; series: Array<{ date: string; PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number; rate: number | null }> }>('/api/attendance/stats', { branchId: branchId || undefined, groupId: groupId || undefined, days: 14 }) });
  const trend = React.useMemo(() => (stats.data?.series ?? []).map((s) => ({ d: dayjs(s.date).format('DD.MM'), present: s.PRESENT, absent: s.ABSENT, late: s.LATE, excused: s.EXCUSED })), [stats.data]);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Davomat" description="Kelgan / Kelmagan / Kechikkan / Sababli. Kelmagan o'quvchining ota-onasiga Telegram orqali avtomatik xabar boradi." />
      <FilterBar>
        <BranchFilter value={branchId} onChange={(v) => { setBranchId(v); setGroupId(''); }} />
        <GroupFilter value={groupId} onChange={setGroupId} branchId={branchId || undefined} allLabel={null} />
      </FilterBar>
      <div className="mb-6 grid gap-4 lg:grid-cols-[280px_1fr]">
        <StatCard label="Davomat (14 kun)" value={stats.data?.rate === null || stats.data?.rate === undefined ? '—' : `${stats.data.rate}%`} hint={`${stats.data?.total ?? 0} ta yozuv`} icon={UserCheck} tone={(stats.data?.rate ?? 100) < 85 ? 'warning' : 'success'} loading={stats.isLoading} />
        <Card className="p-4">{trend.length ? <AreaTrend data={trend} xKey="d" height={120} series={[{ key: 'present', name: 'Kelgan', color: 'var(--success)' }, { key: 'late', name: 'Kechikkan', color: 'var(--warning)' }, { key: 'absent', name: 'Kelmagan', color: 'var(--destructive)' }]} /> : <Skeleton className="h-[120px]" />}</Card>
      </div>
      <Tabs defaultValue={can('attendance.mark') ? 'mark' : 'journal'}>
        <TabsList><TabsTrigger value="mark" disabled={!can('attendance.mark')}>Yo'qlama qilish</TabsTrigger><TabsTrigger value="journal">Jurnal</TabsTrigger></TabsList>
        <TabsContent value="mark" className="mt-4">{groupId ? <MarkSheet groupId={groupId} /> : <EmptyState title="Guruhni tanlang" />}</TabsContent>
        <TabsContent value="journal" className="mt-4"><Journal groupId={groupId} branchId={branchId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function MarkSheet({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const [date, setDate] = React.useState(today());
  const [lessonId, setLessonId] = React.useState('');
  const sheet = useQuery({ queryKey: ['att-sheet', groupId, date, lessonId], queryFn: () => api.get<Sheet>('/api/attendance/sheet', { groupId, date, lessonId: lessonId || undefined }) });
  const [rows, setRows] = React.useState<Record<string, { status: string; lateMinutes: string; reason: string }>>({});
  React.useEffect(() => { if (sheet.data) setRows(Object.fromEntries(sheet.data.items.map((r) => [r.student.id, { status: r.status ?? 'PRESENT', lateMinutes: r.lateMinutes?.toString() ?? '', reason: r.reason ?? '' }]))); }, [sheet.data]);
  const setRow = (id: string, patch: Partial<{ status: string; lateMinutes: string; reason: string }>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const mark = useMutation({
    mutationFn: () => api.post<{ marked: number; notified: number }>('/api/attendance/mark', { groupId, date, lessonId: lessonId || null, items: Object.entries(rows).map(([studentId, r]) => ({ studentId, status: r.status, lateMinutes: r.status === 'LATE' && r.lateMinutes ? Number(r.lateMinutes) : null, reason: r.reason || null })) }),
    onSuccess: (d) => { toast.success(`Davomat saqlandi: ${d.marked} ta o'quvchi${d.notified ? ` · ${d.notified} ota-onaga xabar yuborildi` : ''}`); qc.invalidateQueries({ queryKey: ['att-sheet'] }); qc.invalidateQueries({ queryKey: ['attendance'] }); qc.invalidateQueries({ queryKey: ['att-stats'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const counts = ORDER.map((k) => ({ k, n: Object.values(rows).filter((r) => r.status === k).length }));
  const alreadyMarked = sheet.data?.items.some((i) => i.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-card inline-flex items-center rounded-xl border">
          <Button variant="ghost" size="icon" onClick={() => setDate(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))}><ChevronLeft /></Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40 border-0 shadow-none focus-visible:ring-0" />
          <Button variant="ghost" size="icon" disabled={date >= today()} onClick={() => setDate(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))}><ChevronRight /></Button>
        </div>
        <FilterSelect value={lessonId} onChange={setLessonId} placeholder="Dars" allLabel="Kunlik (darsga bog'lanmagan)" options={(sheet.data?.lessons ?? []).map((l) => ({ value: l.id, label: `${l.startTime} ${l.subject.name}` }))} className="sm:w-64" />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setRows((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v, status: 'PRESENT' }])))}><CheckCheck /> Hammasi kelgan</Button>
      </div>
      <div className="flex flex-wrap gap-2">{counts.map(({ k, n }) => <span key={k} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium')}><span className={cn('size-2 rounded-full', ATTENDANCE[k].dot)} />{ATTENDANCE[k].label}: {n}</span>)}{alreadyMarked && <span className="text-muted-foreground ml-auto text-xs">Bu kun uchun davomat avval kiritilgan — o'zgartirishlar ustiga yoziladi</span>}</div>
      {sheet.isLoading ? <Skeleton className="h-96 rounded-2xl" /> : !sheet.data?.items.length ? <EmptyState title="Guruhda faol o'quvchi yo'q" /> : (
        <div className="bg-card divide-y rounded-2xl border">
          {sheet.data.items.map((r, i) => {
            const st = rows[r.student.id];
            if (!st) return null;
            return (
              <div key={r.student.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:px-4">
                <span className="text-muted-foreground w-6 text-xs">{i + 1}</span>
                <Avatar className="size-8"><AvatarImage src={r.student.avatarUrl ?? undefined} /><AvatarFallback className="text-[10px]">{initials(r.student.fullName)}</AvatarFallback></Avatar>
                <Link href={`/students/${r.student.id}`} className="min-w-[140px] flex-1 text-sm font-medium hover:underline">{r.student.fullName}</Link>
                <div className="flex gap-1">
                  {ORDER.map((k) => <button key={k} onClick={() => setRow(r.student.id, { status: k })} className={cn('h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors', st.status === k ? (k === 'PRESENT' ? 'bg-success text-white border-success' : k === 'ABSENT' ? 'bg-destructive text-white border-destructive' : k === 'LATE' ? 'bg-warning text-black border-warning' : 'bg-muted-foreground text-white border-muted-foreground') : 'hover:bg-accent')}>{ATTENDANCE[k].label}</button>)}
                </div>
                {st.status === 'LATE' && <Input type="number" min={1} placeholder="daqiqa" value={st.lateMinutes} onChange={(e) => setRow(r.student.id, { lateMinutes: e.target.value })} className="h-8 w-24 text-xs" />}
                {(st.status === 'ABSENT' || st.status === 'EXCUSED') && <Input placeholder="Sabab" value={st.reason} onChange={(e) => setRow(r.student.id, { reason: e.target.value })} className="h-8 w-40 text-xs" />}
              </div>
            );
          })}
        </div>
      )}
      <div className="sticky bottom-20 flex justify-end lg:bottom-4"><Button size="lg" onClick={() => mark.mutate()} loading={mark.isPending} disabled={!sheet.data?.items.length}><Send /> Saqlash va ota-onalarga yuborish</Button></div>
    </div>
  );
}

function Journal({ groupId, branchId }: { groupId: string; branchId: string }) {
  const [from, setFrom] = React.useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
  const [to, setTo] = React.useState(today());
  const [status, setStatus] = React.useState('');
  const list = useQuery({ queryKey: ['attendance', { groupId, branchId, from, to, status }], queryFn: () => api.get<{ items: Attendance[]; counts: Record<string, number>; total: number }>('/api/attendance', { groupId: groupId || undefined, branchId: branchId || undefined, from, to, status: status || undefined }) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-card w-40" /><span className="text-muted-foreground text-xs">—</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-card w-40" />
        <FilterSelect value={status} onChange={setStatus} placeholder="Holat" allLabel="Barcha holatlar" options={ORDER.map((k) => ({ value: k, label: ATTENDANCE[k].label }))} className="sm:w-40" />
        <div className="ml-auto flex gap-2">{ORDER.map((k) => <StatusBadge key={k} value={k} map={{ [k]: { ...ATTENDANCE[k], label: `${ATTENDANCE[k].label} ${list.data?.counts?.[k] ?? 0}` } }} />)}</div>
      </div>
      <DataTable<Attendance>
        rows={list.data?.items} loading={list.isLoading} rowKey={(a) => a.id}
        columns={[
          { key: 'date', header: 'Sana', cell: (a) => <span className="text-sm tabular-nums">{fmtDate(a.date)}</span> },
          { key: 'student', header: "O'quvchi", cell: (a) => <Link href={`/students/${a.studentId}`} className="hover:underline"><UserCell name={a.student?.fullName ?? ''} sub={a.group?.name} size="sm" /></Link> },
          { key: 'lesson', header: 'Dars', hideBelow: 'md', cell: (a) => <span className="text-muted-foreground text-sm">{a.lesson ? `${(a.lesson as { startTime?: string }).startTime ?? ''} ${a.lesson.subject.name}` : 'Kunlik'}</span> },
          { key: 'status', header: 'Holat', cell: (a) => <div className="flex items-center gap-2"><StatusBadge value={a.status} map={ATTENDANCE} />{a.lateMinutes ? <span className="text-muted-foreground text-xs">{a.lateMinutes} daq.</span> : null}</div> },
          { key: 'reason', header: 'Sabab', hideBelow: 'lg', cell: (a) => <span className="text-muted-foreground text-sm">{a.reason ?? '—'}</span> },
          { key: 'by', header: 'Kiritdi', hideBelow: 'xl', cell: (a) => <span className="text-muted-foreground text-xs">{a.markedBy?.fullName ?? '—'}</span> },
        ]}
        empty={<EmptyState icon={UserCheck} title="Yozuvlar yo'q" />}
      />
    </div>
  );
}
