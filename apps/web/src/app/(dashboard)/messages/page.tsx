'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { MessagesSquare, Send, Pin, Trash2, Reply, X, Search, Users, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ChatGroup, GroupMessage } from '@/lib/school';
import { ROLE_LABELS } from '@/lib/labels';
import { fromNow, initials, cn } from '@/lib/utils';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { RoleKey } from '@/lib/types';

export default function MessagesPage() {
  return <React.Suspense><MessagesInner /></React.Suspense>;
}

function MessagesInner() {
  const sp = useSearchParams();
  const [groupId, setGroupId] = React.useState(sp.get('groupId') ?? '');
  const [search, setSearch] = React.useState('');
  const groups = useQuery({ queryKey: ['chat-groups'], queryFn: () => api.get<ChatGroup[]>('/api/messages/groups'), refetchInterval: 20_000 });
  const items = (groups.data ?? []).filter((g) => !search || g.name.toLowerCase().includes(search.toLowerCase()));
  const current = groups.data?.find((g) => g.id === groupId);

  return (
    <div className="animate-fade-up -m-4 flex h-[calc(100dvh-4rem)] overflow-hidden lg:-m-6 lg:h-[calc(100dvh-4rem)]">
      <aside className={cn('bg-card flex w-full shrink-0 flex-col border-r lg:w-80', groupId && 'hidden lg:flex')}>
        <div className="border-b p-3">
          <h1 className="mb-2 flex items-center gap-2 text-lg font-semibold"><MessagesSquare className="size-5" /> Xabarlar</h1>
          <div className="relative"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Guruh qidirish…" className="pl-9" /></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {groups.isLoading && <div className="space-y-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>}
          {items.map((g) => (
            <button key={g.id} onClick={() => setGroupId(g.id)} className={cn('hover:bg-accent/60 flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors', groupId === g.id && 'bg-accent')}>
              <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl font-bold">{g.name.slice(0, 3)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{g.name}</span>{g.lastMessage && <span className="text-muted-foreground shrink-0 text-[10px]">{fromNow(g.lastMessage.createdAt)}</span>}</div>
                <div className="text-muted-foreground truncate text-xs">{g.lastMessage ? `${g.lastMessage.author.fullName.split(' ')[0]}: ${g.lastMessage.body}` : `${g._count.students} o'quvchi · ${g.tutor?.fullName ?? 'tutor yo\'q'}`}</div>
              </div>
            </button>
          ))}
          {!groups.isLoading && !items.length && <p className="text-muted-foreground p-6 text-center text-sm">Guruhlar yo'q</p>}
        </div>
      </aside>
      <main className={cn('flex min-w-0 flex-1 flex-col', !groupId && 'hidden lg:flex')}>
        {!groupId || !current ? <EmptyState icon={MessagesSquare} title="Guruhni tanlang" description="Xabarlar o'qituvchi, tutor, o'quvchi va ota-onalarga Telegram orqali ham yetkaziladi." className="m-auto" /> : <Chat group={current} onBack={() => setGroupId('')} />}
      </main>
    </div>
  );
}

function Chat({ group, onBack }: { group: ChatGroup; onBack: () => void }) {
  const qc = useQueryClient();
  const { user, can } = useAuth();
  const [text, setText] = React.useState('');
  const [reply, setReply] = React.useState<GroupMessage | null>(null);
  const bottom = React.useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['chat', group.id], queryFn: () => api.get<{ group: ChatGroup; items: GroupMessage[]; canPost: boolean }>(`/api/messages/groups/${group.id}`, { limit: 100 }), refetchInterval: 8_000 });
  React.useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [q.data?.items.length]);
  const send = useMutation({ mutationFn: () => api.post(`/api/messages/groups/${group.id}`, { body: text.trim(), replyToId: reply?.id ?? null, source: 'web' }), onSuccess: () => { setText(''); setReply(null); qc.invalidateQueries({ queryKey: ['chat', group.id] }); qc.invalidateQueries({ queryKey: ['chat-groups'] }); }, onError: (e: Error) => toast.error(e.message) });
  const pin = useMutation({ mutationFn: (id: string) => api.post(`/api/messages/${id}/pin`, {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', group.id] }) });
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/api/messages/${id}`), onSuccess: () => { toast.success("Xabar o'chirildi"); qc.invalidateQueries({ queryKey: ['chat', group.id] }); }, onError: (e: Error) => toast.error(e.message) });
  const msgs = q.data?.items ?? [];
  const pinned = msgs.filter((m) => m.isPinned);
  const canPost = q.data?.canPost ?? can('messages.send');
  let lastDay = '';

  return (
    <>
      <header className="bg-card flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onBack}><ArrowLeft /></Button>
        <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl font-bold">{group.name.slice(0, 3)}</div>
        <div className="min-w-0 flex-1"><div className="font-semibold">{group.name}</div><div className="text-muted-foreground truncate text-xs">{group._count.students} o'quvchi · {group.branch?.name} · {group.allowParentChat ? 'ota-onalar yozishi mumkin' : 'faqat xodimlar yozadi'}</div></div>
        <Button asChild variant="ghost" size="sm"><Link href={`/groups/${group.id}`}><Users /> Guruh</Link></Button>
      </header>
      {pinned.length > 0 && <div className="bg-warning/10 flex items-center gap-2 border-b px-4 py-2 text-xs"><Pin className="text-warning size-3.5 shrink-0" /><span className="truncate"><b>{pinned[pinned.length - 1].author.fullName}:</b> {pinned[pinned.length - 1].body}</span></div>}
      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {q.isLoading && <Skeleton className="h-40" />}
        {!q.isLoading && !msgs.length && <p className="text-muted-foreground py-10 text-center text-sm">Hali xabar yo'q. Birinchi bo'lib yozing — barcha a'zolar Telegramda oladi.</p>}
        {msgs.map((m) => {
          const day = dayjs(m.createdAt).format('YYYY-MM-DD');
          const showDay = day !== lastDay; lastDay = day;
          const mine = m.authorId === user?.id;
          const roleKey = m.author.role?.key as RoleKey | undefined;
          return (
            <React.Fragment key={m.id}>
              {showDay && <div className="my-3 flex items-center gap-3 text-[11px] text-muted-foreground"><div className="h-px flex-1 bg-border" />{dayjs(m.createdAt).format('DD MMMM YYYY')}<div className="h-px flex-1 bg-border" /></div>}
              <div className={cn('group/msg flex items-end gap-2', mine && 'flex-row-reverse')}>
                {!mine && <Avatar className="size-7"><AvatarImage src={m.author.avatarUrl ?? undefined} /><AvatarFallback className="text-[9px]">{initials(m.author.fullName)}</AvatarFallback></Avatar>}
                <div className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-xs', mine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card rounded-bl-md border')}>
                  {!mine && <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold"><span>{m.author.fullName}</span>{roleKey && <span className={cn('rounded px-1 text-[9px] font-medium', 'bg-black/5 dark:bg-white/10')}>{ROLE_LABELS[roleKey] ?? roleKey}</span>}</div>}
                  {m.replyTo && <div className={cn('mb-1 rounded-lg border-l-2 px-2 py-1 text-xs opacity-80', mine ? 'border-white/60 bg-white/10' : 'border-primary bg-muted')}><b>{m.replyTo.author.fullName}</b>: {m.replyTo.body.slice(0, 80)}</div>}
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  <div className={cn('mt-0.5 flex items-center gap-1 text-[10px]', mine ? 'text-white/70 justify-end' : 'text-muted-foreground')}>{m.isPinned && <Pin className="size-2.5" />}{m.source === 'telegram' && <Send className="size-2.5" />}{dayjs(m.createdAt).format('HH:mm')}</div>
                </div>
                <div className={cn('flex gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100')}>
                  {canPost && <button onClick={() => setReply(m)} className="text-muted-foreground hover:text-foreground p-1" title="Javob"><Reply className="size-3.5" /></button>}
                  {can('groups.manage') && <button onClick={() => pin.mutate(m.id)} className="text-muted-foreground hover:text-foreground p-1" title="Qadash"><Pin className="size-3.5" /></button>}
                  {(mine || can('groups.manage')) && <button onClick={() => del.mutate(m.id)} className="text-muted-foreground hover:text-destructive p-1" title="O'chirish"><Trash2 className="size-3.5" /></button>}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={bottom} />
      </div>
      <footer className="bg-card border-t p-3">
        {reply && <div className="bg-muted mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"><Reply className="size-3.5" /><span className="truncate"><b>{reply.author.fullName}</b>: {reply.body.slice(0, 100)}</span><button onClick={() => setReply(null)} className="ml-auto"><X className="size-3.5" /></button></div>}
        {canPost ? (
          <div className="flex items-end gap-2">
            <Textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) send.mutate(); } }} placeholder="Xabar yozing… (Enter — yuborish, Shift+Enter — yangi qator)" className="max-h-40 min-h-10 resize-none" />
            <Button size="icon" onClick={() => send.mutate()} disabled={!text.trim()} loading={send.isPending}><Send /></Button>
          </div>
        ) : <p className="text-muted-foreground text-center text-xs">Bu guruhda yozish huquqingiz yo'q</p>}
        <p className="text-muted-foreground mt-1.5 text-[10px]">Xabar barcha a'zolarga (o'qituvchi, tutor, o'quvchi va ota-onalar) Telegram orqali yetkaziladi va saqlanadi.</p>
      </footer>
      <Badge className="hidden" />
    </>
  );
}
