'use client';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Group } from '@/lib/school';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { BranchSelect, Field, StaffSelect, SubjectSelect } from './pickers';

export function GroupFormDialog({ open, onOpenChange, group }: { open: boolean; onOpenChange: (v: boolean) => void; group?: Group | null }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isEdit = !!group;
  const year = new Date().getMonth() >= 7 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`;
  const [f, setF] = React.useState({ name: '', gradeLevel: '', academicYear: year, room: '', branchId: '', tutorId: '', teacherId: '', isActive: true, allowParentChat: true });
  const [teachers, setTeachers] = React.useState<Array<{ teacherId: string; subjectId: string }>>([]);
  React.useEffect(() => {
    if (!open) return;
    if (group) { setF({ name: group.name, gradeLevel: group.gradeLevel ? String(group.gradeLevel) : '', academicYear: group.academicYear ?? year, room: group.room ?? '', branchId: group.branchId, tutorId: group.tutorId ?? '', teacherId: group.teacherId ?? '', isActive: group.isActive, allowParentChat: group.allowParentChat }); setTeachers((group.teachers ?? []).map((t) => ({ teacherId: t.teacherId, subjectId: t.subjectId }))); }
    else { setF({ name: '', gradeLevel: '', academicYear: year, room: '', branchId: user?.branch?.id ?? '', tutorId: '', teacherId: '', isActive: true, allowParentChat: true }); setTeachers([]); }
  }, [open, group, user?.branch?.id, year]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const mut = useMutation({
    mutationFn: () => {
      const body = { name: f.name.trim(), gradeLevel: f.gradeLevel ? Number(f.gradeLevel) : null, academicYear: f.academicYear.trim() || null, room: f.room.trim() || null, branchId: f.branchId, tutorId: f.tutorId || null, teacherId: f.teacherId || null, isActive: f.isActive, allowParentChat: f.allowParentChat, teachers: teachers.filter((t) => t.teacherId && t.subjectId) };
      return isEdit ? api.patch(`/api/groups/${group!.id}`, body) : api.post('/api/groups', body);
    },
    onSuccess: () => { toast.success(isEdit ? 'Guruh yangilandi' : 'Guruh yaratildi'); qc.invalidateQueries({ queryKey: ['school-groups'] }); qc.invalidateQueries({ queryKey: ['group'] }); qc.invalidateQueries({ queryKey: ['groups'] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{isEdit ? 'Guruhni tahrirlash' : 'Yangi guruh / sinf'}</DialogTitle><DialogDescription>Guruhga tutor, fan o'qituvchilari va o'quvchilar biriktiriladi. Ota-onalar avtomatik guruh chatiga ulanadi.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nomi *"><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="7-A" /></Field>
          <Field label="Sinf (daraja)"><Input type="number" min={1} max={12} value={f.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)} placeholder="7" /></Field>
          <Field label="Filial *"><BranchSelect value={f.branchId} onChange={(v) => { set('branchId', v); set('tutorId', ''); }} noneLabel={null} /></Field>
          <Field label="O'quv yili"><Input value={f.academicYear} onChange={(e) => set('academicYear', e.target.value)} /></Field>
          <Field label="Tutor (sinf rahbari)"><StaffSelect role="TUTOR" branchId={f.branchId || undefined} value={f.tutorId} onChange={(v) => set('tutorId', v)} /></Field>
          <Field label="Asosiy o'qituvchi"><StaffSelect role="TEACHER" branchId={f.branchId || undefined} value={f.teacherId} onChange={(v) => set('teacherId', v)} /></Field>
          <Field label="Asosiy xona"><Input value={f.room} onChange={(e) => set('room', e.target.value)} placeholder="204" /></Field>
          <div className="grid gap-2">
            <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"><span>Faol</span><Switch checked={f.isActive} onCheckedChange={(v) => set('isActive', v)} /></label>
            <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"><span>Ota-onalar chatda yozishi mumkin</span><Switch checked={f.allowParentChat} onCheckedChange={(v) => set('allowParentChat', v)} /></label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between"><label className="text-sm font-medium">Fan o'qituvchilari</label><Button size="sm" variant="outline" onClick={() => setTeachers((t) => [...t, { teacherId: '', subjectId: '' }])}><Plus /> Qo'shish</Button></div>
            {!teachers.length && <p className="text-muted-foreground text-xs">Har bir fan uchun o'qituvchi biriktiring — dars jadvali va baholarda avtomatik tanlanadi.</p>}
            {teachers.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <SubjectSelect value={t.subjectId} onChange={(v) => setTeachers((ts) => ts.map((x, j) => (j === i ? { ...x, subjectId: v } : x)))} placeholder="Fan" noneLabel={null} />
                <StaffSelect role="TEACHER" value={t.teacherId} onChange={(v) => setTeachers((ts) => ts.map((x, j) => (j === i ? { ...x, teacherId: v } : x)))} placeholder="O'qituvchi" noneLabel={null} />
                <Button variant="ghost" size="icon" onClick={() => setTeachers((ts) => ts.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button onClick={() => mut.mutate()} disabled={!f.name.trim() || !f.branchId} loading={mut.isPending}>{isEdit ? 'Saqlash' : 'Yaratish'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
