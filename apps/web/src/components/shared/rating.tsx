import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Rating({ value, className, showValue = true }: { value?: number | null; className?: string; showValue?: boolean }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cn('size-3.5', i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
        ))}
      </span>
      {showValue && <span className="tabular text-sm font-medium">{value.toFixed(1)}</span>}
    </span>
  );
}
