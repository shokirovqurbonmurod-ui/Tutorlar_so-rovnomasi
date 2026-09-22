'use client';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Student } from '@/lib/school';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BranchSelect, Field, FormSelect, GroupSelect } from './pickers';

interface ParentDraft { fullName: string; phone: string; relation: string; telegramUsername: string; telegramId: string; isPrimary: boolean }
const emptyParent = (isPrimary = false): ParentDraft => ({ fullName: '', phone: '+998', relation: 'father', telegramUsername: '', telegramId: '', isPrimary });

const RELATIONS = [
  { value: 'father', label: 'Ota' }, { value: 'mother', label: 'Ona' }, { value: 'guardian', label: 'Vasiy' }, { value: 'other', label: 'Boshqa' },
];

export function StudentFormDialog({ open, onOpenChange, student, defaultGroupId, defaultBranchId }: { open: boolean; onOpenChange: (v: boolean) => void; student?: Student | null; defaultGroupId?: string; defaultBranchId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isEdit = !!student;
  const [f, setF] = React.useState({
    firstName: '', lastName: '', middleName: '', gender: '', birthDate: '', phone: '', address: '', branchId: '', groupId: '', status: 'ACTIVE', enrolledAt: new Date().toISOString().slice(0, 10),
    monthlyFee: '', discountPercent: '0', discountNote: '', isBoarder: false, notes: '', createAccount: false, telegramId: '',
  });
  const [parents, setParents] = React.useState<ParentDraft[]>([emptyParent(true)]);

  React.useEffect(() => {
    if (!open) return;
    if (student) {
      setF({
        firstName: student.firstName, lastName: student.lastName, middleName: student.middleName ?? '', gender: student.gender ?? '', birthDate: student.birthDate?.slice(0, 10) ?? '', phone: student.phone ?? '', address: student.address ?? '',
        branchId: student.branchId, groupId: student.groupId ?? '', status: student.status, enrolledAt: student.enrolledAt.slice(0, 10), monthlyFee: String(Number(student.monthlyFee) || ''), discountPercent: String(student.discountPercent ?? 0), discountNote: student.discountNote ?? '',
        isBoarder: student.isBoarder, notes: student.notes ?? '', createAccount: false, telegramId: student.user?.telegramId ?? '',
      });
    } else {
      setF((s) => ({ ...s, firstName: '', lastName: '', middleName: '', gender: '', birthDate: '', phone: '', address: '', branchId: defaultBranchId ?? user?.branch?.id ?? '', groupId: defaultGroupId ?? '', status: 'ACTIVE', monthlyFee: '', discountPercent: '0', discountNote: '', isBoarder: false, notes: '', telegramId: '' }));
      setParents([emptyParent(true)]);
    }
  }, [open, student, defaultBranchId, defaultGroupId, user?.branch?.id]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const mut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        firstName: f.firstName.trim(), lastName: f.lastName.trim(), middleName: f.middleName.trim() || null, gender: f.gender || null, birthDate: f.birthDate || null, phone: f.phone.trim() || null, address: f.address.trim() || null,
        branchId: f.branchId, groupId: f.groupId || null, status: f.status, enrolledAt: f.enrolledAt || undefined, monthlyFee: f.monthlyFee === '' ? undefined : Number(f.monthlyFee), discountPercent: Number(f.discountPercent) || 0, discountNote: f.discountNote.trim() || null,
        isBoarder: f.isBoarder, notes: f.notes.trim() || null, telegramId: f.telegramId.trim() || null,
      };
      if (isEdit) return api.patch(`/api/students/${student!.id}`, body);
      const ps = parents.filter((p) => p.fullName.trim() && p.phone.replace(/\D/g, '').length >= 9).map((p) => ({ fullName: p.fullName.trim(), phone: p.phone.trim(), relation: p.relation, telegramUsername: p.telegramUsername.trim() || undefined, telegramId: p.telegramId.trim() || undefined, isPrimary: p.isPrimary }));
      return api.post('/api/students', { ...body, parents: ps, createAccount: f.createAccount });
    },
    onSuccess: () => {
      toast.success(isEdit ? "O'quvchi ma'lumotlari yangilandi" : "O'quvchi qo'shildi. Ota-ona botda /start bosganda avtomatik ulanadi.");
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student'] });
      qc.invalidateQueries({ queryKey: ['students-lite'] });
      qc.invalidateQueries({ queryKey: ['school-groups'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = f.firstName.trim() && f.lastName.trim() && f.branchId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "O'quvchini tahrirlash" : "Yangi o'quvchi"}</DialogTitle>
          <DialogDescription>{isEdit ? `${student!.fullName} · ${student!.studentCode}` : "Shaxsiy ma'lumotlar, guruh, to'lov va ota-ona kontaktlari"}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="main">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="main">Asosiy</TabsTrigger>
            <TabsTrigger value="fee">To'lov</TabsTrigger>
            <TabsTrigger value="parents" disabled={isEdit}>Ota-onalar</TabsTrigger>
          </TabsList>
          <TabsContent value="main" className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Familiya *"><Input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Jumayev" /></Field>
            <Field label="Ism *"><Input value={f.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Ali" /></Field>
            <Field label="Otasining ismi"><Input value={f.middleName} onChange={(e) => set('middleName', e.target.value)} /></Field>
            <Field label="Jinsi"><FormSelect value={f.gender} onChange={(v) => set('gender', v)} options={[{ value: 'MALE', label: "O'g'il bola" }, { value: 'FEMALE', label: 'Qiz bola' }]} /></Field>
            <Field label="Tug'ilgan sana"><Input type="date" value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} /></Field>
            <Field label="Telefon"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+998 90 000 00 00" /></Field>
            <Field label="Filial *"><BranchSelect value={f.branchId} onChange={(v) => { set('branchId', v); set('groupId', ''); }} noneLabel={null} /></Field>
            <Field label="Guruh / sinf"><GroupSelect value={f.groupId} onChange={(v) => set('groupId', v)} branchId={f.branchId || undefined} noneLabel="— Guruhsiz —" /></Field>
            <Field label="Qabul sanasi"><Input type="date" value={f.enrolledAt} onChange={(e) => set('enrolledAt', e.target.value)} /></Field>
            <Field label="Holati"><FormSelect value={f.status} onChange={(v) => set('status', v)} noneLabel={null} options={[{ value: 'ACTIVE', label: 'Faol' }, { value: 'INACTIVE', label: 'Nofaol' }, { value: 'GRADUATED', label: 'Bitirgan' }, { value: 'ARCHIVED', label: 'Arxiv' }]} /></Field>
            <Field label="Manzil" className="sm:col-span-2"><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
            <div className="flex items-center justify-between rounded-xl border p-3 sm:col-span-2">
              <div><div className="text-sm font-medium">Yotoqxonada yashaydi</div><div className="text-muted-foreground text-xs">Komendant keyin xona va joy biriktiradi</div></div>
              <Switch checked={f.isBoarder} onCheckedChange={(v) => set('isBoarder', v)} />
            </div>
            <Field label="O'quvchi Telegram ID" hint="Ixtiyoriy. O'quvchi botdan o'zi foydalanishi uchun."><Input value={f.telegramId} onChange={(e) => set('telegramId', e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="123456789" /></Field>
            {!isEdit && (
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div><div className="text-sm font-medium">O'quvchi akkaunti</div><div className="text-muted-foreground text-xs">Bot uchun STUDENT akkaunt yaratish</div></div>
                <Switch checked={f.createAccount} onCheckedChange={(v) => set('createAccount', v)} />
              </div>
            )}
            <Field label="Izoh" className="sm:col-span-2"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          </TabsContent>
          <TabsContent value="fee" className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Oylik to'lov (so'm)" hint="Bo'sh qoldirilsa filial standarti qo'llanadi"><Input type="number" min={0} step={10000} value={f.monthlyFee} onChange={(e) => set('monthlyFee', e.target.value)} placeholder="2 500 000" /></Field>
            <Field label="Chegirma (%)"><Input type="number" min={0} max={100} value={f.discountPercent} onChange={(e) => set('discountPercent', e.target.value)} /></Field>
            <Field label="Chegirma sababi" className="sm:col-span-2"><Input value={f.discountNote} onChange={(e) => set('discountNote', e.target.value)} placeholder="Masalan: aka-uka chegirmasi" /></Field>
            <p className="text-muted-foreground text-xs sm:col-span-2">Oylik hisob-fakturalar “Finance → Hisob-faktura yaratish” orqali shu summa va chegirma asosida avtomatik chiqariladi; ota-onaga Telegram orqali Jami / To'langan / Qoldiq xabari boradi.</p>
          </TabsContent>
          <TabsContent value="parents" className="mt-4 space-y-3">
            {parents.map((p, i) => (
              <div key={i} className="bg-muted/40 grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                <div className="flex items-center justify-between sm:col-span-2">
                  <div className="text-sm font-medium">{i + 1}-ota-ona {p.isPrimary && <span className="text-primary text-xs">· asosiy</span>}</div>
                  {parents.length > 1 && <Button variant="ghost" size="icon-sm" onClick={() => setParents((ps) => ps.filter((_, j) => j !== i))}><Trash2 /></Button>}
                </div>
                <Field label="F.I.Sh"><Input value={p.fullName} onChange={(e) => setParents((ps) => ps.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)))} placeholder="Baxtbek Jumayev" /></Field>
                <Field label="Telefon *" hint="Bot shu raqam orqali ulanadi"><Input value={p.phone} onChange={(e) => setParents((ps) => ps.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} /></Field>
                <Field label="Kimi"><FormSelect value={p.relation} onChange={(v) => setParents((ps) => ps.map((x, j) => (j === i ? { ...x, relation: v } : x)))} noneLabel={null} options={RELATIONS} /></Field>
                <Field label="Telegram username"><Input value={p.telegramUsername} onChange={(e) => setParents((ps) => ps.map((x, j) => (j === i ? { ...x, telegramUsername: e.target.value } : x)))} placeholder="@username" /></Field>
                <Field label="Telegram ID"><Input value={p.telegramId} inputMode="numeric" onChange={(e) => setParents((ps) => ps.map((x, j) => (j === i ? { ...x, telegramId: e.target.value.replace(/\D/g, '') } : x)))} /></Field>
              </div>
            ))}
            {parents.length < 4 && <Button variant="outline" size="sm" onClick={() => setParents((ps) => [...ps, emptyParent(false)])}><Plus /> Yana ota-ona qo'shish</Button>}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button>
          <Button onClick={() => mut.mutate()} disabled={!valid} loading={mut.isPending}>{isEdit ? 'Saqlash' : "Qo'shish"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
