'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Branch, Paginated, User } from '@/lib/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function BranchFormDialog({ open, onOpenChange, branch }: { open: boolean; onOpenChange: (o: boolean) => void; branch?: Branch | null }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ name: '', code: '', city: '', address: '', phone: '', studentCount: '0', directorId: '', ceoId: '', isActive: true });
  React.useEffect(() => { if (open) setF(branch ? { name: branch.name, code: branch.code, city: branch.city ?? '', address: branch.address ?? '', phone: branch.phone ?? '', studentCount: String(branch.studentCount ?? 0), directorId: branch.director?.id ?? '', ceoId: branch.ceo?.id ?? '', isActive: branch.isActive } : { name: '', code: '', city: '', address: '', phone: '', studentCount: '0', directorId: '', ceoId: '', isActive: true }); }, [open, branch]);
  const directors = useQuery({ queryKey: ['users', 'role', 'DIRECTOR'], queryFn: () => api.get<Paginated<User>>('/api/users', { role: 'DIRECTOR', limit: 100 }), enabled: open });
  const ceos = useQuery({ queryKey: ['users', 'role', 'CEO'], queryFn: () => api.get<Paginated<User>>('/api/users', { role: 'CEO', limit: 100 }), enabled: open });
  const m = useMutation({
    mutationFn: () => { const body = { name: f.name.trim(), code: f.code.trim().toUpperCase(), city: f.city.trim() || null, address: f.address.trim() || null, phone: f.phone.trim() || null, studentCount: Number(f.studentCount) || 0, directorId: f.directorId || null, ceoId: f.ceoId || null, isActive: f.isActive }; return branch ? api.patch<Branch>(`/api/branches/${branch.id}`, body) : api.post<Branch>('/api/branches', body); },
    onSuccess: () => { toast.success(branch ? 'Filial yangilandi' : 'Filial yaratildi'); void qc.invalidateQueries({ queryKey: ['branches'] }); void qc.invalidateQueries({ queryKey: ['branch'] }); onOpenChange(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xatolik'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{branch ? 'Filialni tahrirlash' : 'Yangi filial'}</DialogTitle></DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1.5 sm:col-span-2"><Label>Nomi *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Chilonzor filiali" /></div>
          <div className="space-y-1.5"><Label>Kod *</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required maxLength={12} placeholder="CHL" /></div>
          <div className="space-y-1.5"><Label>Shahar</Label><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Toshkent" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Manzil</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Telefon</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+998 71 ..." /></div>
          <div className="space-y-1.5"><Label>O‘quvchilar soni</Label><Input type="number" min={0} value={f.studentCount} onChange={(e) => setF({ ...f, studentCount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Direktor</Label>
            <Select value={f.directorId || '__none'} onValueChange={(v) => setF({ ...f, directorId: v === '__none' ? '' : v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">— Yo‘q —</SelectItem>{directors.data?.items.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>CEO</Label>
            <Select value={f.ceoId || '__none'} onValueChange={(v) => setF({ ...f, ceoId: v === '__none' ? '' : v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">— Yo‘q —</SelectItem>{ceos.data?.items.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}</SelectContent></Select></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} /> Faol filial</label>
          <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Bekor</Button><Button type="submit" loading={m.isPending}>Saqlash</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
