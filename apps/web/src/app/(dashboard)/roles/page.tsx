'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Plus, Shield, Users, Trash2, Save, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { RoleFull } from '@/lib/school';
import { ROLE_LABELS } from '@/lib/labels';
import type { RoleKey } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Field, FormSelect } from '@/components/school/pickers';

type PermGroup = { group: string; items: Array<{ key: string; label: string }> };
const GROUP_UZ: Record<string, string> = { dashboard: 'Dashboard', analytics: 'Analitika', kpi: 'KPI', reports: 'Hisobotlar', surveys: "So'rovnomalar", questions: 'Savollar', users: 'Xodimlar', branches: 'Filiallar', announcements: "E'lonlar", tasks: 'Vazifalar', notifications: 'Bildirishnomalar', audit: 'Audit', settings: 'Sozlamalar', students: "O'quvchilar", parents: 'Ota-onalar', groups: 'Guruhlar', subjects: 'Fanlar', schedule: 'Dars jadvali', attendance: 'Davomat', grades: 'Baholar', homework: 'Uy vazifalari', exams: 'Imtihonlar', messages: 'Xabarlar', finance: 'Moliya', dorm: 'Yotoqxona' };
const PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#64748b'];

export default function RolesPage() {
  const qc = useQueryClient();
  const { is } = useAuth();
  const superAdmin = is('SUPER_ADMIN');
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleFull[]>('/api/roles') });
  const perms = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<PermGroup[]>('/api/roles/permissions'), staleTime: Infinity });
  const [selId, setSelId] = React.useState('');
  const [draft, setDraft] = React.useState<Set<string>>(new Set());
  const [meta, setMeta] = React.useState({ name: '', description: '', color: '' });
  const [create, setCreate] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  React.useEffect(() => { if (!selId && roles.data?.length) setSelId(roles.data[0].id); }, [roles.data, selId]);
  const sel = roles.data?.find((r) => r.id === selId);
  React.useEffect(() => { if (sel) { setDraft(new Set(sel.permissions)); setMeta({ name: sel.name, description: sel.description ?? '', color: sel.color ?? '' }); } }, [sel]);
  const dirty = sel && (JSON.stringify([...draft].sort()) !== JSON.stringify([...sel.permissions].sort()) || meta.name !== sel.name || meta.description !== (sel.description ?? '') || meta.color !== (sel.color ?? ''));
  const locked = !superAdmin || sel?.key === 'SUPER_ADMIN';
  const save = useMutation({ mutationFn: () => api.patch(`/api/roles/${selId}`, { name: meta.name, description: meta.description || null, color: meta.color || null, permissions: [...draft] }), onSuccess: () => { toast.success('Rol saqlandi. Huquqlar darhol kuchga kirdi.'); qc.invalidateQueries({ queryKey: ['roles'] }); qc.invalidateQueries({ queryKey: ['users-roles'] }); }, onError: (e: Error) => toast.error(e.message) });
  const del = useMutation({ mutationFn: () => api.delete(`/api/roles/${selId}`), onSuccess: () => { toast.success("Rol o'chirildi"); setSelId(''); qc.invalidateQueries({ queryKey: ['roles'] }); setConfirmDel(false); }, onError: (e: Error) => toast.error(e.message) });
  const toggleGroup = (g: PermGroup, on: boolean) => setDraft((d) => { const n = new Set(d); for (const it of g.items) on ? n.add(it.key) : n.delete(it.key); return n; });

  return (
    <div className="animate-fade-up">
      <PageHeader title="Rollar va huquqlar" description="Har bir rol uchun bo'limlarga kirish va amallar. Super Admin yangi rol yaratishi va huquqlarni belgilashi mumkin." actions={superAdmin && <Button onClick={() => setCreate(true)}><Plus /> Yangi rol</Button>} />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-1.5">
          {roles.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          {roles.data?.map((r) => (
            <button key={r.id} onClick={() => setSelId(r.id)} className={cn('bg-card flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors', selId === r.id ? 'border-primary ring-primary/20 ring-2' : 'hover:bg-accent/60')}>
              <span className="flex size-9 items-center justify-center rounded-lg text-white" style={{ background: r.color ?? '#64748b' }}>{r.key === 'SUPER_ADMIN' ? <Lock className="size-4" /> : <Shield className="size-4" />}</span>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{r.name}</div><div className="text-muted-foreground text-xs">{r.isSystem ? ROLE_LABELS[r.key as RoleKey] ?? r.key : 'Maxsus rol'} · {r.permissions.length} huquq</div></div>
              <Badge variant="secondary"><Users className="size-3" /> {r.users}</Badge>
            </button>
          ))}
        </div>
        <Card className="p-5">
          {!sel ? <Skeleton className="h-64" /> : (
            <>
              <div className="mb-4 flex flex-wrap items-start gap-3">
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <Field label="Nomi"><Input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} disabled={locked} /></Field>
                  <Field label="Tavsif"><Input value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} disabled={locked} /></Field>
                  <Field label="Rang" className="sm:col-span-2"><div className="flex flex-wrap gap-2">{PALETTE.map((c) => <button key={c} type="button" disabled={locked} onClick={() => setMeta({ ...meta, color: c })} className={cn('size-7 rounded-full ring-offset-2 ring-offset-background', meta.color === c && 'ring-2 ring-primary')} style={{ background: c }} />)}</div></Field>
                </div>
                <div className="flex gap-2">
                  {!sel.isSystem && superAdmin && <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDel(true)}><Trash2 /></Button>}
                  <Button disabled={locked || !dirty} loading={save.isPending} onClick={() => save.mutate()}><Save /> Saqlash</Button>
                </div>
              </div>
              {sel.key === 'SUPER_ADMIN' && <p className="bg-warning/10 mb-4 rounded-xl p-3 text-xs"><Lock className="mr-1 inline size-3.5" /> Super Admin barcha huquqlarga ega; o'zgartirib bo'lmaydi.</p>}
              {!superAdmin && <p className="text-muted-foreground mb-4 text-xs">Faqat ko'rish rejimi — rollarni Super Admin tahrirlaydi.</p>}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {perms.data?.map((g) => {
                  const all = g.items.every((i) => draft.has(i.key));
                  const some = g.items.some((i) => draft.has(i.key));
                  return (
                    <div key={g.group} className={cn('rounded-xl border p-3', some && 'border-primary/40 bg-primary/[0.03]')}>
                      <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm font-semibold"><Checkbox checked={all ? true : some ? 'indeterminate' : false} disabled={locked} onCheckedChange={(v) => toggleGroup(g, !!v)} />{GROUP_UZ[g.group] ?? g.group}</label>
                      <div className="space-y-1.5 pl-6">
                        {g.items.map((it) => <label key={it.key} className="flex cursor-pointer items-start gap-2 text-xs"><Checkbox className="mt-0.5" checked={draft.has(it.key)} disabled={locked} onCheckedChange={(v) => setDraft((d) => { const n = new Set(d); v ? n.add(it.key) : n.delete(it.key); return n; })} /><span><span className="text-foreground">{it.label}</span><span className="text-muted-foreground ml-1 font-mono text-[10px]">{it.key}</span></span></label>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      </div>
      {create && <CreateRoleDialog open onOpenChange={setCreate} groups={perms.data ?? []} onCreated={(id) => setSelId(id)} />}
      <ConfirmDialog open={confirmDel} onOpenChange={setConfirmDel} title={`"${sel?.name}" rolini o'chirish`} description={sel?.users ? `Bu rolda ${sel.users} ta foydalanuvchi bor — avval ularni boshqa rolga o'tkazing.` : 'Rol butunlay o\'chiriladi.'} confirmText="O'chirish" destructive loading={del.isPending} onConfirm={() => del.mutate()} />
    </div>
  );
}

function CreateRoleDialog({ open, onOpenChange, groups, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; groups: PermGroup[]; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ name: '', slug: '', description: '', color: PALETTE[1], kind: 'CUSTOM' });
  const [perms, setPerms] = React.useState<Set<string>>(new Set(['dashboard.view']));
  const KINDS: Array<{ value: string; label: string }> = [{ value: 'CUSTOM', label: 'Xodim (barcha filiallar)' }, { value: 'ADMINISTRATOR', label: 'Filial xodimi (o\'z filiali)' }, { value: 'TEACHER', label: "O'qituvchi kabi (o'z guruhlari)" }, { value: 'TUTOR', label: "Tutor kabi (o'z guruhlari)" }, { value: 'DORM_MANAGER', label: 'Komendant kabi' }];
  const mut = useMutation({ mutationFn: () => api.post<RoleFull>('/api/roles', { name: f.name.trim(), slug: f.slug.trim() || undefined, description: f.description.trim() || null, color: f.color, kind: f.kind, permissions: [...perms] }), onSuccess: (r) => { toast.success(`"${r.name}" roli yaratildi`); qc.invalidateQueries({ queryKey: ['roles'] }); qc.invalidateQueries({ queryKey: ['users-roles'] }); onCreated(r.id); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Yangi rol</DialogTitle><DialogDescription>Masalan: “Psixolog”, “Kutubxonachi”, “Oshxona mudiri”. Keyin Xodimlar bo'limida shu rol bilan odam qo'shasiz.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nomi *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Psixolog" /></Field>
          <Field label="Xatti-harakat (ko'rinish doirasi)"><FormSelect value={f.kind} onChange={(v) => setF({ ...f, kind: v })} noneLabel={null} options={KINDS} /></Field>
          <Field label="Tavsif" className="sm:col-span-2"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Rang" className="sm:col-span-2"><div className="flex flex-wrap gap-2">{PALETTE.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, color: c })} className={cn('size-7 rounded-full ring-offset-2 ring-offset-background', f.color === c && 'ring-2 ring-primary')} style={{ background: c }} />)}</div></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => { const all = g.items.every((i) => perms.has(i.key)); return (
            <div key={g.group} className="rounded-xl border p-3">
              <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-sm font-semibold"><Checkbox checked={all} onCheckedChange={(v) => setPerms((p) => { const n = new Set(p); for (const it of g.items) v ? n.add(it.key) : n.delete(it.key); return n; })} />{GROUP_UZ[g.group] ?? g.group}</label>
              <div className="space-y-1 pl-6">{g.items.map((it) => <label key={it.key} className="flex cursor-pointer items-center gap-2 text-xs"><Checkbox checked={perms.has(it.key)} onCheckedChange={(v) => setPerms((p) => { const n = new Set(p); v ? n.add(it.key) : n.delete(it.key); return n; })} />{it.label}</label>)}</div>
            </div>
          ); })}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={f.name.trim().length < 2} loading={mut.isPending} onClick={() => mut.mutate()}>Yaratish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
