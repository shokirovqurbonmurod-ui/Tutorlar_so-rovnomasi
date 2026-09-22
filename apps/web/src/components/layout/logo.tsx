import { cn } from '@/lib/utils';

export function Logo({ light, compact, className }: { light?: boolean; compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/30">
        <svg viewBox="0 0 64 64" className="size-5" fill="none">
          <path d="M18 22h28M18 32h20M18 42h14" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          <circle cx="46" cy="42" r="7" fill="currentColor" />
          <path d="M43 42l2 2 4-4" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!compact && (
        <span className={cn('leading-tight', light ? 'text-white' : 'text-foreground')}>
          <span className="block text-base font-semibold tracking-tight">TutorSurvey</span>
          <span className={cn('block text-[11px]', light ? 'text-white/60' : 'text-muted-foreground')}>Maktab boshqaruvi</span>
        </span>
      )}
    </div>
  );
}
