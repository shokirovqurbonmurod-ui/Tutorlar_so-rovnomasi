'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Send, Phone, HeartHandshake, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paginated } from '@/lib/types';
import type { Parent } from '@/lib/school';
import { useStudentsLite } from '@/lib/school';
import { PageHeader } from '@/components/shared/page-header';
import { FilterBar, FilterSelect, ResetFilters, SearchInput } from '@/components/shared/filters';
import { DataTable } from '@/components/shared/data-table';
import { UserCell } from '@/components/shared/user-cell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { BranchFilter, Field, FormSelect, GroupFilter } from '@/components/school/pickers';
import { fromNow } from '@/lib/utils';

const RELATIONS = [{ value: 'father', label: 'Ota' }, { value: 'mother', label: 'Ona' }, { value: 'guardian', label: 'Vasiy' }, { value: 'other', label: 'Boshqa' }];
const REL_UZ: Record<string, string> = { father: 'Ota', mother: 'Ona', guardian: 'Vasiy', other: 'Boshqa' };

export default function ParentsPage() {
  return <React.Suspense><ParentsInner /></React.Suspense>;
}

function ParentsInner() {
  const sp = useSearchParams();
  const { can } = useAuth();
  const [search, setSearch] = React.useState(sp.get('search') ?? '');
  const [q, setQ] = React.useState(search);
  const [branchId, setBranchId] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [telegram, setTelegram] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState<Parent | null | 'new'>(null);
  React.useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const params = { search: q || undefined, branchId: branchId || undefined, groupId: groupId || undefined, telegram: telegram || undefined, page, limit: 25 };
  const list = useQuery({ queryKey: ['parents', params], queryFn: () => api.get<Paginated<Parent>>('/api/parents', params), placeholderData: (p) => p });

  return (
    <div className="animate-fade-up">
      <PageHeader title="Ota-onalar" description={list.data ? `${list.data.total} ta ota-ona · Telegram bot orqali farzandi haqida barcha ma'lumotni oladi` : ''} actions={can('parents.manage') && <Button onClick={() => setEditing('new')}><Plus /> Ota-ona qo'shish</Button>} />
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Ism yoki telefon…" />
        <BranchFilter value={branchId} onChange={(v) => { setBranchId(v); setGroupId(''); setPage(1); }} />
        <GroupFilter value={groupId} onChange={(v) => { setGroupId(v); setPage(1); }} branchId={branchId || undefined} />
        <FilterSelect value={telegram} onChange={(v) => { setTelegram(v); setPage(1); }} placeholder="Bot" allLabel="Bot: barchasi" options={[{ value: 'linked', label: 'Bot ulangan' }, { value: 'unlinked', label: 'Bot ulanmagan' }]} className="sm:w-40" />
        <ResetFilters visible={!!(q || branchId || groupId || telegram)} onClick={() => { setSearch(''); setBranchId(''); setGroupId(''); setTelegram(''); }} />
      </FilterBar>
      <DataTable<Parent>
        rows={list.data?.items} loading={list.isLoading} rowKey={(p) => p.id}
        page={list.data?.page} pages={list.data?.pages} total={list.data?.total} onPageChange={setPage}
        onRowClick={can('parents.manage') ? (p) => setEditing(p) : undefined}
        empty={<div className="text-muted-foreground py-10 text-center text-sm"><HeartHandshake className="mx-auto mb-2 size-8 opacity-40" />Ota-onalar topilmadi</div>}
        columns={[
          { key: 'name', header: 'Ota-ona', cell: (p) => <UserCell name={p.user.fullName} sub={REL_UZ[p.relation ?? ''] ?? p.relation ?? ''} avatarUrl={p.user.avatarUrl} /> },
          { key: 'phone', header: 'Telefon', cell: (p) => <a href={`tel:${p.user.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-sm hover:underline"><Phone className="size-3.5" />{p.user.phone}</a> },
          { key: 'children', header: 'Farzandlari', cell: (p) => <div className="flex flex-wrap gap-1">{p.children.map((c) => <Link key={c.student.id} href={`/students/${c.student.id}`} onClick={(e) => e.stopPropagation()}><Badge variant="secondary" className="hover:bg-accent">{c.student.fullName}{c.student.group ? ` · ${c.student.group.name}` : ''}</Badge></Link>)}{!p.children.length && <span className="text-muted-foreground text-xs">—</span>}</div> },
          { key: 'tg', header: 'Telegram', hideBelow: 'md', cell: (p) => (p.user.telegramId ? <Badge variant="success"><Send className="size-3" /> Ulangan{p.user.telegramUsername ? ` · @${p.user.telegramUsername}` : ''}</Badge> : <Badge variant="muted">Ulanmagan</Badge>) },
          { key: 'last', header: 'Faollik', hideBelow: 'lg', cell: (p) => <span className="text-muted-foreground text-xs">{(p.user as { lastActivityAt?: string }).lastActivityAt ? fromNow((p.user as { lastActivityAt?: string }).lastActivityAt!) : '—'}</span> },
          { key: 'a', header: '', cell: () => can('parents.manage') ? <Pencil className="text-muted-foreground size-4" /> : null },
        ]}
      />
      <ParentDialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)} parent={editing === 'new' ? null : editing} />
    </div>
  );
}

function ParentDialog({ open, onOpenChange, parent }: { open: boolean; onOpenChange: (v: boolean) => void; parent: Parent | null }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ fullName: '', phone: '+998', email: '', relation: 'father', occupation: '', workplace: '', address: '', telegramUsername: '', telegramId: '' });
  const [studentIds, setStudentIds] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState('');
  const students = useStudentsLite({ search, limit: 30 });
  React.useEffect(() => {
    if (!open) return;
    if (parent) { setF({ fullName: parent.user.fullName, phone: parent.user.phone ?? '', email: parent.user.email ?? '', relation: parent.relation ?? 'father', occupation: parent.occupation ?? '', workplace: parent.workplace ?? '', address: parent.address ?? '', telegramUsername: parent.user.telegramUsername ?? '', telegramId: parent.user.telegramId ?? '' }); setStudentIds(parent.children.map((c) => c.student.id)); }
    else { setF({ fullName: '', phone: '+998', email: '', relation: 'father', occupation: '', workplace: '', address: '', telegramUsername: '', telegramId: '' }); setStudentIds([]); }
    setSearch('');
  }, [open, parent]);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const mut = useMutation({
    mutationFn: () => {
      const body = { fullName: f.fullName.trim(), phone: f.phone.trim(), email: f.email.trim() || null, relation: f.relation, occupation: f.occupation.trim() || null, workplace: f.workplace.trim() || null, address: f.address.trim() || null, telegramUsername: f.telegramUsername.trim().replace(/^@/, '') || null, telegramId: f.telegramId.trim() || null, studentIds };
      return parent ? api.patch(`/api/parents/${parent.id}`, body) : api.post('/api/parents', body);
    },
    onSuccess: () => { toast.success(parent ? 'Saqlandi' : "Ota-ona qo'shildi"); qc.invalidateQueries({ queryKey: ['parents'] }); qc.invalidateQueries({ queryKey: ['students'] }); qc.invalidateQueries({ queryKey: ['student'] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const selected = new Set(studentIds);
  const knownChildren = parent?.children.map((c) => c.student) ?? [];
  const listed = [...knownChildren.filter((c) => !(students.data ?? []).some((s) => s.id === c.id)).map((c) => ({ id: c.id, fullName: c.fullName, studentCode: c.studentCode, group: c.group })), ...(students.data ?? [])];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{parent ? 'Ota-onani tahrirlash' : 'Yangi ota-ona'}</DialogTitle><DialogDescription>Telefon raqami orqali Telegram botga ulanadi va farzandi haqidagi barcha xabarlarni oladi.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="F.I.Sh *"><Input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
          <Field label="Telefon *"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Kimi"><FormSelect value={f.relation} onChange={(v) => set('relation', v)} noneLabel={null} options={RELATIONS} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Telegram username"><Input value={f.telegramUsername} onChange={(e) => set('telegramUsername', e.target.value)} placeholder="@username" /></Field>
          <Field label="Telegram ID"><Input inputMode="numeric" value={f.telegramId} onChange={(e) => set('telegramId', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Kasbi"><Input value={f.occupation} onChange={(e) => set('occupation', e.target.value)} /></Field>
          <Field label="Ish joyi"><Input value={f.workplace} onChange={(e) => set('workplace', e.target.value)} /></Field>
          <Field label="Manzil" className="sm:col-span-2"><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between"><label className="text-sm font-medium">Farzandlari ({studentIds.length})</label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="O'quvchi qidirish…" className="h-8 w-48 text-xs" /></div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border p-2">
              {listed.map((s) => (
                <label key={s.id} className="hover:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                  <Checkbox checked={selected.has(s.id)} onCheckedChange={(v) => setStudentIds((ids) => (v ? [...ids, s.id] : ids.filter((x) => x !== s.id)))} />
                  <span className="flex-1">{s.fullName}</span><span className="text-muted-foreground text-xs">{s.group?.name ?? '—'} · {s.studentCode}</span>
                </label>
              ))}
              {!listed.length && <p className="text-muted-foreground p-2 text-xs">O'quvchi topilmadi</p>}
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button onClick={() => mut.mutate()} disabled={!f.fullName.trim() || f.phone.replace(/\D/g, '').length < 9} loading={mut.isPending}>Saqlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
