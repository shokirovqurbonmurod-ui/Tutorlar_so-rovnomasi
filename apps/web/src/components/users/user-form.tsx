'use client';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { RoleKey, User, UserStatus } from '@/lib/types';
import { ROLE_LABELS, USER_STATUS } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { useBranches, useDepartments } from '@/lib/queries';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MGMT: RoleKey[] = ['SUPER_ADMIN', 'DIRECTOR', 'CEO', 'HR_ADMIN'];

export function UserFormDialog({ open, onOpenChange, user, defaultRole, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; user?: User | null; defaultRole?: RoleKey; onSaved?: (u: User) => void }) {
  const qc = useQueryClient();
  const { user: me, is } = useAuth();
  const branches = useBranches();
  const [form, setForm] = React.useState({
    fullName: '', email: '', phone: '', password: '', role: (defaultRole ?? 'TUTOR') as RoleKey, branchId: '', departmentId: '', position: '', status: 'ACTIVE' as UserStatus, telegramUsername: '', notes: '',
  });
  const departments = useDepartments(form.branchId || undefined);

  React.useEffect(() => {
    if (!open) return;
    if (user) {
      setForm({ fullName: user.fullName, email: user.email ?? '', phone: user.phone ?? '', password: '', role: user.role.key, branchId: user.branch?.id ?? '', departmentId: user.department?.id ?? '', position: user.position ?? '', status: user.status, telegramUsername: user.telegramUsername ?? '', notes: user.notes ?? '' });
    } else {
      setForm({ fullName: '', email: '', phone: '', password: '', role: defaultRole ?? 'TUTOR', branchId: is('DIRECTOR') ? (me?.branch?.id ?? '') : '', departmentId: '', position: '', status: 'ACTIVE', telegramUsername: '', notes: '' });
    }
  }, [open, user, defaultRole, is, me]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const assignableRoles: RoleKey[] = is('SUPER_ADMIN') ? ['SUPER_ADMIN', 'DIRECTOR', 'CEO', 'HR_ADMIN', 'TUTOR', 'TEACHER'] : is('DIRECTOR') ? ['HR_ADMIN', 'TUTOR', 'TEACHER'] : ['TUTOR', 'TEACHER'];
  const isMgmt = MGMT.includes(form.role);

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        fullName: form.fullName.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, role: form.role, branchId: form.branchId || null, departmentId: form.departmentId || null, position: form.position.trim() || null, status: form.status, telegramUsername: form.telegramUsername.trim() || null, notes: form.notes.trim() || null,
      };
      if (form.password) payload.password = form.password;
      return user ? api.patch<User>(`/api/users/${user.id}`, payload) : api.post<User>('/api/users', payload);
    },
    onSuccess: (u) => {
      toast.success(user ? 'Foydalanuvchi yangilandi' : 'Foydalanuvchi yaratildi');
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['user', u.id] });
      onSaved?.(u);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{user ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi'}</DialogTitle>
          <DialogDescription>{isMgmt ? 'Boshqaruv xodimlari veb-panelga email va parol bilan kiradi.' : 'Tutor va o‘qituvchilar Telegram bot orqali ishlaydi — telefon raqami ulash uchun kerak.'}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label>To‘liq ism *</Label>
            <Input value={form.fullName} onChange={(e) => set('fullName')(e.target.value)} required minLength={2} placeholder="Ism Familiya" />
          </div>
          <div className="space-y-1.5">
            <Label>Rol *</Label>
            <Select value={form.role} onValueChange={(v) => set('role')(v)} disabled={!!user && user.id === me?.id}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{assignableRoles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Holat</Label>
            <Select value={form.status} onValueChange={(v) => set('status')(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(USER_STATUS) as UserStatus[]).map((s) => <SelectItem key={s} value={s}>{USER_STATUS[s].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Email {isMgmt && '*'}</Label>
            <Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} required={isMgmt} placeholder="user@maktab.uz" />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon {!isMgmt && '*'}</Label>
            <Input value={form.phone} onChange={(e) => set('phone')(e.target.value)} required={!isMgmt} placeholder="+998901234567" />
          </div>
          {isMgmt && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{user ? 'Yangi parol (ixtiyoriy)' : 'Parol *'}</Label>
              <Input type="password" value={form.password} onChange={(e) => set('password')(e.target.value)} required={!user} minLength={8} placeholder="Kamida 8 ta belgi" autoComplete="new-password" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Filial</Label>
            <Select value={form.branchId || '__none'} onValueChange={(v) => { set('branchId')(v === '__none' ? '' : v); set('departmentId')(''); }} disabled={is('DIRECTOR')}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Yo‘q —</SelectItem>
                {branches.data?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Bo‘lim</Label>
            <Select value={form.departmentId || '__none'} onValueChange={(v) => set('departmentId')(v === '__none' ? '' : v)} disabled={!form.branchId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Yo‘q —</SelectItem>
                {departments.data?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Lavozim</Label>
            <Input value={form.position} onChange={(e) => set('position')(e.target.value)} placeholder="Masalan: Matematika o‘qituvchisi" />
          </div>
          <div className="space-y-1.5">
            <Label>Telegram username</Label>
            <Input value={form.telegramUsername} onChange={(e) => set('telegramUsername')(e.target.value)} placeholder="@username" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Izoh</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Ichki eslatma (faqat adminlar ko‘radi)" className="min-h-16" />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
            <Button type="submit" loading={mut.isPending}>{user ? 'Saqlash' : 'Yaratish'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
