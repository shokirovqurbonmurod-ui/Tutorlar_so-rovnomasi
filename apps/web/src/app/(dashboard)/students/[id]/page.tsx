'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { ArrowLeft, Pencil, Trash2, Phone, Send, Star, UserCheck, NotebookPen, Wallet, BedDouble, CalendarDays, Download, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { StudentDetail, Grade, Attendance, Invoice, Homework, DormLog } from '@/lib/school';
import { gradeTone, monthOptions, thisMonth } from '@/lib/school';
import { ATTENDANCE, HW_STATUS, INVOICE_STATUS, STUDENT_STATUS, GRADE_KIND, DORM_LOG, fmtUZS } from '@/lib/labels';
import { fmtDate, fmtDateTime, initials, cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { StudentFormDialog } from '@/components/school/student-form';

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [edit, setEdit] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const s = useQuery({ queryKey: ['student', id], queryFn: () => api.get<StudentDetail>(`/api/students/${id}`) });
  const del = useMutation({ mutationFn: () => api.delete(`/api/students/${id}`), onSuccess: () => { toast.success("O'quvchi arxivlandi"); qc.invalidateQueries({ queryKey: ['students'] }); router.push('/students'); }, onError: (e: Error) => toast.error(e.message) });

  if (s.isLoading) return <div className="space-y-4"><Skeleton className="h-28 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div></div>;
  if (!s.data) return <EmptyState title="O'quvchi topilmadi" action={<Button asChild variant="outline"><Link href="/students"><ArrowLeft /> Ro'yxatga</Link></Button>} />;
  const st = s.data;
  const sum = st.summary;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm"><Link href="/students"><ArrowLeft /></Link></Button>
            <Avatar className="size-12 rounded-2xl"><AvatarImage src={st.avatarUrl ?? undefined} /><AvatarFallback className="rounded-2xl">{initials(st.fullName)}</AvatarFallback></Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2"><span>{st.fullName}</span><StatusBadge value={st.status} map={STUDENT_STATUS} />{st.isBoarder && <Badge variant="info"><BedDouble className="size-3" /> Yotoqxona</Badge>}</div>
              <div className="text-muted-foreground text-sm font-normal">{st.studentCode} · {st.group ? <Link className="text-primary hover:underline" href={`/groups/${st.group.id}`}>{st.group.name}</Link> : 'Guruhsiz'} · {st.branch?.name}</div>
            </div>
          </div>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => api.download(`/api/schedule/pdf?studentId=${st.id}`)}><Download /> Jadval PDF</Button>
            {can('students.manage') && <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> Tahrirlash</Button>}
            {can('students.manage') && <Button variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}><Trash2 /></Button>}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Davomat (30 kun)" value={sum.attendance30.rate === null ? '—' : `${sum.attendance30.rate}%`} hint={`${sum.attendance30.ABSENT} kelmagan · ${sum.attendance30.LATE} kechikkan`} icon={UserCheck} tone={sum.attendance30.rate !== null && sum.attendance30.rate < 85 ? 'warning' : 'success'} />
        <StatCard label="O'rtacha baho (30 kun)" value={sum.avgGrade30 ?? '—'} hint={`${sum.gradesCount30} ta baho`} icon={Star} tone="primary" />
        <StatCard label="Uy vazifalari" value={sum.homeworkPending} hint="topshirilmagan / qayta ishlash" icon={NotebookPen} tone={sum.homeworkPending > 0 ? 'warning' : 'info'} />
        <StatCard label="Qarzdorlik" value={sum.debt > 0 ? fmtUZS(sum.debt) : "Yo'q"} hint={`Oylik: ${fmtUZS(st.monthlyFee)}${st.discountPercent ? ` · −${st.discountPercent}%` : ''}`} icon={Wallet} tone={sum.debt > 0 ? 'destructive' : 'success'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs defaultValue="grades" className="min-w-0">
          <TabsList className="flex w-full overflow-x-auto sm:w-auto">
            <TabsTrigger value="grades"><Star className="size-4" /> Baholar</TabsTrigger>
            <TabsTrigger value="attendance"><CalendarDays className="size-4" /> Davomat</TabsTrigger>
            <TabsTrigger value="homework"><NotebookPen className="size-4" /> Vazifalar</TabsTrigger>
            <TabsTrigger value="finance"><Wallet className="size-4" /> To'lovlar</TabsTrigger>
            {st.isBoarder && <TabsTrigger value="dorm"><BedDouble className="size-4" /> Yotoqxona</TabsTrigger>}
          </TabsList>
          <TabsContent value="grades" className="mt-4"><GradesTab studentId={st.id} /></TabsContent>
          <TabsContent value="attendance" className="mt-4"><AttendanceTab studentId={st.id} /></TabsContent>
          <TabsContent value="homework" className="mt-4"><HomeworkTab studentId={st.id} /></TabsContent>
          <TabsContent value="finance" className="mt-4"><FinanceTab studentId={st.id} /></TabsContent>
          {st.isBoarder && <TabsContent value="dorm" className="mt-4"><DormTab studentId={st.id} /></TabsContent>}
        </Tabs>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Ota-onalar</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!st.parents?.length && <p className="text-muted-foreground text-sm">Ota-ona biriktirilmagan</p>}
              {st.parents?.map((p) => (
                <div key={p.parent.id} className="flex items-start gap-3">
                  <Avatar className="size-9"><AvatarFallback>{initials(p.parent.user.fullName)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium"><Link href={`/parents?search=${encodeURIComponent(p.parent.user.phone ?? '')}`} className="hover:underline">{p.parent.user.fullName}</Link>{p.isPrimary && <Badge variant="primary" className="h-4 px-1.5 text-[10px]">asosiy</Badge>}</div>
                    <div className="text-muted-foreground text-xs capitalize">{({ father: 'Ota', mother: 'Ona', guardian: 'Vasiy' } as Record<string, string>)[p.relation ?? p.parent.relation ?? ''] ?? p.relation ?? ''}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {p.parent.user.phone && <a href={`tel:${p.parent.user.phone}`} className="text-primary inline-flex items-center gap-1 hover:underline"><Phone className="size-3" />{p.parent.user.phone}</a>}
                      {p.parent.user.telegramId ? <span className="text-success inline-flex items-center gap-1"><Send className="size-3" /> Bot ulangan</span> : <span className="text-muted-foreground inline-flex items-center gap-1"><Send className="size-3" /> Bot ulanmagan</span>}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Ma'lumotlar</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <Row k="Tug'ilgan sana" v={st.birthDate ? fmtDate(st.birthDate) : '—'} />
              <Row k="Jinsi" v={st.gender === 'MALE' ? "O'g'il bola" : st.gender === 'FEMALE' ? 'Qiz bola' : '—'} />
              <Row k="Telefon" v={st.phone ?? '—'} />
              <Row k="Manzil" v={st.address ?? '—'} />
              <Row k="Qabul sanasi" v={fmtDate(st.enrolledAt)} />
              <Row k="Tutor" v={st.group?.tutor?.fullName ?? '—'} />
              <Row k="Bot (o'quvchi)" v={st.user?.telegramId ? <span className="text-success">Ulangan</span> : '—'} />
              {st.notes && <Row k="Izoh" v={st.notes} />}
            </CardContent>
          </Card>
          {st.group && can('messages.view') && <Button asChild variant="outline" className="w-full"><Link href={`/messages?groupId=${st.group.id}`}><MessageCircle /> Guruh chati</Link></Button>}
        </div>
      </div>
      <StudentFormDialog open={edit} onOpenChange={setEdit} student={st} />
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="O'quvchini arxivlash" description={`${st.fullName} arxivga o'tkaziladi va guruhdan chiqariladi. Tarixiy ma'lumotlar saqlanadi.`} confirmText="Arxivlash" destructive loading={del.isPending} onConfirm={() => del.mutate()} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground shrink-0">{k}</span><span className="text-right font-medium">{v}</span></div>;
}

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-card w-48"><SelectValue /></SelectTrigger>
      <SelectContent>{monthOptions(12).map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function GradesTab({ studentId }: { studentId: string }) {
  const [month, setMonth] = React.useState(thisMonth());
  const from = `${month}-01`, to = dayjs(from).endOf('month').format('YYYY-MM-DD');
  const g = useQuery({ queryKey: ['grades', { studentId, from, to }], queryFn: () => api.get<{ items: Grade[] }>('/api/grades', { studentId, from, to, limit: 500 }) });
  const items = g.data?.items ?? [];
  const bySubject = React.useMemo(() => {
    const m = new Map<string, { name: string; color: string | null; grades: Grade[] }>();
    for (const x of items) { const e = m.get(x.subjectId) ?? { name: x.subject.name, color: x.subject.color ?? null, grades: [] }; e.grades.push(x); m.set(x.subjectId, e); }
    return [...m.values()].map((e) => ({ ...e, avg: e.grades.reduce((s, x) => s + x.value, 0) / e.grades.length }));
  }, [items]);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3"><CardTitle className="text-base">Baholar</CardTitle><MonthPicker value={month} onChange={setMonth} /></CardHeader>
      <CardContent>
        {g.isLoading ? <Skeleton className="h-40" /> : !items.length ? <EmptyState title="Bu oyda baho yo'q" /> : (
          <div className="space-y-4">
            {bySubject.map((sub) => (
              <div key={sub.name} className="rounded-xl border p-3">
                <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: sub.color ?? 'var(--primary)' }} />{sub.name}</div><span className="text-muted-foreground text-xs">o'rtacha <b className="text-foreground">{sub.avg.toFixed(1)}</b></span></div>
                <div className="flex flex-wrap gap-1.5">
                  {sub.grades.sort((a, b) => a.date.localeCompare(b.date)).map((x) => (
                    <span key={x.id} title={`${fmtDate(x.date)} · ${GRADE_KIND[x.kind]}${x.teacher ? ` · ${x.teacher.fullName}` : ''}${x.comment ? `\n${x.comment}` : ''}`} className={cn('inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-semibold', gradeTone(x.value))}>{x.value}{x.maxValue !== 5 && <span className="text-[10px] opacity-60">/{x.maxValue}</span>}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceTab({ studentId }: { studentId: string }) {
  const [month, setMonth] = React.useState(thisMonth());
  const cal = useQuery({ queryKey: ['att-cal', studentId, month], queryFn: () => api.get<{ month: string; days: Record<string, { status: string; items: Attendance[] }>; counts: Record<string, number> }>(`/api/attendance/student/${studentId}/calendar`, { month }) });
  const start = dayjs(`${month}-01`);
  const daysInMonth = start.daysInMonth();
  const offset = (start.day() + 6) % 7;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3"><CardTitle className="text-base">Davomat kalendari</CardTitle><MonthPicker value={month} onChange={setMonth} /></CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-2">{Object.entries(ATTENDANCE).map(([k, m]) => <Badge key={k} variant={m.variant}>{m.label}: {cal.data?.counts?.[k] ?? 0}</Badge>)}</div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
          {['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'].map((d) => <div key={d} className="text-muted-foreground py-1">{d}</div>)}
          {Array.from({ length: offset }).map((_, i) => <div key={`o${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const k = start.date(i + 1).format('YYYY-MM-DD');
            const d = cal.data?.days?.[k];
            const m = d ? ATTENDANCE[d.status] : null;
            return (
              <div key={k} title={d ? d.items.map((x) => `${x.lesson?.subject?.name ?? 'Dars'}: ${ATTENDANCE[x.status]?.label}${x.reason ? ` (${x.reason})` : ''}`).join('\n') : ''} className={cn('flex aspect-square flex-col items-center justify-center rounded-lg border text-sm', m ? `border-transparent ${m.variant === 'success' ? 'bg-success/15 text-success' : m.variant === 'destructive' ? 'bg-destructive/12 text-destructive' : m.variant === 'warning' ? 'bg-warning/20 text-amber-700 dark:text-warning' : 'bg-muted text-muted-foreground'}` : 'text-muted-foreground/60')}>
                <span className="font-medium">{i + 1}</span>{m && <span className="text-[9px] leading-none">{m.short}</span>}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function HomeworkTab({ studentId }: { studentId: string }) {
  const hw = useQuery({ queryKey: ['homework', { studentId }], queryFn: () => api.get<Array<Homework & { mine?: { status: string; score: number | null; feedback: string | null } }>>('/api/homework', { studentId, limit: 50 }) });
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Uy vazifalari</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {hw.isLoading ? <Skeleton className="h-32" /> : !hw.data?.length ? <EmptyState title="Uy vazifalari yo'q" /> : hw.data.map((h) => (
          <Link key={h.id} href={`/homework/${h.id}`} className="hover:bg-accent/60 flex items-center gap-3 rounded-xl border p-3 transition-colors">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: h.subject.color ?? 'var(--primary)' }} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{h.title}</div><div className="text-muted-foreground text-xs">{h.subject.name} · muddat {fmtDateTime(h.deadline)}{h.mine?.score !== null && h.mine?.score !== undefined ? ` · ${h.mine.score}/${h.maxScore}` : ''}</div></div>
            <StatusBadge value={h.mine?.status ?? 'NOT_SUBMITTED'} map={HW_STATUS} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function FinanceTab({ studentId }: { studentId: string }) {
  const inv = useQuery({ queryKey: ['invoices', { studentId }], queryFn: () => api.get<{ items: Invoice[] }>('/api/finance/invoices', { studentId, limit: 24 }) });
  const items = inv.data?.items ?? [];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3"><CardTitle className="text-base">Hisob-fakturalar va to'lovlar</CardTitle><Button asChild size="sm" variant="outline"><Link href={`/finance/payments?studentId=${studentId}`}>To'lov qabul qilish</Link></Button></CardHeader>
      <CardContent className="space-y-2">
        {inv.isLoading ? <Skeleton className="h-32" /> : !items.length ? <EmptyState title="Hisob-faktura yo'q" description="Finance bo'limidan oylik invoice yarating" /> : items.map((i) => {
          const rem = Number(i.total) - Number(i.paid);
          return (
            <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1"><div className="text-sm font-medium">{i.title} <span className="text-muted-foreground font-normal">· {i.number}</span></div><div className="text-muted-foreground text-xs">Muddat {fmtDate(i.dueDate)}{Number(i.discount) > 0 ? ` · chegirma ${fmtUZS(i.discount)}` : ''}</div></div>
              <div className="text-right text-sm"><div>Jami <b>{fmtUZS(i.total)}</b></div><div className="text-xs"><span className="text-success">To'langan {fmtUZS(i.paid)}</span>{rem > 0 && <span className="text-destructive"> · Qoldiq {fmtUZS(rem)}</span>}</div></div>
              <StatusBadge value={i.status} map={INVOICE_STATUS} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DormTab({ studentId }: { studentId: string }) {
  const d = useQuery({ queryKey: ['dorm-student', studentId], queryFn: () => api.get<{ assignment: { checkInAt: string; bed: { label: string; room: { number: string; floor: number; condition: string; building: { name: string; dormitory: { name: string; address: string | null; manager: { fullName: string; phone: string | null } | null } } } } } | null; logs: DormLog[] }>(`/api/dorm/student/${studentId}`) });
  const a = d.data?.assignment;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Yotoqxona</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {d.isLoading ? <Skeleton className="h-24" /> : !a ? <EmptyState title="Joylashtirilmagan" description="Komendant Yotoqxona bo'limidan joy biriktiradi" /> : (
          <div className="grid gap-2 rounded-xl border p-4 text-sm sm:grid-cols-2">
            <Row k="Yotoqxona" v={a.bed.room.building.dormitory.name} /><Row k="Bino" v={a.bed.room.building.name} /><Row k="Qavat / Xona" v={`${a.bed.room.floor}-qavat · ${a.bed.room.number}`} /><Row k="Joy" v={a.bed.label} /><Row k="Joylashgan sana" v={fmtDate(a.checkInAt)} /><Row k="Komendant" v={a.bed.room.building.dormitory.manager ? `${a.bed.room.building.dormitory.manager.fullName}${a.bed.room.building.dormitory.manager.phone ? ` · ${a.bed.room.building.dormitory.manager.phone}` : ''}` : '—'} />
          </div>
        )}
        {!!d.data?.logs?.length && (
          <div className="space-y-2">
            <div className="text-sm font-medium">So'nggi yozuvlar</div>
            {d.data.logs.map((l) => <div key={l.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm"><StatusBadge value={l.type} map={DORM_LOG} /><span className="flex-1 truncate">{l.title}</span><span className="text-muted-foreground text-xs">{fmtDateTime(l.occurredAt)}</span></div>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
