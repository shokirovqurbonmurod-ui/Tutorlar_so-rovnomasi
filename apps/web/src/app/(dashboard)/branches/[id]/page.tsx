'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Users, GraduationCap, Star, ClipboardCheck, Plus, Trash2, MapPin, Phone, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Branch, DashboardData, Role, Paginated, User } from '@/lib/types';
import { ROLE_LABELS, USER_STATUS } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/components/shared/stat-card';
import { UserCell } from '@/components/shared/user-cell';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { AreaTrend, LineTrend } from '@/components/charts';
import { BranchFormDialog } from '@/components/branches/branch-form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fromNow, pct } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/alert-dialog';

type Group = { id: string; name: string; subject: string | null; studentCount: number | null; isActive: boolean; tutor: { id: string; fullName: string } | null; teacher: { id: string; fullName: string } | null };
type BranchDetail = Branch & { departments: Array<{ id: string; name: string; _count: { users: number } }>; groups: Group[]; users: Array<{ id: string; fullName: string; position: string | null; status: keyof typeof USER_STATUS; avatarUrl: string | null; lastActivityAt: string | null; role: Role }> };

export default function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data: b, isLoading } = useQuery({ queryKey: ['branch', id], queryFn: () => api.get<BranchDetail>(`/api/branches/${id}`) });
  const dash = useQuery({ queryKey: ['dashboard', '30d', id], queryFn: () => api.get<DashboardData>('/api/analytics/dashboard', { range: '30d', branchId: id }), enabled: can('analytics.view') });
  const [edit, setEdit] = React.useState(false);
  const [groupForm, setGroupForm] = React.useState<{ open: boolean; group?: Group | null }>({ open: false });
  const [deptName, setDeptName] = React.useState('');
  const [delGroup, setDelGroup] = React.useState<Group | null>(null);

  const addDept = useMutation({ mutationFn: () => api.post('/api/branches/departments', { name: deptName.trim(), branchId: id }), onSuccess: () => { toast.success('Bo‘lim qo‘shildi'); setDeptName(''); void qc.invalidateQueries({ queryKey: ['branch', id] }); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });
  const delDept = useMutation({ mutationFn: (d: string) => api.delete(`/api/branches/departments/${d}`), onSuccess: () => { toast.success('Bo‘lim o‘chirildi'); void qc.invalidateQueries({ queryKey: ['branch', id] }); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });
  const removeGroup = useMutation({ mutationFn: (g: string) => api.delete(`/api/branches/groups/${g}`), onSuccess: () => { toast.success('Guruh o‘chirildi'); setDelGroup(null); void qc.invalidateQueries({ queryKey: ['branch', id] }); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });

  if (isLoading || !b) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-32" /><Skeleton className="h-80" /></div>;
  const o = dash.data?.overview;
  const tutors = b.users.filter((u) => u.role.key === 'TUTOR');
  const teachers = b.users.filter((u) => u.role.key === 'TEACHER');
  const mgmt = b.users.filter((u) => !['TUTOR', 'TEACHER'].includes(u.role.key));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push('/branches')}><ArrowLeft /> Filiallar</Button>
        {can('branches.manage') && <Button size="sm" onClick={() => setEdit(true)}><Pencil /> Tahrirlash</Button>}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl text-lg font-bold">{b.code}</span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{b.name} {!b.isActive && <Badge variant="muted">nofaol</Badge>}</h2>
              <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {(b.city || b.address) && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {[b.city, b.address].filter(Boolean).join(', ')}</span>}
                {b.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" /> {b.phone}</span>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 text-sm">
            <div><div className="text-muted-foreground text-xs">Direktor</div><div className="font-medium">{b.director ? <Link href={`/users/${b.director.id}`} className="hover:underline">{b.director.fullName}</Link> : '—'}</div></div>
            <div><div className="text-muted-foreground text-xs">CEO</div><div className="font-medium">{b.ceo ? <Link href={`/users/${b.ceo.id}`} className="hover:underline">{b.ceo.fullName}</Link> : '—'}</div></div>
          </div>
        </CardContent>
      </Card>

      <div className="stagger mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tutorlar" value={tutors.length} icon={GraduationCap} tone="primary" hint={`${teachers.length} o‘qituvchi · ${mgmt.length} boshqaruv`} />
        <StatCard label="O‘quvchilar" value={b.studentCount ?? 0} icon={Users} tone="violet" hint={`${b.groups.length} ta guruh`} />
        <StatCard label="Bajarilish (30 kun)" value={pct(o?.completionRate ?? b.stats?.completionRate)} icon={ClipboardCheck} tone="success" delta={o?.completionRateDelta} />
        <StatCard label="O‘rtacha baho" value={(o?.avgRating ?? b.stats?.avgRating)?.toFixed(2) ?? '—'} icon={Star} tone="warning" hint={`${o?.pendingReports ?? 0} ta hisobot kutilmoqda`} />
      </div>

      {dash.data && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>So‘rovnoma bajarilishi</CardTitle><CardDescription>So‘nggi 30 kun</CardDescription></CardHeader><CardContent><AreaTrend data={dash.data.completion} xKey="date" series={[{ key: 'assigned', name: 'Tayinlangan' }, { key: 'completed', name: 'Bajarilgan' }]} height={220} /></CardContent></Card>
          <Card><CardHeader><CardTitle>O‘rtacha baho</CardTitle><CardDescription>Haftalik</CardDescription></CardHeader><CardContent>{dash.data.rating.length ? <LineTrend data={dash.data.rating} xKey="week" series={[{ key: 'avg', name: 'Baho', color: 'var(--chart-3)' }]} yDomain={[1, 5]} height={220} /> : <EmptyState className="py-8" title="Baholar yo‘q" />}</CardContent></Card>
        </div>
      )}

      <Tabs defaultValue="staff" className="mt-4">
        <TabsList><TabsTrigger value="staff">Xodimlar ({b.users.length})</TabsTrigger><TabsTrigger value="groups">Guruhlar ({b.groups.length})</TabsTrigger><TabsTrigger value="departments">Bo‘limlar ({b.departments.length})</TabsTrigger>{dash.data && <TabsTrigger value="top">Reyting</TabsTrigger>}</TabsList>
        <TabsContent value="staff">
          <div className="grid gap-4 lg:grid-cols-3">
            {[{ t: 'Tutorlar', list: tutors }, { t: 'O‘qituvchilar', list: teachers }, { t: 'Boshqaruv', list: mgmt }].map(({ t, list }) => (
              <Card key={t} className="gap-3"><CardHeader><CardTitle className="text-base">{t} <span className="text-muted-foreground font-normal">({list.length})</span></CardTitle></CardHeader>
                <CardContent className="space-y-1">{list.length === 0 && <div className="text-muted-foreground text-sm">Yo‘q</div>}{list.map((u) => <Link key={u.id} href={`/users/${u.id}`} className="hover:bg-accent/50 -mx-2 flex items-center justify-between rounded-lg px-2 py-1.5"><UserCell name={u.fullName} sub={u.position ?? ROLE_LABELS[u.role.key]} avatarUrl={u.avatarUrl} size="sm" /><div className="flex items-center gap-2"><span className="text-muted-foreground hidden text-[11px] sm:inline">{fromNow(u.lastActivityAt)}</span><StatusBadge value={u.status} map={USER_STATUS} /></div></Link>)}</CardContent></Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="groups">
          <Card>
            <CardHeader><CardTitle>Guruhlar</CardTitle><CardDescription>Tutor va o‘qituvchi biriktirilgan o‘quv guruhlari</CardDescription>{can('branches.manage') && <CardAction><Button size="sm" onClick={() => setGroupForm({ open: true, group: null })}><Plus /> Guruh</Button></CardAction>}</CardHeader>
            <CardContent>{b.groups.length === 0 ? <EmptyState title="Guruhlar yo‘q" /> : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {b.groups.map((g) => (
                  <div key={g.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between"><div><div className="font-semibold">{g.name}</div><div className="text-muted-foreground text-xs">{g.subject ?? '—'} · {g.studentCount ?? 0} o‘quvchi</div></div>{can('branches.manage') && <div className="flex"><Button variant="ghost" size="icon-sm" onClick={() => setGroupForm({ open: true, group: g })}><Pencil /></Button><Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDelGroup(g)}><Trash2 /></Button></div>}</div>
                    <div className="mt-2 space-y-0.5 text-xs"><div><span className="text-muted-foreground">Tutor: </span>{g.tutor ? <Link href={`/users/${g.tutor.id}`} className="hover:underline">{g.tutor.fullName}</Link> : '—'}</div><div><span className="text-muted-foreground">O‘qituvchi: </span>{g.teacher ? <Link href={`/users/${g.teacher.id}`} className="hover:underline">{g.teacher.fullName}</Link> : '—'}</div></div>
                  </div>
                ))}
              </div>
            )}</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="departments">
          <Card>
            <CardHeader><CardTitle>Bo‘limlar</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="divide-y">{b.departments.map((d) => <div key={d.id} className="flex items-center justify-between py-2 text-sm"><span>{d.name} <span className="text-muted-foreground text-xs">· {d._count?.users ?? 0} xodim</span></span>{can('departments.manage') && <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => delDept.mutate(d.id)}><Trash2 /></Button>}</div>)}{b.departments.length === 0 && <div className="text-muted-foreground py-2 text-sm">Bo‘limlar yo‘q</div>}</div>
              {can('departments.manage') && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (deptName.trim().length >= 2) addDept.mutate(); }}><Input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="Yangi bo‘lim nomi" /><Button type="submit" loading={addDept.isPending}><Plus /> Qo‘shish</Button></form>}
            </CardContent>
          </Card>
        </TabsContent>
        {dash.data && <TabsContent value="top"><Card><CardHeader><CardTitle>Filial reytingi</CardTitle><CardDescription>KPI bo‘yicha eng faol xodimlar</CardDescription></CardHeader><CardContent className="space-y-2">{dash.data.top.map((t, i) => <Link key={t.id} href={`/users/${t.id}`} className="hover:bg-accent/50 -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5"><span className="tabular text-muted-foreground w-5 text-center text-xs font-semibold">{i + 1}</span><div className="flex-1"><UserCell name={t.fullName} sub={ROLE_LABELS[t.role.key]} avatarUrl={t.avatarUrl} size="sm" /></div><span className="text-muted-foreground text-xs">{pct(t.completionRate)}</span><Badge variant="primary" className="tabular">{t.kpiScore ?? '—'}</Badge></Link>)}{dash.data.top.length === 0 && <EmptyState className="py-6" />}</CardContent></Card></TabsContent>}
      </Tabs>

      <BranchFormDialog open={edit} onOpenChange={setEdit} branch={b} />
      <GroupFormDialog open={groupForm.open} onOpenChange={(o) => setGroupForm({ open: o, group: groupForm.group })} branchId={id} group={groupForm.group} staff={b.users} />
      <ConfirmDialog open={!!delGroup} onOpenChange={(o) => !o && setDelGroup(null)} title="Guruhni o‘chirish" description={`«${delGroup?.name}» o‘chiriladi.`} destructive confirmText="O‘chirish" loading={removeGroup.isPending} onConfirm={() => { if (delGroup) removeGroup.mutate(delGroup.id); }} />
    </div>
  );
}

function GroupFormDialog({ open, onOpenChange, branchId, group, staff }: { open: boolean; onOpenChange: (o: boolean) => void; branchId: string; group?: Group | null; staff: BranchDetail['users'] }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ name: '', subject: '', studentCount: '0', tutorId: '', teacherId: '' });
  React.useEffect(() => { if (open) setF(group ? { name: group.name, subject: group.subject ?? '', studentCount: String(group.studentCount ?? 0), tutorId: group.tutor?.id ?? '', teacherId: group.teacher?.id ?? '' } : { name: '', subject: '', studentCount: '0', tutorId: '', teacherId: '' }); }, [open, group]);
  const m = useMutation({
    mutationFn: () => { const body = { name: f.name.trim(), subject: f.subject.trim() || null, studentCount: Number(f.studentCount) || 0, tutorId: f.tutorId || null, teacherId: f.teacherId || null, branchId }; return group ? api.patch(`/api/branches/groups/${group.id}`, body) : api.post('/api/branches/groups', body); },
    onSuccess: () => { toast.success('Saqlandi'); void qc.invalidateQueries({ queryKey: ['branch', branchId] }); onOpenChange(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen className="size-4" /> {group ? 'Guruhni tahrirlash' : 'Yangi guruh'}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Nomi *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="MATE-12" /></div><div className="space-y-1.5"><Label>Fan</Label><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Matematika" /></div></div>
          <div className="space-y-1.5"><Label>O‘quvchilar soni</Label><Input type="number" min={0} value={f.studentCount} onChange={(e) => setF({ ...f, studentCount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Tutor</Label><Select value={f.tutorId || '__none'} onValueChange={(v) => setF({ ...f, tutorId: v === '__none' ? '' : v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">— Yo‘q —</SelectItem>{staff.filter((u) => u.role.key === 'TUTOR').map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>O‘qituvchi</Label><Select value={f.teacherId || '__none'} onValueChange={(v) => setF({ ...f, teacherId: v === '__none' ? '' : v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">— Yo‘q —</SelectItem>{staff.filter((u) => u.role.key === 'TEACHER').map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}</SelectContent></Select></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button type="submit" loading={m.isPending}>Saqlash</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
