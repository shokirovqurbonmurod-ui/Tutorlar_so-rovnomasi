'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Building2, MapPin, Users, GraduationCap, Star, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import type { Branch, DashboardData } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Bars } from '@/components/charts';
import { BranchFormDialog } from '@/components/branches/branch-form';
import { Rating } from '@/components/shared/rating';
import { pct } from '@/lib/utils';

export default function BranchesPage() {
  const router = useRouter();
  const { can } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['branches', 'all'], queryFn: () => api.get<Branch[]>('/api/branches') });
  const perf = useQuery({ queryKey: ['analytics', 'branches', '30d'], queryFn: () => api.get<DashboardData['branches']>('/api/analytics/branches', { range: '30d' }), enabled: can('analytics.view') });
  const [form, setForm] = React.useState(false);
  const [editing, setEditing] = React.useState<Branch | null>(null);

  return (
    <div>
      <PageHeader title="Filiallar" description="Filiallar bo‘yicha xodimlar, so‘rovnoma bajarilishi va KPI taqqoslash" actions={can('branches.manage') && <Button onClick={() => { setEditing(null); setForm(true); }}><Plus /> Filial qo‘shish</Button>} />

      {perf.data && perf.data.length > 0 && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Filiallar taqqoslash</CardTitle><CardDescription>So‘nggi 30 kun: so‘rovnoma bajarilishi, tasdiqlangan hisobotlar va KPI</CardDescription></CardHeader>
          <CardContent><Bars data={perf.data.map((b) => ({ name: b.code, 'Bajarilish %': b.completionRate ?? 0, 'Tasdiqlangan %': b.approvedRate ?? 0, KPI: b.kpiScore ?? 0 }))} xKey="name" series={[{ key: 'Bajarilish %', name: 'Bajarilish %' }, { key: 'Tasdiqlangan %', name: 'Tasdiqlangan %' }, { key: 'KPI', name: 'KPI' }]} height={240} /></CardContent>
        </Card>
      )}

      {isLoading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-56" />)}</div> : !data?.length ? <Card><EmptyState icon={Building2} title="Filiallar yo‘q" /></Card> : (
        <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((b) => {
            const p = perf.data?.find((x) => x.id === b.id);
            return (
              <Card key={b.id} onClick={() => router.push(`/branches/${b.id}`)} className="card-hover cursor-pointer gap-3 py-4">
                <div className="flex items-start justify-between gap-2 px-4">
                  <div className="flex items-center gap-3">
                    <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl text-sm font-bold">{b.code}</span>
                    <div><div className="font-semibold">{b.name}</div><div className="text-muted-foreground flex items-center gap-1 text-xs"><MapPin className="size-3" /> {b.city ?? b.address ?? '—'}</div></div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!b.isActive && <Badge variant="muted">nofaol</Badge>}
                    {can('branches.manage') && <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setEditing(b); setForm(true); }}><Pencil /></Button>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 px-4 text-center">
                  <div className="bg-muted/50 rounded-xl p-2"><div className="tabular text-lg font-semibold">{b.stats?.tutors ?? 0}</div><div className="text-muted-foreground text-[11px]">Tutor</div></div>
                  <div className="bg-muted/50 rounded-xl p-2"><div className="tabular text-lg font-semibold">{b.stats?.teachers ?? 0}</div><div className="text-muted-foreground text-[11px]">O‘qituvchi</div></div>
                  <div className="bg-muted/50 rounded-xl p-2"><div className="tabular text-lg font-semibold">{b.studentCount ?? 0}</div><div className="text-muted-foreground text-[11px]">O‘quvchi</div></div>
                </div>
                <div className="space-y-2 px-4 text-xs">
                  <div><div className="mb-1 flex justify-between"><span className="text-muted-foreground">So‘rovnoma bajarilishi</span><span className="tabular font-medium">{pct(b.stats?.completionRate)}</span></div><Progress value={b.stats?.completionRate ?? 0} className="h-1.5" /></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">O‘rtacha baho</span><Rating value={b.stats?.avgRating} /></div>
                  {p && <div className="flex items-center justify-between"><span className="text-muted-foreground">KPI (30 kun)</span><Badge variant="primary" className="tabular">{p.kpiScore ?? '—'}</Badge></div>}
                </div>
                <div className="text-muted-foreground flex items-center justify-between border-t px-4 pt-3 text-xs">
                  <span>Direktor: <b className="text-foreground font-medium">{b.director?.fullName ?? '—'}</b></span>
                  <span>{b._count?.groups ?? 0} guruh · {b._count?.departments ?? 0} bo‘lim</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <BranchFormDialog open={form} onOpenChange={setForm} branch={editing} />
    </div>
  );
}
