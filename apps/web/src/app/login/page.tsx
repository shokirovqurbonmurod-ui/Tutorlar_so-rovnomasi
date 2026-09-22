'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LockKeyhole, Mail, Sparkles, BarChart3, MessageSquareText, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Logo } from '@/components/layout/logo';

const DEMO = [
  { label: 'Super Admin', email: 'admin@tutorsurvey.uz', password: 'Admin123!' },
  { label: 'Direktor', email: 'director@tutorsurvey.uz', password: 'Director123!' },
  { label: 'CEO', email: 'ceo@tutorsurvey.uz', password: 'Ceo123!' },
  { label: 'HR / Admin', email: 'hr@tutorsurvey.uz', password: 'Hr123!' },
];

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/dashboard';
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [user, loading, router, next]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const u = await login(identifier.trim(), password);
      toast.success(`Xush kelibsiz, ${u.fullName.split(' ')[0]}!`);
      router.replace(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kirishda xatolik');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="identifier">Email yoki telefon</Label>
        <div className="relative">
          <Mail className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input id="identifier" className="h-11 pl-9" placeholder="admin@tutorsurvey.uz" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Parol</Label>
        <div className="relative">
          <LockKeyhole className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input id="password" type={show ? 'text' : 'password'} className="h-11 pr-10 pl-9" placeholder="••••••••" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="button" onClick={() => setShow((s) => !s)} className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2" aria-label="Parolni ko'rsatish">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Kirish
      </Button>

      <div className="pt-2">
        <p className="text-muted-foreground mb-2 text-center text-xs">Demo akkauntlar (bir marta bosing)</p>
        <div className="grid grid-cols-2 gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                setIdentifier(d.email);
                setPassword(d.password);
              }}
              className="bg-muted/60 hover:bg-accent rounded-xl border px-3 py-2 text-left text-xs transition-colors"
            >
              <div className="font-medium">{d.label}</div>
              <div className="text-muted-foreground truncate">{d.email}</div>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between bg-[oklch(0.22_0.05_265)] p-12 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-indigo-500/40 blur-3xl" />
          <div className="absolute right-0 bottom-0 size-[24rem] rounded-full bg-sky-400/30 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.08)_1px,transparent_0)] bg-[size:28px_28px]" />
        </div>
        <div className="relative">
          <Logo light />
        </div>
        <div className="relative max-w-lg space-y-8">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance">Tutorlar va o‘qituvchilar fikrini bir joyda yig‘ing va tahlil qiling</h1>
          <p className="text-white/70">Telegram bot orqali so‘rovnoma va hisobotlar, veb-panelda real vaqt analitika, KPI va filiallar bo‘yicha taqqoslash.</p>
          <ul className="grid gap-4 text-sm">
            {[
              { icon: MessageSquareText, t: 'Telegram orqali 1 daqiqada so‘rovnoma' },
              { icon: BarChart3, t: 'Filial va xodim kesimida KPI tahlili' },
              { icon: ShieldCheck, t: 'Rollar asosida xavfsiz kirish va audit' },
            ].map(({ icon: Icon, t }) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-4" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">© {new Date().getFullYear()} TutorSurvey · Xususiy maktab boshqaruv tizimi</p>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-6 py-10">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <div className="mb-6 space-y-1">
            <div className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
              <Sparkles className="size-3.5" /> Boshqaruv paneli
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Tizimga kirish</h2>
            <p className="text-muted-foreground text-sm">Faqat boshqaruv xodimlari (Admin, Direktor, CEO, HR) uchun. Tutor va o‘qituvchilar Telegram botdan foydalanadi.</p>
          </div>
          <React.Suspense fallback={null}>
            <LoginForm />
          </React.Suspense>
        </div>
      </main>
    </div>
  );
}
