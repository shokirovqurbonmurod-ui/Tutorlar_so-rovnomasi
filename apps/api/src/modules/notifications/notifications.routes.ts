import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { paginationSchema, paged, skipTake } from '../../lib/pagination.js';
import { badRequest } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { notifyMany, flushQueued } from './notifications.service.js';
import { NotificationStatus, NotificationType, RoleKey } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  requirePermission('notifications.view'),
  validate(paginationSchema.extend({ status: z.nativeEnum(NotificationStatus).optional(), type: z.nativeEnum(NotificationType).optional(), userId: z.string().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof paginationSchema> & { status?: NotificationStatus; type?: NotificationType; userId?: string }>(req);
    const where: Prisma.NotificationWhereInput = {
      ...(p.status ? { status: p.status } : {}),
      ...(p.type ? { type: p.type } : {}),
      ...(p.userId ? { userId: p.userId } : {}),
      ...(p.search ? { OR: [{ title: { contains: p.search, mode: 'insensitive' } }, { user: { fullName: { contains: p.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total, byStatus] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, avatarUrl: true, telegramId: true } }, survey: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        ...skipTake(p),
      }),
      prisma.notification.count({ where }),
      prisma.notification.groupBy({ by: ['status'], _count: true }),
    ]);
    res.json(serialize({ ...paged(items, total, p), counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) }));
  }),
);

/** Send a custom admin message to selected users / roles / branch. */
notificationsRouter.post(
  '/broadcast',
  requirePermission('notifications.send'),
  validate(
    z.object({
      title: z.string().min(2).max(150),
      body: z.string().min(2).max(3000),
      userIds: z.array(z.string()).optional(),
      roles: z.array(z.nativeEnum(RoleKey)).optional(),
      branchId: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { title, body, userIds, roles, branchId } = req.body as { title: string; body: string; userIds?: string[]; roles?: RoleKey[]; branchId?: string };
    const where: Prisma.UserWhereInput = { status: 'ACTIVE' };
    if (userIds?.length) where.id = { in: userIds };
    else {
      if (roles?.length) where.role = { key: { in: roles } };
      if (branchId) where.branchId = branchId;
    }
    if (!userIds?.length && !roles?.length && !branchId) throw badRequest('Qabul qiluvchilarni tanlang');
    const users = await prisma.user.findMany({ where, select: { id: true } });
    const sent = await notifyMany(users.map((u) => u.id), { type: 'ADMIN_MESSAGE', title: `💬 ${title}`, body });
    audit({ userId: req.user!.sub, action: 'notification.broadcast', meta: { title, recipients: users.length, sent }, ip: req.ip });
    res.json({ recipients: users.length, sent });
  }),
);

notificationsRouter.post(
  '/retry',
  requirePermission('notifications.send'),
  asyncHandler(async (_req, res) => {
    res.json({ retried: await flushQueued() });
  }),
);
