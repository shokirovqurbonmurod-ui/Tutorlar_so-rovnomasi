'use client';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BedDouble, Plus, Building2, DoorOpen, UserPlus, LogOut, Wrench, Pencil, Trash2, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Dormitory, DormRoom, DormBed, DormBuilding } from '@/lib/school';
import { DORM_LOG } from '@/lib/labels';
import { fmtDate, cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { BranchSelect, Field, FormSelect, StaffSelect } from '@/components/school/pickers';

type Resp = { items: Array<Dormitory & { stats: { buildings: number; rooms: number; beds: number; occupied: number; free: number; occupancy: number; needsRepair: number } }>; today: Record<string, number> };
const COND: Record<string, { label: string; cls: string }> = { GOOD: { label: 'Yaxshi', cls: 'text-success' }, NEEDS_REPAIR: { label: "Ta'mir kerak", cls: 'text-warning' }, CLOSED: { label: 'Yopiq', cls: 'text-destructive' } };

export default function DormPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const manage = can('dorm.manage');
  const d = useQuery({ queryKey: ['dorm'], queryFn: () => api.get<Resp>('/api/dorm') });
  const [dormId, setDormId] = React.useState('');
  const [dlg, setDlg] = React.useState<null | { kind: 'dorm'; dorm?: Dormitory } | { kind: 'building'; dormitoryId: string; building?: DormBuilding } | { kind: 'room'; buildingId: string; room?: DormRoom } | { kind: 'assign'; bed: DormBed; room: DormRoom } | { kind: 'checkout'; bed: DormBed }>(null);
  React.useEffect(() => { if (!dormId && d.data?.items.length) setDormId(d.data.items[0].id); }, [d.data, dormId]);
  const dorm = d.data?.items.find((x) => x.id === dormId);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['dorm'] }); qc.invalidateQueries({ queryKey: ['students'] }); };
  const checkout = useMutation({ mutationFn: (sid: string) => api.post(`/api/dorm/checkout/${sid}`, {}), onSuccess: () => { toast.success("O'quvchi yotoqxonadan chiqarildi"); invalidate(); setDlg(null); }, onError: (e: Error) => toast.error(e.message) });
  const totals = (d.data?.items ?? []).reduce((a, x) => ({ beds: a.beds + x.stats.beds, occupied: a.occupied + x.stats.occupied, rooms: a.rooms + x.stats.rooms, repair: a.repair + x.stats.needsRepair }), { beds: 0, occupied: 0, rooms: 0, repair: 0 });

  return (
    <div className="animate-fade-up">
      <PageHeader title="Yotoqxona" description="Bino → qavat → xona → joy. Komendant o'quvchilarni joylashtiradi, davomat va incidentlarni yuritadi; ota-ona botda ko'radi." actions={<><Button asChild variant="outline"><Link href="/dorm/logs"><ShieldCheck /> Komendant jurnali</Link></Button>{manage && <Button onClick={() => setDlg({ kind: 'dorm' })}><Plus /> Yotoqxona</Button>}</>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Joylashganlar" value={`${totals.occupied} / ${totals.beds}`} hint={`${totals.beds ? Math.round((totals.occupied / totals.beds) * 100) : 0}% bandlik`} icon={Users} tone="primary" loading={d.isLoading} />
        <StatCard label="Bo'sh joylar" value={totals.beds - totals.occupied} icon={BedDouble} tone="success" loading={d.isLoading} />
        <StatCard label="Xonalar" value={totals.rooms} hint={totals.repair ? `${totals.repair} ta ta'mir kerak` : 'hammasi yaxshi holatda'} icon={DoorOpen} tone={totals.repair ? 'warning' : 'info'} loading={d.isLoading} />
        <StatCard label="Bugungi yozuvlar" value={Object.values(d.data?.today ?? {}).reduce((s, n) => s + n, 0)} hint={Object.entries(d.data?.today ?? {}).map(([k, n]) => `${DORM_LOG[k]?.label ?? k}: ${n}`).join(' · ') || 'yozuv yo\'q'} icon={ShieldCheck} tone="violet" loading={d.isLoading} />
      </div>

      {d.isLoading ? <Skeleton className="h-96 rounded-2xl" /> : !d.data?.items.length ? <EmptyState icon={BedDouble} title="Yotoqxona yo'q" action={manage && <Button onClick={() => setDlg({ kind: 'dorm' })}><Plus /> Yotoqxona yaratish</Button>} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {d.data.items.map((x) => <button key={x.id} onClick={() => setDormId(x.id)} className={cn('rounded-xl border px-3 py-1.5 text-sm transition-colors', dormId === x.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent')}>{x.name} <span className="opacity-70">· {x.stats.occupied}/{x.stats.beds}</span></button>)}
            {dorm && manage && <Button variant="ghost" size="sm" onClick={() => setDlg({ kind: 'dorm', dorm })}><Pencil /> Tahrirlash</Button>}
            {dorm && manage && <Button variant="outline" size="sm" onClick={() => setDlg({ kind: 'building', dormitoryId: dorm.id })}><Plus /> Bino</Button>}
            {dorm && <span className="text-muted-foreground ml-auto text-xs">Komendant: <b className="text-foreground">{dorm.manager?.fullName ?? '—'}</b>{dorm.manager?.phone ? ` · ${dorm.manager.phone}` : ''}</span>}
          </div>
          {dorm?.buildings.map((b) => (
            <section key={b.id} className="mb-6">
              <div className="mb-2 flex items-center gap-2"><Building2 className="text-muted-foreground size-4" /><h3 className="font-semibold">{b.name}</h3><span className="text-muted-foreground text-xs">{b.floors} qavat · {b.rooms.length} xona</span>{manage && <><Button variant="ghost" size="icon-sm" onClick={() => setDlg({ kind: 'building', dormitoryId: dorm.id, building: b })}><Pencil /></Button><Button variant="outline" size="sm" onClick={() => setDlg({ kind: 'room', buildingId: b.id })}><Plus /> Xona</Button></>}</div>
              {!b.rooms.length && <p className="text-muted-foreground text-sm">Xonalar yo'q</p>}
              {[...new Set(b.rooms.map((r) => r.floor))].sort((x, y) => x - y).map((floor) => (
                <div key={floor} className="mb-3">
                  <div className="text-muted-foreground mb-1.5 text-xs font-medium uppercase">{floor}-qavat</div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {b.rooms.filter((r) => r.floor === floor).map((r) => {
                      const occ = r.beds.filter((x) => x.assignment).length;
                      return (
                        <Card key={r.id} className={cn('p-3', r.condition === 'CLOSED' && 'opacity-60')}>
                          <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><DoorOpen className="size-4" />{r.number}-xona{r.gender && <span className="text-muted-foreground text-xs font-normal">{r.gender === 'MALE' ? "o'g'il" : 'qiz'}</span>}</div><div className="flex items-center gap-1"><Badge variant={occ === r.beds.length ? 'muted' : 'success'}>{occ}/{r.beds.length}</Badge>{manage && <Button variant="ghost" size="icon-sm" onClick={() => setDlg({ kind: 'room', buildingId: b.id, room: r })}><Pencil /></Button>}</div></div>
                          <div className={cn('mt-0.5 flex items-center gap-1 text-xs', COND[r.condition]?.cls)}>{r.condition !== 'GOOD' && <Wrench className="size-3" />}{COND[r.condition]?.label}{r.note ? ` · ${r.note}` : ''}</div>
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            {r.beds.map((bed) => bed.assignment ? (
                              <div key={bed.id} className="bg-primary/8 group/bed relative rounded-lg border border-primary/20 p-2 text-xs">
                                <div className="text-muted-foreground text-[10px]">{bed.label}</div>
                                <Link href={`/students/${bed.assignment.student.id}`} className="block truncate font-medium hover:underline">{bed.assignment.student.fullName}</Link>
                                <div className="text-muted-foreground truncate text-[10px]">{bed.assignment.student.group?.name ?? ''} · {fmtDate(bed.assignment.checkInAt)}</div>
                                {manage && <button title="Chiqarish" onClick={() => setDlg({ kind: 'checkout', bed })} className="text-muted-foreground hover:text-destructive absolute top-1 right-1 opacity-0 transition-opacity group-hover/bed:opacity-100"><LogOut className="size-3.5" /></button>}
                              </div>
                            ) : (
                              <button key={bed.id} disabled={!manage || r.condition === 'CLOSED'} onClick={() => setDlg({ kind: 'assign', bed, room: r })} className="hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center rounded-lg border border-dashed p-2 text-xs transition-colors disabled:cursor-default disabled:hover:border-border disabled:hover:bg-transparent"><span className="text-muted-foreground text-[10px]">{bed.label}</span><span className="text-muted-foreground inline-flex items-center gap-1"><UserPlus className="size-3" /> bo'sh</span></button>
                            ))}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </>
      )}

      {dlg?.kind === 'dorm' && <DormDialog open onOpenChange={() => setDlg(null)} dorm={dlg.dorm} />}
      {dlg?.kind === 'building' && <BuildingDialog open onOpenChange={() => setDlg(null)} dormitoryId={dlg.dormitoryId} building={dlg.building} />}
      {dlg?.kind === 'room' && <RoomDialog open onOpenChange={() => setDlg(null)} buildingId={dlg.buildingId} room={dlg.room} />}
      {dlg?.kind === 'assign' && <AssignDialog open onOpenChange={() => setDlg(null)} bed={dlg.bed} room={dlg.room} dormName={dorm?.name ?? ''} onDone={invalidate} />}
      <ConfirmDialog open={dlg?.kind === 'checkout'} onOpenChange={(v) => !v && setDlg(null)} title="Yotoqxonadan chiqarish" description={dlg?.kind === 'checkout' ? `${dlg.bed.assignment?.student.fullName} ${dlg.bed.label} joyidan chiqariladi. Ota-onaga xabar boradi.` : ''} confirmText="Chiqarish" destructive loading={checkout.isPending} onConfirm={() => { if (dlg?.kind === 'checkout' && dlg.bed.assignment) checkout.mutate(dlg.bed.assignment.student.id); }} />
    </div>
  );
}

function DormDialog({ open, onOpenChange, dorm }: { open: boolean; onOpenChange: (v: boolean) => void; dorm?: Dormitory }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [f, setF] = React.useState({ name: dorm?.name ?? '', address: dorm?.address ?? '', branchId: dorm?.branchId ?? user?.branch?.id ?? '', managerId: dorm?.managerId ?? '' });
  const [confirm, setConfirm] = React.useState(false);
  const mut = useMutation({ mutationFn: () => (dorm ? api.patch(`/api/dorm/${dorm.id}`, { ...f, address: f.address || null, managerId: f.managerId || null }) : api.post('/api/dorm', { ...f, address: f.address || null, managerId: f.managerId || null })), onSuccess: () => { toast.success('Saqlandi'); qc.invalidateQueries({ queryKey: ['dorm'] }); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  const rm = useMutation({ mutationFn: () => api.delete(`/api/dorm/${dorm!.id}`), onSuccess: () => { toast.success("O'chirildi"); qc.invalidateQueries({ queryKey: ['dorm'] }); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{dorm ? 'Yotoqxonani tahrirlash' : 'Yangi yotoqxona'}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label="Nomi *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Asosiy yotoqxona" /></Field>
          <Field label="Filial *"><BranchSelect value={f.branchId} onChange={(v) => setF({ ...f, branchId: v, managerId: '' })} noneLabel={null} /></Field>
          <Field label="Komendant" hint="DORM_MANAGER rolidagi xodim. Xodimlar bo'limidan qo'shiladi."><StaffSelect role="DORM_MANAGER" value={f.managerId} onChange={(v) => setF({ ...f, managerId: v })} /></Field>
          <Field label="Manzil"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        </div>
        <DialogFooter className="sm:justify-between"><div>{dorm && <Button variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}><Trash2 /> O'chirish</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!f.name.trim() || !f.branchId} loading={mut.isPending} onClick={() => mut.mutate()}>Saqlash</Button></div></DialogFooter>
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Yotoqxonani o'chirish" description="Barcha binolar, xonalar va joylashuvlar o'chadi." confirmText="O'chirish" destructive loading={rm.isPending} onConfirm={() => rm.mutate()} />
      </DialogContent>
    </Dialog>
  );
}

function BuildingDialog({ open, onOpenChange, dormitoryId, building }: { open: boolean; onOpenChange: (v: boolean) => void; dormitoryId: string; building?: DormBuilding }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ name: building?.name ?? '', floors: String(building?.floors ?? 1) });
  const mut = useMutation({ mutationFn: () => (building ? api.patch(`/api/dorm/buildings/${building.id}`, { name: f.name, floors: Number(f.floors) }) : api.post('/api/dorm/buildings', { dormitoryId, name: f.name, floors: Number(f.floors) })), onSuccess: () => { toast.success('Saqlandi'); qc.invalidateQueries({ queryKey: ['dorm'] }); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  const rm = useMutation({ mutationFn: () => api.delete(`/api/dorm/buildings/${building!.id}`), onSuccess: () => { toast.success("O'chirildi"); qc.invalidateQueries({ queryKey: ['dorm'] }); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{building ? 'Binoni tahrirlash' : 'Yangi bino'}</DialogTitle></DialogHeader>
        <div className="grid gap-4"><Field label="Nomi *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="A bino" /></Field><Field label="Qavatlar soni"><Input type="number" min={1} value={f.floors} onChange={(e) => setF({ ...f, floors: e.target.value })} /></Field></div>
        <DialogFooter className="sm:justify-between"><div>{building && <Button variant="ghost" className="text-destructive" onClick={() => rm.mutate()} loading={rm.isPending}><Trash2 /></Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!f.name.trim()} loading={mut.isPending} onClick={() => mut.mutate()}>Saqlash</Button></div></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomDialog({ open, onOpenChange, buildingId, room }: { open: boolean; onOpenChange: (v: boolean) => void; buildingId: string; room?: DormRoom }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ number: room?.number ?? '', floor: String(room?.floor ?? 1), capacity: String(room?.capacity ?? 4), gender: room?.gender ?? '', condition: room?.condition ?? 'GOOD', note: room?.note ?? '' });
  const body = () => ({ number: f.number.trim(), floor: Number(f.floor), capacity: Number(f.capacity), gender: f.gender || null, condition: f.condition, note: f.note.trim() || null });
  const mut = useMutation({ mutationFn: () => (room ? api.patch(`/api/dorm/rooms/${room.id}`, body()) : api.post('/api/dorm/rooms', { buildingId, ...body() })), onSuccess: () => { toast.success('Saqlandi'); qc.invalidateQueries({ queryKey: ['dorm'] }); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  const rm = useMutation({ mutationFn: () => api.delete(`/api/dorm/rooms/${room!.id}`), onSuccess: () => { toast.success("Xona o'chirildi"); qc.invalidateQueries({ queryKey: ['dorm'] }); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{room ? `${room.number}-xona` : 'Yangi xona'}</DialogTitle><DialogDescription>Sig'imga qarab joylar (A, B, C…) avtomatik yaratiladi.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Raqami *"><Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} placeholder="101" /></Field>
          <Field label="Qavat"><Input type="number" min={0} value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} /></Field>
          <Field label="Sig'im (joylar)"><Input type="number" min={1} max={20} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
          <Field label="Jinsi"><FormSelect value={f.gender} onChange={(v) => setF({ ...f, gender: v })} noneLabel="Aralash" options={[{ value: 'MALE', label: "O'g'il bolalar" }, { value: 'FEMALE', label: 'Qiz bolalar' }]} /></Field>
          <Field label="Holati"><FormSelect value={f.condition} onChange={(v) => setF({ ...f, condition: v })} noneLabel={null} options={Object.entries(COND).map(([value, m]) => ({ value, label: m.label }))} /></Field>
          <Field label="Izoh"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <DialogFooter className="sm:justify-between"><div>{room && <Button variant="ghost" className="text-destructive" onClick={() => rm.mutate()} loading={rm.isPending}><Trash2 /></Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!f.number.trim()} loading={mut.isPending} onClick={() => mut.mutate()}>Saqlash</Button></div></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ open, onOpenChange, bed, room, dormName, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; bed: DormBed; room: DormRoom; dormName: string; onDone: () => void }) {
  const [search, setSearch] = React.useState('');
  const [studentId, setStudentId] = React.useState('');
  const [note, setNote] = React.useState('');
  const list = useQuery({ queryKey: ['dorm-unassigned', search], queryFn: () => api.get<Array<{ id: string; fullName: string; studentCode: string; gender: string | null; group?: { name: string } | null }>>('/api/dorm/students', { unassigned: 'yes', search: search || undefined }) });
  const mut = useMutation({ mutationFn: () => api.post('/api/dorm/assign', { studentId, bedId: bed.id, note: note || null }), onSuccess: () => { toast.success('Joylashtirildi. Ota-onaga xabar yuborildi.'); onDone(); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  const items = (list.data ?? []).filter((s) => !room.gender || !s.gender || s.gender === room.gender);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Joylashtirish — {room.number}-xona, {bed.label}</DialogTitle><DialogDescription>{dormName}. Faqat “yotoqxonada yashaydi” belgisi bor va hali joylashtirilmagan o'quvchilar ko'rsatiladi.</DialogDescription></DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="O'quvchi qidirish…" />
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border p-1.5">
          {items.map((s) => <button key={s.id} type="button" onClick={() => setStudentId(s.id)} className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors', studentId === s.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}><span>{s.fullName}</span><span className="text-xs opacity-70">{s.group?.name ?? '—'} · {s.studentCode}</span></button>)}
          {!items.length && <p className="text-muted-foreground p-3 text-center text-xs">{list.isLoading ? 'Yuklanmoqda…' : "Joylashtirilmagan o'quvchi yo'q. O'quvchi kartasida “Yotoqxonada yashaydi”ni yoqing."}</p>}
        </div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Izoh (ixtiyoriy)" />
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!studentId} loading={mut.isPending} onClick={() => mut.mutate()}><UserPlus /> Joylashtirish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
