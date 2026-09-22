'use client';
import * as React from 'react';
import Link from 'next/link';
import { Plus, UsersRound, MessageSquare, CalendarDays, NotebookPen } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSchoolGroups, type Group } from '@/lib/school';
import { initials } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { FilterBar, ResetFilters, SearchInput } from '@/components/shared/filters';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BranchFilter } from '@/components/school/pickers';
import { GroupFormDialog } from '@/components/school/group-form';

export default function GroupsPage() {
  const { can } = useAuth();
  const [branchId, setBranchId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const groups = useSchoolGroups(branchId || undefined);
  const items = (groups.data ?? []).filter((g) => !search || g.name.toLowerCase().includes(search.toLowerCase()) || g.tutor?.fullName.toLowerCase().includes(search.toLowerCase()));
  const byGrade = React.useMemo(() => {
    const m = new Map<string, Group[]>();
    for (const g of items) { const k = g.gradeLevel ? `${g.gradeLevel}-sinflar` : 'Boshqa'; m.set(k, [...(m.get(k) ?? []), g]); }
    return [...m.entries()].sort((a, b) => (parseInt(a[0]) || 99) - (parseInt(b[0]) || 99));
  }, [items]);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Guruhlar / Sinflar" description={`${groups.data?.length ?? 0} ta faol guruh · tutor, o'qituvchilar, o'quvchilar va ota-onalar chati`} actions={can('groups.manage') && <Button onClick={() => setOpen(true)}><Plus /> Guruh yaratish</Button>} />
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Guruh yoki tutor…" />
        <BranchFilter value={branchId} onChange={setBranchId} />
        <ResetFilters visible={!!(search || branchId)} onClick={() => { setSearch(''); setBranchId(''); }} />
      </FilterBar>
      {groups.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
        : !items.length ? <EmptyState icon={UsersRound} title="Guruhlar yo'q" action={can('groups.manage') && <Button onClick={() => setOpen(true)}><Plus /> Birinchi guruhni yarating</Button>} />
        : byGrade.map(([grade, list]) => (
          <section key={grade} className="mb-8">
            <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">{grade}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((g) => (
                <Link key={g.id} href={`/groups/${g.id}`}>
                  <Card className="group hover:border-primary/40 h-full p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-2xl font-bold tracking-tight">{g.name}</div>
                        <div className="text-muted-foreground text-xs">{g.branch?.name}{g.room ? ` · ${g.room}-xona` : ''}{g.academicYear ? ` · ${g.academicYear}` : ''}</div>
                      </div>
                      <Badge variant="primary">{g.studentCount ?? g._count?.students ?? 0} o'quvchi</Badge>
                    </div>
                    <div className="mt-4 flex items-center gap-2.5">
                      <Avatar className="size-8"><AvatarImage src={g.tutor?.avatarUrl ?? undefined} /><AvatarFallback className="text-[10px]">{g.tutor ? initials(g.tutor.fullName) : '—'}</AvatarFallback></Avatar>
                      <div className="min-w-0"><div className="truncate text-sm font-medium">{g.tutor?.fullName ?? 'Tutor biriktirilmagan'}</div><div className="text-muted-foreground text-xs">Tutor · {g.teachers?.length ?? 0} ta fan o'qituvchisi</div></div>
                    </div>
                    <div className="text-muted-foreground mt-4 flex items-center gap-4 text-xs">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{g._count?.lessons ?? 0} dars</span>
                      <span className="inline-flex items-center gap-1"><NotebookPen className="size-3.5" />{g._count?.homeworks ?? 0} vazifa</span>
                      <span className="inline-flex items-center gap-1"><MessageSquare className="size-3.5" />{g._count?.messages ?? 0}</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      <GroupFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
