'use client';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import type { Homework } from '@/lib/school';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FormSelect, GroupSelect, SubjectSelect } from '@/components/school/pickers';

export function HomeworkDialog({ open, onOpenChange, defaultGroupId, defaultSubjectId, homework }: { open: boolean; onOpenChange: (v: boolean) => void; defaultGroupId?: string; defaultSubjectId?: string; homework?: Homework }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ groupId: homework?.groupId ?? defaultGroupId ?? '', subjectId: homework?.subjectId ?? defaultSubjectId ?? '', title: homework?.title ?? '', task: homework?.task ?? '', deadline: homework ? dayjs(homework.deadline).format('YYYY-MM-DDTHH:mm') : dayjs().add(1, 'day').hour(20).minute(0).format('YYYY-MM-DDTHH:mm'), fileUrl: homework?.fileUrl ?? '', fileName: homework?.fileName ?? '', note: homework?.note ?? '', maxScore: String(homework?.maxScore ?? 5) });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const mut = useMutation({
    mutationFn: () => { const body = { ...f, title: f.title.trim(), task: f.task.trim(), deadline: new Date(f.deadline).toISOString(), fileUrl: f.fileUrl.trim() || null, fileName: f.fileName.trim() || null, note: f.note.trim() || null, maxScore: Number(f.maxScore) || 5 }; return homework ? api.patch(`/api/homework/${homework.id}`, body) : api.post('/api/homework', body); },
    onSuccess: () => { toast.success(homework ? 'Vazifa yangilandi' : "Vazifa berildi. O'quvchi va ota-onalarga xabar yuborildi."); qc.invalidateQueries({ queryKey: ['homework'] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{homework ? 'Vazifani tahrirlash' : 'Yangi uy vazifasi'}</DialogTitle><DialogDescription>Fan, mavzu, topshiriq, muddat, fayl va izoh.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guruh *"><GroupSelect value={f.groupId} onChange={(v) => set('groupId', v)} noneLabel={null} disabled={!!homework} /></Field>
          <Field label="Fan *"><SubjectSelect value={f.subjectId} onChange={(v) => set('subjectId', v)} noneLabel={null} /></Field>
          <Field label="Mavzu *" className="sm:col-span-2"><Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Kvadrat tenglamalar" /></Field>
          <Field label="Topshiriq *" className="sm:col-span-2"><Textarea rows={4} value={f.task} onChange={(e) => set('task', e.target.value)} placeholder="Darslik 45-bet, 1–10 misollar…" /></Field>
          <Field label="Muddat *"><Input type="datetime-local" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} /></Field>
          <Field label="Maksimal ball"><FormSelect value={f.maxScore} onChange={(v) => set('maxScore', v)} noneLabel={null} options={[{ value: '5', label: '5' }, { value: '10', label: '10' }, { value: '100', label: '100' }]} /></Field>
          <Field label="Fayl havolasi"><Input value={f.fileUrl} onChange={(e) => set('fileUrl', e.target.value)} placeholder="https://…" /></Field>
          <Field label="Fayl nomi"><Input value={f.fileName} onChange={(e) => set('fileName', e.target.value)} placeholder="topshiriq.pdf" /></Field>
          <Field label="Izoh" className="sm:col-span-2"><Input value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button disabled={!f.groupId || !f.subjectId || f.title.trim().length < 2 || f.task.trim().length < 2} loading={mut.isPending} onClick={() => mut.mutate()}>{homework ? 'Saqlash' : 'Berish va xabar yuborish'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
