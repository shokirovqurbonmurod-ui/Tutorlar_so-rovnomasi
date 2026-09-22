'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Wallet, TrendingUp, TrendingDown, AlertCircle, Receipt, Plus, FileSpreadsheet, Download, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { FinanceSummary, Expense, Invoice } from '@/lib/school';
import { INVOICE_STATUS, PAYMENT_METHOD, fmtUZS, fmtUZSshort } from '@/lib/labels';
import { fmtDate, fmtDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { FilterBar, FilterSelect } from '@/components/shared/filters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Bars, Donut, ChartLegend, COLORS } from '@/components/charts';
import { BranchFilter, GroupFilter } from '@/components/school/pickers';
import { ExpenseDialog, GenerateInvoicesDialog, InvoiceDialog, PaymentDialog } from '@/components/school/finance-dialogs';
import { monthOptions, thisMonth } from '@/lib/school';
import type { Paginated } from '@/lib/types';

export default function FinancePage() {
  const { can } = useAuth();
  const [branchId, setBranchId] = React.useState('');
  const [from, setFrom] = React.useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [to, setTo] = React.useState(dayjs().format('YYYY-MM-DD'));
  const [dlg, setDlg] = React.useState<null | 'pay' | 'invoice' | 'generate' | 'expense'>(null);
  const s = useQuery({ queryKey: ['finance-summary', branchId, from, to], queryFn: () => api.get<FinanceSummary>('/api/finance/summary', { branchId: branchId || undefined, from, to }) });
  const d = s.data;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Finance"
        description="Daromad, xarajat, to'lovlar, qarzdorlik va invoice'lar. Har bir to'lov va qarz ota-onaga Telegram orqali yetkaziladi."
        actions={
          <>
            {can('finance.reports', 'analytics.export') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline"><Download /> Export</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(['invoices', 'payments', 'debtors', 'expenses'] as const).map((t) => <DropdownMenuItem key={t} onClick={() => api.download(`/api/finance/export?type=${t}&period=${thisMonth()}${branchId ? `&branchId=${branchId}` : ''}`)}><FileSpreadsheet /> {({ invoices: 'Invoice\'lar', payments: "To'lovlar", debtors: 'Qarzdorlar', expenses: 'Xarajatlar' })[t]} (Excel)</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {can('finance.manage') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button><Plus /> Amal</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDlg('pay')}><Receipt /> To'lov qabul qilish</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDlg('generate')}><FileSpreadsheet /> Oylik invoice yaratish</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDlg('invoice')}><Plus /> Yakka invoice</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDlg('expense')}><TrendingDown /> Xarajat kiritish</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <FilterBar>
        <BranchFilter value={branchId} onChange={setBranchId} />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-card w-40" /><span className="text-muted-foreground text-xs">—</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-card w-40" />
      </FilterBar>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Daromad" value={fmtUZSshort(d?.income)} hint={`${d?.paymentsCount ?? 0} ta to'lov`} icon={TrendingUp} tone="success" loading={s.isLoading} />
        <StatCard label="Xarajat" value={fmtUZSshort(d?.expenses)} icon={TrendingDown} tone="warning" loading={s.isLoading} />
        <StatCard label="Foyda" value={fmtUZSshort(d?.profit)} icon={Wallet} tone={(d?.profit ?? 0) >= 0 ? 'primary' : 'destructive'} loading={s.isLoading} />
        <StatCard label="Qarzdorlik" value={fmtUZSshort(d?.debt)} hint={<Link href="/finance/debts" className="text-primary inline-flex items-center gap-1 hover:underline">{d?.debtors ?? 0} qarzdor <ArrowRight className="size-3" /></Link>} icon={AlertCircle} tone="destructive" loading={s.isLoading} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Oylik daromad va xarajat</CardTitle></CardHeader>
          <CardContent>{d ? <Bars data={d.monthly} xKey="month" height={260} series={[{ key: 'expected', name: 'Kutilgan', color: 'var(--muted-foreground)' }, { key: 'income', name: 'Daromad', color: 'var(--success)' }, { key: 'expenses', name: 'Xarajat', color: 'var(--destructive)' }]} formatter={(v) => fmtUZS(v)} /> : <Skeleton className="h-[260px]" />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">To'lov usullari</CardTitle></CardHeader>
          <CardContent>{d ? <><Donut data={d.byMethod.map((m, i) => ({ name: PAYMENT_METHOD[m.method] ?? m.method, value: m.amount, color: COLORS[i % COLORS.length] }))} centerLabel="Jami" centerValue={fmtUZSshort(d.income)} /><ChartLegend items={d.byMethod.map((m, i) => ({ name: PAYMENT_METHOD[m.method] ?? m.method, color: COLORS[i % COLORS.length], value: fmtUZSshort(m.amount) }))} /></> : <Skeleton className="h-[220px]" />}</CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Invoice holati</CardTitle></CardHeader>
          <CardContent className="space-y-2">{d?.invoices.map((i) => <div key={i.status} className="flex items-center justify-between text-sm"><StatusBadge value={i.status} map={INVOICE_STATUS} /><span>{i.count} ta · {fmtUZSshort(i.total)}</span></div>)}{!d?.invoices.length && !s.isLoading && <p className="text-muted-foreground text-xs">Invoice yo'q. “Oylik invoice yaratish” orqali chiqaring.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Xarajat kategoriyalari</CardTitle></CardHeader>
          <CardContent className="space-y-2">{d?.expensesByCategory.slice(0, 8).map((c) => <div key={c.category} className="flex items-center justify-between text-sm"><span>{c.category}</span><span className="font-medium">{fmtUZSshort(c.amount)}</span></div>)}{!d?.expensesByCategory.length && !s.isLoading && <p className="text-muted-foreground text-xs">Xarajatlar yo'q</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-base">So'nggi to'lovlar</CardTitle><Button asChild variant="ghost" size="sm"><Link href="/finance/payments">Barchasi <ArrowRight /></Link></Button></CardHeader>
          <CardContent className="space-y-2">{d?.recentPayments.map((p) => <div key={p.id} className="flex items-center justify-between text-sm"><div className="min-w-0"><div className="truncate font-medium">{p.student?.fullName}</div><div className="text-muted-foreground text-xs">{fmtDateTime(p.paidAt)} · {PAYMENT_METHOD[p.method]}</div></div><span className="text-success font-semibold">+{fmtUZSshort(p.amount)}</span></div>)}</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="invoices" className="mt-6">
        <TabsList><TabsTrigger value="invoices">Invoice'lar</TabsTrigger><TabsTrigger value="expenses">Xarajatlar</TabsTrigger></TabsList>
        <TabsContent value="invoices" className="mt-4"><InvoicesTab branchId={branchId} /></TabsContent>
        <TabsContent value="expenses" className="mt-4"><ExpensesTab branchId={branchId} /></TabsContent>
      </Tabs>

      {dlg === 'pay' && <PaymentDialog open onOpenChange={() => setDlg(null)} />}
      {dlg === 'invoice' && <InvoiceDialog open onOpenChange={() => setDlg(null)} />}
      {dlg === 'generate' && <GenerateInvoicesDialog open onOpenChange={() => setDlg(null)} />}
      {dlg === 'expense' && <ExpenseDialog open onOpenChange={() => setDlg(null)} />}
    </div>
  );
}

function InvoicesTab({ branchId }: { branchId: string }) {
  const { can } = useAuth();
  const [period, setPeriod] = React.useState(thisMonth());
  const [status, setStatus] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pay, setPay] = React.useState<Invoice | null>(null);
  const list = useQuery({ queryKey: ['invoices', { period, status, groupId, branchId, page }], queryFn: () => api.get<Paginated<Invoice>>('/api/finance/invoices', { period: period || undefined, status: status || undefined, groupId: groupId || undefined, branchId: branchId || undefined, page, limit: 25 }), placeholderData: (p) => p });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect value={period} onChange={setPeriod} allLabel="Barcha davrlar" options={monthOptions(12)} className="sm:w-48" />
        <FilterSelect value={status} onChange={setStatus} placeholder="Holat" allLabel="Barcha holatlar" options={Object.entries(INVOICE_STATUS).map(([value, m]) => ({ value, label: m.label }))} className="sm:w-40" />
        <GroupFilter value={groupId} onChange={setGroupId} branchId={branchId || undefined} />
      </div>
      <DataTable<Invoice>
        rows={list.data?.items} loading={list.isLoading} rowKey={(i) => i.id} page={list.data?.page} pages={list.data?.pages} total={list.data?.total} onPageChange={setPage}
        columns={[
          { key: 'n', header: 'Invoice', cell: (i) => <div><div className="text-sm font-medium">{i.number}</div><div className="text-muted-foreground text-xs">{i.period}</div></div> },
          { key: 'student', header: "O'quvchi", cell: (i) => <Link href={`/students/${i.studentId}`} className="hover:underline"><div className="text-sm font-medium">{i.student?.fullName}</div><div className="text-muted-foreground text-xs">{i.student?.group?.name ?? '—'}</div></Link> },
          { key: 'total', header: 'Jami', cell: (i) => <span className="text-sm font-medium">{fmtUZS(i.total)}</span> },
          { key: 'paid', header: "To'langan", hideBelow: 'sm', cell: (i) => <span className="text-success text-sm">{fmtUZS(i.paid)}</span> },
          { key: 'rem', header: 'Qoldiq', hideBelow: 'sm', cell: (i) => { const r = Number(i.total) - Number(i.paid); return <span className={r > 0 ? 'text-destructive text-sm font-medium' : 'text-muted-foreground text-sm'}>{r > 0 ? fmtUZS(r) : '—'}</span>; } },
          { key: 'due', header: 'Muddat', hideBelow: 'md', cell: (i) => <span className="text-sm">{fmtDate(i.dueDate)}</span> },
          { key: 'status', header: 'Holat', cell: (i) => <StatusBadge value={i.status} map={INVOICE_STATUS} /> },
          { key: 'x', header: '', cell: (i) => can('finance.manage') && Number(i.total) - Number(i.paid) > 0 ? <Button size="sm" variant="outline" onClick={() => setPay(i)}>To'lov</Button> : null },
        ]}
        empty={<EmptyState icon={Receipt} title="Invoice yo'q" />}
      />
      {pay && <PaymentDialog open onOpenChange={() => setPay(null)} invoice={pay} />}
    </div>
  );
}

function ExpensesTab({ branchId }: { branchId: string }) {
  const [page, setPage] = React.useState(1);
  const list = useQuery({ queryKey: ['expenses', { branchId, page }], queryFn: () => api.get<Paginated<Expense>>('/api/finance/expenses', { branchId: branchId || undefined, page, limit: 25 }), placeholderData: (p) => p });
  return (
    <DataTable<Expense>
      rows={list.data?.items} loading={list.isLoading} rowKey={(e) => e.id} page={list.data?.page} pages={list.data?.pages} total={list.data?.total} onPageChange={setPage}
      columns={[
        { key: 'date', header: 'Sana', cell: (e) => <span className="text-sm">{fmtDate(e.spentAt)}</span> },
        { key: 'title', header: 'Nomi', cell: (e) => <div><div className="text-sm font-medium">{e.title}</div><div className="text-muted-foreground text-xs">{e.category}</div></div> },
        { key: 'branch', header: 'Filial', hideBelow: 'md', cell: (e) => <span className="text-sm">{e.branch?.name ?? 'Umumiy'}</span> },
        { key: 'amount', header: 'Summa', cell: (e) => <span className="text-destructive text-sm font-medium">−{fmtUZS(e.amount)}</span> },
        { key: 'by', header: 'Kiritdi', hideBelow: 'lg', cell: (e) => <span className="text-muted-foreground text-xs">{e.recordedBy?.fullName ?? '—'}</span> },
      ]}
      empty={<EmptyState icon={TrendingDown} title="Xarajatlar yo'q" />}
    />
  );
}
