'use client';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { RoleKey, User, UserStatus } from '@/lib/types';
import { ROLE_LABELS, USER_STATUS } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { useBranches, useDepartments, useRoles } from '@/lib/queries';
import { initials } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Roles that work in the web panel (need login + password). Others mostly use the Telegram bot. */
const WEB_ROLES: RoleKey[] = ['SUPER_ADMIN', 'DIRECTOR', 'CEO', 'HR_ADMIN', 'ACCOUNTANT', 'ADMINISTRATOR', 'DORM_MANAGER', 'RECEPTION', 'MARKETING', 'IT_ADMIN', 'CUSTOM'];
const MANAGEMENT: RoleKey[] = ['SUPER_ADMIN', 'DIRECTOR', 'CEO', 'IT_ADMIN'];
const POSITIONS: Record<string, string> = { SUPER_ADMIN: 'Bosh Admin', DIRECTOR: 'Direktor', CEO: 'CEO', HR_ADMIN: 'HR menejer', ACCOUNTANT: 'Buxgalter', ADMINISTRATOR: 'Administrator', DORM_MANAGER: 'Yotoqxona komendanti', RECEPTION: 'Reception', MARKETING: 'Marketing menejeri', IT_ADMIN: 'IT administrator', TEACHER: "O'qituvchi", TUTOR: 'Tutor', PARENT: 'Ota-ona', STUDENT: "O'quvchi" };

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + '!';
}

export function UserFormDialog({ open, onOpenChange, user, defaultRole, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; user?: User | null; defaultRole?: RoleKey; onSaved?: (u: User) => void }) {
  const qc = useQueryClient();
  const { user: me, is } = useAuth();
  const branches = useBranches();
  const roles = useRoles();
  const [showPw, setShowPw] = React.useState(false);
  const [form, setForm] = React.useState({
    firstName: '', lastName: '', email: '', phone: '+998', password: '', roleId: '', branchId: '', departmentId: '', position: '', status: 'ACTIVE' as UserStatus, telegramUsername: '', telegramId: '', avatarUrl: '', notes: '',
  });
  const departments = useDepartments(form.branchId || undefined);

  // Which roles can the current actor assign? Mirrors the API rule (assertRoleAssignable).
  const assignable = React.useMemo(() => {
    const all = roles.data ?? [];
    if (is('SUPER_ADMIN')) return all;
    if (is('DIRECTOR', 'HR_ADMIN', 'IT_ADMIN')) return all.filter((r) => !MANAGEMENT.includes(r.key as RoleKey));
    if (is('ADMINISTRATOR', 'RECEPTION')) return all.filter((r) => ['PARENT', 'STUDENT'].includes(r.key));
    return all.filter((r) => ['TUTOR', 'TEACHER'].includes(r.key));
  }, [roles.data, is]);

  React.useEffect(() => {
    if (!open) return;
    if (user) {
      const [firstName, ...rest] = user.fullName.split(' ');
      setForm({ firstName, lastName: rest.join(' '), email: user.email ?? '', phone: user.phone ?? '', password: '', roleId: user.role.id ?? '', branchId: user.branch?.id ?? '', departmentId: user.department?.id ?? '', position: user.position ?? '', status: user.status, telegramUsername: user.telegramUsername ?? '', telegramId: user.telegramId ?? '', avatarUrl: user.avatarUrl ?? '', notes: user.notes ?? '' });
    } else {
      const def = (roles.data ?? []).find((r) => r.key === (defaultRole ?? 'TEACHER'))?.id ?? '';
      setForm({ firstName: '', lastName: '', email: '', phone: '+998', password: '', roleId: def, branchId: is('DIRECTOR', 'ADMINISTRATOR') ? (me?.branch?.id ?? '') : '', departmentId: '', position: POSITIONS[defaultRole ?? 'TEACHER'] ?? '', status: 'ACTIVE', telegramUsername: '', telegramId: '', avatarUrl: '', notes: '' });
    }
  }, [open, user, defaultRole, is, me, roles.data]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const role = roles.data?.find((r) => r.id === form.roleId);
  const roleKey = (role?.key ?? 'TEACHER') as RoleKey;
  const needsLogin = WEB_ROLES.includes(roleKey);
  const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        fullName, email: form.email.trim() || null, phone: form.phone.trim() || null, roleId: form.roleId, branchId: form.branchId || null, departmentId: form.departmentId || null, position: form.position.trim() || null, status: form.status,
        telegramUsername: form.telegramUsername.trim().replace(/^@/, '') || null, telegramId: form.telegramId.trim() || null, avatarUrl: form.avatarUrl.trim() || null, notes: form.notes.trim() || null,
      };
      if (form.password) payload.password = form.password;
      return user ? api.patch<User>(`/api/users/${user.id}`, payload) : api.post<User>('/api/users', payload);
    },
    onSuccess: (u) => {
      toast.success(user ? 'Xodim yangilandi' : `${u.fullName} qo'shildi${form.password ? '. Login va parolni xodimga yetkazing.' : ''}`);
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['user', u.id] });
      void qc.invalidateQueries({ queryKey: ['staff'] });
      void qc.invalidateQueries({ queryKey: ['users-roles'] });
      onSaved?.(u);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{user ? 'Xodimni tahrirlash' : 'Xodim qo\'shish'}</DialogTitle>
          <DialogDescription>{needsLogin ? 'Bu rol veb-panelga login (email) va parol bilan kiradi. Telegram ID ulansa botdan ham foydalanadi.' : "O'qituvchi, tutor, ota-ona va o'quvchilar asosan Telegram bot orqali ishlaydi — telefon raqami ulash uchun kerak."}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div className="flex items-center gap-4 sm:col-span-2">
            <Avatar className="size-16 rounded-2xl"><AvatarImage src={form.avatarUrl || undefined} /><AvatarFallback className="rounded-2xl text-lg">{fullName ? initials(fullName) : '?'}</AvatarFallback></Avatar>
            <div className="flex-1 space-y-1.5"><Label>Rasm (URL)</Label><Input value={form.avatarUrl} onChange={(e) => set('avatarUrl')(e.target.value)} placeholder="https://…/photo.jpg" /></div>
          </div>
          <div className="space-y-1.5"><Label>Ism *</Label><Input value={form.firstName} onChange={(e) => set('firstName')(e.target.value)} required minLength={2} placeholder="Baxtbek" /></div>
          <div className="space-y-1.5"><Label>Familiya *</Label><Input value={form.lastName} onChange={(e) => set('lastName')(e.target.value)} required minLength={2} placeholder="Jumayev" /></div>
          <div className="space-y-1.5"><Label>Telefon *</Label><Input value={form.phone} onChange={(e) => set('phone')(e.target.value)} required placeholder="+998 90 000 00 00" /></div>
          <div className="space-y-1.5"><Label>Telegram username</Label><Input value={form.telegramUsername} onChange={(e) => set('telegramUsername')(e.target.value)} placeholder="@username" /></div>
          <div className="space-y-1.5"><Label>Telegram ID</Label><Input inputMode="numeric" value={form.telegramId} onChange={(e) => set('telegramId')(e.target.value.replace(/\D/g, ''))} placeholder="123456789 (ixtiyoriy — /start bosganda avtomatik)" /></div>
          <div className="space-y-1.5">
            <Label>Rol *</Label>
            <Select value={form.roleId} onValueChange={(v) => { set('roleId')(v); const r = roles.data?.find((x) => x.id === v); if (r && !form.position) set('position')(POSITIONS[r.key] ?? r.name); }} disabled={!!user && user.id === me?.id}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
              <SelectContent>{assignable.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}{r.key !== 'CUSTOM' && r.name !== ROLE_LABELS[r.key as RoleKey] ? ` (${ROLE_LABELS[r.key as RoleKey]})` : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Lavozim</Label><Input value={form.position} onChange={(e) => set('position')(e.target.value)} placeholder="Masalan: Matematika o'qituvchisi" /></div>
          <div className="space-y-1.5">
            <Label>Filial</Label>
            <Select value={form.branchId || '__none'} onValueChange={(v) => { set('branchId')(v === '__none' ? '' : v); set('departmentId')(''); }} disabled={is('DIRECTOR', 'ADMINISTRATOR')}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
              <SelectContent><SelectItem value="__none">— Barcha filiallar —</SelectItem>{branches.data?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Bo'lim</Label>
            <Select value={form.departmentId || '__none'} onValueChange={(v) => set('departmentId')(v === '__none' ? '' : v)} disabled={!form.branchId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Tanlang" /></SelectTrigger>
              <SelectContent><SelectItem value="__none">— Yo'q —</SelectItem>{departments.data?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Login (email) {needsLogin && '*'}</Label><Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} required={needsLogin} placeholder="ism@target-school.uz" autoComplete="off" /></div>
          <div className="space-y-1.5">
            <Label>{user ? 'Yangi parol (ixtiyoriy)' : `Parol ${needsLogin ? '*' : '(ixtiyoriy)'}`}</Label>
            <div className="flex gap-1.5">
              <div className="relative flex-1"><Input type={showPw ? 'text' : 'password'} value={form.password} onChange={(e) => set('password')(e.target.value)} required={needsLogin && !user} minLength={8} placeholder="Kamida 8 ta belgi" autoComplete="new-password" className="pr-9" /><button type="button" onClick={() => setShowPw((s) => !s)} className="text-muted-foreground absolute top-1/2 right-2.5 -translate-y-1/2">{showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
              <Button type="button" variant="outline" size="icon" title="Parol yaratish" onClick={() => { set('password')(genPassword()); setShowPw(true); }}><Wand2 /></Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Holat</Label>
            <Select value={form.status} onValueChange={(v) => set('status')(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(USER_STATUS) as UserStatus[]).map((s) => <SelectItem key={s} value={s}>{USER_STATUS[s].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Izoh</Label><Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Ichki eslatma" className="min-h-9" rows={1} /></div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
            <Button type="submit" loading={mut.isPending} disabled={!form.roleId || !fullName}>{user ? 'Saqlash' : 'Qo\'shish'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
