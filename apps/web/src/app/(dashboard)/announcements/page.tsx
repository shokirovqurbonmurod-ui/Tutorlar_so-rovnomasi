'use client';
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Megaphone, Pin, Eye, Send, Trash2, Pencil, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Announcement, Paginated, SurveyAudience } from '@/lib/types';
import { PRIORITY, AUDIENCE } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { useBranches } from '@/lib/queries';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { fmtDateTime, fromNow, cn } from '@/lib/utils';

type AnnDetail = Announcement & { reads: Array<{ id: string; readAt: string; user: { id: string; fullName: string } }> };

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['announcements', page], queryFn: () => api.get<Paginated<Announcement>>('/api/announcements', { page, limit: 20 }) });
  const [form, setForm] = React.useState<{ open: boolean; item?: Announcement | null }>({ open: false });
  const [del, setDel] = React.useState<Announcement | null>(null);
  const [view, setView] = React.useState<string | null>(null);
  const inv = () => void qc.invalidateQueries({ queryKey: ['announcements'] });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/api/announcements/${id}`), onSuccess: () => { toast.success('O‘chirildi'); setDel(null); inv(); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });
  const resend = useMutation({ mutationFn: (id: string) => api.post<{ sent: number }>(`/api/announcements/${id}/resend`), onSuccess: (r) => { toast.success(`${r.sent ?? ''} xodimga qayta yuborildi`); inv(); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik') });

  return (
    <div>
      <PageHeader title="E’lonlar" description="Xodimlarga Telegram orqali yuboriladigan e’lonlar va ularning o‘qilganlik statistikasi" actions={can('announcements.manage') && <Button onClick={() => setForm({ open: true, item: null })}><Plus /> Yangi e’lon</Button>} />
      {isLoading ? <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div> : !data?.items.length ? <Card><EmptyState icon={Megaphone} title="E’lonlar yo‘q" /></Card> : (
        <div className="stagger space-y-3">
          {data.items.map((a) => {
            const reads = a.readCount ?? a._count?.reads ?? 0;
            const target = a.targetCount ?? a.sentCount ?? 0;
            const p = target ? Math.round((reads / target) * 100) : 0;
            return (
              <Card key={a.id} className={cn('card-hover cursor-pointer gap-3 py-4', a.isPinned && 'border-primary/40')} onClick={() => setView(a.id)}>
                <div className="flex items-start justify-between gap-3 px-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {a.isPinned && <Badge variant="primary"><Pin /> Qadalgan</Badge>}
                      <StatusBadge value={a.priority} map={PRIORITY} />
                      <Badge variant="outline"><Users /> {AUDIENCE[a.audience]}{a.branch ? ` · ${a.branch.code ?? a.branch.name}` : ''}</Badge>
                    </div>
                    <h3 className="mt-2 font-semibold">{a.title}</h3>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm whitespace-pre-line">{a.body}</p>
                  </div>
                  {can('announcements.manage') && <div className="flex shrink-0" onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="icon-sm" title="Qayta yuborish" onClick={() => resend.mutate(a.id)}><Send /></Button><Button variant="ghost" size="icon-sm" onClick={() => setForm({ open: true, item: a })}><Pencil /></Button><Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDel(a)}><Trash2 /></Button></div>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 pt-3 text-xs">
                  <span className="text-muted-foreground">{a.author?.fullName} · {fromNow(a.publishAt ?? a.createdAt)}</span>
                  <span className="inline-flex items-center gap-1"><Send className="size-3.5" /> {a.sentCount} yuborilgan</span>
                  <span className="inline-flex items-center gap-1"><Eye className="size-3.5" /> {reads} o‘qigan</span>
                  <div className="flex min-w-32 flex-1 items-center gap-2"><Progress value={p} className="h-1.5" /><span className="tabular">{p}%</span></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <AnnouncementForm open={form.open} onOpenChange={(o) => setForm({ ...form, open: o })} item={form.item} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="E’lonni o‘chirish" description={`«${del?.title}» o‘chiriladi.`} destructive confirmText="O‘chirish" loading={remove.isPending} onConfirm={() => { if (del) remove.mutate(del.id); }} />
      <Sheet open={!!view} onOpenChange={(o) => !o && setView(null)}><SheetContent className="sm:max-w-lg">{view && <AnnouncementView id={view} />}</SheetContent></Sheet>
    </div>
  );
}

function AnnouncementView({ id }: { id: string }) {
  const { data: a } = useQuery({ queryKey: ['announcement', id], queryFn: () => api.get<AnnDetail>(`/api/announcements/${id}`) });
  if (!a) return <div className="p-5 text-sm">Yuklanmoqda…</div>;
  return (
    <>
      <SheetHeader><div className="flex gap-1.5"><StatusBadge value={a.priority} map={PRIORITY} />{a.isPinned && <Badge variant="primary"><Pin /> Qadalgan</Badge>}</div><SheetTitle className="text-lg leading-snug">{a.title}</SheetTitle><SheetDescription>{a.author?.fullName} · {fmtDateTime(a.publishAt ?? a.createdAt)} · {AUDIENCE[a.audience]}{a.branch ? ` · ${a.branch.name}` : ''}</SheetDescription></SheetHeader>
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <div className="text-sm leading-relaxed whitespace-pre-wrap">{a.body}</div>
        <div className="mt-6"><div className="mb-2 text-sm font-semibold">O‘qiganlar <span className="text-muted-foreground font-normal">({a.reads.length} / {a.sentCount})</span></div>
          <ul className="divide-y text-sm">{a.reads.map((r) => <li key={r.id} className="flex items-center justify-between py-1.5"><span>{r.user.fullName}</span><span className="text-muted-foreground text-xs">{fromNow(r.readAt)}</span></li>)}{a.reads.length === 0 && <li className="text-muted-foreground py-2">Hali hech kim o‘qimagan</li>}</ul>
        </div>
      </div>
    </>
  );
}

function AnnouncementForm({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: Announcement | null }) {
  const qc = useQueryClient();
  const { is, user: me } = useAuth();
  const branches = useBranches(!is('DIRECTOR'));
  const [f, setF] = React.useState({ title: '', body: '', priority: 'NORMAL', audience: 'ALL' as SurveyAudience, branchId: '', isPinned: false });
  React.useEffect(() => { if (open) setF(item ? { title: item.title, body: item.body, priority: item.priority, audience: item.audience, branchId: item.branch?.id ?? '', isPinned: item.isPinned } : { title: '', body: '', priority: 'NORMAL', audience: 'ALL', branchId: is('DIRECTOR') ? me?.branch?.id ?? '' : '', isPinned: false }); }, [open, item, is, me]);
  const m = useMutation({
    mutationFn: () => { const body = { title: f.title.trim(), body: f.body.trim(), priority: f.priority, audience: f.audience, branchId: f.branchId || null, isPinned: f.isPinned }; return item ? api.patch(`/api/announcements/${item.id}`, body) : api.post<{ sent: number }>('/api/announcements', body); },
    onSuccess: (r) => { toast.success(item ? 'E’lon yangilandi' : `E’lon yuborildi${(r as { sent?: number })?.sent != null ? ` (${(r as { sent?: number }).sent} xodim)` : ''}`); void qc.invalidateQueries({ queryKey: ['announcements'] }); onOpenChange(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{item ? 'E’lonni tahrirlash' : 'Yangi e’lon'}</DialogTitle><DialogDescription>{item ? 'O‘zgarishlar saqlanadi (qayta yuborilmaydi).' : 'E’lon darhol tanlangan auditoriyaga Telegram orqali yuboriladi.'}</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1.5"><Label>Sarlavha *</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} /></div>
          <div className="space-y-1.5"><Label>Matn *</Label><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required minLength={3} className="min-h-32" placeholder="Hurmatli hamkasblar!…" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Muhimlik</Label><Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Auditoriya</Label><Select value={f.audience} onValueChange={(v) => setF({ ...f, audience: v as SurveyAudience })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(['ALL', 'TUTORS', 'TEACHERS', 'BRANCH'] as SurveyAudience[]).map((a) => <SelectItem key={a} value={a}>{AUDIENCE[a]}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {!is('DIRECTOR') && <div className="space-y-1.5"><Label>Filial {f.audience === 'BRANCH' && '*'}</Label><Select value={f.branchId || '__all'} onValueChange={(v) => setF({ ...f, branchId: v === '__all' ? '' : v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all">Barcha filiallar</SelectItem>{branches.data?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>}
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.isPinned} onCheckedChange={(v) => setF({ ...f, isPinned: v })} /> Qadab qo‘yish (botda birinchi ko‘rsatiladi)</label>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button type="submit" loading={m.isPending}>{item ? 'Saqlash' : <><Send /> Yuborish</>}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
