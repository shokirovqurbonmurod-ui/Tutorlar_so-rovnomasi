'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Branch } from './types';

export function useBranches(enabled = true) {
  return useQuery({ queryKey: ['branches', 'all'], queryFn: () => api.get<Branch[]>('/api/branches'), enabled, staleTime: 5 * 60_000 });
}
export function useDepartments(branchId?: string) {
  return useQuery({ queryKey: ['departments', branchId ?? 'all'], queryFn: () => api.get<Array<{ id: string; name: string; branchId: string; branch?: { name: string } }>>('/api/branches/departments/all', { branchId: branchId || undefined }), staleTime: 5 * 60_000 });
}
export function useGroups(branchId?: string) {
  return useQuery({ queryKey: ['groups', branchId ?? 'all'], queryFn: () => api.get<Array<{ id: string; name: string; subject: string | null; branchId: string; studentCount: number | null; tutor?: { id: string; fullName: string } | null; teacher?: { id: string; fullName: string } | null; branch?: { name: string } }>>('/api/branches/groups/all', { branchId: branchId || undefined }), staleTime: 60_000 });
}
export function useRoles() {
  return useQuery({ queryKey: ['users-roles'], queryFn: () => api.get<Array<{ id: string; key: string; slug: string; name: string; label: string; color?: string | null; isSystem?: boolean; _count: { users: number } }>>('/api/users/roles'), staleTime: 10 * 60_000 });
}
