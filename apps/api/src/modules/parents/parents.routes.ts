import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { paginationSchema, paged, skipTake, type Pagination } from '../../lib/pagination.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { pid } from '../../lib/params.js';
import { actor, isBranchScoped } from '../../lib/scope.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const parentsRouter = Router();
parentsRouter.use(authenticate);

const listSchema = paginationSchema.extend({ branchId: z.string().optional(), telegram: z.enum(['linked', 'unlinked']).optional(), groupId: z.string().optional() });

const createSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional().nullable(),
  relation: z.string().max(30).optional().nullable(),
  occupation: z.string().max(120).optional().nullable(),
  workplace: z.string().max(120).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  telegramUsername: z.string().max(64).optional().nullable(),
  telegramId: z.string().regex(/^\d+$/).optional().nullable(),
  studentIds: z.array(z.string()).max(10).optional(),
});
const updateSchema = createSchema.partial();

const include = {
  user: { select: { id: true, fullName: true, phone: true, email: true, telegramId: true, telegramUsername: true, status: true, lastActivityAt: true, avatarUrl: true } },
  children: { include: { student: { select: { id: true, fullName: true, studentCode: true, status: true, branchId: true, group: { select: { id: true, name: true } } } } } },
} satisfies Prisma.ParentInclude;

parentsRouter.get(
  '/',
  requirePermission('parents.view'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof listSchema>>(req);
    const a = actor(req);
    const branchId = isBranchScoped(a) ? a.branchId! : p.branchId;
    const where: Prisma.ParentWhereInput = {
      ...(branchId ? { children: { some: { student: { branchId } } } } : {}),
      ...(p.groupId ? { children: { some: { student: { groupId: p.groupId } } } } : {}),
      ...(p.telegram === 'linked' ? { user: { telegramId: { not: null } } } : {}),
      ...(p.telegram === 'unlinked' ? { user: { telegramId: null } } : {}),
      ...(p.search
        ? { OR: [{ user: { fullName: { contains: p.search, mode: 'insensitive' } } }, { user: { phone: { contains: p.search } } }, { children: { some: { student: { fullName: { contains: p.search, mode: 'insensitive' } } } } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.parent.findMany({ where, include, orderBy: { user: { fullName: 'asc' } }, ...skipTake(p) }),
      prisma.parent.count({ where }),
    ]);
    res.json(serialize(paged(items, total, p as Pagination)));
  }),
);

parentsRouter.get(
  '/:id',
  requirePermission('parents.view'),
  asyncHandler(async (req, res) => {
    const item = await prisma.parent.findUnique({ where: { id: pid(req) }, include });
    if (!item) throw notFound('Ota-ona topilmadi');
    const notifications = await prisma.notification.findMany({ where: { userId: item.userId }, orderBy: { createdAt: 'desc' }, take: 20 });
    res.json(serialize({ ...item, notifications }));
  }),
);

parentsRouter.post(
  '/',
  requirePermission('parents.manage'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const role = await prisma.role.findUniqueOrThrow({ where: { slug: 'PARENT' } });
    if (await prisma.user.findUnique({ where: { phone: body.phone } })) throw badRequest('Bu telefon raqam bilan foydalanuvchi mavjud');
    const parent = await prisma.parent.create({
      data: {
        relation: body.relation ?? null,
        occupation: body.occupation ?? null,
        workplace: body.workplace ?? null,
        address: body.address ?? null,
        user: {
          create: {
            fullName: body.fullName,
            phone: body.phone,
            email: body.email?.toLowerCase() ?? null,
            roleId: role.id,
            telegramUsername: body.telegramUsername?.replace(/^@/, '') ?? null,
            telegramId: body.telegramId ? BigInt(body.telegramId) : null,
          },
        },
        children: { create: (body.studentIds ?? []).map((studentId, i) => ({ studentId, isPrimary: i === 0, relation: body.relation ?? null })) },
      },
      include,
    });
    audit({ userId: req.user!.sub, action: 'parent.create', entity: 'Parent', entityId: parent.id, meta: { fullName: body.fullName }, ip: req.ip });
    res.status(201).json(serialize(parent));
  }),
);

parentsRouter.patch(
  '/:id',
  requirePermission('parents.manage'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const existing = await prisma.parent.findUnique({ where: { id: pid(req) } });
    if (!existing) throw notFound('Ota-ona topilmadi');
    const parent = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          fullName: body.fullName,
          phone: body.phone,
          email: body.email === undefined ? undefined : body.email?.toLowerCase() ?? null,
          telegramUsername: body.telegramUsername === undefined ? undefined : body.telegramUsername?.replace(/^@/, '') ?? null,
          telegramId: body.telegramId === undefined ? undefined : body.telegramId ? BigInt(body.telegramId) : null,
        },
      });
      if (body.studentIds) {
        await tx.studentParent.deleteMany({ where: { parentId: existing.id } });
        await tx.studentParent.createMany({ data: body.studentIds.map((studentId, i) => ({ studentId, parentId: existing.id, isPrimary: i === 0 })), skipDuplicates: true });
      }
      return tx.parent.update({ where: { id: existing.id }, data: { relation: body.relation, occupation: body.occupation, workplace: body.workplace, address: body.address }, include });
    });
    audit({ userId: req.user!.sub, action: 'parent.update', entity: 'Parent', entityId: parent.id, meta: body, ip: req.ip });
    res.json(serialize(parent));
  }),
);

parentsRouter.delete(
  '/:id',
  requirePermission('parents.manage'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.parent.findUnique({ where: { id: pid(req) } });
    if (!existing) throw notFound();
    await prisma.user.delete({ where: { id: existing.userId } }); // cascades parent + links
    audit({ userId: req.user!.sub, action: 'parent.delete', entity: 'Parent', entityId: existing.id, ip: req.ip });
    res.json({ ok: true });
  }),
);
