'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStudentsLite, monthOptions, thisMonth, type Invoice, type Student } from '@/lib/school';
import { PAYMENT_METHOD, INVOICE_STATUS, fmtUZS } from '@/lib/labels';
import { fmtDate } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/shared/status-badge';
import { BranchSelect, Field, FormSelect } from './pickers';

function StudentPicker({ value, onChange, disabled }: { value: string; onChange: (id: string, s?: Student) => void; disabled?: boolean }) {
  const [search, setSearch] = React.useState('');
  const list = useStudentsLite({ search, limit: 20 });
  const selected = list.data?.find((s) => s.id === value);
  return (
    <div className="space-y-1.5">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="O'quvchi ismi yoki kodi…" disabled={disabled} />
      {!disabled && search && (
        <div className="max-h-40 overflow-y-auto rounded-xl border">
          {(list.data ?? []).map((s) => <button key={s.id} type="button" onClick={() => { onChange(s.id, s); setSearch(''); }} className="hover:bg-accent flex w-full items-center justify-between px-3 py-1.5 text-left text-sm"><span>{s.fullName}</span><span className="text-muted-foreground text-xs">{s.group?.name ?? '—'} · {s.studentCode}</span></button>)}
          {!list.data?.length && <p className="text-muted-foreground p-2 text-xs">Topilmadi</p>}
        </div>
      )}
      {value && <p className="text-muted-foreground text-xs">Tanlangan: <b className="text-foreground">{selected?.fullName ?? value}</b></p>}
    </div>
  );
}

export function PaymentDialog({ open, onOpenChange, studentId: initialStudent, invoice }: { open: boolean; onOpenChange: (v: boolean) => void; studentId?: string; invoice?: Invoice | null }) {
  const qc = useQueryClient();
  const [studentId, setStudentId] = React.useState(invoice?.studentId ?? initialStudent ?? '');
  const [invoiceId, setInvoiceId] = React.useState(invoice?.id ?? '');
  const [f, setF] = React.useState({ amount: invoice ? String(Number(invoice.total) - Number(invoice.paid)) : '', method: 'CASH', paidAt: dayjs().format('YYYY-MM-DDTHH:mm'), receiptNo: '', note: '' });
  const invoices = useQuery({ queryKey: ['invoices', { studentId, open: true }], queryFn: () => api.get<{ items: Invoice[] }>('/api/finance/invoices', { studentId, limit: 24 }), enabled: !!studentId });
  const openInv = (invoices.data?.items ?? []).filter((i) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(i.status));
  React.useEffect(() => { if (!invoiceId && openInv.length && !invoice) { const first = openInv[0]; setInvoiceId(first.id); if (!f.amount) setF((s) => ({ ...s, amount: String(Number(first.total) - Number(first.paid)) })); } }, [openInv, invoiceId, invoice, f.amount]);
  const mut = useMutation({
    mutationFn: () => api.post('/api/finance/payments', { studentId, invoiceId: invoiceId || null, amount: Number(f.amount), method: f.method, paidAt: new Date(f.paidAt).toISOString(), receiptNo: f.receiptNo.trim() || null, note: f.note.trim() || null }),
    onSuccess: () => { toast.success("To'lov qabul qilindi. Ota-onaga Telegram orqali kvitansiya yuborildi."); ['payments', 'invoices', 'finance-summary', 'debtors', 'student', 'students'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>To'lov qabul qilish</DialogTitle><DialogDescription>To'lov invoice'ga bog'lanadi; qoldiq avtomatik hisoblanadi.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <Field label="O'quvchi *"><StudentPicker value={studentId} onChange={(id) => { setStudentId(id); setInvoiceId(''); setF((s) => ({ ...s, amount: '' })); }} disabled={!!invoice} /></Field>
          <Field label="Hisob-faktura"><FormSelect value={invoiceId} onChange={(v) => { setInvoiceId(v); const i = openInv.find((x) => x.id === v); if (i) setF((s) => ({ ...s, amount: String(Number(i.total) - Number(i.paid)) })); }} noneLabel="— Avans (invoice'siz) —" options={openInv.map((i) => ({ value: i.id, label: `${i.period} · qoldiq ${fmtUZS(Number(i.total) - Number(i.paid))} · ${INVOICE_STATUS[i.status]?.label}` }))} disabled={!studentId} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Summa (so'm) *"><Input type="number" min={1000} step={1000} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Usul"><FormSelect value={f.method} onChange={(v) => setF({ ...f, method: v })} noneLabel={null} options={Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }))} /></Field>
            <Field label="Sana"><Input type="datetime-local" value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></Field>
            <Field label="Kvitansiya №"><Input value={f.receiptNo} onChange={(e) => setF({ ...f, receiptNo: e.target.value })} /></Field>
          </div>
          <Field label="Izoh"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!studentId || !(Number(f.amount) > 0)} loading={mut.isPending} onClick={() => mut.mutate()}><Send /> Qabul qilish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceDialog({ open, onOpenChange, studentId: initial }: { open: boolean; onOpenChange: (v: boolean) => void; studentId?: string }) {
  const qc = useQueryClient();
  const [studentId, setStudentId] = React.useState(initial ?? '');
  const [f, setF] = React.useState({ period: thisMonth(), amount: '', discount: '0', dueDate: dayjs().date(10).format('YYYY-MM-DD'), title: '', note: '', notify: true });
  const mut = useMutation({
    mutationFn: () => api.post('/api/finance/invoices', { studentId, period: f.period, amount: Number(f.amount), discount: Number(f.discount) || 0, dueDate: f.dueDate, title: f.title.trim() || undefined, note: f.note.trim() || null, notify: f.notify }),
    onSuccess: () => { toast.success('Hisob-faktura yaratildi'); ['invoices', 'finance-summary', 'debtors'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Yakka hisob-faktura</DialogTitle><DialogDescription>Bitta o'quvchi uchun qo'lda invoice. Ommaviy oylik invoice uchun “Oylik invoice yaratish”ni ishlating.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <Field label="O'quvchi *"><StudentPicker value={studentId} onChange={(id, s) => { setStudentId(id); if (s && !f.amount) setF((x) => ({ ...x, amount: String(Number(s.monthlyFee) || ''), discount: String(Math.round((Number(s.monthlyFee) * (s.discountPercent || 0)) / 100)) })); }} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Davr"><FormSelect value={f.period} onChange={(v) => setF({ ...f, period: v })} noneLabel={null} options={monthOptions(6).concat([{ value: dayjs().add(1, 'month').format('YYYY-MM'), label: dayjs().add(1, 'month').toDate().toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' }) }])} /></Field>
            <Field label="Muddat"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
            <Field label="Summa (so'm) *"><Input type="number" min={0} step={10000} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Chegirma (so'm)"><Input type="number" min={0} step={10000} value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field>
          </div>
          <Field label="Nomi"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Oylik to'lov / Forma / Ekskursiya" /></Field>
          <Field label="Izoh"><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"><span>Ota-onaga Telegram orqali yuborish</span><Switch checked={f.notify} onCheckedChange={(v) => setF({ ...f, notify: v })} /></label>
          {Number(f.amount) > 0 && <p className="text-muted-foreground text-xs">Jami: <b className="text-foreground">{fmtUZS(Number(f.amount) - (Number(f.discount) || 0))}</b></p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!studentId || !(Number(f.amount) >= 0) || !f.dueDate} loading={mut.isPending} onClick={() => mut.mutate()}>Yaratish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GenerateInvoicesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [f, setF] = React.useState({ period: thisMonth(), branchId: user?.branch?.id ?? '', dueDay: '10', notify: true });
  const mut = useMutation({
    mutationFn: () => api.post<{ period: string; created: number; students: number }>('/api/finance/invoices/generate', { period: f.period, branchId: f.branchId || undefined, dueDay: Number(f.dueDay) || 10, notify: f.notify }),
    onSuccess: (d) => { toast.success(`${d.period}: ${d.created} ta yangi invoice (${d.students} faol o'quvchi)`); ['invoices', 'finance-summary', 'debtors'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Oylik invoice yaratish</DialogTitle><DialogDescription>Har bir faol o'quvchi uchun oylik to'lov va shaxsiy chegirma asosida hisob-faktura chiqariladi. Mavjud invoice'lar takrorlanmaydi.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <Field label="Davr"><FormSelect value={f.period} onChange={(v) => setF({ ...f, period: v })} noneLabel={null} options={[{ value: dayjs().add(1, 'month').format('YYYY-MM'), label: dayjs().add(1, 'month').toDate().toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' }) }, ...monthOptions(4)]} /></Field>
          <Field label="Filial"><BranchSelect value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })} noneLabel="Barcha filiallar" /></Field>
          <Field label="To'lov muddati (oyning kuni)"><Input type="number" min={1} max={28} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })} /></Field>
          <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"><span>Ota-onalarga Telegram xabar</span><Switch checked={f.notify} onCheckedChange={(v) => setF({ ...f, notify: v })} /></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button loading={mut.isPending} onClick={() => mut.mutate()}>Yaratish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [f, setF] = React.useState({ branchId: user?.branch?.id ?? '', category: 'Ish haqi', title: '', amount: '', spentAt: dayjs().format('YYYY-MM-DD'), note: '' });
  const mut = useMutation({ mutationFn: () => api.post('/api/finance/expenses', { branchId: f.branchId || null, category: f.category, title: f.title.trim(), amount: Number(f.amount), spentAt: f.spentAt, note: f.note.trim() || null }), onSuccess: () => { toast.success('Xarajat kiritildi'); ['expenses', 'finance-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onOpenChange(false); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Xarajat kiritish</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kategoriya"><FormSelect value={f.category} onChange={(v) => setF({ ...f, category: v })} noneLabel={null} options={['Ish haqi', 'Ijara', 'Kommunal', 'Oziq-ovqat', 'Ta\'mirlash', 'Jihozlar', 'Marketing', 'Transport', 'Soliq', 'Boshqa'].map((c) => ({ value: c, label: c }))} /></Field>
          <Field label="Filial"><BranchSelect value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })} noneLabel="Umumiy" /></Field>
          <Field label="Nomi *" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Summa *"><Input type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Sana"><Input type="date" value={f.spentAt} onChange={(e) => setF({ ...f, spentAt: e.target.value })} /></Field>
          <Field label="Izoh" className="sm:col-span-2"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!f.title.trim() || !(Number(f.amount) > 0)} loading={mut.isPending} onClick={() => mut.mutate()}>Saqlash</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceRow({ i, onPay, onRemind }: { i: Invoice; onPay?: () => void; onRemind?: () => void }) {
  const rem = Number(i.total) - Number(i.paid);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{i.title} <span className="text-muted-foreground font-normal">· {i.number}</span></div><div className="text-muted-foreground text-xs">Muddat {fmtDate(i.dueDate)}</div></div>
      <div className="text-right text-sm"><div>Jami <b>{fmtUZS(i.total)}</b></div><div className="text-xs"><span className="text-success">To'langan {fmtUZS(i.paid)}</span>{rem > 0 && <span className="text-destructive"> · Qoldiq {fmtUZS(rem)}</span>}</div></div>
      <StatusBadge value={i.status} map={INVOICE_STATUS} />
      {rem > 0 && onPay && <Button size="sm" onClick={onPay}>To'lov</Button>}
      {rem > 0 && onRemind && <Button size="sm" variant="ghost" onClick={onRemind}><Send /></Button>}
    </div>
  );
}
