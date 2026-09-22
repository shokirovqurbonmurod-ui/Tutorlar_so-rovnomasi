'use client';
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from './empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

const HIDE: Record<string, string> = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' };

export function DataTable<T>({ columns, rows, rowKey, loading, empty, onRowClick, page, pages, total, onPageChange, className, rowClassName }: { columns: Column<T>[]; rows: T[] | undefined; rowKey: (row: T) => string; loading?: boolean; empty?: React.ReactNode; onRowClick?: (row: T) => void; page?: number; pages?: number; total?: number; onPageChange?: (p: number) => void; className?: string; rowClassName?: (row: T) => string | undefined }) {
  return (
    <div className={cn('bg-card overflow-hidden rounded-2xl border', className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead key={c.key} className={cn(c.className, c.hideBelow && HIDE[c.hideBelow])}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && !rows?.length
            ? Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn(c.hideBelow && HIDE[c.hideBelow])}><Skeleton className="h-4 w-full max-w-40" /></TableCell>
                  ))}
                </TableRow>
              ))
            : rows?.map((r) => (
                <TableRow key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn(onRowClick && 'cursor-pointer', rowClassName?.(r))}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn(c.className, c.hideBelow && HIDE[c.hideBelow])}>{c.cell(r)}</TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {!loading && rows && rows.length === 0 && (empty ?? <EmptyState />)}
      {pages !== undefined && pages > 1 && page !== undefined && onPageChange && (
        <div className="flex items-center justify-between border-t px-4 py-2.5 text-sm">
          <span className="text-muted-foreground text-xs">Jami {total ?? 0} ta · {page}/{pages} sahifa</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Oldingi"><ChevronLeft /></Button>
            <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Keyingi"><ChevronRight /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
