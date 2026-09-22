import type { Request } from 'express';
import { prisma } from './prisma.js';
import { forbidden } from './errors.js';
import type { RoleKey } from '../generated/prisma/enums.js';

/**
 * Data-scoping helpers shared by the school modules.
 *
 *  - SUPER_ADMIN / CEO / HR / ACCOUNTANT / IT_ADMIN / MARKETING → everything
 *  - DIRECTOR / ADMINISTRATOR / RECEPTION / DORM_MANAGER        → own branch
 *  - TEACHER / TUTOR                                            → own groups only
 *  - PARENT                                                     → own children only
 *  - STUDENT                                                    → self only
 */

const GLOBAL_ROLES: RoleKey[] = ['SUPER_ADMIN', 'CEO', 'HR_ADMIN', 'ACCOUNTANT', 'IT_ADMIN', 'MARKETING', 'CUSTOM'];
const BRANCH_ROLES: RoleKey[] = ['DIRECTOR', 'ADMINISTRATOR', 'RECEPTION', 'DORM_MANAGER'];
export const STAFF_GROUP_ROLES: RoleKey[] = ['TEACHER', 'TUTOR'];

export interface Actor {
  sub: string;
  role: RoleKey;
  branchId: string | null;
}

export const actor = (req: Request): Actor => {
  if (!req.user) throw forbidden();
  return { sub: req.user.sub, role: req.user.role, branchId: req.user.branchId };
};

export const isGlobal = (a: Actor) => GLOBAL_ROLES.includes(a.role);
export const isBranchScoped = (a: Actor) => BRANCH_ROLES.includes(a.role) && !!a.branchId;
export const isGroupStaff = (a: Actor) => STAFF_GROUP_ROLES.includes(a.role);

/** Group ids a teacher/tutor is attached to (class teacher, tutor or subject teacher). */
export async function staffGroupIds(userId: string): Promise<string[]> {
  const [own, subj] = await Promise.all([
    prisma.group.findMany({ where: { OR: [{ tutorId: userId }, { teacherId: userId }], isActive: true }, select: { id: true } }),
    prisma.groupTeacher.findMany({ where: { teacherId: userId }, select: { groupId: true } }),
  ]);
  return [...new Set([...own.map((g) => g.id), ...subj.map((g) => g.groupId)])];
}

/** Student ids visible to a parent. */
export async function parentStudentIds(userId: string): Promise<string[]> {
  const p = await prisma.parent.findUnique({ where: { userId }, select: { children: { select: { studentId: true } } } });
  return p?.children.map((c) => c.studentId) ?? [];
}

export async function studentIdOfUser(userId: string): Promise<string | null> {
  const s = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  return s?.id ?? null;
}

/** Prisma where-fragment restricting Student rows for the actor. */
export async function studentScope(a: Actor): Promise<Record<string, unknown>> {
  if (isGlobal(a)) return {};
  if (isBranchScoped(a)) return { branchId: a.branchId! };
  if (isGroupStaff(a)) return { groupId: { in: await staffGroupIds(a.sub) } };
  if (a.role === 'PARENT') return { id: { in: await parentStudentIds(a.sub) } };
  if (a.role === 'STUDENT') return { userId: a.sub };
  return { id: '__none__' };
}

/** Prisma where-fragment restricting Group rows for the actor. */
export async function groupScope(a: Actor): Promise<Record<string, unknown>> {
  if (isGlobal(a)) return {};
  if (isBranchScoped(a)) return { branchId: a.branchId! };
  if (isGroupStaff(a)) return { id: { in: await staffGroupIds(a.sub) } };
  if (a.role === 'PARENT') {
    const ids = await parentStudentIds(a.sub);
    return { students: { some: { id: { in: ids } } } };
  }
  if (a.role === 'STUDENT') return { students: { some: { userId: a.sub } } };
  return { id: '__none__' };
}

/** Throws unless actor may touch the given group. */
export async function assertGroupAccess(a: Actor, groupId: string) {
  if (isGlobal(a)) return;
  const g = await prisma.group.findUnique({ where: { id: groupId }, select: { branchId: true } });
  if (!g) throw forbidden('Guruh topilmadi');
  if (isBranchScoped(a)) {
    if (g.branchId !== a.branchId) throw forbidden('Bu guruh sizning filialingizga tegishli emas');
    return;
  }
  if (isGroupStaff(a)) {
    if (!(await staffGroupIds(a.sub)).includes(groupId)) throw forbidden('Siz bu guruhga biriktirilmagansiz');
    return;
  }
  throw forbidden();
}

/** Throws unless actor may view the given student. */
export async function assertStudentAccess(a: Actor, studentId: string) {
  if (isGlobal(a)) return;
  const where = await studentScope(a);
  const s = await prisma.student.findFirst({ where: { id: studentId, ...where }, select: { id: true } });
  if (!s) throw forbidden("Bu o'quvchi ma'lumotlariga ruxsatingiz yo'q");
}

/** Users (parents + student account) that should be notified about a student. */
export async function studentAudience(studentId: string): Promise<{ parents: string[]; student: string | null; name: string; groupName: string | null }> {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    select: { fullName: true, userId: true, group: { select: { name: true } }, parents: { select: { parent: { select: { userId: true } } } } },
  });
  return { parents: s?.parents.map((p) => p.parent.userId) ?? [], student: s?.userId ?? null, name: s?.fullName ?? '', groupName: s?.group?.name ?? null };
}
