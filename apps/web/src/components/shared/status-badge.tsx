import { Badge } from '@/components/ui/badge';

export function StatusBadge<K extends string>({ value, map, className }: { value: K; map: Record<K, { label: string; variant: string }>; className?: string }) {
  const m = map[value];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Badge variant={(m?.variant ?? 'secondary') as any} className={className}>{m?.label ?? value}</Badge>;
}
