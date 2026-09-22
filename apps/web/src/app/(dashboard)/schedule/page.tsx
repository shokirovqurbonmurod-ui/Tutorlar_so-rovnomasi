'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Download, CalendarDays, Trash2, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGroup, useRooms, useSchoolGroups, useStaff, type Lesson } from '@/lib/school';
import { DAY_SHORT, DAY_UZ, WEEKDAYS } from '@/lib/labels';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { FilterBar, FilterSelect } from '@/components/shared/filters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { BranchFilter, Field, FormSelect, GroupFilter, SubjectSelect } from '@/components/school/pickers';
import { cn } from '@/lib/utils';

const DAYS = WEEKDAYS.filter((d) => d !== 'SUN');
const SLOTS = [
  { order: 1, start: '08:30', end: '09:15' }, { order: 2, start: '09:25', end: '10:10' }, { order: 3, start: '10:20', end: '11:05' }, { order: 4, start: '11:25', end: '12:10' },
  { order: 5, start: '12:20', end: '13:05' }, { order: 6, start: '14:00', end: '14:45' }, { order: 7, start: '14:55', end: '15:40' }, { order: 8, start: '15:50', end: '16:35' },
];

export default function SchedulePage() {
  return <React.Suspense><ScheduleInner /></React.Suspense>;
}

function ScheduleInner() {
  const sp = useSearchParams();
  const { can, user, is } = useAuth();
  const qc = useQueryClient();
  const [branchId, setBranchId] = React.useState('');
  const [mode, setMode] = React.useState<'group' | 'teacher'>(is('TEACHER') ? 'teacher' : 'group');
  const [groupId, setGroupId] = React.useState(sp.get('groupId') ?? '');
  const [teacherId, setTeacherId] = React.useState(is('TEACHER') ? user?.id ?? '' : '');
  const groups = useSchoolGroups(branchId || undefined);
  const teachers = useStaff('TEACHER', branchId || undefined);
  const [editing, setEditing] = React.useState<{ lesson?: Lesson; weekday?: string; slot?: (typeof SLOTS)[number] } | null>(null);
  const [del, setDel] = React.useState<Lesson | null>(null);

  React.useEffect(() => { if (mode === 'group' && !groupId && groups.data?.length) setGroupId(groups.data[0].id); }, [groups.data, groupId, mode]);
  const params = mode === 'group' ? { groupId: groupId || undefined } : { teacherId: teacherId || undefined };
  const enabled = mode === 'group' ? !!groupId : !!teacherId;
  const sched = useQuery({ queryKey: ['schedule', params], queryFn: () => api.get<{ items: Lesson[]; byDay: Record<string, Lesson[]> }>('/api/schedule', params), enabled });
  const rm = useMutation({ mutationFn: (id: string) => api.delete(`/api/schedule/lessons/${id}`), onSuccess: () => { toast.success("Dars o'chirildi. Guruhga xabar yuborildi."); qc.invalidateQueries({ queryKey: ['schedule'] }); setDel(null); }, onError: (e: Error) => toast.error(e.message) });

  const lessons = sched.data?.items ?? [];
  const times = React.useMemo(() => {
    const set = new Map<string, { start: string; end: string; order: number }>();
    for (const s of SLOTS) set.set(s.start, { start: s.start, end: s.end, order: s.order });
    for (const l of lessons) if (!set.has(l.startTime)) set.set(l.startTime, { start: l.startTime, end: l.endTime, order: l.order });
    return [...set.values()].sort((a, b) => a.start.localeCompare(b.start));
  }, [lessons]);
  const cell = (d: string, t: string) => lessons.filter((l) => l.weekday === d && l.startTime === t);
  const group = groups.data?.find((g) => g.id === groupId);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Dars jadvali"
        description="Haftalik jadval. O'zgarishlar darhol Telegram bot orqali o'quvchi va ota-onalarga yetkaziladi."
        actions={
          <>
            {enabled && mode === 'group' && <Button variant="outline" onClick={() => api.download(`/api/schedule/pdf?groupId=${groupId}`)}><Download /> PDF</Button>}
            {can('schedule.manage') && mode === 'group' && groupId && <Button onClick={() => setEditing({})}><Plus /> Dars qo'shish</Button>}
          </>
        }
      />
      <FilterBar>
        <div className="bg-muted inline-flex rounded-xl p-1 text-sm">
          {(['group', 'teacher'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cn('rounded-lg px-3 py-1.5 transition-colors', mode === m ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground')}>{m === 'group' ? 'Guruh bo\'yicha' : 'O\'qituvchi bo\'yicha'}</button>)}
        </div>
        <BranchFilter value={branchId} onChange={(v) => { setBranchId(v); setGroupId(''); }} />
        {mode === 'group' ? <GroupFilter value={groupId} onChange={setGroupId} branchId={branchId || undefined} allLabel={null} /> : <FilterSelect value={teacherId} onChange={setTeacherId} placeholder="O'qituvchi" allLabel={null} options={(teachers.data ?? []).map((t) => ({ value: t.id, label: t.fullName }))} className="sm:w-56" />}
        {group && <Badge variant="secondary" className="hidden sm:inline-flex">{group.studentCount} o'quvchi · tutor {group.tutor?.fullName ?? '—'}</Badge>}
      </FilterBar>

      {!enabled ? <EmptyState icon={CalendarDays} title={mode === 'group' ? 'Guruhni tanlang' : "O'qituvchini tanlang"} />
        : sched.isLoading ? <Skeleton className="h-[520px] rounded-2xl" />
        : (
          <div className="bg-card overflow-x-auto rounded-2xl border shadow-xs">
            <div className="grid min-w-[860px]" style={{ gridTemplateColumns: `88px repeat(${DAYS.length}, minmax(0, 1fr))` }}>
              <div className="bg-muted/50 border-b p-2" />
              {DAYS.map((d) => { const isToday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date().getDay()] === d; return <div key={d} className={cn('bg-muted/50 border-b border-l p-2 text-center text-sm font-semibold', isToday && 'text-primary')}>{DAY_UZ[d]}{isToday && <span className="bg-primary ml-1 inline-block size-1.5 rounded-full align-middle" />}</div>; })}
              {times.map((t) => (
                <React.Fragment key={t.start}>
                  <div className="text-muted-foreground flex flex-col items-center justify-center border-b p-2 text-xs tabular-nums"><span className="text-foreground font-semibold">{t.order}-dars</span>{t.start}<span className="opacity-60">{t.end}</span></div>
                  {DAYS.map((d) => {
                    const ls = cell(d, t.start);
                    return (
                      <div key={d} className={cn('group/cell relative min-h-[72px] border-b border-l p-1', can('schedule.manage') && mode === 'group' && 'hover:bg-accent/40 cursor-pointer')} onClick={() => can('schedule.manage') && mode === 'group' && !ls.length && setEditing({ weekday: d, slot: { order: t.order, start: t.start, end: t.end } })}>
                        {ls.map((l) => (
                          <button key={l.id} onClick={(e) => { e.stopPropagation(); if (can('schedule.manage')) setEditing({ lesson: l }); }} className="w-full rounded-lg p-2 text-left text-xs text-white shadow-sm transition-transform hover:scale-[1.02]" style={{ background: l.subject.color ?? 'var(--primary)' }}>
                            <div className="truncate font-semibold">{l.subject.name}</div>
                            <div className="truncate opacity-90">{mode === 'group' ? l.teacher?.fullName ?? '—' : l.group.name}</div>
                            <div className="truncate opacity-75">{l.room ? `${l.room.name}-xona` : ''}{l.note ? ` · ${l.note}` : ''}</div>
                          </button>
                        ))}
                        {!ls.length && can('schedule.manage') && mode === 'group' && <Plus className="text-muted-foreground/40 absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/cell:opacity-100" />}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

      <div className="mt-6 grid gap-3 md:hidden">
        {enabled && DAYS.filter((d) => lessons.some((l) => l.weekday === d)).map((d) => (
          <div key={d} className="bg-card rounded-2xl border p-3">
            <div className="mb-2 text-sm font-semibold">{DAY_UZ[d]}</div>
            {lessons.filter((l) => l.weekday === d).sort((a, b) => a.startTime.localeCompare(b.startTime)).map((l) => (
              <button key={l.id} onClick={() => can('schedule.manage') && setEditing({ lesson: l })} className="flex w-full items-center gap-2 py-1.5 text-left text-sm"><Clock className="text-muted-foreground size-3.5" /><span className="w-24 shrink-0 text-xs tabular-nums">{l.startTime}–{l.endTime}</span><span className="size-2 rounded-full" style={{ background: l.subject.color ?? 'var(--primary)' }} /><span className="flex-1 truncate">{l.subject.name}</span><span className="text-muted-foreground truncate text-xs">{l.teacher?.fullName?.split(' ')[0]}</span></button>
            ))}
          </div>
        ))}
      </div>

      {editing && <LessonDialog open onOpenChange={(v) => !v && setEditing(null)} groupId={editing.lesson?.groupId ?? groupId} branchId={group?.branchId ?? editing.lesson?.group.branchId} lesson={editing.lesson} weekday={editing.weekday} slot={editing.slot} onDelete={(l) => { setEditing(null); setDel(l); }} />}
      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(null)} title="Darsni o'chirish" description={del ? `${DAY_UZ[del.weekday]} ${del.startTime}–${del.endTime} · ${del.subject.name}` : ''} confirmText="O'chirish" destructive loading={rm.isPending} onConfirm={() => { if (del) rm.mutate(del.id); }} />
    </div>
  );
}

function LessonDialog({ open, onOpenChange, groupId, branchId, lesson, weekday, slot, onDelete }: { open: boolean; onOpenChange: (v: boolean) => void; groupId: string; branchId?: string; lesson?: Lesson; weekday?: string; slot?: { order: number; start: string; end: string }; onDelete: (l: Lesson) => void }) {
  const qc = useQueryClient();
  const group = useGroup(groupId);
  const rooms = useRooms(branchId);
  const teachers = useStaff('TEACHER', branchId);
  const [f, setF] = React.useState({ subjectId: lesson?.subjectId ?? '', teacherId: lesson?.teacherId ?? '', roomId: lesson?.roomId ?? '', weekday: lesson?.weekday ?? weekday ?? 'MON', startTime: lesson?.startTime ?? slot?.start ?? '08:30', endTime: lesson?.endTime ?? slot?.end ?? '09:15', order: String(lesson?.order ?? slot?.order ?? 1), note: lesson?.note ?? '' });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  // Auto-pick the teacher assigned to that subject in this group
  React.useEffect(() => {
    if (!f.subjectId || f.teacherId) return;
    const gt = group.data?.teachers?.find((t) => t.subjectId === f.subjectId);
    if (gt) setF((s) => ({ ...s, teacherId: gt.teacherId }));
    else if (group.data?.teacherId) setF((s) => ({ ...s, teacherId: group.data!.teacherId! }));
  }, [f.subjectId, f.teacherId, group.data]);
  const applySlot = (o: string) => { const s = SLOTS.find((x) => String(x.order) === o); setF((st) => ({ ...st, order: o, startTime: s?.start ?? st.startTime, endTime: s?.end ?? st.endTime })); };
  const mut = useMutation({
    mutationFn: () => {
      const body = { groupId, subjectId: f.subjectId, teacherId: f.teacherId || null, roomId: f.roomId || null, weekday: f.weekday, startTime: f.startTime, endTime: f.endTime, order: Number(f.order) || 1, note: f.note.trim() || null };
      return lesson ? api.patch(`/api/schedule/lessons/${lesson.id}`, body) : api.post('/api/schedule/lessons', body);
    },
    onSuccess: () => { toast.success(lesson ? 'Dars yangilandi' : "Dars qo'shildi. Guruhga xabar yuborildi."); qc.invalidateQueries({ queryKey: ['schedule'] }); qc.invalidateQueries({ queryKey: ['group', groupId] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{lesson ? 'Darsni tahrirlash' : 'Yangi dars'}</DialogTitle><DialogDescription>{group.data?.name} · {DAY_UZ[f.weekday]}</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fan *" className="sm:col-span-2"><SubjectSelect value={f.subjectId} onChange={(v) => { set('subjectId', v); set('teacherId', ''); }} noneLabel={null} /></Field>
          <Field label="O'qituvchi"><FormSelect value={f.teacherId} onChange={(v) => set('teacherId', v)} options={(teachers.data ?? []).map((t) => ({ value: t.id, label: t.fullName }))} /></Field>
          <Field label="Xona"><FormSelect value={f.roomId} onChange={(v) => set('roomId', v)} options={(rooms.data ?? []).map((r) => ({ value: r.id, label: `${r.name}${r.building ? ` · ${r.building}` : ''}` }))} /></Field>
          <Field label="Kun"><FormSelect value={f.weekday} onChange={(v) => set('weekday', v)} noneLabel={null} options={DAYS.map((d) => ({ value: d, label: DAY_UZ[d] }))} /></Field>
          <Field label="Dars tartibi"><FormSelect value={f.order} onChange={applySlot} noneLabel={null} options={SLOTS.map((s) => ({ value: String(s.order), label: `${s.order}-dars (${s.start}–${s.end})` }))} /></Field>
          <Field label="Boshlanish"><Input type="time" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} /></Field>
          <Field label="Tugash"><Input type="time" value={f.endTime} onChange={(e) => set('endTime', e.target.value)} /></Field>
          <Field label="Izoh" className="sm:col-span-2"><Textarea rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Masalan: laboratoriya" /></Field>
        </div>
        <DialogFooter className="sm:justify-between">
          <div>{lesson && <Button variant="ghost" className="text-destructive" onClick={() => onDelete(lesson)}><Trash2 /> O'chirish</Button>}</div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!f.subjectId || !f.startTime || !f.endTime} loading={mut.isPending} onClick={() => mut.mutate()}>Saqlash</Button></div>
        </DialogFooter>
        <p className="text-muted-foreground text-[11px]">{DAY_SHORT[f.weekday]} {f.startTime}–{f.endTime}. O'qituvchi yoki xona band bo'lsa tizim ogohlantiradi.</p>
      </DialogContent>
    </Dialog>
  );
}
