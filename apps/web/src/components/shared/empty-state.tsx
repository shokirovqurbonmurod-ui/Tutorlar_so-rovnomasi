import * as React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon = Inbox, title = "Ma'lumot topilmadi", description, action, className }: { icon?: LucideIcon; title?: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-2xl">
        <Icon className="size-6" />
      </span>
      <div>
        <div className="font-medium">{title}</div>
        {description && <div className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</div>}
      </div>
      {action}
    </div>
  );
}
