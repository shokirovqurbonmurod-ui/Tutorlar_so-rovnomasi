import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { pid } from '../../lib/params.js';
import { actor, assertGroupAccess, groupScope, isBranchScoped } from '../../lib/scope.js';
import { notifyMany } from '../notifications/notifications.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { syncGroupCount } from '../students/students.routes.js';

export const groupsRouter = Router();
groupsRouter.use(authenticate);

const listSchema = z.object({ branchId: z.string().optional(), search: z.string().optional(), active: z.enum(['yes', 'no']).optional(), gradeLevel: z.coerce.number().optional() });

const groupSchema = z.object({
  name: z.string().min(1).max(60),
  subject: z.string().max(80).optional().nullable(),
  gradeLevel: z.coerce.number().int().min(0).max(12).optional().nullable(),
  academicYear: z.string().max(20).optional().nullable(),
  room: z.string().max(30).optional().nullable(),
  branchId: z.string(),
  tutorId: z.string().optional().nullable(),
  teacherId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  allowParentChat: z.boolean().default(true),
  studentIds: z.array(z.string()).optional(),
  teachers: z.array(z.object({ teacherId: z.string(), subjectId: z.string() })).optional(),
});

const include = {
  branch: { select: { id: true, name: true, code: true } },
  tutor: { select: { id: true, fullName: true, phone: true, avatarUrl: true, telegramId: true } },
  teacher: { select: { id: true, fullName: true, phone: true, avatarUrl: true, telegramId: true } },
  teachers: { include: { teacher: { select: { id: true, fullName: true, avatarUrl: true } }, subject: { select: { id: true, name: true, color: true } } } },
  _count: { select: { students: true, homeworks: true, messages: true, lessons: true } },
} satisfies Prisma.GroupInclude;

groupsRouter.get(
  '/',
  requirePermission('groups.view'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof listSchema>>(req);
    const a = actor(req);
    const where: Prisma.GroupWhereInput = {
      ...(await groupScope(a)),
      ...(p.branchId ? { branchId: p.branchId } : {}),
      ...(p.active === 'yes' ? { isActive: true } : p.active === 'no' ? { isActive: false } : {}),
      ...(p.gradeLevel ? { gradeLevel: p.gradeLevel } : {}),
      ...(p.search ? { name: { contains: p.search, mode: 'insensitive' } } : {}),
    };
    const items = await prisma.group.findMany({ where, include, orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }] });
    res.json(serialize(items));
  }),
);

groupsRouter.get(
  '/:id',
  requirePermission('groups.view'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const g = await prisma.group.findFirst({ where: { id: pid(req), ...(await groupScope(a)) }, include });
    if (!g) throw notFound('Guruh topilmadi');
    const [students, lessons] = await Promise.all([
      prisma.student.findMany({
        where: { groupId: g.id, status: 'ACTIVE' },
        orderBy: { fullName: 'asc' },
        include: { parents: { include: { parent: { include: { user: { select: { id: true, fullName: true, phone: true, telegramId: true } } } } } }, user: { select: { telegramId: true } } },
      }),
      prisma.lesson.findMany({ where: { groupId: g.id }, include: { subject: true, teacher: { select: { id: true, fullName: true } }, room: true }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] }),
    ]);
    res.json(serialize({ ...g, students, lessons }));
  }),
);

groupsRouter.post(
  '/',
  requirePermission('groups.manage'),
  validate(groupSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof groupSchema>;
    const a = actor(req);
    if (isBranchScoped(a) && body.branchId !== a.branchId) throw badRequest("Faqat o'z filialingizda guruh yarata olasiz");
    const { studentIds, teachers, ...data } = body;
    const g = await prisma.group.create({
      data: { ...data, teachers: teachers ? { create: teachers } : undefined },
      include,
    });
    if (studentIds?.length) await prisma.student.updateMany({ where: { id: { in: studentIds }, branchId: body.branchId }, data: { groupId: g.id } });
    await syncGroupCount(g.id);
    await notifyGroupStaff(g.id, `Siz "${g.name}" guruhiga biriktirildingiz.`);
    audit({ userId: a.sub, action: 'group.create', entity: 'Group', entityId: g.id, meta: { name: g.name }, ip: req.ip });
    res.status(201).json(serialize(await prisma.group.findUnique({ where: { id: g.id }, include })));
  }),
);

groupsRouter.patch(
  '/:id',
  requirePermission('groups.manage'),
  validate(groupSchema.partial()),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<z.infer<typeof groupSchema>>;
    const a = actor(req);
    await assertGroupAccess(a, pid(req));
    const before = await prisma.group.findUnique({ where: { id: pid(req) } });
    if (!before) throw notFound();
    const { studentIds, teachers, ...data } = body;
    const g = await prisma.$transaction(async (tx) => {
      if (teachers) {
        await tx.groupTeacher.deleteMany({ where: { groupId: pid(req) } });
        await tx.groupTeacher.createMany({ data: teachers.map((t) => ({ ...t, groupId: pid(req) })), skipDuplicates: true });
      }
      if (studentIds) {
        await tx.student.updateMany({ where: { groupId: pid(req), id: { notIn: studentIds } }, data: { groupId: null } });
        await tx.student.updateMany({ where: { id: { in: studentIds } }, data: { groupId: pid(req) } });
      }
      return tx.group.update({ where: { id: pid(req) }, data, include });
    });
    await syncGroupCount(g.id);
    const changed = (body.tutorId && body.tutorId !== before.tutorId) || (body.teacherId && body.teacherId !== before.teacherId) || !!teachers;
    if (changed) await notifyGroupStaff(g.id, `Siz "${g.name}" guruhiga biriktirildingiz.`);
    audit({ userId: a.sub, action: 'group.update', entity: 'Group', entityId: g.id, meta: body, ip: req.ip });
    res.json(serialize(g));
  }),
);

groupsRouter.delete(
  '/:id',
  requirePermission('groups.manage'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    await assertGroupAccess(a, pid(req));
    const n = await prisma.student.count({ where: { groupId: pid(req), status: 'ACTIVE' } });
    if (n > 0) throw badRequest(`Guruhda ${n} ta faol o'quvchi bor. Avval ularni boshqa guruhga o'tkazing`);
    await prisma.group.delete({ where: { id: pid(req) } });
    audit({ userId: a.sub, action: 'group.delete', entity: 'Group', entityId: pid(req), ip: req.ip });
    res.json({ ok: true });
  }),
);

/** Add / move students into the group */
groupsRouter.post(
  '/:id/students',
  requirePermission('groups.manage', 'students.manage'),
  validate(z.object({ studentIds: z.array(z.string()).min(1) })),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    await assertGroupAccess(a, pid(req));
    const g = await prisma.group.findUniqueOrThrow({ where: { id: pid(req) } });
    const { studentIds } = req.body as { studentIds: string[] };
    const prev = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { groupId: true } });
    await prisma.student.updateMany({ where: { id: { in: studentIds }, branchId: g.branchId }, data: { groupId: g.id } });
    await syncGroupCount(g.id);
    for (const gid of new Set(prev.map((p) => p.groupId).filter(Boolean) as string[])) await syncGroupCount(gid);
    res.json({ ok: true });
  }),
);

groupsRouter.delete(
  '/:id/students/:studentId',
  requirePermission('groups.manage', 'students.manage'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    await assertGroupAccess(a, pid(req));
    await prisma.student.updateMany({ where: { id: String(req.params.studentId), groupId: pid(req) }, data: { groupId: null } });
    await syncGroupCount(pid(req));
    res.json({ ok: true });
  }),
);

async function notifyGroupStaff(groupId: string, body: string) {
  const g = await prisma.group.findUnique({ where: { id: groupId }, select: { tutorId: true, teacherId: true, teachers: { select: { teacherId: true } } } });
  if (!g) return;
  const ids = [...new Set([g.tutorId, g.teacherId, ...g.teachers.map((t) => t.teacherId)].filter(Boolean) as string[])];
  if (ids.length) await notifyMany(ids, { type: 'SYSTEM', title: '👥 Guruh', body });
}
