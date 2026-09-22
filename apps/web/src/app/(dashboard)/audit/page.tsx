'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Globe, Send, Cpu } from 'lucide-react';
import { api } from '@/lib/api';
import type { AuditLog, Paginated } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filters';
import { UserCell } from '@/components/shared/user-cell';
import { Badge } from '@/components/ui/badge';
import { useDebounce } from '@/hooks/use-debounce';
import { fmtDateTime } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/labels';

const ACTIONS = ['auth', 'user', 'survey', 'report', 'announcement', 'task', 'branch', 'kpi', 'settings', 'notification'];
const SRC_ICON: Record<string, React.ComponentType<{ className?: string }>> = { WEB: Globe, TELEGRAM: Send, SYSTEM: Cpu };

export default function AuditPage() {
  const [search, setSearch] = React.useState('');
  const [action, setAction] = React.useState('');
  const [source, setSource] = React.useState('');
  const [page, setPage] = React.useState(1);
  const dq = useDebounce(search);
  React.useEffect(() => setPage(1), [dq, action, source]);
  const { data, isLoading } = useQuery({ queryKey: ['audit', dq, action, source, page], queryFn: () => api.get<Paginated<AuditLog>>('/api/audit', { search: dq || undefined, action: action || undefined, source: source || undefined, page, limit: 30 }) });
  const cols: Column<AuditLog>[] = [
    { key: 'at', header: 'Vaqt', cell: (a) => <span className="tabular text-xs">{fmtDateTime(a.createdAt)}</span> },
    { key: 'user', header: 'Foydalanuvchi', cell: (a) => a.user ? <UserCell name={a.user.fullName} sub={a.user.role ? ROLE_LABELS[a.user.role.key] : undefined} size="sm" /> : <span className="text-muted-foreground text-sm">Tizim</span> },
    { key: 'action', header: 'Amal', cell: (a) => <code className="bg-muted rounded-md px-1.5 py-0.5 text-xs">{a.action}</code> },
    { key: 'entity', header: 'Obyekt', hideBelow: 'md', cell: (a) => <span className="text-muted-foreground text-xs">{a.entity}{a.entityId ? ` · ${a.entityId.slice(-6)}` : ''}</span> },
    { key: 'source', header: 'Manba', hideBelow: 'sm', cell: (a) => { const I = SRC_ICON[a.source] ?? Cpu; return <Badge variant="outline"><I className="size-3" /> {a.source}</Badge>; } },
    { key: 'ip', header: 'IP', hideBelow: 'lg', cell: (a) => <span className="text-muted-foreground text-xs">{a.ip ?? '—'}</span> },
    { key: 'meta', header: 'Tafsilot', hideBelow: 'xl', cell: (a) => <span className="text-muted-foreground block max-w-64 truncate text-xs" title={JSON.stringify(a.meta)}>{a.meta ? JSON.stringify(a.meta) : ''}</span> },
  ];
  return (
    <div>
      <PageHeader title="Audit jurnali" description="Tizimdagi barcha muhim amallar: kirish, o‘zgartirish, yuborish, ko‘rib chiqish" />
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Amal yoki foydalanuvchi…" />
        <FilterSelect value={action} onChange={setAction} allLabel="Barcha amallar" options={ACTIONS.map((a) => ({ value: a, label: a }))} className="sm:w-40" />
        <FilterSelect value={source} onChange={setSource} allLabel="Barcha manbalar" options={[{ value: 'WEB', label: 'Veb-panel' }, { value: 'TELEGRAM', label: 'Telegram' }, { value: 'SYSTEM', label: 'Tizim' }]} className="sm:w-40" />
      </FilterBar>
      <DataTable columns={cols} rows={data?.items} rowKey={(a) => a.id} loading={isLoading} page={data?.page} pages={data?.pages} total={data?.total} onPageChange={setPage} empty={<div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-sm"><ScrollText className="size-6" /> Yozuvlar topilmadi</div>} />
    </div>
  );
}
