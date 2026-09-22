'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Copy, Save, Send, Sparkles, EyeOff, Smartphone, Star, CheckSquare, Circle, Hash, ThumbsUp, Type, AlignLeft } from 'lucide-react';
import { api } from '@/lib/api';
import type { QuestionType, Survey, SurveyAudience } from '@/lib/types';
import { QUESTION_TYPES, AUDIENCE } from '@/lib/labels';
import { useAuth } from '@/lib/auth';
import { useBranches } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn, dayjs } from '@/lib/utils';
import { SendSurveyDialog } from './send-dialog';

export interface DraftOption { id?: string; label: string; _key: string }
export interface DraftQuestion { id?: string; _key: string; type: QuestionType; text: string; hint: string; isRequired: boolean; minValue: number | null; maxValue: number | null; options: DraftOption[] }
export interface DraftSurvey { title: string; description: string; audience: SurveyAudience; branchId: string; isAnonymous: boolean; allowMultiple: boolean; deadline: string; questions: DraftQuestion[] }

const key = () => Math.random().toString(36).slice(2, 9);
const TYPE_ICON: Record<QuestionType, React.ComponentType<{ className?: string }>> = { TEXT: Type, LONG_TEXT: AlignLeft, SINGLE_CHOICE: Circle, MULTIPLE_CHOICE: CheckSquare, RATING: Star, YES_NO: ThumbsUp, NUMBER: Hash };

export const newQuestion = (type: QuestionType = 'RATING', text = ''): DraftQuestion => ({
  _key: key(), type, text, hint: '', isRequired: true, minValue: type === 'RATING' ? 1 : null, maxValue: type === 'RATING' ? 5 : null,
  options: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(type) ? [{ label: '', _key: key() }, { label: '', _key: key() }] : [],
});

export const TEMPLATES: Array<{ id: string; name: string; description: string; audience: SurveyAudience; questions: Array<Partial<DraftQuestion> & { type: QuestionType; text: string; opts?: string[] }> }> = [
  { id: 'weekly-tutor', name: 'Haftalik tutor so‘rovnomasi', description: 'Darslar, muammolar, natijalar va takliflar', audience: 'TUTORS', questions: [
    { type: 'RATING', text: 'Ushbu hafta darslar qanday o‘tdi?', hint: '1 — juda yomon, 5 — a’lo' },
    { type: 'LONG_TEXT', text: 'O‘quvchilar bilan qanday muammolar bo‘ldi?', isRequired: false },
    { type: 'TEXT', text: 'Qaysi guruhga qo‘shimcha yordam kerak?', isRequired: false },
    { type: 'LONG_TEXT', text: 'Ushbu hafta qanday natijaga erishdingiz?' },
    { type: 'MULTIPLE_CHOICE', text: 'Maktab boshqaruvidan qanday yordam kerak?', opts: ['O‘quv materiallari', 'Texnik jihozlar', 'Ota-onalar bilan aloqa', 'Qo‘shimcha trening', 'Kerak emas'] },
    { type: 'LONG_TEXT', text: 'Takliflaringiz?', isRequired: false },
  ] },
  { id: 'teacher-lesson', name: 'O‘qituvchi dars sifati', description: 'Dars rejasi, davomat, uy vazifasi', audience: 'TEACHERS', questions: [
    { type: 'RATING', text: 'Dars rejasi qanchalik bajarildi?' },
    { type: 'NUMBER', text: 'Bu hafta nechta dars o‘tdingiz?', minValue: 0, maxValue: 60 },
    { type: 'YES_NO', text: 'O‘quvchilar uy vazifasini bajaryaptimi?' },
    { type: 'SINGLE_CHOICE', text: 'O‘quvchilarning umumiy o‘zlashtirishi', opts: ['A’lo', 'Yaxshi', 'Qoniqarli', 'Past'] },
    { type: 'LONG_TEXT', text: 'Qaysi mavzular qiyin bo‘ldi?', isRequired: false },
  ] },
  { id: 'satisfaction', name: 'Xodimlar qoniqish so‘rovnomasi (anonim)', description: 'Ish sharoiti, rahbariyat, motivatsiya', audience: 'ALL', questions: [
    { type: 'RATING', text: 'Ish sharoitidan qanchalik qoniqasiz?' },
    { type: 'RATING', text: 'Rahbariyat bilan aloqani baholang' },
    { type: 'RATING', text: 'Ish yuklamasi me’yoridami?' },
    { type: 'YES_NO', text: 'Kelgusi yil ham shu maktabda ishlashni rejalashtiryapsizmi?' },
    { type: 'LONG_TEXT', text: 'Nimani o‘zgartirgan bo‘lardingiz?', isRequired: false },
  ] },
  { id: 'monthly', name: 'Oylik natijalar', description: 'Oylik yakun va rejalar', audience: 'ALL', questions: [
    { type: 'RATING', text: 'Oy davomida o‘z ishingizni baholang' },
    { type: 'LONG_TEXT', text: 'Eng katta yutug‘ingiz' },
    { type: 'LONG_TEXT', text: 'Eng katta qiyinchilik' },
    { type: 'LONG_TEXT', text: 'Keyingi oy uchun 3 ta maqsad' },
  ] },
];

export function templateToDraft(t: (typeof TEMPLATES)[number]): DraftQuestion[] {
  return t.questions.map((q) => ({ ...newQuestion(q.type, q.text), hint: q.hint ?? '', isRequired: q.isRequired ?? true, minValue: q.minValue ?? (q.type === 'RATING' ? 1 : null), maxValue: q.maxValue ?? (q.type === 'RATING' ? 5 : null), options: (q.opts ?? []).map((label) => ({ label, _key: key() })) }));
}

export function surveyToDraft(s: Survey): DraftSurvey {
  return {
    title: s.title, description: s.description ?? '', audience: s.audience, branchId: s.branch?.id ?? s.branchId ?? '', isAnonymous: s.isAnonymous, allowMultiple: !!s.allowMultiple, deadline: s.deadline ? dayjs(s.deadline).format('YYYY-MM-DDTHH:mm') : '',
    questions: (s.questions ?? []).map((q) => ({ id: q.id, _key: key(), type: q.type, text: q.text, hint: q.hint ?? '', isRequired: q.isRequired, minValue: q.minValue, maxValue: q.maxValue, options: q.options.map((o) => ({ id: o.id, label: o.label, _key: key() })) })),
  };
}

export function SurveyBuilder({ initial, surveyId, initialSurvey }: { initial?: DraftSurvey; surveyId?: string; initialSurvey?: Survey }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { is, user: me } = useAuth();
  const branches = useBranches(!is('DIRECTOR'));
  const [d, setD] = React.useState<DraftSurvey>(initial ?? { title: '', description: '', audience: 'TUTORS', branchId: is('DIRECTOR') ? me?.branch?.id ?? '' : '', isAnonymous: false, allowMultiple: false, deadline: '', questions: [newQuestion('RATING')] });
  const [active, setActive] = React.useState(0);
  const [saved, setSaved] = React.useState<Survey | null>(initialSurvey ?? null);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [showTemplates, setShowTemplates] = React.useState(!initial && !surveyId);

  const setQ = (i: number, patch: Partial<DraftQuestion>) => setD((s) => ({ ...s, questions: s.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) }));
  const move = (i: number, dir: -1 | 1) => setD((s) => { const arr = [...s.questions]; const j = i + dir; if (j < 0 || j >= arr.length) return s; [arr[i], arr[j]] = [arr[j], arr[i]]; setActive(j); return { ...s, questions: arr }; });
  const removeQ = (i: number) => setD((s) => ({ ...s, questions: s.questions.filter((_, idx) => idx !== i) }));
  const dupQ = (i: number) => setD((s) => { const q = s.questions[i]; const copy = { ...q, id: undefined, _key: key(), options: q.options.map((o) => ({ ...o, id: undefined, _key: key() })) }; const arr = [...s.questions]; arr.splice(i + 1, 0, copy); return { ...s, questions: arr }; });
  const addQ = (type: QuestionType) => { setD((s) => ({ ...s, questions: [...s.questions, newQuestion(type)] })); setActive(d.questions.length); };

  const validate = () => {
    if (d.title.trim().length < 3) return 'Sarlavha kamida 3 ta belgi bo‘lishi kerak';
    if (d.questions.length === 0) return 'Kamida bitta savol qo‘shing';
    for (const [i, q] of d.questions.entries()) {
      if (q.text.trim().length < 2) return `${i + 1}-savol matni bo‘sh`;
      if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(q.type) && q.options.filter((o) => o.label.trim()).length < 2) return `${i + 1}-savol uchun kamida 2 ta variant kerak`;
    }
    if (d.audience === 'BRANCH' && !d.branchId) return 'Filial tanlang';
    return null;
  };

  const payload = () => ({
    title: d.title.trim(), description: d.description.trim() || null, audience: d.audience, branchId: d.audience === 'BRANCH' || d.branchId ? d.branchId || null : null, isAnonymous: d.isAnonymous, allowMultiple: d.allowMultiple, deadline: d.deadline ? new Date(d.deadline).toISOString() : null,
    questions: d.questions.map((q) => ({ id: q.id, type: q.type, text: q.text.trim(), hint: q.hint.trim() || null, isRequired: q.isRequired, minValue: q.minValue, maxValue: q.maxValue, options: q.options.filter((o) => o.label.trim()).map((o) => ({ id: o.id, label: o.label.trim() })) })),
  });

  const save = useMutation({
    mutationFn: async () => {
      const err = validate();
      if (err) throw new Error(err);
      const body = payload();
      return saved?.id || surveyId ? api.patch<Survey>(`/api/surveys/${saved?.id ?? surveyId}`, body) : api.post<Survey>('/api/surveys', body);
    },
    onSuccess: (s, _v, _c) => {
      setSaved(s);
      void qc.invalidateQueries({ queryKey: ['surveys'] });
      void qc.invalidateQueries({ queryKey: ['survey', s.id] });
      toast.success('Saqlandi');
      if (!surveyId) router.replace(`/surveys/${s.id}/edit`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });

  const saveAndSend = async () => {
    try {
      const s = await save.mutateAsync();
      setSaved(s);
      setSendOpen(true);
    } catch { /* toast shown */ }
  };

  const q = d.questions[active];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push(saved ? `/surveys/${saved.id}` : '/surveys')}><ArrowLeft /> {saved ? 'So‘rovnomaga' : 'Ro‘yxatga'} qaytish</Button>
        <div className="flex items-center gap-2">
          {saved && <Badge variant="muted">ID: {saved.id.slice(-6)}</Badge>}
          <Button variant="outline" onClick={() => save.mutate()} loading={save.isPending}><Save /> Saqlash</Button>
          {(!saved || saved.status === 'DRAFT' || saved.status === 'ACTIVE') && <Button onClick={() => void saveAndSend()} loading={save.isPending}><Send /> Saqlash va yuborish</Button>}
        </div>
      </div>

      {showTemplates && (
        <Card className="mb-4 gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="text-primary size-4" /> Shablondan boshlang</CardTitle>
            <CardDescription>Tayyor savollar to‘plamini tanlang yoki bo‘sh so‘rovnomadan boshlang</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" onClick={() => { setD((s) => ({ ...s, title: s.title || t.name, audience: t.audience, isAnonymous: t.id === 'satisfaction', questions: templateToDraft(t) })); setShowTemplates(false); setActive(0); }} className="hover:border-primary hover:bg-primary/5 rounded-xl border p-3 text-left transition-colors">
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">{t.description}</div>
                <div className="text-muted-foreground mt-2 text-[11px]">{t.questions.length} savol · {AUDIENCE[t.audience]}</div>
              </button>
            ))}
            <button type="button" onClick={() => setShowTemplates(false)} className="text-muted-foreground hover:text-foreground rounded-xl border border-dashed p-3 text-sm sm:col-span-2 lg:col-span-4">Bo‘sh so‘rovnomadan boshlash →</button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* Meta */}
          <Card>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Sarlavha *</Label>
                <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Masalan: Haftalik tutor so‘rovnomasi — 27.09" className="h-11 text-base font-medium" />
              </div>
              <div className="space-y-1.5">
                <Label>Tavsif</Label>
                <Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Xodimlar botda ko‘radigan qisqa kirish matni" className="min-h-16" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Auditoriya</Label>
                  <Select value={d.audience} onValueChange={(v) => setD({ ...d, audience: v as SurveyAudience })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(AUDIENCE) as SurveyAudience[]).filter((a) => a !== 'CUSTOM').map((a) => <SelectItem key={a} value={a}>{AUDIENCE[a]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Filial {d.audience === 'BRANCH' && '*'}</Label>
                  <Select value={d.branchId || '__all'} onValueChange={(v) => setD({ ...d, branchId: v === '__all' ? '' : v })} disabled={is('DIRECTOR')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">Barcha filiallar</SelectItem>
                      {branches.data?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      {is('DIRECTOR') && me?.branch && <SelectItem value={me.branch.id}>{me.branch.name}</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Muddat</Label>
                  <Input type="datetime-local" value={d.deadline} onChange={(e) => setD({ ...d, deadline: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm"><Switch checked={d.isAnonymous} onCheckedChange={(v) => setD({ ...d, isAnonymous: v })} /> <EyeOff className="text-muted-foreground size-4" /> Anonim rejim <span className="text-muted-foreground text-xs">(javob beruvchi ko‘rsatilmaydi)</span></label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={d.allowMultiple} onCheckedChange={(v) => setD({ ...d, allowMultiple: v })} /> Qayta to‘ldirishga ruxsat</label>
              </div>
            </CardContent>
          </Card>

          {/* Questions list */}
          <Card>
            <CardHeader>
              <CardTitle>Savollar <span className="text-muted-foreground font-normal">({d.questions.length})</span></CardTitle>
              <CardDescription>Savolni bosib tahrirlang. Tartibni o‘q tugmalari bilan o‘zgartiring.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.questions.map((qq, i) => {
                const Icon = TYPE_ICON[qq.type];
                const isActive = i === active;
                return (
                  <div key={qq._key} className={cn('rounded-xl border transition-colors', isActive ? 'border-primary bg-primary/[0.03] shadow-sm' : 'hover:bg-accent/40')}>
                    <div className="flex items-center gap-2 px-3 py-2" onClick={() => setActive(i)} role="button">
                      <GripVertical className="text-muted-foreground/50 size-4" />
                      <span className="bg-muted text-muted-foreground tabular flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold">{i + 1}</span>
                      <Icon className="text-muted-foreground size-4 shrink-0" />
                      <span className={cn('min-w-0 flex-1 truncate text-sm', !qq.text && 'text-muted-foreground italic')}>{qq.text || 'Savol matni…'}</span>
                      {!qq.isRequired && <Badge variant="muted" className="hidden sm:inline-flex">ixtiyoriy</Badge>}
                      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === d.questions.length - 1}><ChevronDown /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => dupQ(i)}><Copy /></Button>
                        <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => { removeQ(i); setActive(Math.max(0, i - 1)); }}><Trash2 /></Button>
                      </div>
                    </div>
                    {isActive && (
                      <div className="space-y-3 border-t px-3 py-3">
                        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                          <div className="space-y-1.5">
                            <Label>Savol matni *</Label>
                            <Textarea value={qq.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="Savolni yozing…" className="min-h-14" autoFocus />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Turi</Label>
                            <Select value={qq.type} onValueChange={(v) => { const t = v as QuestionType; setQ(i, { type: t, minValue: t === 'RATING' ? 1 : t === 'NUMBER' ? qq.minValue : null, maxValue: t === 'RATING' ? 5 : t === 'NUMBER' ? qq.maxValue : null, options: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(t) ? (qq.options.length ? qq.options : [{ label: '', _key: key() }, { label: '', _key: key() }]) : [] }); }}>
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>{(Object.keys(QUESTION_TYPES) as QuestionType[]).map((t) => <SelectItem key={t} value={t}>{QUESTION_TYPES[t].icon} {QUESTION_TYPES[t].label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Yordamchi matn</Label>
                          <Input value={qq.hint} onChange={(e) => setQ(i, { hint: e.target.value })} placeholder="Masalan: 1 — juda yomon, 5 — a’lo" />
                        </div>
                        {['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(qq.type) && (
                          <div className="space-y-1.5">
                            <Label>Variantlar</Label>
                            <div className="space-y-1.5">
                              {qq.options.map((o, oi) => (
                                <div key={o._key} className="flex items-center gap-2">
                                  {qq.type === 'SINGLE_CHOICE' ? <Circle className="text-muted-foreground size-4" /> : <CheckSquare className="text-muted-foreground size-4" />}
                                  <Input value={o.label} onChange={(e) => setQ(i, { options: qq.options.map((x, xi) => (xi === oi ? { ...x, label: e.target.value } : x)) })} placeholder={`${oi + 1}-variant`} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setQ(i, { options: [...qq.options, { label: '', _key: key() }] }); } }} />
                                  <Button variant="ghost" size="icon-sm" disabled={qq.options.length <= 2} onClick={() => setQ(i, { options: qq.options.filter((_, xi) => xi !== oi) })}><Trash2 /></Button>
                                </div>
                              ))}
                              <Button variant="ghost" size="sm" onClick={() => setQ(i, { options: [...qq.options, { label: '', _key: key() }] })}><Plus /> Variant qo‘shish</Button>
                            </div>
                          </div>
                        )}
                        {qq.type === 'NUMBER' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5"><Label>Minimal</Label><Input type="number" value={qq.minValue ?? ''} onChange={(e) => setQ(i, { minValue: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                            <div className="space-y-1.5"><Label>Maksimal</Label><Input type="number" value={qq.maxValue ?? ''} onChange={(e) => setQ(i, { maxValue: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                          </div>
                        )}
                        <label className="flex items-center gap-2 text-sm"><Switch checked={qq.isRequired} onCheckedChange={(v) => setQ(i, { isRequired: v })} /> Majburiy savol</label>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-1.5 pt-2">
                {(Object.keys(QUESTION_TYPES) as QuestionType[]).map((t) => {
                  const Icon = TYPE_ICON[t];
                  return <Button key={t} variant="outline" size="sm" onClick={() => addQ(t)}><Icon /> {QUESTION_TYPES[t].label}</Button>;
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Telegram preview */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm"><Smartphone className="size-4" /> Telegram ko‘rinishi</CardTitle>
              <CardDescription>Xodim botda shunday ko‘radi</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl bg-[#8fb2d9]/30 p-3 dark:bg-[#0e1621]">
                <div className="space-y-2">
                  <Bubble>
                    <div className="font-semibold">📋 {d.title || 'So‘rovnoma sarlavhasi'}</div>
                    {d.description && <div className="mt-1 opacity-80">{d.description}</div>}
                    <div className="mt-1 text-[11px] opacity-60">{d.questions.length} ta savol{d.isAnonymous ? ' · anonim' : ''}{d.deadline ? ` · muddat ${dayjs(d.deadline).format('DD.MM HH:mm')}` : ''}</div>
                  </Bubble>
                  {q && (
                    <Bubble>
                      <div><i className="opacity-60">{active + 1}/{d.questions.length}</i>  {q.text || 'Savol matni…'}</div>
                      {q.hint && <div className="mt-1 opacity-70">💡 {q.hint}</div>}
                      <div className="mt-1 opacity-70">
                        {q.type === 'RATING' && '⭐ 1 dan 5 gacha baholang'}
                        {q.type === 'YES_NO' && '👍 Ha yoki Yo‘q'}
                        {q.type === 'NUMBER' && `🔢 Raqam kiriting${q.minValue != null || q.maxValue != null ? ` (${q.minValue ?? '…'}–${q.maxValue ?? '…'})` : ''}`}
                        {q.type === 'TEXT' && `✍️ Javobingizni yozing${q.isRequired ? '' : ' (ixtiyoriy)'}`}
                        {q.type === 'LONG_TEXT' && `✍️ Batafsil javob yozing${q.isRequired ? '' : ' (ixtiyoriy)'}`}
                        {q.type === 'SINGLE_CHOICE' && '👇 Bitta variantni tanlang'}
                        {q.type === 'MULTIPLE_CHOICE' && '👇 Bir yoki bir nechta variantni tanlang va tasdiqlang'}
                      </div>
                      <div className="mt-2 grid gap-1">
                        {q.type === 'RATING' && <div className="grid grid-cols-5 gap-1">{[1, 2, 3, 4, 5].map((n) => <KB key={n}>⭐ {n}</KB>)}</div>}
                        {q.type === 'YES_NO' && <div className="grid grid-cols-2 gap-1"><KB>✅ Ha</KB><KB>❌ Yo‘q</KB></div>}
                        {['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(q.type) && q.options.map((o) => <KB key={o._key}>{q.type === 'MULTIPLE_CHOICE' ? '⬜️ ' : ''}{o.label || '…'}</KB>)}
                        {q.type === 'MULTIPLE_CHOICE' && <KB>✅ Tasdiqlash</KB>}
                        {!q.isRequired && <KB>⏭ O‘tkazib yuborish</KB>}
                        <KB>❌ Bekor qilish</KB>
                      </div>
                    </Bubble>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {saved && sendOpen && <SendSurveyDialog survey={saved} open={sendOpen} onOpenChange={setSendOpen} onSent={() => router.push(`/surveys/${saved.id}`)} />}
    </div>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[95%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] leading-snug text-zinc-900 shadow-sm dark:bg-[#182533] dark:text-zinc-100">{children}</div>;
}
function KB({ children }: { children: React.ReactNode }) {
  return <div className="truncate rounded-lg bg-black/5 px-2 py-1 text-center text-[12px] dark:bg-white/10">{children}</div>;
}
