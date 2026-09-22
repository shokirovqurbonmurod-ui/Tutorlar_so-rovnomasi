'use client';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, Send, Download, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Invoice } from '@/lib/school';
import { fmtUZS, fmtUZSshort } from '@/lib/labels';
import { fmtDate } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { FilterBar } from '@/components/shared/filters';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BranchFilter, GroupFilter } from '@/components/school/pickers';
import { PaymentDialog } from '@/components/school/finance-dialogs';
import { StatusBadge } from '@/components/shared/status-badge';
import { INVOICE_STATUS } from '@/lib/labels';

type DebtorRow = { student: { id: string; fullName: string; studentCode: string; group?: { name: string } | null; parents?: Array<{ parent: { user: { fullName: string; phone: string | null; telegramId: string | null } } }> }; debt: number; overdue: number; invoices: number; oldestDue: string };

export default function DebtsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [branchId, setBranchId] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [pay, setPay] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const list = useQuery({ queryKey: ['debtors', branchId, groupId], queryFn: () => api.get<{ items: DebtorRow[]; total: number; count: number }>('/api/finance/debtors', { branchId: branchId || undefined, groupId: groupId || undefined, limit: 300 }) });
  const inv = useQuery({ queryKey: ['invoices', { studentId: expanded, debt: true }], queryFn: () => api.get<{ items: Invoice[] }>('/api/finance/invoices', { studentId: expanded, limit: 24 }), enabled: !!expanded });
  const remind = useMutation({ mutationFn: (id: string) => api.post(`/api/finance/invoices/${id}/remind`, {}), onSuccess: () => toast.success('Eslatma Telegram orqali yuborildi'), onError: (e: Error) => toast.error(e.message) });
  const remindAll = useMutation({
    mutationFn: async () => { let n = 0; for (const r of list.data?.items ?? []) { const is = await api.get<{ items: Invoice[] }>('/api/finance/invoices', { studentId: r.student.id, limit: 12 }); const first = is.items.find((i) => ['OVERDUE', 'PARTIAL', 'PENDING'].includes(i.status)); if (first) { await api.post(`/api/finance/invoices/${first.id}/remind`, {}); n++; } } return n; },
    onSuccess: (n) => toast.success(`${n} ta ota-onaga qarz eslatmasi yuborildi`), onError: (e: Error) => toast.error(e.message),
  });
  const overdueTotal = (list.data?.items ?? []).reduce((s, r) => s + r.overdue, 0);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Qarzlar" description="To'lanmagan invoice'lar bo'yicha qarzdorlar. Eslatma ota-onaga Telegram orqali boradi (Jami / To'langan / Qoldiq)." actions={<>{can('finance.reports', 'analytics.export') && <Button variant="outline" onClick={() => api.download(`/api/finance/export?type=debtors${branchId ? `&branchId=${branchId}` : ''}`)}><Download /> Excel</Button>}{can('finance.manage') && <Button onClick={() => remindAll.mutate()} loading={remindAll.isPending} disabled={!list.data?.items.length}><Send /> Hammasiga eslatma</Button>}</>} />
      <FilterBar><BranchFilter value={branchId} onChange={(v) => { setBranchId(v); setGroupId(''); }} /><GroupFilter value={groupId} onChange={setGroupId} branchId={branchId || undefined} /></FilterBar>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Umumiy qarz" value={fmtUZSshort(list.data?.total)} icon={AlertCircle} tone="destructive" loading={list.isLoading} />
        <StatCard label="Muddati o'tgan" value={fmtUZSshort(overdueTotal)} icon={AlertCircle} tone="warning" loading={list.isLoading} />
        <StatCard label="Qarzdorlar" value={list.data?.count ?? 0} icon={AlertCircle} tone="info" loading={list.isLoading} />
      </div>
      <DataTable<DebtorRow>
        rows={list.data?.items} loading={list.isLoading} rowKey={(r) => r.student.id} onRowClick={(r) => setExpanded(expanded === r.student.id ? null : r.student.id)}
        columns={[
          { key: 'student', header: "O'quvchi", cell: (r) => <div><Link href={`/students/${r.student.id}`} onClick={(e) => e.stopPropagation()} className="text-sm font-medium hover:underline">{r.student.fullName}</Link><div className="text-muted-foreground text-xs">{r.student.group?.name ?? '—'} · {r.student.studentCode}</div></div> },
          { key: 'parent', header: 'Ota-ona', hideBelow: 'md', cell: (r) => { const p = r.student.parents?.[0]?.parent.user; return p ? <div className="text-sm"><div>{p.fullName}</div><div className="text-muted-foreground flex items-center gap-1 text-xs"><Phone className="size-3" />{p.phone}{p.telegramId && <Send className="size-3 text-info" />}</div></div> : <span className="text-muted-foreground text-xs">—</span>; } },
          { key: 'debt', header: 'Qarz', cell: (r) => <span className="text-destructive text-sm font-semibold">{fmtUZS(r.debt)}</span> },
          { key: 'overdue', header: "Muddati o'tgan", hideBelow: 'sm', cell: (r) => <span className="text-sm">{r.overdue > 0 ? fmtUZS(r.overdue) : '—'}</span> },
          { key: 'inv', header: 'Invoice', hideBelow: 'lg', cell: (r) => <Badge variant="secondary">{r.invoices} ta</Badge> },
          { key: 'oldest', header: 'Eng eski muddat', hideBelow: 'lg', cell: (r) => <span className="text-sm">{fmtDate(r.oldestDue)}</span> },
          { key: 'x', header: '', cell: (r) => can('finance.manage') ? <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}><Button size="sm" onClick={() => setPay(r.student.id)}>To'lov</Button></div> : null },
        ]}
        empty={<EmptyState icon={AlertCircle} title="Qarzdorlar yo'q 🎉" />}
      />
      {expanded && (
        <div className="bg-card mt-3 space-y-2 rounded-2xl border p-4">
          <div className="text-sm font-semibold">Invoice'lar</div>
          {(inv.data?.items ?? []).filter((i) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(i.status)).map((i) => <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"><div className="flex-1"><div className="font-medium">{i.title} · {i.number}</div><div className="text-muted-foreground text-xs">Muddat {fmtDate(i.dueDate)}</div></div><div className="text-right"><div>Jami {fmtUZS(i.total)}</div><div className="text-xs"><span className="text-success">To'langan {fmtUZS(i.paid)}</span> · <span className="text-destructive">Qoldiq {fmtUZS(Number(i.total) - Number(i.paid))}</span></div></div><StatusBadge value={i.status} map={INVOICE_STATUS} />{can('finance.manage') && <Button size="sm" variant="ghost" onClick={() => remind.mutate(i.id)}><Send /> Eslatma</Button>}</div>)}
        </div>
      )}
      {pay && <PaymentDialog open onOpenChange={() => setPay(null)} studentId={pay} />}
    </div>
  );
}
