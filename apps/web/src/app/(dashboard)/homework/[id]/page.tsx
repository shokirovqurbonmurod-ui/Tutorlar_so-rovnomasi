'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Trash2, Paperclip, Clock, Check, RotateCcw, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Homework, Submission } from '@/lib/school';
import { HW_STATUS } from '@/lib/labels';
import { fmtDateTime, initials, cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { HomeworkDialog } from '@/components/school/homework-dialog';

type Detail = Homework & { roster: Array<{ student: { id: string; fullName: string; studentCode: string }; submission: Submission | null }> };

export default function HomeworkDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [edit, setEdit] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const h = useQuery({ queryKey: ['homework', id], queryFn: () => api.get<Detail>(`/api/homework/${id}`) });
  const del = useMutation({ mutationFn: () => api.delete(`/api/homework/${id}`), onSuccess: () => { toast.success("Vazifa o'chirildi"); qc.invalidateQueries({ queryKey: ['homework'] }); router.push('/homework'); }, onError: (e: Error) => toast.error(e.message) });
  const review = useMutation({
    mutationFn: (b: { studentId: string; status: 'ACCEPTED' | 'REVISION' | 'GRADED'; score?: number | null; feedback?: string | null }) => api.post(`/api/homework/${id}/review`, b),
    onSuccess: () => { toast.success("Baholandi. O'quvchi va ota-onaga xabar yuborildi."); qc.invalidateQueries({ queryKey: ['homework', id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const [drafts, setDrafts] = React.useState<Record<string, { score: string; feedback: string }>>({});
  const d = (sid: string) => drafts[sid] ?? { score: '', feedback: '' };

  if (h.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (!h.data) return <EmptyState title="Vazifa topilmadi" action={<Button asChild variant="outline"><Link href="/homework"><ArrowLeft /> Orqaga</Link></Button>} />;
  const hw = h.data;
  const counts = hw.roster.reduce((acc, r) => { const k = r.submission?.status ?? 'NOT_SUBMITTED'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={<div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon-sm"><Link href="/homework"><ArrowLeft /></Link></Button><span>{hw.title}</span></div>}
        description={<span className="inline-flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: hw.subject.color ?? 'var(--primary)' }} />{hw.subject.name}</span>· <Link href={`/groups/${hw.groupId}`} className="text-primary hover:underline">{hw.group.name}</Link> · {hw.author.fullName} · <Clock className="size-3.5" /> {fmtDateTime(hw.deadline)}</span>}
        actions={can('homework.manage') && <><Button variant="outline" onClick={() => setEdit(true)}><Pencil /> Tahrirlash</Button><Button variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}><Trash2 /></Button></>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">{Object.entries(HW_STATUS).map(([k, m]) => <Badge key={k} variant={m.variant}>{m.label}: {counts[k] ?? 0}</Badge>)}</div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">O'quvchilar ({hw.roster.length})</CardTitle></CardHeader>
            <CardContent className="divide-y p-0">
              {hw.roster.map(({ student, submission }) => {
                const st = submission?.status ?? 'NOT_SUBMITTED';
                const dr = d(student.id);
                const canReview = can('homework.manage') && st !== 'NOT_SUBMITTED';
                return (
                  <div key={student.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Avatar className="size-8"><AvatarFallback className="text-[10px]">{initials(student.fullName)}</AvatarFallback></Avatar>
                      <Link href={`/students/${student.id}`} className="min-w-[140px] flex-1 text-sm font-medium hover:underline">{student.fullName}</Link>
                      {submission?.submittedAt && <span className="text-muted-foreground text-xs">{fmtDateTime(submission.submittedAt)}</span>}
                      {submission?.score !== null && submission?.score !== undefined && <Badge variant="primary"><Star className="size-3" /> {submission.score}/{hw.maxScore}</Badge>}
                      <StatusBadge value={st} map={HW_STATUS} />
                    </div>
                    {submission?.content && <p className="bg-muted/50 mt-2 rounded-lg p-2 text-sm whitespace-pre-wrap">{submission.content}</p>}
                    {(submission?.fileUrl || submission?.fileName) && <p className="text-muted-foreground mt-1 text-xs"><Paperclip className="inline size-3" /> {submission.fileName ?? 'Fayl'} {submission.fileUrl && <a href={submission.fileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">ochish</a>}{submission.telegramFileId && !submission.fileUrl && <span> · Telegram orqali yuborilgan</span>}</p>}
                    {submission?.feedback && <p className="text-muted-foreground mt-1 text-xs">Izoh: {submission.feedback}</p>}
                    {canReview && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input type="number" min={0} max={hw.maxScore} value={dr.score} onChange={(e) => setDrafts((x) => ({ ...x, [student.id]: { ...dr, score: e.target.value } }))} placeholder={`0–${hw.maxScore}`} className="h-8 w-20 text-xs" />
                        <Input value={dr.feedback} onChange={(e) => setDrafts((x) => ({ ...x, [student.id]: { ...dr, feedback: e.target.value } }))} placeholder="Fikr-mulohaza" className="h-8 w-48 text-xs" />
                        <Button size="sm" variant="outline" className="text-success" onClick={() => review.mutate({ studentId: student.id, status: 'ACCEPTED', feedback: dr.feedback || null })}><Check /> Qabul</Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => review.mutate({ studentId: student.id, status: 'REVISION', feedback: dr.feedback || null })}><RotateCcw /> Qayta ishlash</Button>
                        <Button size="sm" disabled={dr.score === ''} onClick={() => review.mutate({ studentId: student.id, status: 'GRADED', score: Number(dr.score), feedback: dr.feedback || null })}><Star /> Baholash</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Topshiriq</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="whitespace-pre-wrap">{hw.task}</p>{hw.note && <p className="text-muted-foreground text-xs">Izoh: {hw.note}</p>}{hw.fileUrl && <a href={hw.fileUrl} target="_blank" rel="noreferrer" className={cn('text-primary inline-flex items-center gap-1 text-xs hover:underline')}><Paperclip className="size-3" />{hw.fileName ?? 'Fayl'}</a>}<div className="text-muted-foreground text-xs">Maksimal ball: {hw.maxScore}</div></CardContent></Card>
        </div>
      </div>
      {edit && <HomeworkDialog open onOpenChange={setEdit} homework={hw} />}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Vazifani o'chirish" description="Barcha topshiriqlar ham o'chadi." confirmText="O'chirish" destructive loading={del.isPending} onConfirm={() => del.mutate()} />
    </div>
  );
}
