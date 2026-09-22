'use client';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Library, DoorOpen } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRooms, useSubjects, type Room, type Subject } from '@/lib/school';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { BranchFilter, BranchSelect, Field } from '@/components/school/pickers';
import { cn } from '@/lib/utils';

const PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#4f46e5', '#64748b', '#0f172a'];

export default function SubjectsPage() {
  const { can } = useAuth();
  const manage = can('subjects.manage') || can('schedule.manage');
  return (
    <div className="animate-fade-up">
      <PageHeader title="Fanlar va xonalar" description="Dars jadvali, baholar va uy vazifalarida ishlatiladigan fanlar ro'yxati hamda o'quv xonalari" />
      <Tabs defaultValue="subjects">
        <TabsList><TabsTrigger value="subjects"><Library className="size-4" /> Fanlar</TabsTrigger><TabsTrigger value="rooms"><DoorOpen className="size-4" /> Xonalar</TabsTrigger></TabsList>
        <TabsContent value="subjects" className="mt-4"><SubjectsTab manage={manage} /></TabsContent>
        <TabsContent value="rooms" className="mt-4"><RoomsTab manage={manage} /></TabsContent>
      </Tabs>
    </div>
  );
}

function SubjectsTab({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const subjects = useSubjects();
  const [editing, setEditing] = React.useState<Subject | null | 'new'>(null);
  const [del, setDel] = React.useState<Subject | null>(null);
  const rm = useMutation({ mutationFn: (id: string) => api.delete(`/api/subjects/${id}`), onSuccess: () => { toast.success("Fan o'chirildi"); qc.invalidateQueries({ queryKey: ['subjects'] }); setDel(null); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <>
      <div className="mb-3 flex justify-end">{manage && <Button onClick={() => setEditing('new')}><Plus /> Fan qo'shish</Button>}</div>
      {!subjects.isLoading && !subjects.data?.length ? <EmptyState icon={Library} title="Fanlar yo'q" /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(subjects.data ?? []).map((s) => (
            <Card key={s.id} className={cn('flex items-center gap-3 p-4', !s.isActive && 'opacity-60')}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: s.color ?? '#2563eb' }}>{(s.code ?? s.name).slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{s.name}</div><div className="text-muted-foreground text-xs">{s._count?.lessons ?? 0} dars · {s._count?.groupTeachers ?? 0} o'qituvchi{!s.isActive && ' · nofaol'}</div></div>
              {manage && <div className="flex"><Button variant="ghost" size="icon-sm" onClick={() => setEditing(s)}><Pencil /></Button><Button variant="ghost" size="icon-sm" onClick={() => setDel(s)}><Trash2 className="text-destructive" /></Button></div>}
            </Card>
          ))}
        </div>
      )}
      <SubjectDialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)} subject={editing === 'new' ? null : editing} />
      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(null)} title={`"${del?.name}" fanini o'chirish`} description="Fan bilan bog'liq darslar bo'lsa, fan faqat nofaol holatga o'tadi." confirmText="O'chirish" destructive loading={rm.isPending} onConfirm={() => { if (del) rm.mutate(del.id); }} />
    </>
  );
}

function SubjectDialog({ open, onOpenChange, subject }: { open: boolean; onOpenChange: (v: boolean) => void; subject: Subject | null }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ name: '', code: '', color: PALETTE[0], isActive: true });
  React.useEffect(() => { if (open) setF(subject ? { name: subject.name, code: subject.code ?? '', color: subject.color ?? PALETTE[0], isActive: subject.isActive } : { name: '', code: '', color: PALETTE[Math.floor(Math.random() * PALETTE.length)], isActive: true }); }, [open, subject]);
  const mut = useMutation({ mutationFn: () => (subject ? api.patch(`/api/subjects/${subject.id}`, { ...f, code: f.code || null }) : api.post('/api/subjects', { ...f, code: f.code || null })), onSuccess: () => { toast.success('Saqlandi'); qc.invalidateQueries({ queryKey: ['subjects'] }); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{subject ? 'Fanni tahrirlash' : 'Yangi fan'}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label="Nomi *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Matematika" /></Field>
          <Field label="Qisqa kod"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="MATH" maxLength={20} /></Field>
          <Field label="Rang"><div className="flex flex-wrap gap-2">{PALETTE.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, color: c })} className={cn('size-8 rounded-full ring-offset-2 ring-offset-background transition-transform', f.color === c && 'ring-2 ring-primary scale-110')} style={{ background: c }} />)}</div></Field>
          <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"><span>Faol</span><Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!f.name.trim()} loading={mut.isPending} onClick={() => mut.mutate()}>Saqlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomsTab({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const [branchId, setBranchId] = React.useState('');
  const rooms = useRooms(branchId || undefined);
  const [editing, setEditing] = React.useState<Room | null | 'new'>(null);
  const [del, setDel] = React.useState<Room | null>(null);
  const rm = useMutation({ mutationFn: (id: string) => api.delete(`/api/subjects/rooms/${id}`), onSuccess: () => { toast.success("Xona o'chirildi"); qc.invalidateQueries({ queryKey: ['rooms'] }); setDel(null); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2"><BranchFilter value={branchId} onChange={setBranchId} /><div className="flex-1" />{manage && <Button onClick={() => setEditing('new')}><Plus /> Xona qo'shish</Button>}</div>
      <DataTable<Room>
        rows={rooms.data} loading={rooms.isLoading} rowKey={(r) => r.id}
        columns={[
          { key: 'name', header: 'Xona', cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'building', header: 'Bino / qavat', cell: (r) => <span className="text-sm">{r.building ?? '—'}{r.floor ? ` · ${r.floor}-qavat` : ''}</span> },
          { key: 'branch', header: 'Filial', hideBelow: 'md', cell: (r) => <span className="text-sm">{r.branch?.name}</span> },
          { key: 'cap', header: "Sig'im", hideBelow: 'sm', cell: (r) => <span className="text-sm">{r.capacity ?? '—'}</span> },
          { key: 'lessons', header: 'Darslar', hideBelow: 'sm', cell: (r) => <Badge variant="secondary">{r._count?.lessons ?? 0}</Badge> },
          { key: 'x', header: '', cell: (r) => manage ? <div className="flex justify-end"><Button variant="ghost" size="icon-sm" onClick={() => setEditing(r)}><Pencil /></Button><Button variant="ghost" size="icon-sm" onClick={() => setDel(r)}><Trash2 className="text-destructive" /></Button></div> : null },
        ]}
        empty={<EmptyState icon={DoorOpen} title="Xonalar yo'q" />}
      />
      <RoomDialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)} room={editing === 'new' ? null : editing} defaultBranchId={branchId} />
      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(null)} title={`${del?.name} xonasini o'chirish`} confirmText="O'chirish" destructive loading={rm.isPending} onConfirm={() => { if (del) rm.mutate(del.id); }} />
    </>
  );
}

function RoomDialog({ open, onOpenChange, room, defaultBranchId }: { open: boolean; onOpenChange: (v: boolean) => void; room: Room | null; defaultBranchId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [f, setF] = React.useState({ name: '', building: '', floor: '', capacity: '', branchId: '' });
  React.useEffect(() => { if (open) setF(room ? { name: room.name, building: room.building ?? '', floor: room.floor?.toString() ?? '', capacity: room.capacity?.toString() ?? '', branchId: room.branchId } : { name: '', building: '', floor: '', capacity: '', branchId: defaultBranchId || user?.branch?.id || '' }); }, [open, room, defaultBranchId, user?.branch?.id]);
  const body = () => ({ name: f.name.trim(), building: f.building.trim() || null, floor: f.floor ? Number(f.floor) : null, capacity: f.capacity ? Number(f.capacity) : null, branchId: f.branchId });
  const mut = useMutation({ mutationFn: () => (room ? api.patch(`/api/subjects/rooms/${room.id}`, body()) : api.post('/api/subjects/rooms', body())), onSuccess: () => { toast.success('Saqlandi'); qc.invalidateQueries({ queryKey: ['rooms'] }); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{room ? 'Xonani tahrirlash' : 'Yangi xona'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nomi / raqami *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="204" /></Field>
          <Field label="Filial *"><BranchSelect value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })} noneLabel={null} /></Field>
          <Field label="Bino"><Input value={f.building} onChange={(e) => setF({ ...f, building: e.target.value })} placeholder="Asosiy bino" /></Field>
          <Field label="Qavat"><Input type="number" value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} /></Field>
          <Field label="Sig'im"><Input type="number" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!f.name.trim() || !f.branchId} loading={mut.isPending} onClick={() => mut.mutate()}>Saqlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
