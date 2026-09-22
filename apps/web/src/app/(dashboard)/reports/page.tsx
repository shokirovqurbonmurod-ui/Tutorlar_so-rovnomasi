'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, CheckCircle2, XCircle, PencilLine, Clock, Building2, CalendarDays, Trash2, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Paginated, Report, ReportStatus, ReportType } from '@/lib/types';
import { REPORT_STATUS, REPORT_TYPES, ROLE_LABELS } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { useBranches } from '@/lib/queries';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar, FilterSelect, ResetFilters, SearchInput } from '@/components/shared/filters';
import { StatusBadge } from '@/components/shared/status-badge';
import { UserCell } from '@/components/shared/user-cell';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { fmtDate, fmtDateTime, fromNow, cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/lib/utils';

function ReportsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { can, is } = useAuth();
  const branches = useBranches(!is('DIRECTOR'));
  const [status, setStatus] = React.useState('PENDING');
  const [type, setType] = React.useState('');
  const [branchId, setBranchId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(sp.get('id'));
  const authorId = sp.get('authorId') ?? undefined;
  const dq = useDebounce(search);
  React.useEffect(() => setPage(1), [dq, status, type, branchId]);
  React.useEffect(() => { const id = sp.get('id'); if (id) setOpenId(id); }, [sp]);

  const params = { page, limit: 20, search: dq || undefined, status: status || undefined, type: type || undefined, branchId: branchId || undefined, authorId };
  const { data, isLoading } = useQuery({ queryKey: ['reports', params], queryFn: () => api.get<Paginated<Report>>('/api/reports', params), placeholderData: (p) => p });
  const counts = useQuery({ queryKey: ['reports', 'counts', authorId], queryFn: async () => Object.fromEntries(await Promise.all((Object.keys(REPORT_STATUS) as ReportStatus[]).map(async (s) => [s, (await api.get<Paginated<Report>>('/api/reports', { limit: 1, status: s, authorId })).total]))) as Record<ReportStatus, number> });

  const cols: Column<Report>[] = [
    { key: 'title', header: 'Hisobot', cell: (r) => <div className="flex items-center gap-2.5"><span className="text-lg leading-none">{REPORT_TYPES[r.type].icon}</span><div className="min-w-0"><div className="max-w-72 truncate font-medium">{r.title}</div><div className="text-muted-foreground text-xs">{REPORT_TYPES[r.type].label}{r.group ? ` · ${r.group.name}` : ''}</div></div></div> },
    { key: 'author', header: 'Muallif', cell: (r) => <UserCell name={r.author.fullName} sub={`${r.author.role ? ROLE_LABELS[r.author.role.key] : ''}${r.author.branch ? ' · ' + r.author.branch.name : ''}`} avatarUrl={r.author.avatarUrl} size="sm" /> },
    { key: 'status', header: 'Holat', cell: (r) => <StatusBadge value={r.status} map={REPORT_STATUS} /> },
    { key: 'created', header: 'Topshirilgan', hideBelow: 'md', cell: (r) => <span className="text-xs" title={fmtDateTime(r.createdAt)}>{fromNow(r.createdAt)}</span> },
    { key: 'reviewer', header: 'Ko‘rib chiqqan', hideBelow: 'lg', cell: (r) => <span className="text-muted-foreground text-xs">{r.reviewer?.fullName ?? '—'}{r.reviewedAt ? ` · ${fmtDate(r.reviewedAt)}` : ''}</span> },
  ];

  return (
    <div>
      <PageHeader title="Hisobotlar" description="Tutor va o‘qituvchilarning kunlik, haftalik va oylik hisobotlari — ko‘rib chiqing va baholang" />
      <div className="stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Kutilmoqda" value={counts.data?.PENDING ?? '—'} icon={Clock} tone="warning" loading={counts.isLoading} />
        <StatCard label="Tasdiqlangan" value={counts.data?.APPROVED ?? '—'} icon={CheckCircle2} tone="success" loading={counts.isLoading} />
        <StatCard label="Qayta ishlash" value={counts.data?.NEEDS_REVISION ?? '—'} icon={PencilLine} tone="info" loading={counts.isLoading} />
        <StatCard label="Rad etilgan" value={counts.data?.REJECTED ?? '—'} icon={XCircle} tone="destructive" loading={counts.isLoading} />
      </div>

      <Tabs value={status} onValueChange={setStatus} className="mb-3">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-fit">
          <TabsTrigger value="" className="flex-none">Barchasi</TabsTrigger>
          {(Object.keys(REPORT_STATUS) as ReportStatus[]).map((s) => <TabsTrigger key={s} value={s} className="flex-none">{REPORT_STATUS[s].label}{counts.data && <span className="bg-muted-foreground/15 tabular ml-1 rounded-full px-1.5 text-[10px]">{counts.data[s]}</span>}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Sarlavha yoki matn…" />
        <FilterSelect value={type} onChange={setType} allLabel="Barcha turlar" options={(Object.keys(REPORT_TYPES) as ReportType[]).map((t) => ({ value: t, label: `${REPORT_TYPES[t].icon} ${REPORT_TYPES[t].label}` }))} />
        {!is('DIRECTOR') && <FilterSelect value={branchId} onChange={setBranchId} allLabel="Barcha filiallar" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />}
        {authorId && <Badge variant="primary"><UsersIcon /> Bitta muallif <button className="ml-1 underline" onClick={() => router.push('/reports')}>×</button></Badge>}
        <ResetFilters visible={!!(search || type || branchId)} onClick={() => { setSearch(''); setType(''); setBranchId(''); }} />
      </FilterBar>

      <DataTable columns={cols} rows={data?.items} rowKey={(r) => r.id} loading={isLoading} onRowClick={(r) => setOpenId(r.id)} page={data?.page} pages={data?.pages} total={data?.total} onPageChange={setPage} rowClassName={(r) => (r.status === 'PENDING' ? 'bg-warning/[0.04]' : undefined)} />

      <ReportSheet id={openId} onClose={() => { setOpenId(null); if (sp.get('id')) router.replace('/reports'); }} canReview={can('reports.review')} canDelete={can('reports.review') && is('SUPER_ADMIN', 'DIRECTOR')} onChanged={() => { void qc.invalidateQueries({ queryKey: ['reports'] }); void qc.invalidateQueries({ queryKey: ['bell'] }); }} />
    </div>
  );
}

export default function ReportsPage() { return <React.Suspense><ReportsInner /></React.Suspense>; }

function ReportSheet({ id, onClose, canReview, canDelete, onChanged }: { id: string | null; onClose: () => void; canReview: boolean; canDelete: boolean; onChanged: () => void }) {
  const { data: r, isLoading } = useQuery({ queryKey: ['report', id], queryFn: () => api.get<Report>(`/api/reports/${id}`), enabled: !!id });
  const [note, setNote] = React.useState('');
  const [del, setDel] = React.useState(false);
  const qc = useQueryClient();
  React.useEffect(() => setNote(''), [id]);
  const review = useMutation({
    mutationFn: (status: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION') => api.post(`/api/reports/${id}/review`, { status, note: note.trim() || null }),
    onSuccess: (_d, status) => { toast.success({ APPROVED: 'Hisobot tasdiqlandi', REJECTED: 'Hisobot rad etildi', NEEDS_REVISION: 'Qayta ishlashga yuborildi' }[status]); void qc.invalidateQueries({ queryKey: ['report', id] }); onChanged(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });
  const remove = useMutation({ mutationFn: () => api.delete(`/api/reports/${id}`), onSuccess: () => { toast.success('O‘chirildi'); setDel(false); onChanged(); onClose(); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
        {isLoading || !r ? <div className="p-5 text-sm">Yuklanmoqda…</div> : (
          <>
            <SheetHeader className="pb-0">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{REPORT_TYPES[r.type].icon} {REPORT_TYPES[r.type].label}</Badge><StatusBadge value={r.status} map={REPORT_STATUS} />{r.group && <Badge variant="outline">{r.group.name}</Badge>}</div>
              <SheetTitle className="mt-2 text-lg leading-snug">{r.title}</SheetTitle>
              <SheetDescription className="flex flex-wrap gap-x-3"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {fmtDateTime(r.createdAt)}</span>{r.periodStart && <span>Davr: {fmtDate(r.periodStart)}{r.periodEnd ? ` — ${fmtDate(r.periodEnd)}` : ''}</span>}{r.author.branch && <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" /> {r.author.branch.name}</span>}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-5">
              <div className="bg-muted/50 mb-4 flex items-center gap-3 rounded-xl p-3">
                <Avatar><AvatarImage src={r.author.avatarUrl ?? undefined} /><AvatarFallback>{initials(r.author.fullName)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.author.fullName}</div><div className="text-muted-foreground text-xs">{r.author.role ? ROLE_LABELS[r.author.role.key] : ''}</div></div>
                <Button variant="outline" size="sm" asChild><a href={`/users/${r.author.id}`}>Profil</a></Button>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">{r.content}</div>
              {r.reviewNote && (
                <div className={cn('mt-4 rounded-xl border p-3 text-sm', r.status === 'APPROVED' ? 'border-success/30 bg-success/5' : r.status === 'REJECTED' ? 'border-destructive/30 bg-destructive/5' : 'border-info/30 bg-info/5')}>
                  <div className="text-muted-foreground mb-1 text-xs">Ko‘rib chiquvchi izohi · {r.reviewer?.fullName} · {fmtDateTime(r.reviewedAt)}</div>
                  {r.reviewNote}
                </div>
              )}
              {canReview && (
                <div className="mt-5 space-y-2 border-t pt-4">
                  <Label>Izoh (xodimga Telegram orqali yuboriladi)</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: Davomat haqida aniqroq yozing…" className="min-h-20" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 border-t p-4">
              {canReview && (
                <>
                  <Button className="flex-1 bg-emerald-600 text-white hover:bg-emerald-600/90" onClick={() => review.mutate('APPROVED')} loading={review.isPending} disabled={r.status === 'APPROVED'}><CheckCircle2 /> Tasdiqlash</Button>
                  <Button variant="outline" className="flex-1" onClick={() => review.mutate('NEEDS_REVISION')} loading={review.isPending} disabled={r.status === 'NEEDS_REVISION'}><PencilLine /> Qayta ishlash</Button>
                  <Button variant="destructive" className="flex-1" onClick={() => review.mutate('REJECTED')} loading={review.isPending} disabled={r.status === 'REJECTED'}><XCircle /> Rad etish</Button>
                </>
              )}
              {canDelete && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDel(true)}><Trash2 /></Button>}
            </div>
            <ConfirmDialog open={del} onOpenChange={setDel} title="Hisobotni o‘chirish" description="Bu amalni qaytarib bo‘lmaydi." destructive confirmText="O‘chirish" loading={remove.isPending} onConfirm={() => remove.mutate()} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
