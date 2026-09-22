'use client';
import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Button } from './button';

export function ConfirmDialog({ open, onOpenChange, title, description, confirmText = 'Tasdiqlash', cancelText = 'Bekor qilish', destructive, loading, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: React.ReactNode; confirmText?: string; cancelText?: string; destructive?: boolean; loading?: boolean; onConfirm: () => void | Promise<void> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{cancelText}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} loading={loading} onClick={() => void onConfirm()}>{confirmText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
