import { pid } from '../../lib/params.js';
import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { paginationSchema, paged, skipTake } from '../../lib/pagination.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { notify } from '../notifications/notifications.service.js';
import { TaskStatus } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const tasksRouter = Router();
tasksRouter.use(authenticate);

const schema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(3000).optional().nullable(),
  assigneeId: z.string(),
  dueAt: z.coerce.date().optional().nullable(),
});

const include = {
  assignee: { select: { id: true, fullName: true, avatarUrl: true, branch: { select: { name: true } } } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.TaskInclude;

tasksRouter.get(
  '/',
  requirePermission('tasks.manage', 'dashboard.view'),
  validate(paginationSchema.extend({ status: z.nativeEnum(TaskStatus).optional(), assigneeId: z.string().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof paginationSchema> & { status?: TaskStatus; assigneeId?: string }>(req);
    const where: Prisma.TaskWhereInput = {
      ...(p.status ? { status: p.status } : {}),
      ...(p.assigneeId ? { assigneeId: p.assigneeId } : {}),
      ...(p.search ? { title: { contains: p.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.task.findMany({ where, include, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], ...skipTake(p) }),
      prisma.task.count({ where }),
    ]);
    res.json(serialize(paged(items, total, p)));
  }),
);

tasksRouter.post(
  '/',
  requirePermission('tasks.manage'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const t = await prisma.task.create({ data: { ...req.body, createdById: req.user!.sub }, include });
    await notify({
      userId: t.assigneeId,
      type: 'TASK',
      title: '🎯 Yangi vazifa',
      body: `${t.title}${t.description ? `\n\n${t.description}` : ''}${t.dueAt ? `\n\n⏰ Muddat: ${dayjs(t.dueAt).format('DD.MM.YYYY HH:mm')}` : ''}`,
      payload: { taskId: t.id, keyboard: { inline_keyboard: [[{ text: '✅ Bajardim', callback_data: `task:done:${t.id}` }]] } },
    });
    audit({ userId: req.user!.sub, action: 'task.create', entity: 'Task', entityId: t.id, ip: req.ip });
    res.status(201).json(serialize(t));
  }),
);

tasksRouter.patch(
  '/:id',
  requirePermission('tasks.manage'),
  validate(schema.partial().extend({ status: z.nativeEnum(TaskStatus).optional() })),
  asyncHandler(async (req, res) => {
    const data = { ...req.body } as Prisma.TaskUncheckedUpdateInput;
    if (req.body.status === 'DONE') data.completedAt = new Date();
    const t = await prisma.task.update({ where: { id: pid(req) }, data, include });
    audit({ userId: req.user!.sub, action: 'task.update', entity: 'Task', entityId: t.id, meta: req.body, ip: req.ip });
    res.json(serialize(t));
  }),
);

tasksRouter.delete(
  '/:id',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    await prisma.task.delete({ where: { id: pid(req) } });
    res.json({ ok: true });
  }),
);
