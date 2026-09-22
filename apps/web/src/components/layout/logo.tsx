import { cn } from '@/lib/utils';

/** TARGET INTERNATIONAL SCHOOL emblem — concentric target with an arrow. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9 shrink-0 drop-shadow-md', className)} aria-hidden>
      <defs>
        <linearGradient id="tis-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1d4ed8" /><stop offset="1" stopColor="#0ea5e9" /></linearGradient>
        <linearGradient id="tis-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e11d48" /><stop offset="1" stopColor="#f43f5e" /></linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#tis-b)" />
      <circle cx="32" cy="32" r="22.5" fill="#fff" />
      <circle cx="32" cy="32" r="16" fill="url(#tis-r)" />
      <circle cx="32" cy="32" r="9" fill="#fff" />
      <circle cx="32" cy="32" r="3.6" fill="#0f172a" />
      <path d="M34.5 29.5L54 10" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <path d="M46 18l8-8-2-6-6 6-6-2z" fill="#facc15" stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ light, compact, className, size = 'md' }: { light?: boolean; compact?: boolean; className?: string; size?: 'md' | 'lg' }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={size === 'lg' ? 'size-14' : 'size-9'} />
      {!compact && (
        <span className={cn('leading-none', light ? 'text-white' : 'text-foreground')}>
          <span className={cn('block font-extrabold tracking-[0.18em]', size === 'lg' ? 'text-2xl' : 'text-[15px]')}>TARGET</span>
          <span className={cn('mt-1 block font-semibold tracking-[0.14em] uppercase', size === 'lg' ? 'text-[11px]' : 'text-[9px]', light ? 'text-sky-200' : 'text-primary')}>International School</span>
        </span>
      )}
    </div>
  );
}
