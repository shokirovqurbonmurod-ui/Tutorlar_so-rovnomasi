import { pid } from '../../lib/params.js';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { paginationSchema, paged, skipTake } from '../../lib/pagination.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { notify } from '../notifications/notifications.service.js';
import { ReportStatus, ReportType, type RoleKey } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  DAILY: 'Kunlik hisobot',
  WEEKLY: 'Haftalik hisobot',
  MONTHLY: 'Oylik hisobot',
  PROBLEM: 'Muammo haqida',
  STUDENT_FEEDBACK: "O'quvchi fikri",
  LESSON: 'Dars hisoboti',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  PENDING: 'Kutilmoqda',
  APPROVED: 'Tasdiqlangan',
  REJECTED: 'Rad etilgan',
  NEEDS_REVISION: 'Qayta ishlash kerak',
};

const listSchema = paginationSchema.extend({
  type: z.nativeEnum(ReportType).optional(),
  status: z.nativeEnum(ReportStatus).optional(),
  authorId: z.string().optional(),
  branchId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const include = {
  author: { select: { id: true, fullName: true, avatarUrl: true, role: { select: { key: true, name: true } }, branch: { select: { id: true, name: true } } } },
  reviewer: { select: { id: true, fullName: true } },
  group: { select: { id: true, name: true } },
} satisfies Prisma.ReportInclude;

const scope = (req: { user?: { role: RoleKey; branchId: string | null } }): Prisma.ReportWhereInput =>
  req.user?.role === 'DIRECTOR' && req.user.branchId ? { author: { branchId: req.user.branchId } } : {};

reportsRouter.get(
  '/',
  requirePermission('reports.view'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof listSchema>>(req);
    const where: Prisma.ReportWhereInput = {
      ...scope(req),
      ...(p.type ? { type: p.type } : {}),
      ...(p.status ? { status: p.status } : {}),
      ...(p.authorId ? { authorId: p.authorId } : {}),
      ...(p.branchId ? { author: { branchId: p.branchId } } : {}),
      ...(p.from || p.to ? { createdAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: p.to } : {}) } } : {}),
      ...(p.search ? { OR: [{ title: { contains: p.search, mode: 'insensitive' } }, { content: { contains: p.search, mode: 'insensitive' } }, { author: { fullName: { contains: p.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total, byStatus] = await Promise.all([
      prisma.report.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...skipTake(p) }),
      prisma.report.count({ where }),
      prisma.report.groupBy({ by: ['status'], where: scope(req), _count: true }),
    ]);
    res.json(serialize({ ...paged(items, total, p), counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) }));
  }),
);

reportsRouter.get(
  '/:id',
  requirePermission('reports.view'),
  asyncHandler(async (req, res) => {
    const r = await prisma.report.findFirst({ where: { id: pid(req), ...scope(req) }, include });
    if (!r) throw notFound('Hisobot topilmadi');
    res.json(serialize(r));
  }),
);

reportsRouter.post(
  '/:id/review',
  requirePermission('reports.review'),
  validate(z.object({ status: z.enum(['APPROVED', 'REJECTED', 'NEEDS_REVISION']), note: z.string().max(1000).optional().nullable() })),
  asyncHandler(async (req, res) => {
    const r = await prisma.report.update({
      where: { id: pid(req) },
      data: { status: req.body.status, reviewNote: req.body.note ?? null, reviewerId: req.user!.sub, reviewedAt: new Date() },
      include,
    });
    const emoji = { APPROVED: '✅', REJECTED: '❌', NEEDS_REVISION: '✏️' }[req.body.status as 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION'];
    await notify({
      userId: r.authorId,
      type: 'REPORT_REVIEWED',
      title: `${emoji} Hisobotingiz ko'rib chiqildi`,
      body: `"${r.title}" — ${REPORT_STATUS_LABELS[r.status]}${r.reviewNote ? `\n\n💬 Izoh: ${r.reviewNote}` : ''}`,
      payload: { reportId: r.id },
    });
    audit({ userId: req.user!.sub, action: 'report.review', entity: 'Report', entityId: r.id, meta: req.body, ip: req.ip });
    res.json(serialize(r));
  }),
);

reportsRouter.delete(
  '/:id',
  requirePermission('reports.review'),
  asyncHandler(async (req, res) => {
    await prisma.report.delete({ where: { id: pid(req) } });
    audit({ userId: req.user!.sub, action: 'report.delete', entity: 'Report', entityId: pid(req), ip: req.ip });
    res.json({ ok: true });
  }),
);
