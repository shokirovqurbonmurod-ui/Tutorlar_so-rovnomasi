'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MoreHorizontal, Send, CalendarClock, Copy, Pencil, Trash2, BarChart3, BellRing, Archive, CheckCircle2, RotateCcw, Download } from 'lucide-react';
import { api } from '@/lib/api';
import type { Survey } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { ScheduleDialog, SendSurveyDialog } from './send-dialog';

export function SurveyActions({ survey, variant = 'menu' }: { survey: Survey; variant?: 'menu' | 'bar' }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [sendOpen, setSendOpen] = React.useState(false);
  const [schedOpen, setSchedOpen] = React.useState(false);
  const [del, setDel] = React.useState(false);
  const inv = () => { void qc.invalidateQueries({ queryKey: ['surveys'] }); void qc.invalidateQueries({ queryKey: ['survey', survey.id] }); };
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Xatolik');

  const dup = useMutation({ mutationFn: () => api.post<Survey>(`/api/surveys/${survey.id}/duplicate`), onSuccess: (s) => { toast.success('Nusxa yaratildi'); inv(); router.push(`/surveys/${s.id}/edit`); }, onError: err });
  const remove = useMutation({ mutationFn: () => api.delete(`/api/surveys/${survey.id}`), onSuccess: () => { toast.success('O‘chirildi'); inv(); setDel(false); router.push('/surveys'); }, onError: err });
  const remind = useMutation({ mutationFn: () => api.post<{ reminded: number }>(`/api/surveys/${survey.id}/remind`), onSuccess: (r) => toast.success(`${r.reminded} xodimga eslatma yuborildi`), onError: err });
  const status = useMutation({ mutationFn: (s: string) => api.post(`/api/surveys/${survey.id}/status`, { status: s }), onSuccess: () => { toast.success('Holat yangilandi'); inv(); }, onError: err });
  const exp = async (format: 'csv' | 'xlsx' | 'pdf') => {
    try { await api.download(`/api/surveys/${survey.id}/export?format=${format}`); } catch (e) { err(e); }
  };

  const canSend = can('surveys.send') && (survey.status === 'DRAFT' || survey.status === 'SCHEDULED' || survey.status === 'ACTIVE');
  const items = (
    <>
      <DropdownMenuItem onClick={() => router.push(`/surveys/${survey.id}`)}><BarChart3 /> Natijalar</DropdownMenuItem>
      {can('surveys.update') && survey.status !== 'ARCHIVED' && <DropdownMenuItem onClick={() => router.push(`/surveys/${survey.id}/edit`)}><Pencil /> Tahrirlash</DropdownMenuItem>}
      {can('surveys.create') && <DropdownMenuItem onClick={() => dup.mutate()}><Copy /> Nusxa olish</DropdownMenuItem>}
      <DropdownMenuSeparator />
      {canSend && <DropdownMenuItem onClick={() => setSendOpen(true)}><Send /> {survey.status === 'ACTIVE' ? 'Yana yuborish' : 'Yuborish'}</DropdownMenuItem>}
      {can('surveys.send') && survey.status === 'DRAFT' && <DropdownMenuItem onClick={() => setSchedOpen(true)}><CalendarClock /> Rejalashtirish</DropdownMenuItem>}
      {can('surveys.send') && survey.status === 'ACTIVE' && <DropdownMenuItem onClick={() => remind.mutate()}><BellRing /> Eslatma yuborish</DropdownMenuItem>}
      {can('surveys.results') && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Download className="text-muted-foreground mr-2 size-4" /> Eksport</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => void exp('xlsx')}>Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exp('csv')}>CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exp('pdf')}>PDF</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      {can('surveys.update') && (
        <>
          <DropdownMenuSeparator />
          {survey.status === 'ACTIVE' && <DropdownMenuItem onClick={() => status.mutate('COMPLETED')}><CheckCircle2 /> Yakunlash</DropdownMenuItem>}
          {survey.status !== 'ARCHIVED' && survey.status !== 'DRAFT' && <DropdownMenuItem onClick={() => status.mutate('ARCHIVED')}><Archive /> Arxivlash</DropdownMenuItem>}
          {(survey.status === 'ARCHIVED' || survey.status === 'COMPLETED') && <DropdownMenuItem onClick={() => status.mutate('ACTIVE')}><RotateCcw /> Qayta faollashtirish</DropdownMenuItem>}
          {survey.status === 'SCHEDULED' && <DropdownMenuItem onClick={() => status.mutate('DRAFT')}><RotateCcw /> Rejani bekor qilish</DropdownMenuItem>}
        </>
      )}
      {can('surveys.delete') && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setDel(true)}><Trash2 /> O‘chirish</DropdownMenuItem></>}
    </>
  );

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
      {variant === 'bar' && canSend && <Button size="sm" onClick={() => setSendOpen(true)}><Send /> {survey.status === 'ACTIVE' ? 'Yana yuborish' : 'Yuborish'}</Button>}
      {variant === 'bar' && can('surveys.send') && survey.status === 'ACTIVE' && <Button size="sm" variant="outline" onClick={() => remind.mutate()} loading={remind.isPending}><BellRing /> Eslatma</Button>}
      {variant === 'bar' && can('surveys.update') && survey.status !== 'ARCHIVED' && <Button size="sm" variant="outline" onClick={() => router.push(`/surveys/${survey.id}/edit`)}><Pencil /> Tahrirlash</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant={variant === 'bar' ? 'outline' : 'ghost'} size={variant === 'bar' ? 'icon' : 'icon-sm'}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">{items}</DropdownMenuContent>
      </DropdownMenu>
      {sendOpen && <SendSurveyDialog survey={survey} open={sendOpen} onOpenChange={setSendOpen} />}
      {schedOpen && <ScheduleDialog survey={survey} open={schedOpen} onOpenChange={setSchedOpen} />}
      <ConfirmDialog open={del} onOpenChange={setDel} title="So‘rovnomani o‘chirish" description={<>«{survey.title}» va barcha javoblari butunlay o‘chiriladi.</>} destructive confirmText="O‘chirish" loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </div>
  );
}
