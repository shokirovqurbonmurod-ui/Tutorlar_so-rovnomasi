import { pid } from '../../lib/params.js';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { paginationSchema, paged, skipTake, type Pagination } from '../../lib/pagination.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { hashPassword } from '../auth/auth.service.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { ROLE_LABELS } from '../../lib/permissions.js';
import { RoleKey, UserStatus, Language } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const usersRouter = Router();
usersRouter.use(authenticate);

const listSchema = paginationSchema.extend({
  role: z.nativeEnum(RoleKey).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  branchId: z.string().optional(),
  departmentId: z.string().optional(),
  telegram: z.enum(['linked', 'unlinked']).optional(),
});

const userInclude = {
  role: { select: { key: true, name: true } },
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  _count: { select: { assignments: true, reports: true, responses: true } },
} satisfies Prisma.UserInclude;

const createSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(7).max(20).optional().nullable(),
  password: z.string().min(8).optional(),
  role: z.nativeEnum(RoleKey),
  branchId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  position: z.string().max(120).optional().nullable(),
  status: z.nativeEnum(UserStatus).default('ACTIVE'),
  language: z.nativeEnum(Language).default('UZ'),
  telegramUsername: z.string().max(64).optional().nullable(),
  telegramId: z.string().regex(/^\d+$/).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  joinDate: z.coerce.date().optional(),
});
const updateSchema = createSchema.partial();

function scopeForRole(req: { user?: { role: RoleKey; branchId: string | null } }): Prisma.UserWhereInput {
  // Directors only see their own branch. CEO / HR / Super Admin see all.
  if (req.user?.role === 'DIRECTOR' && req.user.branchId) return { branchId: req.user.branchId };
  return {};
}

usersRouter.get(
  '/',
  requirePermission('users.view'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof listSchema>>(req);
    const where: Prisma.UserWhereInput = {
      ...scopeForRole(req),
      ...(p.role ? { role: { key: p.role } } : {}),
      ...(p.status ? { status: p.status } : {}),
      ...(p.branchId ? { branchId: p.branchId } : {}),
      ...(p.departmentId ? { departmentId: p.departmentId } : {}),
      ...(p.telegram === 'linked' ? { telegramId: { not: null } } : {}),
      ...(p.telegram === 'unlinked' ? { telegramId: null } : {}),
      ...(p.search
        ? {
            OR: [
              { fullName: { contains: p.search, mode: 'insensitive' } },
              { email: { contains: p.search, mode: 'insensitive' } },
              { phone: { contains: p.search } },
              { telegramUsername: { contains: p.search, mode: 'insensitive' } },
              { position: { contains: p.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const sortable = ['fullName', 'createdAt', 'lastActivityAt', 'joinDate', 'status'];
    const orderBy = sortable.includes(p.sort ?? '') ? { [p.sort!]: p.order } : { createdAt: 'desc' as const };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, include: userInclude, orderBy, ...skipTake(p) }),
      prisma.user.count({ where }),
    ]);
    res.json(serialize(paged(items.map(stripHash), total, p as Pagination)));
  }),
);

usersRouter.get(
  '/roles',
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { createdAt: 'asc' } });
    res.json(roles.map((r) => ({ ...r, label: ROLE_LABELS[r.key] })));
  }),
);

usersRouter.get(
  '/:id',
  requirePermission('users.view'),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { id: pid(req), ...scopeForRole(req) },
      include: {
        ...userInclude,
        tutorGroups: { select: { id: true, name: true, subject: true, studentCount: true } },
        teacherGroups: { select: { id: true, name: true, subject: true, studentCount: true } },
        kpiResults: {
          orderBy: { periodStart: 'desc' },
          take: 14,
          include: { metric: { select: { key: true, name: true, weight: true } } },
        },
      },
    });
    if (!user) throw notFound('Foydalanuvchi topilmadi');
    const [recentResponses, recentReports, auditTrail] = await Promise.all([
      prisma.surveyResponse.findMany({
        where: { userId: user.id, submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 10,
        include: { survey: { select: { id: true, title: true } } },
      }),
      prisma.report.findMany({ where: { authorId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.auditLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 15 }),
    ]);
    res.json(serialize({ ...stripHash(user), recentResponses, recentReports, auditTrail }));
  }),
);

usersRouter.post(
  '/',
  requirePermission('users.create'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    assertRoleAssignable(req.user!.role, body.role);
    const role = await prisma.role.findUniqueOrThrow({ where: { key: body.role } });
    if (['SUPER_ADMIN', 'DIRECTOR', 'CEO', 'HR_ADMIN'].includes(body.role) && !body.email) {
      throw badRequest('Boshqaruv xodimlari uchun email majburiy');
    }
    const user = await prisma.user.create({
      data: {
        fullName: body.fullName,
        email: body.email?.toLowerCase() ?? null,
        phone: body.phone ?? null,
        passwordHash: body.password ? await hashPassword(body.password) : null,
        roleId: role.id,
        branchId: body.branchId ?? null,
        departmentId: body.departmentId ?? null,
        position: body.position ?? null,
        status: body.status,
        language: body.language,
        telegramUsername: body.telegramUsername?.replace(/^@/, '') ?? null,
        telegramId: body.telegramId ? BigInt(body.telegramId) : null,
        notes: body.notes ?? null,
        joinDate: body.joinDate,
      },
      include: userInclude,
    });
    audit({ userId: req.user!.sub, action: 'user.create', entity: 'User', entityId: user.id, meta: { role: body.role }, ip: req.ip });
    res.status(201).json(serialize(stripHash(user)));
  }),
);

usersRouter.patch(
  '/:id',
  requirePermission('users.update'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const existing = await prisma.user.findUnique({ where: { id: pid(req) }, include: { role: true } });
    if (!existing) throw notFound('Foydalanuvchi topilmadi');
    if (existing.role.key === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') throw forbidden();
    if (body.role) assertRoleAssignable(req.user!.role, body.role);

    const data: Prisma.UserUncheckedUpdateInput = {
      fullName: body.fullName,
      email: body.email === undefined ? undefined : body.email?.toLowerCase() ?? null,
      phone: body.phone,
      branchId: body.branchId,
      departmentId: body.departmentId,
      position: body.position,
      status: body.status,
      language: body.language,
      telegramUsername: body.telegramUsername === undefined ? undefined : body.telegramUsername?.replace(/^@/, '') ?? null,
      telegramId: body.telegramId === undefined ? undefined : body.telegramId ? BigInt(body.telegramId) : null,
      notes: body.notes,
      joinDate: body.joinDate,
    };
    if (body.password) data.passwordHash = await hashPassword(body.password);
    if (body.role) data.roleId = (await prisma.role.findUniqueOrThrow({ where: { key: body.role } })).id;

    const user = await prisma.user.update({ where: { id: pid(req) }, data, include: userInclude });
    if (body.status && body.status !== 'ACTIVE') {
      await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    audit({ userId: req.user!.sub, action: 'user.update', entity: 'User', entityId: user.id, meta: body, ip: req.ip });
    res.json(serialize(stripHash(user)));
  }),
);

usersRouter.delete(
  '/:id',
  requirePermission('users.delete'),
  asyncHandler(async (req, res) => {
    if (pid(req) === req.user!.sub) throw badRequest("O'zingizni o'chira olmaysiz");
    const existing = await prisma.user.findUnique({ where: { id: pid(req) }, include: { role: true } });
    if (!existing) throw notFound();
    if (existing.role.key === 'SUPER_ADMIN') throw forbidden("Super Adminni o'chirib bo'lmaydi");
    await prisma.user.delete({ where: { id: pid(req) } });
    audit({ userId: req.user!.sub, action: 'user.delete', entity: 'User', entityId: pid(req), meta: { fullName: existing.fullName }, ip: req.ip });
    res.json({ ok: true });
  }),
);

usersRouter.post(
  '/:id/unlink-telegram',
  requirePermission('users.update'),
  asyncHandler(async (req, res) => {
    await prisma.user.update({ where: { id: pid(req) }, data: { telegramId: null, telegramChatId: null } });
    await prisma.telegramSession.deleteMany({ where: { userId: pid(req) } });
    audit({ userId: req.user!.sub, action: 'user.unlink_telegram', entity: 'User', entityId: pid(req), ip: req.ip });
    res.json({ ok: true });
  }),
);

function assertRoleAssignable(actor: RoleKey, target: RoleKey) {
  if (actor === 'SUPER_ADMIN') return;
  if (actor === 'HR_ADMIN' && ['TUTOR', 'TEACHER'].includes(target)) return;
  throw forbidden("Bu rolni tayinlash uchun ruxsatingiz yo'q");
}

function stripHash<T extends { passwordHash?: string | null }>(u: T) {
  const { passwordHash: _ph, ...rest } = u;
  return { ...rest, hasPassword: Boolean(_ph) };
}
