import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { paginationSchema, paged, skipTake } from '../../lib/pagination.js';
import { serialize } from '../../lib/json.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const auditRouter = Router();
auditRouter.use(authenticate, requirePermission('audit.view'));

auditRouter.get(
  '/',
  validate(paginationSchema.extend({ action: z.string().optional(), userId: z.string().optional(), source: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof paginationSchema> & { action?: string; userId?: string; source?: string; from?: Date; to?: Date }>(req);
    const where: Prisma.AuditLogWhereInput = {
      ...(p.action ? { action: { startsWith: p.action } } : {}),
      ...(p.userId ? { userId: p.userId } : {}),
      ...(p.source ? { source: p.source } : {}),
      ...(p.from || p.to ? { createdAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: p.to } : {}) } } : {}),
      ...(p.search ? { OR: [{ action: { contains: p.search } }, { user: { fullName: { contains: p.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { user: { select: { id: true, fullName: true, avatarUrl: true, role: { select: { key: true } } } } }, orderBy: { createdAt: 'desc' }, ...skipTake(p) }),
      prisma.auditLog.count({ where }),
    ]);
    res.json(serialize(paged(items, total, p)));
  }),
);
