import { pid } from '../../lib/params.js';
import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import * as kpi from './kpi.service.js';
import { KpiPeriod, RoleKey } from '../../generated/prisma/enums.js';

export const kpiRouter = Router();
kpiRouter.use(authenticate);

const periodSchema = z.object({
  period: z.nativeEnum(KpiPeriod).default('WEEKLY'),
  ref: z.coerce.date().optional(),
  branchId: z.string().optional(),
});

kpiRouter.get(
  '/metrics',
  requirePermission('kpi.view'),
  asyncHandler(async (_req, res) => {
    res.json(await prisma.kpiMetric.findMany({ orderBy: { weight: 'desc' } }));
  }),
);

kpiRouter.patch(
  '/metrics/:id',
  requirePermission('kpi.manage'),
  validate(z.object({ name: z.string().min(2).optional(), description: z.string().optional().nullable(), weight: z.number().int().min(0).max(100).optional(), target: z.number().optional(), isActive: z.boolean().optional(), appliesTo: z.array(z.nativeEnum(RoleKey)).optional() })),
  asyncHandler(async (req, res) => {
    const m = await prisma.kpiMetric.update({ where: { id: pid(req) }, data: req.body });
    audit({ userId: req.user!.sub, action: 'kpi.metric_update', entity: 'KpiMetric', entityId: m.id, meta: req.body, ip: req.ip });
    res.json(m);
  }),
);

kpiRouter.get(
  '/leaderboard',
  requirePermission('kpi.view'),
  validate(periodSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof periodSchema>>(req);
    const branchId = req.user!.role === 'DIRECTOR' && req.user!.branchId ? req.user!.branchId : p.branchId;
    const board = await kpi.leaderboard(p.period, p.ref, branchId);
    const range = kpi.periodRange(p.period, p.ref ?? kpi.defaultRef(p.period));
    const avg = board.length ? Math.round(board.reduce((s, b) => s + b.total, 0) / board.length) : 0;
    res.json(serialize({ period: p.period, range, average: avg, count: board.length, items: board }));
  }),
);

kpiRouter.get(
  '/user/:id',
  requirePermission('kpi.view'),
  asyncHandler(async (req, res) => {
    const results = await prisma.kpiResult.findMany({
      where: { userId: pid(req) },
      include: { metric: { select: { key: true, name: true, weight: true } } },
      orderBy: { periodStart: 'desc' },
    });
    const byPeriod = new Map<string, typeof results>();
    for (const r of results) {
      const k = `${r.period}:${dayjs(r.periodStart).format('YYYY-MM-DD')}`;
      byPeriod.set(k, [...(byPeriod.get(k) ?? []), r] as typeof results);
    }
    const history = [...byPeriod.entries()].map(([k, rs]) => ({ key: k, period: rs[0].period, periodStart: rs[0].periodStart, total: kpi.weightedScore(rs), metrics: rs.map((r) => ({ key: r.metric.key, name: r.metric.name, score: r.score, value: r.value, weight: r.metric.weight })) }));
    res.json(serialize(history));
  }),
);

kpiRouter.post(
  '/compute',
  requirePermission('kpi.manage'),
  validate(z.object({ period: z.nativeEnum(KpiPeriod).default('WEEKLY'), ref: z.coerce.date().optional() })),
  asyncHandler(async (req, res) => {
    const r = await kpi.computeKpi(req.body.period, req.body.ref);
    audit({ userId: req.user!.sub, action: 'kpi.compute', meta: r, ip: req.ip });
    res.json(r);
  }),
);
