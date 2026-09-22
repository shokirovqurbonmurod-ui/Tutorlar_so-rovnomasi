'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { Paginated, RoleKey, Survey, User } from '@/lib/types';
import { useBranches } from '@/lib/queries';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserCell } from '@/components/shared/user-cell';
import { useDebounce } from '@/hooks/use-debounce';
import { dayjs } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

export function SendSurveyDialog({ survey, open, onOpenChange, onSent }: { survey: Survey; open: boolean; onOpenChange: (o: boolean) => void; onSent?: () => void }) {
  const qc = useQueryClient();
  const { is, user: me } = useAuth();
  const branches = useBranches(!is('DIRECTOR'));
  const [mode, setMode] = React.useState<'audience' | 'custom'>('audience');
  const [roles, setRoles] = React.useState<RoleKey[]>(survey.audience === 'TUTORS' ? ['TUTOR'] : survey.audience === 'TEACHERS' ? ['TEACHER'] : ['TUTOR', 'TEACHER']);
  const [branchId, setBranchId] = React.useState(survey.branch?.id ?? (is('DIRECTOR') ? me?.branch?.id ?? '' : ''));
  const [deadline, setDeadline] = React.useState(survey.deadline ? dayjs(survey.deadline).format('YYYY-MM-DDTHH:mm') : dayjs().add(3, 'day').hour(18).minute(0).format('YYYY-MM-DDTHH:mm'));
  const [search, setSearch] = React.useState('');
  const dq = useDebounce(search);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const users = useQuery({
    queryKey: ['users', 'pick', dq, branchId],
    queryFn: () => api.get<Paginated<User>>('/api/users', { limit: 200, status: 'ACTIVE', search: dq || undefined, branchId: branchId || undefined }),
    enabled: open && mode === 'custom',
  });
  const preview = useQuery({
    queryKey: ['users', 'preview', roles.join(','), branchId],
    queryFn: async () => {
      const res = await Promise.all(roles.map((r) => api.get<Paginated<User>>('/api/users', { limit: 1, status: 'ACTIVE', role: r, branchId: branchId || undefined })));
      return res.reduce((s, r) => s + r.total, 0);
    },
    enabled: open && mode === 'audience' && roles.length > 0,
  });

  const send = useMutation({
    mutationFn: () => api.post<{ recipients: number; notified: number }>(`/api/surveys/${survey.id}/send`, mode === 'custom' ? { userIds: [...selected], deadline: deadline || null } : { roles, branchId: branchId || undefined, deadline: deadline || null }),
    onSuccess: (r) => {
      toast.success(`${r.recipients} xodimga yuborildi (${r.notified} Telegram orqali xabardor qilindi)`);
      void qc.invalidateQueries({ queryKey: ['surveys'] });
      void qc.invalidateQueries({ queryKey: ['survey', survey.id] });
      onSent?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });

  const toggleRole = (r: RoleKey) => setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));
  const toggleUser = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const staff = (users.data?.items ?? []).filter((u) => u.role.key === 'TUTOR' || u.role.key === 'TEACHER');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="size-4" /> So‘rovnomani yuborish</DialogTitle>
          <DialogDescription>«{survey.title}» tanlangan xodimlarga Telegram orqali yuboriladi va faol holatga o‘tadi.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'audience' | 'custom')}>
          <TabsList className="w-full"><TabsTrigger value="audience">Auditoriya bo‘yicha</TabsTrigger><TabsTrigger value="custom">Xodimlarni tanlash</TabsTrigger></TabsList>
          <TabsContent value="audience" className="space-y-4">
            <div className="space-y-2">
              <Label>Kimga</Label>
              <div className="flex gap-2">
                {(['TUTOR', 'TEACHER'] as RoleKey[]).map((r) => (
                  <label key={r} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition-colors ${roles.includes(r) ? 'border-primary bg-primary/5' : ''}`}>
                    <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} /> {r === 'TUTOR' ? 'Tutorlar' : 'O‘qituvchilar'}
                  </label>
                ))}
              </div>
            </div>
            {!is('DIRECTOR') && (
              <div className="space-y-2">
                <Label>Filial</Label>
                <Select value={branchId || '__all'} onValueChange={(v) => setBranchId(v === '__all' ? '' : v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Barcha filiallar</SelectItem>
                    {branches.data?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="bg-muted/60 flex items-center gap-2 rounded-xl p-3 text-sm"><Users className="text-muted-foreground size-4" /> Taxminan <b className="tabular">{preview.data ?? '…'}</b> nafar faol xodim oladi</div>
          </TabsContent>
          <TabsContent value="custom" className="space-y-3">
            <Input placeholder="Ism bo‘yicha qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <ScrollArea className="h-64 rounded-xl border">
              <div className="p-1">
                {staff.map((u) => (
                  <label key={u.id} className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5">
                    <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggleUser(u.id)} />
                    <UserCell name={u.fullName} sub={`${u.role.name} · ${u.branch?.name ?? '—'}`} size="sm" />
                  </label>
                ))}
                {users.isLoading && <div className="text-muted-foreground p-4 text-center text-sm">Yuklanmoqda…</div>}
                {!users.isLoading && staff.length === 0 && <div className="text-muted-foreground p-4 text-center text-sm">Topilmadi</div>}
              </div>
            </ScrollArea>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{selected.size} ta tanlandi</span>
              <button type="button" className="text-primary hover:underline" onClick={() => setSelected(new Set(staff.map((u) => u.id)))}>Barchasini tanlash</button>
            </div>
          </TabsContent>
        </Tabs>
        <div className="space-y-2">
          <Label>Muddat (deadline)</Label>
          <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button onClick={() => send.mutate()} loading={send.isPending} disabled={mode === 'custom' ? selected.size === 0 : roles.length === 0}><Send /> Yuborish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleDialog({ survey, open, onOpenChange }: { survey: Survey; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [at, setAt] = React.useState(dayjs().add(1, 'day').hour(9).minute(0).format('YYYY-MM-DDTHH:mm'));
  const [deadline, setDeadline] = React.useState(dayjs().add(4, 'day').hour(18).minute(0).format('YYYY-MM-DDTHH:mm'));
  const m = useMutation({
    mutationFn: () => api.post(`/api/surveys/${survey.id}/schedule`, { scheduledAt: new Date(at).toISOString(), deadline: deadline ? new Date(deadline).toISOString() : null }),
    onSuccess: () => { toast.success('So‘rovnoma rejalashtirildi'); void qc.invalidateQueries({ queryKey: ['surveys'] }); void qc.invalidateQueries({ queryKey: ['survey', survey.id] }); onOpenChange(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Rejalashtirish</DialogTitle><DialogDescription>So‘rovnoma belgilangan vaqtda auditoriyaga avtomatik yuboriladi ({survey.audience === 'TUTORS' ? 'tutorlar' : survey.audience === 'TEACHERS' ? 'o‘qituvchilar' : survey.audience === 'BRANCH' ? survey.branch?.name : 'barcha xodimlar'}).</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Yuborish vaqti</Label><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Muddat</Label><Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button onClick={() => m.mutate()} loading={m.isPending}>Rejalashtirish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
