'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Download, GraduationCap, BedDouble, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paginated } from '@/lib/types';
import type { Student } from '@/lib/school';
import { STUDENT_STATUS, fmtUZS } from '@/lib/labels';
import { PageHeader } from '@/components/shared/page-header';
import { FilterBar, FilterSelect, ResetFilters, SearchInput } from '@/components/shared/filters';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { UserCell } from '@/components/shared/user-cell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BranchFilter, GroupFilter } from '@/components/school/pickers';
import { StudentFormDialog } from '@/components/school/student-form';
import { cn } from '@/lib/utils';

export default function StudentsPage() {
  return <React.Suspense><StudentsInner /></React.Suspense>;
}

function StudentsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { can } = useAuth();
  const [search, setSearch] = React.useState('');
  const [q, setQ] = React.useState('');
  const [branchId, setBranchId] = React.useState('');
  const [groupId, setGroupId] = React.useState(sp.get('groupId') ?? '');
  const [status, setStatus] = React.useState('ACTIVE');
  const [flag, setFlag] = React.useState(sp.get('debt') ? 'debt' : '');
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const params = { search: q || undefined, branchId: branchId || undefined, groupId: groupId || undefined, status: status || undefined, boarder: flag === 'boarder' ? 'yes' : undefined, debt: flag === 'debt' ? 'yes' : undefined, unassigned: flag === 'unassigned' ? 'yes' : undefined, page, limit: 25 };
  const list = useQuery({ queryKey: ['students', params], queryFn: () => api.get<Paginated<Student>>('/api/students', params), placeholderData: (p) => p });
  const dirty = !!(q || branchId || groupId || flag || status !== 'ACTIVE');

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="O'quvchilar"
        description={list.data ? `${list.data.total} ta o'quvchi` : "Barcha o'quvchilar, guruhlari, ota-onalari va to'lov holati"}
        actions={
          <>
            <Button variant="outline" onClick={() => api.download('/api/students/export' + (branchId ? `?branchId=${branchId}` : ''))}><Download /> Export</Button>
            {can('students.manage') && <Button onClick={() => setOpen(true)}><Plus /> O'quvchi qo'shish</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Ism, kod yoki telefon…" />
        <BranchFilter value={branchId} onChange={(v) => { setBranchId(v); setGroupId(''); setPage(1); }} />
        <GroupFilter value={groupId} onChange={(v) => { setGroupId(v); setPage(1); }} branchId={branchId || undefined} />
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="Holat" allLabel="Barcha holatlar" options={Object.entries(STUDENT_STATUS).map(([value, m]) => ({ value, label: m.label }))} className="sm:w-36" />
        <FilterSelect value={flag} onChange={(v) => { setFlag(v); setPage(1); }} placeholder="Belgi" allLabel="Barchasi" options={[{ value: 'debt', label: 'Qarzdorlar' }, { value: 'boarder', label: 'Yotoqxonadagilar' }, { value: 'unassigned', label: 'Guruhsizlar' }]} className="sm:w-40" />
        <ResetFilters visible={dirty} onClick={() => { setSearch(''); setBranchId(''); setGroupId(''); setStatus('ACTIVE'); setFlag(''); setPage(1); }} />
      </FilterBar>

      <DataTable<Student>
        rows={list.data?.items}
        loading={list.isLoading}
        rowKey={(s) => s.id}
        page={list.data?.page} pages={list.data?.pages} total={list.data?.total} onPageChange={setPage}
        onRowClick={(s) => router.push(`/students/${s.id}`)}
        empty={<div className="text-muted-foreground py-10 text-center text-sm"><GraduationCap className="mx-auto mb-2 size-8 opacity-40" />O'quvchilar topilmadi</div>}
        columns={[
          { key: 'name', header: "O'quvchi", cell: (s) => <UserCell name={s.fullName} sub={s.studentCode} avatarUrl={s.avatarUrl} /> },
          { key: 'group', header: 'Guruh', cell: (s) => (s.group ? <Badge variant="primary">{s.group.name}</Badge> : <span className="text-muted-foreground text-xs">—</span>) },
          { key: 'branch', header: 'Filial', hideBelow: 'lg', cell: (s) => <span className="text-sm">{s.branch?.name}</span> },
          { key: 'parent', header: 'Ota-ona', hideBelow: 'md', cell: (s) => { const p = s.parents?.find((x) => x.isPrimary) ?? s.parents?.[0]; return p ? <div className="text-sm"><div>{p.parent.user.fullName}</div><div className="text-muted-foreground flex items-center gap-1 text-xs">{p.parent.user.phone}{p.parent.user.telegramId && <Send className="size-3 text-info" />}</div></div> : <span className="text-muted-foreground text-xs">—</span>; } },
          { key: 'fee', header: "Oylik to'lov", hideBelow: 'xl', cell: (s) => <div className="text-sm">{fmtUZS(s.monthlyFee)}{s.discountPercent > 0 && <span className="text-success ml-1 text-xs">−{s.discountPercent}%</span>}</div> },
          { key: 'debt', header: 'Qarz', hideBelow: 'sm', cell: (s) => <span className={cn('text-sm font-medium', (s.debt ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground')}>{(s.debt ?? 0) > 0 ? fmtUZS(s.debt) : '—'}</span> },
          { key: 'flags', header: '', hideBelow: 'md', cell: (s) => <div className="flex items-center gap-1.5">{s.isBoarder && <BedDouble className="text-muted-foreground size-4" />}<StatusBadge value={s.status} map={STUDENT_STATUS} /></div> },
        ]}
      />
      <StudentFormDialog open={open} onOpenChange={setOpen} defaultBranchId={branchId || undefined} defaultGroupId={groupId || undefined} />
    </div>
  );
}
