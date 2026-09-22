import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { serialize } from '../../lib/json.js';
import * as a from './analytics.service.js';
import { RoleKey } from '../../generated/prisma/enums.js';
import type { Request } from 'express';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate, requirePermission('dashboard.view', 'analytics.view'));

const scopeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: z.string().optional(),
  range: z.enum(['7d', '30d', '90d', '12m']).optional(),
});

function scopeOf(req: Request): a.Scope {
  const p = q<z.infer<typeof scopeSchema>>(req);
  const days = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 }[p.range ?? '30d'];
  const to = p.to ?? dayjs().endOf('day').toDate();
  const from = p.from ?? dayjs(to).subtract(days - 1, 'day').startOf('day').toDate();
  // Directors are locked to their branch
  const branchId = req.user!.role === 'DIRECTOR' && req.user!.branchId ? req.user!.branchId : p.branchId;
  return { from, to, branchId };
}

analyticsRouter.get(
  '/dashboard',
  validate(scopeSchema, 'query'),
  asyncHandler(async (req, res) => {
    const s = scopeOf(req);
    const [overview, completion, activity, branches, rating, reports, top, recent, deadlines] = await Promise.all([
      a.overview(s),
      a.completionTimeline(s),
      a.activityTimeline(s),
      a.branchPerformance(s),
      a.ratingTrend(s),
      a.reportsBreakdown(s),
      a.topPerformers(s),
      a.recentActivity(s),
      a.upcomingDeadlines(s),
    ]);
    res.json(serialize({ scope: s, overview, completion, activity, branches, rating, reports, top, recent, deadlines }));
  }),
);

analyticsRouter.get('/overview', validate(scopeSchema, 'query'), asyncHandler(async (req, res) => res.json(await a.overview(scopeOf(req)))));
analyticsRouter.get('/completion', validate(scopeSchema, 'query'), asyncHandler(async (req, res) => res.json(await a.completionTimeline(scopeOf(req)))));
analyticsRouter.get('/activity', validate(scopeSchema, 'query'), asyncHandler(async (req, res) => res.json(await a.activityTimeline(scopeOf(req)))));
analyticsRouter.get('/branches', validate(scopeSchema, 'query'), asyncHandler(async (req, res) => res.json(await a.branchPerformance(scopeOf(req)))));
analyticsRouter.get('/rating', validate(scopeSchema, 'query'), asyncHandler(async (req, res) => res.json(await a.ratingTrend(scopeOf(req)))));
analyticsRouter.get('/reports', validate(scopeSchema, 'query'), asyncHandler(async (req, res) => res.json(await a.reportsBreakdown(scopeOf(req)))));
analyticsRouter.get(
  '/performers',
  validate(scopeSchema.extend({ role: z.nativeEnum(RoleKey).optional(), limit: z.coerce.number().min(1).max(100).default(10) }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ role?: RoleKey; limit: number }>(req);
    res.json(serialize(await a.topPerformers(scopeOf(req), p.role, p.limit)));
  }),
);
