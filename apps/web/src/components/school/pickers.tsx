'use client';
import * as React from 'react';
import { useBranches } from '@/lib/queries';
import { useSchoolGroups, useSubjects, useStaff } from '@/lib/school';
import { useAuth } from '@/lib/auth';
import { FilterSelect } from '@/components/shared/filters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Branch filter — hidden for branch-scoped roles (their branch is implied by the API). */
export function BranchFilter({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const { is } = useAuth();
  const branches = useBranches();
  if (is('DIRECTOR', 'ADMINISTRATOR', 'RECEPTION', 'DORM_MANAGER')) return null;
  return <FilterSelect value={value} onChange={onChange} placeholder="Filial" allLabel="Barcha filiallar" className={className} options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />;
}

export function GroupFilter({ value, onChange, branchId, className, allLabel = 'Barcha guruhlar' }: { value: string; onChange: (v: string) => void; branchId?: string; className?: string; allLabel?: string | null }) {
  const groups = useSchoolGroups(branchId);
  return <FilterSelect value={value} onChange={onChange} placeholder="Guruh" allLabel={allLabel} className={className} options={(groups.data ?? []).map((g) => ({ value: g.id, label: `${g.name}${g.branch ? ` · ${g.branch.code}` : ''}` }))} />;
}

export function SubjectFilter({ value, onChange, className, allLabel = 'Barcha fanlar' }: { value: string; onChange: (v: string) => void; className?: string; allLabel?: string | null }) {
  const subjects = useSubjects();
  return <FilterSelect value={value} onChange={onChange} placeholder="Fan" allLabel={allLabel} className={className} options={(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />;
}

/** Controlled select used inside forms (value '' = none). */
export function FormSelect({ value, onChange, options, placeholder = 'Tanlang', noneLabel, className, disabled }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; noneLabel?: string | null; className?: string; disabled?: boolean }) {
  return (
    <Select value={value || '__none'} onValueChange={(v) => onChange(v === '__none' ? '' : v)} disabled={disabled}>
      <SelectTrigger className={cn('w-full', className)}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {noneLabel !== null && <SelectItem value="__none">{noneLabel ?? '— Tanlanmagan —'}</SelectItem>}
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function BranchSelect(props: Omit<React.ComponentProps<typeof FormSelect>, 'options'>) {
  const branches = useBranches();
  return <FormSelect {...props} options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />;
}
export function GroupSelect({ branchId, ...props }: Omit<React.ComponentProps<typeof FormSelect>, 'options'> & { branchId?: string }) {
  const groups = useSchoolGroups(branchId);
  return <FormSelect {...props} options={(groups.data ?? []).map((g) => ({ value: g.id, label: `${g.name}${g.branch ? ` · ${g.branch.name}` : ''}` }))} />;
}
export function SubjectSelect(props: Omit<React.ComponentProps<typeof FormSelect>, 'options'>) {
  const subjects = useSubjects();
  return <FormSelect {...props} options={(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />;
}
export function StaffSelect({ role, branchId, ...props }: Omit<React.ComponentProps<typeof FormSelect>, 'options'> & { role: 'TEACHER' | 'TUTOR' | 'DORM_MANAGER'; branchId?: string }) {
  const staff = useStaff(role, branchId);
  return <FormSelect {...props} options={(staff.data ?? []).map((u) => ({ value: u.id, label: u.fullName }))} />;
}

export function Field({ label, children, className, hint }: { label: React.ReactNode; children: React.ReactNode; className?: string; hint?: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
