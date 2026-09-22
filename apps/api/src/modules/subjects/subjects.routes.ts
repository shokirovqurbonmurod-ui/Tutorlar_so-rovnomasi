import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate } from '../../middleware/validate.js';
import { badRequest } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { pid } from '../../lib/params.js';

/** Subjects + physical classrooms (rooms). */
export const subjectsRouter = Router();
subjectsRouter.use(authenticate);

const subjectSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().max(20).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  branchId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

subjectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const items = await prisma.subject.findMany({
      where: branchId ? { OR: [{ branchId }, { branchId: null }] } : {},
      include: { _count: { select: { lessons: true, grades: true, homeworks: true, groupTeachers: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(items);
  }),
);

subjectsRouter.post(
  '/',
  requirePermission('subjects.manage'),
  validate(subjectSchema),
  asyncHandler(async (req, res) => {
    const s = await prisma.subject.create({ data: req.body });
    audit({ userId: req.user!.sub, action: 'subject.create', entity: 'Subject', entityId: s.id, meta: { name: s.name }, ip: req.ip });
    res.status(201).json(s);
  }),
);

subjectsRouter.patch(
  '/:id',
  requirePermission('subjects.manage'),
  validate(subjectSchema.partial()),
  asyncHandler(async (req, res) => res.json(await prisma.subject.update({ where: { id: pid(req) }, data: req.body }))),
);

subjectsRouter.delete(
  '/:id',
  requirePermission('subjects.manage'),
  asyncHandler(async (req, res) => {
    const used = await prisma.grade.count({ where: { subjectId: pid(req) } });
    if (used) throw badRequest("Bu fan bo'yicha baholar mavjud — o'chirish o'rniga nofaol qiling");
    await prisma.subject.delete({ where: { id: pid(req) } });
    res.json({ ok: true });
  }),
);

// ── Rooms ──────────────────────────────────────────────────────────────────
const roomSchema = z.object({ name: z.string().min(1).max(30), building: z.string().max(60).optional().nullable(), floor: z.coerce.number().int().optional().nullable(), capacity: z.coerce.number().int().optional().nullable(), branchId: z.string() });

subjectsRouter.get(
  '/rooms',
  asyncHandler(async (req, res) => {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    res.json(await prisma.room.findMany({ where: branchId ? { branchId } : {}, orderBy: [{ building: 'asc' }, { name: 'asc' }] }));
  }),
);
subjectsRouter.post('/rooms', requirePermission('schedule.manage', 'branches.manage'), validate(roomSchema), asyncHandler(async (req, res) => res.status(201).json(await prisma.room.create({ data: req.body }))));
subjectsRouter.patch('/rooms/:id', requirePermission('schedule.manage', 'branches.manage'), validate(roomSchema.partial()), asyncHandler(async (req, res) => res.json(await prisma.room.update({ where: { id: pid(req) }, data: req.body }))));
subjectsRouter.delete('/rooms/:id', requirePermission('schedule.manage', 'branches.manage'), asyncHandler(async (req, res) => { await prisma.room.delete({ where: { id: pid(req) } }); res.json({ ok: true }); }));
