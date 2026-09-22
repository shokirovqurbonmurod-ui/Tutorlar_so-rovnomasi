'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Plus, UserMinus, Download, MessageSquare, UserCheck, Star, NotebookPen, CalendarDays, Send, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStudentsLite, type Group, type Lesson, type Student } from '@/lib/school';
import { DAY_UZ, WEEKDAYS, fmtUZS } from '@/lib/labels';
import { initials } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { UserCell } from '@/components/shared/user-cell';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { GroupFormDialog } from '@/components/school/group-form';
import { StudentFormDialog } from '@/components/school/student-form';

type GroupDetail = Group & { students: Student[]; lessons: Lesson[] };

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [edit, setEdit] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [newStudent, setNewStudent] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const g = useQuery({ queryKey: ['group', id], queryFn: () => api.get<GroupDetail>(`/api/groups/${id}`) });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['group', id] }); qc.invalidateQueries({ queryKey: ['school-groups'] }); qc.invalidateQueries({ queryKey: ['students'] }); };
  const remove = useMutation({ mutationFn: (sid: string) => api.delete(`/api/groups/${id}/students/${sid}`), onSuccess: () => { toast.success("O'quvchi guruhdan chiqarildi"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const del = useMutation({ mutationFn: () => api.delete(`/api/groups/${id}`), onSuccess: () => { toast.success('Guruh arxivlandi'); invalidate(); router.push('/groups'); }, onError: (e: Error) => toast.error(e.message) });

  if (g.isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>;
  if (!g.data) return <EmptyState title="Guruh topilmadi" action={<Button asChild variant="outline"><Link href="/groups"><ArrowLeft /> Guruhlar</Link></Button>} />;
  const gr = g.data;
  const parentsLinked = gr.students.filter((s) => s.parents?.some((p) => p.parent.user.telegramId)).length;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={<div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon-sm"><Link href="/groups"><ArrowLeft /></Link></Button><span>{gr.name}</span>{!gr.isActive && <Badge variant="muted">Arxiv</Badge>}</div>}
        description={`${gr.branch?.name}${gr.gradeLevel ? ` · ${gr.gradeLevel}-sinf` : ''}${gr.room ? ` · ${gr.room}-xona` : ''} · ${gr.academicYear ?? ''}`}
        actions={
          <>
            <Button variant="outline" onClick={() => api.download(`/api/schedule/pdf?groupId=${gr.id}`)}><Download /> Jadval PDF</Button>
            {can('messages.view') && <Button asChild variant="outline"><Link href={`/messages?groupId=${gr.id}`}><MessageSquare /> Chat</Link></Button>}
            {can('groups.manage') && <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> Tahrirlash</Button>}
            {can('groups.manage') && <Button variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}><Trash2 /></Button>}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-muted-foreground text-xs font-medium uppercase">Tutor</div>
          <div className="mt-2 flex items-center gap-3"><Avatar className="size-10"><AvatarImage src={gr.tutor?.avatarUrl ?? undefined} /><AvatarFallback>{gr.tutor ? initials(gr.tutor.fullName) : '—'}</AvatarFallback></Avatar><div><div className="font-medium">{gr.tutor?.fullName ?? 'Biriktirilmagan'}</div><div className="text-muted-foreground text-xs">{gr.tutor?.phone ?? ''}</div></div></div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-xs font-medium uppercase">Fan o'qituvchilari</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{gr.teachers?.map((t) => <Badge key={t.teacherId + t.subjectId} variant="secondary" className="gap-1"><span className="size-2 rounded-full" style={{ background: t.subject.color ?? 'var(--primary)' }} />{t.subject.name}: {t.teacher.fullName}</Badge>)}{!gr.teachers?.length && gr.teacher && <Badge variant="secondary">{gr.teacher.fullName}</Badge>}{!gr.teachers?.length && !gr.teacher && <span className="text-muted-foreground text-sm">—</span>}</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-xs font-medium uppercase">O'quvchilar</div>
          <div className="mt-2 flex items-end gap-3"><span className="text-3xl font-bold">{gr.students.length}</span><span className="text-muted-foreground pb-1 text-xs"><Send className="mr-1 inline size-3 text-info" />{parentsLinked} ota-ona botga ulangan</span></div>
        </Card>
      </div>

      <Tabs defaultValue="students">
        <TabsList className="flex w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="students">O'quvchilar</TabsTrigger>
          <TabsTrigger value="schedule"><CalendarDays className="size-4" /> Jadval</TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {can('attendance.mark') && <Button asChild size="sm" variant="outline"><Link href={`/attendance?groupId=${gr.id}`}><UserCheck /> Davomat</Link></Button>}
            {can('grades.manage') && <Button asChild size="sm" variant="outline"><Link href={`/grades?groupId=${gr.id}`}><Star /> Baholar</Link></Button>}
            {can('homework.manage') && <Button asChild size="sm" variant="outline"><Link href={`/homework?groupId=${gr.id}`}><NotebookPen /> Uy vazifasi</Link></Button>}
            <div className="flex-1" />
            {can('groups.manage') && <Button size="sm" variant="outline" onClick={() => setNewStudent(true)}><Plus /> Yangi o'quvchi</Button>}
            {can('groups.manage') && <Button size="sm" onClick={() => setAddOpen(true)}><Plus /> Mavjud o'quvchini qo'shish</Button>}
          </div>
          <DataTable<Student>
            rows={gr.students} rowKey={(s) => s.id} onRowClick={(s) => router.push(`/students/${s.id}`)}
            columns={[
              { key: 'n', header: '#', className: 'w-10', cell: (s) => <span className="text-muted-foreground text-xs">{gr.students.indexOf(s) + 1}</span> },
              { key: 'name', header: "O'quvchi", cell: (s) => <UserCell name={s.fullName} sub={s.studentCode} avatarUrl={s.avatarUrl} /> },
              { key: 'parent', header: 'Ota-ona', hideBelow: 'md', cell: (s) => { const p = s.parents?.find((x) => x.isPrimary) ?? s.parents?.[0]; return p ? <div className="text-sm"><div>{p.parent.user.fullName}</div><div className="text-muted-foreground text-xs">{p.parent.user.phone}</div></div> : <span className="text-muted-foreground text-xs">—</span>; } },
              { key: 'tg', header: 'Bot', hideBelow: 'sm', cell: (s) => (s.parents?.some((p) => p.parent.user.telegramId) ? <Badge variant="success">Ulangan</Badge> : <Badge variant="muted">—</Badge>) },
              { key: 'fee', header: "To'lov", hideBelow: 'lg', cell: (s) => <span className="text-sm">{fmtUZS(s.monthlyFee)}</span> },
              { key: 'x', header: '', cell: (s) => can('groups.manage') ? <Button variant="ghost" size="icon-sm" title="Guruhdan chiqarish" onClick={(e) => { e.stopPropagation(); remove.mutate(s.id); }}><UserMinus className="text-destructive" /></Button> : null },
            ]}
            empty={<EmptyState title="Guruhda o'quvchi yo'q" action={can('groups.manage') && <Button onClick={() => setAddOpen(true)}><Plus /> O'quvchi qo'shish</Button>} />}
          />
        </TabsContent>
        <TabsContent value="schedule" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3"><CardTitle className="text-base">Haftalik jadval</CardTitle>{can('schedule.manage') && <Button asChild size="sm" variant="outline"><Link href={`/schedule?groupId=${gr.id}`}><Pencil /> Tahrirlash</Link></Button>}</CardHeader>
            <CardContent>
              {!gr.lessons.length ? <EmptyState title="Jadval tuzilmagan" action={can('schedule.manage') && <Button asChild><Link href={`/schedule?groupId=${gr.id}`}>Jadval tuzish</Link></Button>} /> : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {WEEKDAYS.filter((d) => gr.lessons.some((l) => l.weekday === d)).map((d) => (
                    <div key={d} className="rounded-xl border p-3">
                      <div className="mb-2 text-sm font-semibold">{DAY_UZ[d]}</div>
                      <div className="space-y-1.5">{gr.lessons.filter((l) => l.weekday === d).map((l) => <div key={l.id} className="flex items-center gap-2 text-sm"><span className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">{l.startTime}–{l.endTime}</span><span className="size-2 rounded-full" style={{ background: l.subject.color ?? 'var(--primary)' }} /><span className="flex-1 truncate">{l.subject.name}</span><span className="text-muted-foreground truncate text-xs">{l.teacher?.fullName?.split(' ')[0]}{l.room ? ` · ${l.room.name}` : ''}</span></div>)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <GroupFormDialog open={edit} onOpenChange={setEdit} group={gr} />
      <StudentFormDialog open={newStudent} onOpenChange={(v) => { setNewStudent(v); if (!v) invalidate(); }} defaultGroupId={gr.id} defaultBranchId={gr.branchId} />
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Guruhni arxivlash" description="Guruh nofaol bo'ladi; o'quvchilar guruhsiz qoladi." confirmText="Arxivlash" destructive loading={del.isPending} onConfirm={() => del.mutate()} />
      <AddStudentsDialog open={addOpen} onOpenChange={setAddOpen} groupId={gr.id} branchId={gr.branchId} onDone={invalidate} />
    </div>
  );
}

function AddStudentsDialog({ open, onOpenChange, groupId, branchId, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; groupId: string; branchId: string; onDone: () => void }) {
  const [search, setSearch] = React.useState('');
  const [onlyFree, setOnlyFree] = React.useState(true);
  const [ids, setIds] = React.useState<string[]>([]);
  const list = useStudentsLite({ branchId, search, unassigned: onlyFree, limit: 60 });
  React.useEffect(() => { if (open) { setIds([]); setSearch(''); } }, [open]);
  const mut = useMutation({ mutationFn: () => api.post(`/api/groups/${groupId}/students`, { studentIds: ids }), onSuccess: () => { toast.success(`${ids.length} ta o'quvchi qo'shildi. Ota-onalarga xabar yuborildi.`); onDone(); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  const rows = (list.data ?? []).filter((s) => s.groupId !== groupId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Guruhga o'quvchi qo'shish</DialogTitle><DialogDescription>Tanlangan o'quvchilar shu guruhga o'tkaziladi.</DialogDescription></DialogHeader>
        <div className="flex items-center gap-2"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism yoki kod…" /><label className="flex shrink-0 items-center gap-2 text-xs"><Checkbox checked={onlyFree} onCheckedChange={(v) => setOnlyFree(!!v)} /> Faqat guruhsizlar</label></div>
        <div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border p-2">
          {rows.map((s) => (
            <label key={s.id} className="hover:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
              <Checkbox checked={ids.includes(s.id)} onCheckedChange={(v) => setIds((x) => (v ? [...x, s.id] : x.filter((i) => i !== s.id)))} />
              <span className="flex-1">{s.fullName}</span><span className="text-muted-foreground text-xs">{s.group?.name ?? 'guruhsiz'} · {s.studentCode}</span>
            </label>
          ))}
          {!rows.length && <p className="text-muted-foreground p-3 text-center text-xs">{list.isLoading ? 'Yuklanmoqda…' : "O'quvchi topilmadi"}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!ids.length} loading={mut.isPending} onClick={() => mut.mutate()}>{ids.length} ta qo'shish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
