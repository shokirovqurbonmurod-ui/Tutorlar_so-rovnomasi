import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/lib/utils';

export function UserCell({ name, sub, avatarUrl, size = 'md' }: { name: string; sub?: string | null; avatarUrl?: string | null; size?: 'sm' | 'md' }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar className={size === 'sm' ? 'size-7' : 'size-8'}>
        <AvatarImage src={avatarUrl ?? undefined} />
        <AvatarFallback className={size === 'sm' ? 'text-[10px]' : ''}>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        {sub && <div className="text-muted-foreground truncate text-xs">{sub}</div>}
      </div>
    </div>
  );
}
