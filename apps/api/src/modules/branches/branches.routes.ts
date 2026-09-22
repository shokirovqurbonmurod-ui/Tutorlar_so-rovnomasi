import { pid } from '../../lib/params.js';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate } from '../../middleware/validate.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';

export const branchesRouter = Router();
branchesRouter.use(authenticate);

const branchSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(12).transform((s) => s.toUpperCase()),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  studentCount: z.coerce.number().int().min(0).default(0),
  directorId: z.string().optional().nullable(),
  ceoId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

const branchInclude = {
  director: { select: { id: true, fullName: true, avatarUrl: true } },
  ceo: { select: { id: true, fullName: true, avatarUrl: true } },
  _count: { select: { users: true, groups: true, departments: true, surveys: true } },
} as const;

async function withStats<T extends { id: string; studentCount: number }>(branches: T[]) {
  const ids = branches.map((b) => b.id);
  const roles = await prisma.role.findMany({ select: { id: true, key: true } });
  const roleKey = Object.fromEntries(roles.map((r) => [r.id, r.key]));
  const [roleCounts, responses, avgRatings, assignTotals, assignDone] = await Promise.all([
    prisma.user.groupBy({ by: ['branchId', 'roleId'], where: { branchId: { in: ids }, status: 'ACTIVE' }, _count: true }),
    prisma.surveyResponse.groupBy({ by: ['branchIdSnap'], where: { branchIdSnap: { in: ids }, submittedAt: { not: null } }, _count: true }),
    prisma.surveyResponse.groupBy({ by: ['branchIdSnap'], where: { branchIdSnap: { in: ids }, avgRating: { not: null } }, _avg: { avgRating: true } }),
    prisma.$queryRaw<Array<{ branchId: string; total: bigint }>>`
      SELECT u."branchId" as "branchId", COUNT(*)::bigint as total
      FROM survey_assignments a JOIN users u ON u.id = a."userId"
      WHERE u."branchId" = ANY(${ids}) GROUP BY u."branchId"`,
    prisma.$queryRaw<Array<{ branchId: string; done: bigint }>>`
      SELECT u."branchId" as "branchId", COUNT(*)::bigint as done
      FROM survey_assignments a JOIN users u ON u.id = a."userId"
      WHERE u."branchId" = ANY(${ids}) AND a.status = 'COMPLETED' GROUP BY u."branchId"`,
  ]);

  return branches.map((b) => {
    const counts = { tutors: 0, teachers: 0, staff: 0 };
    for (const rc of roleCounts) {
      if (rc.branchId !== b.id) continue;
      const k = roleKey[rc.roleId];
      if (k === 'TUTOR') counts.tutors += rc._count;
      else if (k === 'TEACHER') counts.teachers += rc._count;
      else counts.staff += rc._count;
    }
    const total = Number(assignTotals.find((r) => r.branchId === b.id)?.total ?? 0);
    const done = Number(assignDone.find((r) => r.branchId === b.id)?.done ?? 0);
    return {
      ...b,
      stats: {
        ...counts,
        responses: responses.find((r) => r.branchIdSnap === b.id)?._count ?? 0,
        completionRate: total ? Math.round((done / total) * 100) : 0,
        avgRating: Number((avgRatings.find((r) => r.branchIdSnap === b.id)?._avg.avgRating ?? 0).toFixed(2)),
      },
    };
  });
}

branchesRouter.get(
  '/',
  requirePermission('branches.view'),
  asyncHandler(async (_req, res) => {
    const branches = await prisma.branch.findMany({ include: branchInclude, orderBy: { name: 'asc' } });
    res.json(serialize(await withStats(branches)));
  }),
);

branchesRouter.get(
  '/:id',
  requirePermission('branches.view'),
  asyncHandler(async (req, res) => {
    const branch = await prisma.branch.findUnique({
      where: { id: pid(req) },
      include: {
        ...branchInclude,
        departments: { include: { _count: { select: { users: true } } } },
        groups: {
          include: { tutor: { select: { id: true, fullName: true } }, teacher: { select: { id: true, fullName: true } } },
          orderBy: { name: 'asc' },
        },
        users: {
          where: { status: { not: 'BLOCKED' } },
          select: { id: true, fullName: true, position: true, status: true, avatarUrl: true, lastActivityAt: true, role: { select: { key: true, name: true } } },
          orderBy: { fullName: 'asc' },
        },
      },
    });
    if (!branch) throw notFound('Filial topilmadi');
    const [b] = await withStats([branch]);
    res.json(serialize(b));
  }),
);

branchesRouter.post(
  '/',
  requirePermission('branches.manage'),
  validate(branchSchema),
  asyncHandler(async (req, res) => {
    const branch = await prisma.branch.create({ data: req.body, include: branchInclude });
    audit({ userId: req.user!.sub, action: 'branch.create', entity: 'Branch', entityId: branch.id, ip: req.ip });
    res.status(201).json(serialize(branch));
  }),
);

branchesRouter.patch(
  '/:id',
  requirePermission('branches.manage'),
  validate(branchSchema.partial()),
  asyncHandler(async (req, res) => {
    const branch = await prisma.branch.update({ where: { id: pid(req) }, data: req.body, include: branchInclude });
    audit({ userId: req.user!.sub, action: 'branch.update', entity: 'Branch', entityId: branch.id, meta: req.body, ip: req.ip });
    res.json(serialize(branch));
  }),
);

branchesRouter.delete(
  '/:id',
  requirePermission('branches.manage'),
  asyncHandler(async (req, res) => {
    await prisma.branch.delete({ where: { id: pid(req) } });
    audit({ userId: req.user!.sub, action: 'branch.delete', entity: 'Branch', entityId: pid(req), ip: req.ip });
    res.json({ ok: true });
  }),
);

// ── Departments ───────────────────────────────────────────────────────────────
const deptSchema = z.object({ name: z.string().min(2).max(100), branchId: z.string().optional().nullable() });

branchesRouter.get(
  '/departments/all',
  asyncHandler(async (_req, res) => {
    const items = await prisma.department.findMany({
      include: { branch: { select: { id: true, name: true } }, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(items);
  }),
);

branchesRouter.post(
  '/departments',
  requirePermission('departments.manage', 'branches.manage'),
  validate(deptSchema),
  asyncHandler(async (req, res) => {
    const d = await prisma.department.create({ data: req.body });
    audit({ userId: req.user!.sub, action: 'department.create', entity: 'Department', entityId: d.id, ip: req.ip });
    res.status(201).json(d);
  }),
);

branchesRouter.patch(
  '/departments/:id',
  requirePermission('departments.manage', 'branches.manage'),
  validate(deptSchema.partial()),
  asyncHandler(async (req, res) => {
    res.json(await prisma.department.update({ where: { id: pid(req) }, data: req.body }));
  }),
);

branchesRouter.delete(
  '/departments/:id',
  requirePermission('departments.manage', 'branches.manage'),
  asyncHandler(async (req, res) => {
    await prisma.department.delete({ where: { id: pid(req) } });
    res.json({ ok: true });
  }),
);

// ── Groups ────────────────────────────────────────────────────────────────────
const groupSchema = z.object({
  name: z.string().min(1).max(80),
  subject: z.string().max(80).optional().nullable(),
  branchId: z.string(),
  tutorId: z.string().optional().nullable(),
  teacherId: z.string().optional().nullable(),
  studentCount: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

branchesRouter.get(
  '/groups/all',
  asyncHandler(async (req, res) => {
    const where = req.user!.role === 'DIRECTOR' && req.user!.branchId ? { branchId: req.user!.branchId } : {};
    const items = await prisma.group.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        tutor: { select: { id: true, fullName: true } },
        teacher: { select: { id: true, fullName: true } },
      },
      orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
    });
    res.json(items);
  }),
);

branchesRouter.post(
  '/groups',
  requirePermission('branches.manage', 'users.update'),
  validate(groupSchema),
  asyncHandler(async (req, res) => {
    const g = await prisma.group.create({ data: req.body });
    audit({ userId: req.user!.sub, action: 'group.create', entity: 'Group', entityId: g.id, ip: req.ip });
    res.status(201).json(g);
  }),
);

branchesRouter.patch(
  '/groups/:id',
  requirePermission('branches.manage', 'users.update'),
  validate(groupSchema.partial()),
  asyncHandler(async (req, res) => {
    res.json(await prisma.group.update({ where: { id: pid(req) }, data: req.body }));
  }),
);

branchesRouter.delete(
  '/groups/:id',
  requirePermission('branches.manage'),
  asyncHandler(async (req, res) => {
    await prisma.group.delete({ where: { id: pid(req) } });
    res.json({ ok: true });
  }),
);
