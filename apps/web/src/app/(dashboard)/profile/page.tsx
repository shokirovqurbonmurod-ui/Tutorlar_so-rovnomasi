'use client';
import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Send, Copy, Check, RefreshCw, Mail, Phone, Building2, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS, USER_STATUS } from '@/lib/labels';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/shared/status-badge';
import { initials, fmtDateTime } from '@/lib/utils';

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [pw, setPw] = React.useState({ current: '', next: '', confirm: '' });
  const [code, setCode] = React.useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const change = useMutation({ mutationFn: () => { if (pw.next !== pw.confirm) throw new Error('Parollar mos emas'); if (pw.next.length < 8) throw new Error('Yangi parol kamida 8 ta belgi'); return api.post('/api/auth/change-password', { currentPassword: pw.current, newPassword: pw.next }); }, onSuccess: () => { toast.success('Parol o‘zgartirildi'); setPw({ current: '', next: '', confirm: '' }); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });
  const link = useMutation({ mutationFn: () => api.post<{ code: string; expiresAt: string }>('/api/auth/telegram-link-code'), onSuccess: (r) => setCode(r), onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });
  if (!user) return null;
  return (
    <div>
      <PageHeader title="Profil" description="Shaxsiy ma’lumotlar, parol va Telegram ulanishi" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center text-center">
            <Avatar className="size-20"><AvatarImage src={user.avatarUrl ?? undefined} /><AvatarFallback className="text-xl">{initials(user.fullName)}</AvatarFallback></Avatar>
            <h3 className="mt-3 text-lg font-semibold">{user.fullName}</h3>
            <div className="mt-1 flex gap-1.5"><Badge variant="primary">{ROLE_LABELS[user.role.key]}</Badge><StatusBadge value={user.status} map={USER_STATUS} /></div>
            <div className="mt-5 w-full space-y-2 text-left text-sm">
              <Row icon={Mail} label="Email" value={user.email} /><Row icon={Phone} label="Telefon" value={user.phone} /><Row icon={Building2} label="Filial" value={user.branch?.name} /><Row icon={Briefcase} label="Lavozim" value={user.position} />
              <div className="text-muted-foreground pt-2 text-xs">So‘nggi kirish: {fmtDateTime(user.lastLoginAt)}</div>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          <Card id="password">
            <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> Parolni o‘zgartirish</CardTitle><CardDescription>Kamida 8 ta belgi. O‘zgartirilgach, boshqa qurilmalardagi sessiyalar yopiladi.</CardDescription></CardHeader>
            <CardContent>
              <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); change.mutate(); }}>
                <div className="space-y-1.5"><Label>Joriy parol</Label><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoComplete="current-password" /></div>
                <div className="space-y-1.5"><Label>Yangi parol</Label><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} autoComplete="new-password" /></div>
                <div className="space-y-1.5"><Label>Takrorlang</Label><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required autoComplete="new-password" /></div>
                <div className="sm:col-span-3"><Button type="submit" loading={change.isPending}>Saqlash</Button></div>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Send className="size-4" /> Telegram</CardTitle><CardDescription>{user.telegramId ? `Ulangan: ${user.telegramUsername ? '@' + user.telegramUsername : 'ID ' + user.telegramId}. Admin buyruqlari (/admin, /analytics) botda ishlaydi.` : 'Hisobingizni botga ulang — admin xabarlari va tezkor statistika Telegramda.'}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {code ? (
                <div className="bg-muted/60 flex flex-col items-center gap-2 rounded-xl p-4 text-center">
                  <div className="text-muted-foreground text-xs">Botga quyidagi buyruqni yuboring (10 daqiqa amal qiladi)</div>
                  <code className="bg-card rounded-lg border px-4 py-2 text-xl font-bold tracking-widest">/link {code.code}</code>
                  <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(`/link ${code.code}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check /> : <Copy />} Nusxalash</Button><Button size="sm" variant="ghost" onClick={() => void refresh()}><RefreshCw /> Tekshirish</Button></div>
                </div>
              ) : <Button variant={user.telegramId ? 'outline' : 'default'} onClick={() => link.mutate()} loading={link.isPending}><Send /> {user.telegramId ? 'Qayta ulash kodi' : 'Ulash kodini olish'}</Button>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
function Row({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) { return <div className="flex items-center gap-2"><Icon className="text-muted-foreground size-4" /><span className="text-muted-foreground w-16 text-xs">{label}</span><span className="truncate font-medium">{value || '—'}</span></div>; }
