'use client';
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Bot, Server, Globe, Clock, Shield, ExternalLink, CheckCircle2, XCircle, Copy, KeyRound, Info } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRoles } from '@/lib/queries';
import { ROLE_LABELS } from '@/lib/labels';
import type { RoleKey } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Settings = { values: Record<string, unknown>; system: { version: string; env: string; botMode: string; botConfigured: boolean; webUrl: string; apiUrl: string; timezone: string } };
type BotInfo = { running: boolean; username: string | null; name?: string; mode: string; webhook?: string | null; pendingUpdates?: number; link?: string; error?: string };

const PERM_GROUPS: Record<string, string> = { dashboard: 'Bosh sahifa', analytics: 'Analitika', kpi: 'KPI', users: 'Foydalanuvchilar', branches: 'Filiallar', departments: 'Bo‘limlar', surveys: 'So‘rovnomalar', reports: 'Hisobotlar', announcements: 'E’lonlar', tasks: 'Vazifalar', notifications: 'Bildirishnomalar', settings: 'Sozlamalar', audit: 'Audit' };

export default function SettingsPage() {
  const qc = useQueryClient();
  const { can, user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/api/settings') });
  const bot = useQuery({ queryKey: ['settings', 'bot'], queryFn: () => api.get<BotInfo>('/api/settings/bot'), refetchInterval: 30_000 });
  const roles = useRoles();
  const [v, setV] = React.useState<Record<string, unknown>>({});
  React.useEffect(() => { if (data) setV(data.values); }, [data]);
  const save = useMutation({ mutationFn: () => api.put('/api/settings', v), onSuccess: () => { toast.success('Sozlamalar saqlandi'); void qc.invalidateQueries({ queryKey: ['settings'] }); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });
  const set = (k: string, val: unknown) => setV((s) => ({ ...s, [k]: val }));
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success('Nusxalandi'); };

  if (isLoading || !data) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-64" /></div>;
  const s = data.system;

  return (
    <div>
      <PageHeader title="Sozlamalar" description="Tashkilot, so‘rovnoma va hisobot qoidalari, Telegram bot holati" actions={can('settings.manage') && <Button onClick={() => save.mutate()} loading={save.isPending}><Save /> Saqlash</Button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Tashkilot</CardTitle><CardDescription>Bot va panelda ko‘rsatiladigan asosiy ma’lumotlar</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label>Maktab nomi</Label><Input value={String(v['org.name'] ?? '')} onChange={(e) => set('org.name', e.target.value)} disabled={!can('settings.manage')} /></div>
              <div className="space-y-1.5"><Label>Vaqt mintaqasi</Label><Input value={String(v['org.timezone'] ?? '')} onChange={(e) => set('org.timezone', e.target.value)} disabled={!can('settings.manage')} /></div>
              <div className="space-y-1.5"><Label>Asosiy til</Label><Select value={String(v['org.language'] ?? 'UZ')} onValueChange={(x) => set('org.language', x)} disabled={!can('settings.manage')}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UZ">O‘zbekcha</SelectItem><SelectItem value="RU">Русский (tez orada)</SelectItem><SelectItem value="EN">English (tez orada)</SelectItem></SelectContent></Select></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>So‘rovnoma va hisobot qoidalari</CardTitle><CardDescription>Avtomatik muddatlar va eslatmalar</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Standart muddat (soat)</Label><Input type="number" min={1} value={Number(v['survey.defaultDeadlineHours'] ?? 48)} onChange={(e) => set('survey.defaultDeadlineHours', Number(e.target.value))} disabled={!can('settings.manage')} /><p className="text-muted-foreground text-xs">Muddat ko‘rsatilmasa, yuborilgandan keyin shuncha soat</p></div>
              <div className="space-y-1.5"><Label>Eslatma (muddatdan necha soat oldin)</Label><Input type="number" min={1} value={Number(v['survey.reminderHoursBefore'] ?? 3)} onChange={(e) => set('survey.reminderHoursBefore', Number(e.target.value))} disabled={!can('settings.manage')} /></div>
              <div className="space-y-1.5"><Label>Kunlik hisobot muddati</Label><Input type="time" value={String(v['reports.dailyDeadline'] ?? '20:00')} onChange={(e) => set('reports.dailyDeadline', e.target.value)} disabled={!can('settings.manage')} /><p className="text-muted-foreground text-xs">Har kuni 18:00 da topshirmaganlarga eslatma yuboriladi</p></div>
              <div className="space-y-1.5"><Label>Haftalik hisobot kuni</Label><Select value={String(v['reports.weeklyDay'] ?? 5)} onValueChange={(x) => set('reports.weeklyDay', Number(x))} disabled={!can('settings.manage')}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'].map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent></Select></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(v['notifications.telegramEnabled'] ?? true)} onCheckedChange={(x) => set('notifications.telegramEnabled', x)} disabled={!can('settings.manage')} /> Telegram bildirishnomalari yoqilgan</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(v['kpi.autoComputeWeekly'] ?? true)} onCheckedChange={(x) => set('kpi.autoComputeWeekly', x)} disabled={!can('settings.manage')} /> KPI ni avtomatik hisoblash (yakshanba 23:30)</label>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="size-4" /> Rollar va ruxsatlar</CardTitle><CardDescription>RBAC — har bir rol uchun tizimdagi imkoniyatlar</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {roles.data?.map((r) => <div key={r.key} className="rounded-xl border p-3"><div className="flex items-center justify-between"><span className="font-medium">{ROLE_LABELS[r.key as RoleKey] ?? r.name}</span><Badge variant="muted">{r._count.users}</Badge></div><div className="text-muted-foreground mt-1 text-xs">{{ SUPER_ADMIN: 'Barcha huquqlar', DIRECTOR: 'Filial doirasida boshqaruv', CEO: 'Biznes analitika (faqat ko‘rish)', HR_ADMIN: 'Xodimlar va so‘rovnomalar', TUTOR: 'Telegram bot', TEACHER: 'Telegram bot' }[r.key] ?? ''}</div></div>)}
              </div>
              {user && <div className="mt-4"><div className="mb-2 text-sm font-medium">Sizning ruxsatlaringiz ({ROLE_LABELS[user.role.key]})</div><div className="flex flex-wrap gap-1">{Object.entries(user.permissions.reduce((m, p) => { const g = p.split('.')[0]; (m[g] ??= []).push(p.split('.')[1]); return m; }, {} as Record<string, string[]>)).map(([g, ps]) => <Badge key={g} variant="secondary" className="font-normal">{PERM_GROUPS[g] ?? g}: {ps.join(', ')}</Badge>)}</div></div>}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card id="bot">
            <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-4" /> Telegram bot</CardTitle><CardAction>{bot.data?.running ? <Badge variant="success"><CheckCircle2 /> Ishlayapti</Badge> : <Badge variant="destructive"><XCircle /> Ulanmagan</Badge>}</CardAction></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {bot.isLoading ? <Skeleton className="h-20" /> : (
                <>
                  <Row label="Bot">{bot.data?.username ? <a href={bot.data.link} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">@{bot.data.username} <ExternalLink className="size-3" /></a> : '—'}</Row>
                  <Row label="Rejim">{bot.data?.mode ?? s.botMode}</Row>
                  {bot.data?.webhook !== undefined && <Row label="Webhook">{bot.data.webhook ? <span className="truncate text-xs">{bot.data.webhook}</span> : 'yo‘q (polling)'}</Row>}
                  {bot.data?.pendingUpdates !== undefined && <Row label="Navbatda">{bot.data.pendingUpdates} update</Row>}
                  {bot.data?.error && <div className="bg-destructive/10 text-destructive rounded-lg p-2 text-xs">{bot.data.error}</div>}
                  <div className="bg-muted/60 rounded-xl p-3 text-xs"><div className="mb-1 flex items-center gap-1 font-medium"><Info className="size-3.5" /> Xodimni botga ulash</div><ol className="text-muted-foreground list-inside list-decimal space-y-0.5"><li>Xodimni telefon raqami bilan qo‘shing</li><li>Xodim botda <b>/start</b> → «📱 Telefon raqam orqali» bosadi</li><li>Yoki profilingizdagi kod bilan <b>/link KOD</b></li></ol></div>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Server className="size-4" /> Tizim</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Versiya">v{s.version}</Row>
              <Row label="Muhit"><Badge variant={s.env === 'production' ? 'success' : 'warning'}>{s.env}</Badge></Row>
              <Row label="API"><button className="inline-flex items-center gap-1 text-xs hover:underline" onClick={() => copy(s.apiUrl)}>{s.apiUrl} <Copy className="size-3" /></button></Row>
              <Row label="Veb"><span className="text-xs">{s.webUrl}</span></Row>
              <Row label="Vaqt mintaqasi"><span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> {s.timezone}</span></Row>
              <div className="pt-2"><Button variant="outline" size="sm" asChild className="w-full"><a href="/api/docs" target="_blank" rel="noreferrer"><Globe /> API hujjatlari (Swagger)</a></Button></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> Xavfsizlik</CardTitle></CardHeader>
            <CardContent className="text-muted-foreground space-y-1.5 text-xs">
              <p>• JWT (15 daqiqa) + httpOnly refresh cookie (30 kun)</p><p>• Parollar bcrypt bilan xeshlanadi</p><p>• So‘rovlar limiti: login 10/15 daq, API 300/daq</p><p>• Telegram: telefon / kod orqali tasdiqlash, PENDING holat</p><p>• Barcha muhim amallar audit jurnaliga yoziladi</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground shrink-0 text-xs">{label}</span><span className="min-w-0 truncate text-right font-medium">{children}</span></div>; }
