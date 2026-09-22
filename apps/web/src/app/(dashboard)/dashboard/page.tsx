'use client';
import * as React from 'react';
import Link from 'next/link';
import { GraduationCap, Users, UserCheck, Star, Wallet, AlertCircle, UsersRound, BedDouble, ArrowRight, TrendingUp, TrendingDown, NotebookPen, FlaskConical, Building2, HeartHandshake, Sparkles, School, BookOpenText, FileClock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useOverview } from '@/lib/school';
import { fmtUZS, fmtUZSshort } from '@/lib/labels';
import { fmtDate, dayjs, cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaTrend, Bars, Donut, ChartLegend, Gauge } from '@/components/charts';
import { BranchFilter } from '@/components/school/pickers';
import { LogoMark } from '@/components/layout/logo';

export default function DashboardPage() {
  const { user, is, can } = useAuth();
  const [branchId, setBranchId] = React.useState('');
  const o = useOverview(branchId || undefined);
  const d = o.data;
  const greeting = React.useMemo(() => { const h = new Date().getHours(); return h < 12 ? 'Xayrli tong' : h < 18 ? 'Xayrli kun' : 'Xayrli kech'; }, []);
  const isCeo = is('CEO', 'SUPER_ADMIN');
  const fin = d?.finance;
  const monthly = (fin?.monthly ?? []).map((m) => ({ ...m, label: /^\d{4}-\d{2}$/.test(m.month) ? dayjs(`${m.month}-01`).format('MMM') : m.month }));
  const attTrend = (d?.attendance.trend ?? []).map((t) => ({ ...t, rate: t.present + t.absent + t.late ? Math.round(((t.present + t.late) / (t.present + t.absent + t.late)) * 100) : null }));
  const gradeDist = (d?.grades.distribution ?? []).map((g) => ({ name: `${g.value} baho`, value: g.count, color: g.value >= 5 ? 'var(--success)' : g.value === 4 ? 'var(--info)' : g.value === 3 ? 'var(--warning)' : 'var(--destructive)' }));

  return (
    <div className="animate-fade-up space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,oklch(0.28_0.09_262)_0%,oklch(0.45_0.17_255)_55%,oklch(0.62_0.19_240)_100%)] p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.08)_1px,transparent_0)] bg-[size:24px_24px]" />
        <div className="pointer-events-none absolute -right-10 -bottom-16 opacity-15"><LogoMark className="size-64 drop-shadow-none" /></div>
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur"><Sparkles className="size-3.5" /> TARGET INTERNATIONAL SCHOOL</div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}, {user?.fullName.split(' ')[0]} 👋</h1>
            <p className="mt-1 text-sm text-white/75">{dayjs().format('D MMMM YYYY, dddd')} · {user?.position ?? user?.role.name}{user?.branch ? ` · ${user.branch.name}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can('attendance.mark') && <Button asChild variant="secondary" size="sm"><Link href="/attendance"><UserCheck /> Davomat</Link></Button>}
            {can('grades.manage') && <Button asChild variant="secondary" size="sm"><Link href="/grades"><Star /> Baho qo'yish</Link></Button>}
            {can('finance.manage') && <Button asChild variant="secondary" size="sm"><Link href="/finance/payments"><Wallet /> To'lov</Link></Button>}
            {can('students.manage') && <Button asChild size="sm" className="bg-white text-primary hover:bg-white/90"><Link href="/students"><GraduationCap /> O'quvchi qo'shish</Link></Button>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2"><BranchFilter value={branchId} onChange={setBranchId} />{d && <span className="text-muted-foreground text-xs">Yangilangan: {dayjs().format('HH:mm')}</span>}</div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="O'quvchilar" value={d?.counts.students ?? '—'} hint={`+${d?.counts.newStudents ?? 0} shu oyda · ${d?.counts.boarders ?? 0} yotoqxonada`} icon={GraduationCap} tone="primary" loading={o.isLoading} />
        <StatCard label="Bugungi davomat" value={d?.attendance.today.rate === null || d?.attendance.today.rate === undefined ? '—' : `${d.attendance.today.rate}%`} hint={d?.attendance.today.total ? `${d.attendance.today.absent} kelmagan · ${d.attendance.today.late} kechikkan` : "Bugun yo'qlama qilinmagan"} icon={UserCheck} tone={(d?.attendance.today.rate ?? 100) < 85 ? 'warning' : 'success'} loading={o.isLoading} />
        <StatCard label="O'rtacha baho" value={d?.grades.avg ?? '—'} hint={`${d?.grades.count ?? 0} ta baho (30 kun)`} icon={Star} tone="info" loading={o.isLoading} />
        {can('finance.view') ? <StatCard label="Qarzdorlik" value={fmtUZSshort(fin?.debt)} hint={<Link href="/finance/debts" className="text-primary inline-flex items-center gap-1 hover:underline">{fin?.debtors ?? 0} qarzdor <ArrowRight className="size-3" /></Link>} icon={AlertCircle} tone={(fin?.debt ?? 0) > 0 ? 'destructive' : 'success'} loading={o.isLoading} />
          : <StatCard label="Guruhlar" value={d?.counts.groups ?? '—'} icon={UsersRound} tone="violet" loading={o.isLoading} />}
      </div>

      {can('finance.view') && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label={isCeo ? 'Daromad (shu oy)' : "To'lovlar (shu oy)"} value={fmtUZSshort(fin?.income)} icon={TrendingUp} tone="success" loading={o.isLoading} />
          <StatCard label="Xarajat (shu oy)" value={fmtUZSshort(fin?.expenses)} icon={TrendingDown} tone="warning" loading={o.isLoading} />
          <StatCard label="Foyda" value={fmtUZSshort(fin?.profit)} icon={Wallet} tone={(fin?.profit ?? 0) >= 0 ? 'primary' : 'destructive'} loading={o.isLoading} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Davomat dinamikasi</CardTitle><CardDescription>So'nggi 14 kun · kelgan / kechikkan / kelmagan</CardDescription></CardHeader>
          <CardContent>{o.isLoading ? <Skeleton className="h-[240px]" /> : attTrend.length ? <AreaTrend data={attTrend} xKey="d" height={240} series={[{ key: 'present', name: 'Kelgan', color: 'var(--success)' }, { key: 'late', name: 'Kechikkan', color: 'var(--warning)' }, { key: 'absent', name: 'Kelmagan', color: 'var(--destructive)' }]} /> : <EmptyState className="py-8" title="Davomat ma'lumoti yo'q" />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Oylik davomat</CardTitle><CardDescription>{dayjs().format('MMMM')} oyi</CardDescription></CardHeader>
          <CardContent className="flex flex-col items-center">{o.isLoading ? <Skeleton className="h-[160px] w-full" /> : <Gauge value={d?.attendance.month.rate ?? 0} label="Davomat" color={(d?.attendance.month.rate ?? 100) < 85 ? 'var(--warning)' : 'var(--success)'} />}<div className="text-muted-foreground mt-2 grid w-full grid-cols-2 gap-2 text-center text-xs"><div className="rounded-lg border p-2"><div className="text-foreground text-lg font-semibold">{d?.attendance.month.absent ?? 0}</div>kelmagan</div><div className="rounded-lg border p-2"><div className="text-foreground text-lg font-semibold">{d?.attendance.month.late ?? 0}</div>kechikkan</div></div></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {can('finance.view') && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-base">Moliya · 6 oy</CardTitle><CardDescription>Kutilgan tushum, haqiqiy daromad va xarajatlar</CardDescription></CardHeader>
            <CardContent>{o.isLoading ? <Skeleton className="h-[240px]" /> : <Bars data={monthly} xKey="label" height={240} series={[{ key: 'expected', name: 'Kutilgan', color: 'var(--muted-foreground)' }, { key: 'income', name: 'Daromad', color: 'var(--success)' }, { key: 'expenses', name: 'Xarajat', color: 'var(--destructive)' }]} formatter={(v) => fmtUZS(v)} />}</CardContent>
          </Card>
        )}
        <Card className={cn(!can('finance.view') && 'lg:col-span-1')}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Baholar taqsimoti</CardTitle><CardDescription>So'nggi 30 kun</CardDescription></CardHeader>
          <CardContent>{o.isLoading ? <Skeleton className="h-[220px]" /> : gradeDist.length ? <><Donut data={gradeDist} centerLabel="O'rtacha" centerValue={d?.grades.avg ?? '—'} /><ChartLegend items={gradeDist.map((g) => ({ name: g.name, color: g.color, value: g.value }))} /></> : <EmptyState className="py-8" title="Baholar yo'q" />}</CardContent>
        </Card>
        {!can('finance.view') && <PeopleCard d={d} loading={o.isLoading} className="lg:col-span-1" />}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {can('finance.view') && <PeopleCard d={d} loading={o.isLoading} />}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Bugun e'tibor</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row icon={NotebookPen} label="Faol uy vazifalari" value={d?.homework.open ?? 0} href="/homework" />
            <Row icon={FileClock} label="Tekshirish kutayotgan" value={d?.homework.pendingReview ?? 0} href="/homework" tone={(d?.homework.pendingReview ?? 0) > 0 ? 'warning' : undefined} />
            <Row icon={BedDouble} label="Yotoqxona yozuvlari" value={d?.dormToday ?? 0} href="/dorm/logs" />
            <Row icon={FileClock} label="Hisobotlar (kutilmoqda)" value={d?.reportsPending ?? 0} href="/reports" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Yaqin imtihonlar</CardTitle></CardHeader>
          <CardContent className="space-y-2">{!d?.upcomingExams.length && <p className="text-muted-foreground text-xs">Rejalashtirilgan imtihon yo'q</p>}{d?.upcomingExams.slice(0, 5).map((e) => <Link key={e.id} href="/exams" className="hover:bg-accent/60 -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"><FlaskConical className="text-muted-foreground size-4" /><div className="min-w-0 flex-1"><div className="truncate font-medium">{e.title}</div><div className="text-muted-foreground text-xs">{e.group.name} · {e.subject.name}</div></div><Badge variant="secondary">{fmtDate(e.date)}</Badge></Link>)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Filiallar</CardTitle></CardHeader>
          <CardContent className="space-y-3">{d?.branches.map((b) => <Link key={b.id} href={`/branches/${b.id}`} className="block"><div className="flex items-center justify-between text-sm"><span className="inline-flex items-center gap-1.5 font-medium"><Building2 className="text-muted-foreground size-3.5" />{b.name}</span><span className="text-muted-foreground text-xs">{b.students} o'quvchi</span></div><Progress value={b.attendance ?? 0} className="mt-1 h-1.5" /><div className="text-muted-foreground mt-0.5 flex justify-between text-[11px]"><span>davomat {b.attendance ?? '—'}%</span>{can('finance.view') && <span>{fmtUZSshort(b.income)} · qarz {fmtUZSshort(b.debt)}</span>}</div></Link>)}</CardContent>
        </Card>
      </div>
    </div>
  );
}

function PeopleCard({ d, loading, className }: { d?: ReturnType<typeof useOverview>['data']; loading: boolean; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2"><CardTitle className="text-base">Jamoa</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? <Skeleton className="h-28" /> : <>
          <Row icon={BookOpenText} label="O'qituvchilar" value={d?.counts.teachers ?? 0} href="/teachers" />
          <Row icon={School} label="Tutorlar" value={d?.counts.tutors ?? 0} href="/tutors" />
          <Row icon={Users} label="Xodimlar" value={d?.counts.staff ?? 0} href="/users" />
          <Row icon={UsersRound} label="Guruhlar" value={d?.counts.groups ?? 0} href="/groups" />
          <Row icon={HeartHandshake} label="Ota-onalar (botda)" value={`${d?.counts.parentsLinked ?? 0}/${d?.counts.parentsTotal ?? 0}`} href="/parents" />
        </>}
      </CardContent>
    </Card>
  );
}

function Row({ icon: Icon, label, value, href, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; href: string; tone?: 'warning' }) {
  return <Link href={href} className="hover:bg-accent/60 -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5"><Icon className="text-muted-foreground size-4" /><span className="flex-1">{label}</span><span className={cn('font-semibold', tone === 'warning' && 'text-warning')}>{value}</span><ArrowRight className="text-muted-foreground size-3.5" /></Link>;
}
