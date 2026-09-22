import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const TONES = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/18 text-amber-700 dark:text-warning',
  info: 'bg-info/12 text-info',
  destructive: 'bg-destructive/10 text-destructive',
  violet: 'bg-chart-5/12 text-chart-5',
};

export function StatCard({ label, value, hint, delta, deltaLabel = 'oldingi davrga nisbatan', icon: Icon, tone = 'primary', loading, className, spark }: { label: string; value: React.ReactNode; hint?: React.ReactNode; delta?: number | null; deltaLabel?: string; icon: LucideIcon; tone?: keyof typeof TONES; loading?: boolean; className?: string; spark?: React.ReactNode }) {
  if (loading) {
    return (
      <Card className={cn('gap-3 py-4', className)}>
        <div className="flex items-start justify-between px-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="size-9 rounded-xl" />
        </div>
        <div className="px-4"><Skeleton className="h-8 w-20" /></div>
        <div className="px-4"><Skeleton className="h-3 w-32" /></div>
      </Card>
    );
  }
  const up = (delta ?? 0) >= 0;
  return (
    <Card className={cn('card-hover relative gap-2 overflow-hidden py-4', className)}>
      <div className="flex items-start justify-between px-4">
        <div className="text-muted-foreground text-sm font-medium">{label}</div>
        <span className={cn('flex size-9 items-center justify-center rounded-xl', TONES[tone])}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div className="px-4">
        <div className="tabular text-2xl font-semibold tracking-tight lg:text-[28px]">{value}</div>
      </div>
      <div className="flex items-center gap-2 px-4 text-xs">
        {delta !== undefined && delta !== null && (
          <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium', up ? 'bg-success/12 text-success' : 'bg-destructive/10 text-destructive')}>
            {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta)}%
          </span>
        )}
        <span className="text-muted-foreground truncate">{hint ?? (delta !== undefined && delta !== null ? deltaLabel : '')}</span>
      </div>
      {spark && <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-10 opacity-60">{spark}</div>}
    </Card>
  );
}
