'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Receipt, Plus, Trash2, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paginated } from '@/lib/types';
import type { Payment } from '@/lib/school';
import { PAYMENT_METHOD, fmtUZS } from '@/lib/labels';
import { fmtDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { FilterBar, FilterSelect, ResetFilters } from '@/components/shared/filters';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { BranchFilter } from '@/components/school/pickers';
import { PaymentDialog } from '@/components/school/finance-dialogs';

export default function PaymentsPage() {
  return <React.Suspense><PaymentsInner /></React.Suspense>;
}

function PaymentsInner() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [branchId, setBranchId] = React.useState('');
  const [method, setMethod] = React.useState('');
  const [from, setFrom] = React.useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [to, setTo] = React.useState(dayjs().format('YYYY-MM-DD'));
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState(!!sp.get('studentId'));
  const [del, setDel] = React.useState<Payment | null>(null);
  const studentId = sp.get('studentId') ?? undefined;
  const list = useQuery({ queryKey: ['payments', { branchId, method, from, to, page, studentId }], queryFn: () => api.get<Paginated<Payment>>('/api/finance/payments', { branchId: branchId || undefined, method: method || undefined, from, to, page, limit: 30, studentId }), placeholderData: (p) => p });
  const rm = useMutation({ mutationFn: (id: string) => api.delete(`/api/finance/payments/${id}`), onSuccess: () => { toast.success("To'lov bekor qilindi"); ['payments', 'invoices', 'finance-summary', 'debtors'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setDel(null); }, onError: (e: Error) => toast.error(e.message) });
  const total = (list.data?.items ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="animate-fade-up">
      <PageHeader title="To'lovlar" description="Qabul qilingan barcha to'lovlar. Har biri ota-onaga Telegram orqali tasdiqlanadi." actions={<>{can('finance.reports', 'analytics.export') && <Button variant="outline" onClick={() => api.download(`/api/finance/export?type=payments&period=${from.slice(0, 7)}`)}><Download /> Excel</Button>}{can('finance.manage') && <Button onClick={() => setOpen(true)}><Plus /> To'lov qabul qilish</Button>}</>} />
      <FilterBar>
        <BranchFilter value={branchId} onChange={setBranchId} />
        <FilterSelect value={method} onChange={setMethod} placeholder="Usul" allLabel="Barcha usullar" options={Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }))} className="sm:w-40" />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-card w-40" /><span className="text-muted-foreground text-xs">—</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-card w-40" />
        <ResetFilters visible={!!(branchId || method)} onClick={() => { setBranchId(''); setMethod(''); }} />
        <Badge variant="success" className="ml-auto">Sahifa jami: {fmtUZS(total)}</Badge>
      </FilterBar>
      <DataTable<Payment>
        rows={list.data?.items} loading={list.isLoading} rowKey={(p) => p.id} page={list.data?.page} pages={list.data?.pages} total={list.data?.total} onPageChange={setPage}
        columns={[
          { key: 'date', header: 'Sana', cell: (p) => <span className="text-sm tabular-nums">{fmtDateTime(p.paidAt)}</span> },
          { key: 'student', header: "O'quvchi", cell: (p) => <Link href={`/students/${p.studentId}`} className="hover:underline"><div className="text-sm font-medium">{p.student?.fullName}</div><div className="text-muted-foreground text-xs">{p.student?.group?.name ?? '—'} · {p.student?.studentCode}</div></Link> },
          { key: 'amount', header: 'Summa', cell: (p) => <span className="text-success text-sm font-semibold">+{fmtUZS(p.amount)}</span> },
          { key: 'method', header: 'Usul', hideBelow: 'sm', cell: (p) => <Badge variant="secondary">{PAYMENT_METHOD[p.method] ?? p.method}</Badge> },
          { key: 'inv', header: 'Invoice', hideBelow: 'md', cell: (p) => <span className="text-muted-foreground text-xs">{p.invoice ? `${p.invoice.number} · ${p.invoice.period}` : 'Avans'}</span> },
          { key: 'receipt', header: 'Kvitansiya', hideBelow: 'lg', cell: (p) => <span className="text-muted-foreground text-xs">{p.receiptNo ?? '—'}</span> },
          { key: 'by', header: 'Qabul qildi', hideBelow: 'xl', cell: (p) => <span className="text-muted-foreground text-xs">{p.recordedBy?.fullName ?? '—'}</span> },
          { key: 'x', header: '', cell: (p) => can('finance.manage') ? <Button variant="ghost" size="icon-sm" onClick={() => setDel(p)}><Trash2 className="text-destructive" /></Button> : null },
        ]}
        empty={<EmptyState icon={Receipt} title="To'lovlar yo'q" />}
      />
      {open && <PaymentDialog open onOpenChange={setOpen} studentId={studentId} />}
      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(null)} title="To'lovni bekor qilish" description={del ? `${del.student?.fullName} · ${fmtUZS(del.amount)} · ${fmtDateTime(del.paidAt)}. Invoice qoldig'i qayta hisoblanadi.` : ''} confirmText="Bekor qilish" destructive loading={rm.isPending} onConfirm={() => { if (del) rm.mutate(del.id); }} />
    </div>
  );
}
