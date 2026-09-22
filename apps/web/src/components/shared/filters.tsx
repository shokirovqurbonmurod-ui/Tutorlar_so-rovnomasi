'use client';
import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder = 'Qidirish…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-card pl-9 pr-8" />
      {value && (
        <button onClick={() => onChange('')} className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2" aria-label="Tozalash">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({ value, onChange, options, placeholder, allLabel = 'Barchasi', className }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; allLabel?: string | null; className?: string }) {
  return (
    <Select value={value || '__all'} onValueChange={(v) => onChange(v === '__all' ? '' : v)}>
      <SelectTrigger className={cn('bg-card w-full sm:w-44', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allLabel !== null && <SelectItem value="__all">{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ResetFilters({ onClick, visible }: { onClick: () => void; visible: boolean }) {
  if (!visible) return null;
  return (
    <Button variant="ghost" size="sm" onClick={onClick}><X /> Tozalash</Button>
  );
}
