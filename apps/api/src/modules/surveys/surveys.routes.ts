import { pid } from '../../lib/params.js';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { paginationSchema, paged, skipTake } from '../../lib/pagination.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import * as svc from './surveys.service.js';
import { exportCsv, exportPdf, exportXlsx } from './export.js';
import { QuestionType, RoleKey, SurveyAudience, SurveyStatus } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const surveysRouter = Router();
surveysRouter.use(authenticate);

const optionSchema = z.object({ id: z.string().optional(), label: z.string().min(1).max(200), value: z.string().max(100).optional().nullable() });
const questionSchema = z
  .object({
    id: z.string().optional(),
    type: z.nativeEnum(QuestionType),
    text: z.string().min(2).max(500),
    hint: z.string().max(300).optional().nullable(),
    isRequired: z.boolean().default(true),
    minValue: z.number().int().optional().nullable(),
    maxValue: z.number().int().optional().nullable(),
    options: z.array(optionSchema).max(20).default([]),
  })
  .refine((qn) => !(['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(qn.type) && qn.options.length < 2), { message: 'Tanlov savoli uchun kamida 2 ta variant kerak' });

const surveySchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().nullable(),
  audience: z.nativeEnum(SurveyAudience).default('ALL'),
  branchId: z.string().optional().nullable(),
  isAnonymous: z.boolean().default(false),
  allowMultiple: z.boolean().default(false),
  scheduledAt: z.coerce.date().optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
  questions: z.array(questionSchema).max(50).default([]),
  targetUserIds: z.array(z.string()).max(2000).optional(),
});

const listSchema = paginationSchema.extend({
  status: z.nativeEnum(SurveyStatus).optional(),
  audience: z.nativeEnum(SurveyAudience).optional(),
  branchId: z.string().optional(),
});

const filtersSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: z.string().optional(),
  userId: z.string().optional(),
  role: z.nativeEnum(RoleKey).optional(),
});

const scope = (req: { user?: { role: RoleKey; branchId: string | null } }): Prisma.SurveyWhereInput =>
  req.user?.role === 'DIRECTOR' && req.user.branchId ? { OR: [{ branchId: req.user.branchId }, { branchId: null }] } : {};

surveysRouter.get(
  '/',
  requirePermission('surveys.view'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof listSchema>>(req);
    const where: Prisma.SurveyWhereInput = {
      ...scope(req),
      ...(p.status ? { status: p.status } : {}),
      ...(p.audience ? { audience: p.audience } : {}),
      ...(p.branchId ? { branchId: p.branchId } : {}),
      ...(p.search ? { title: { contains: p.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.survey.findMany({
        where,
        include: {
          createdBy: { select: { id: true, fullName: true } },
          branch: { select: { id: true, name: true, code: true } },
          _count: { select: { questions: true, assignments: true, responses: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...skipTake(p),
      }),
      prisma.survey.count({ where }),
    ]);
    const ids = items.map((s) => s.id);
    const completed = await prisma.surveyAssignment.groupBy({ by: ['surveyId'], where: { surveyId: { in: ids }, status: 'COMPLETED' }, _count: true });
    const ratings = await prisma.surveyResponse.groupBy({ by: ['surveyId'], where: { surveyId: { in: ids }, avgRating: { not: null } }, _avg: { avgRating: true } });
    const enriched = items.map((s) => {
      const done = completed.find((c) => c.surveyId === s.id)?._count ?? 0;
      return {
        ...s,
        stats: {
          completed: done,
          assigned: s._count.assignments,
          completionRate: s._count.assignments ? Math.round((done / s._count.assignments) * 100) : 0,
          avgRating: ratings.find((r) => r.surveyId === s.id)?._avg.avgRating ?? null,
        },
      };
    });
    res.json(serialize(paged(enriched, total, p)));
  }),
);

surveysRouter.get(
  '/:id',
  requirePermission('surveys.view'),
  asyncHandler(async (req, res) => {
    const survey = await prisma.survey.findFirst({ where: { id: pid(req), ...scope(req) }, include: svc.surveyInclude });
    if (!survey) throw notFound("So'rovnoma topilmadi");
    const assignments = await prisma.surveyAssignment.findMany({
      where: { surveyId: survey.id },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true, role: { select: { key: true, name: true } }, branch: { select: { id: true, name: true } } } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(serialize({ ...survey, assignments }));
  }),
);

surveysRouter.post(
  '/',
  requirePermission('surveys.create'),
  validate(surveySchema),
  asyncHandler(async (req, res) => {
    const survey = await svc.createSurvey(req.body, req.user!.sub);
    audit({ userId: req.user!.sub, action: 'survey.create', entity: 'Survey', entityId: survey.id, meta: { title: survey.title }, ip: req.ip });
    res.status(201).json(serialize(survey));
  }),
);

surveysRouter.patch(
  '/:id',
  requirePermission('surveys.update'),
  validate(surveySchema.partial()),
  asyncHandler(async (req, res) => {
    const survey = await svc.updateSurvey(pid(req), req.body);
    audit({ userId: req.user!.sub, action: 'survey.update', entity: 'Survey', entityId: survey.id, ip: req.ip });
    res.json(serialize(survey));
  }),
);

surveysRouter.delete(
  '/:id',
  requirePermission('surveys.delete'),
  asyncHandler(async (req, res) => {
    const s = await prisma.survey.findUnique({ where: { id: pid(req) }, select: { title: true } });
    if (!s) throw notFound();
    await prisma.survey.delete({ where: { id: pid(req) } });
    audit({ userId: req.user!.sub, action: 'survey.delete', entity: 'Survey', entityId: pid(req), meta: s, ip: req.ip });
    res.json({ ok: true });
  }),
);

surveysRouter.post(
  '/:id/duplicate',
  requirePermission('surveys.create'),
  asyncHandler(async (req, res) => {
    const survey = await svc.duplicateSurvey(pid(req), req.user!.sub);
    audit({ userId: req.user!.sub, action: 'survey.duplicate', entity: 'Survey', entityId: survey.id, meta: { from: pid(req) }, ip: req.ip });
    res.status(201).json(serialize(survey));
  }),
);

surveysRouter.post(
  '/:id/send',
  requirePermission('surveys.send'),
  validate(
    z.object({
      userIds: z.array(z.string()).optional(),
      branchId: z.string().optional(),
      roles: z.array(z.nativeEnum(RoleKey)).optional(),
      deadline: z.coerce.date().optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const result = await svc.sendSurvey(pid(req), req.body);
    audit({ userId: req.user!.sub, action: 'survey.send', entity: 'Survey', entityId: pid(req), meta: result, ip: req.ip });
    res.json(result);
  }),
);

surveysRouter.post(
  '/:id/schedule',
  requirePermission('surveys.send'),
  validate(z.object({ scheduledAt: z.coerce.date(), deadline: z.coerce.date().optional().nullable() })),
  asyncHandler(async (req, res) => {
    if (req.body.scheduledAt < new Date()) throw badRequest("Rejalashtirilgan vaqt o'tmishda bo'lishi mumkin emas");
    const survey = await prisma.survey.update({
      where: { id: pid(req) },
      data: { status: 'SCHEDULED', scheduledAt: req.body.scheduledAt, deadline: req.body.deadline },
      include: svc.surveyInclude,
    });
    audit({ userId: req.user!.sub, action: 'survey.schedule', entity: 'Survey', entityId: survey.id, meta: req.body, ip: req.ip });
    res.json(serialize(survey));
  }),
);

surveysRouter.post(
  '/:id/remind',
  requirePermission('surveys.send'),
  asyncHandler(async (req, res) => {
    const { remindPending } = await import('../../jobs/scheduler.js');
    const n = await remindPending(pid(req));
    audit({ userId: req.user!.sub, action: 'survey.remind', entity: 'Survey', entityId: pid(req), meta: { reminded: n }, ip: req.ip });
    res.json({ reminded: n });
  }),
);

surveysRouter.post(
  '/:id/status',
  requirePermission('surveys.update'),
  validate(z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']) })),
  asyncHandler(async (req, res) => {
    if (req.body.status === 'COMPLETED' || req.body.status === 'ARCHIVED') {
      await svc.closeSurvey(pid(req), req.body.status);
    } else {
      await prisma.survey.update({ where: { id: pid(req) }, data: { status: req.body.status, closedAt: null } });
    }
    audit({ userId: req.user!.sub, action: 'survey.status', entity: 'Survey', entityId: pid(req), meta: req.body, ip: req.ip });
    res.json({ ok: true });
  }),
);

surveysRouter.get(
  '/:id/results',
  requirePermission('surveys.results', 'surveys.results_hr'),
  validate(filtersSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(serialize(await svc.surveyResults(pid(req), q(req))));
  }),
);

surveysRouter.get(
  '/:id/export',
  requirePermission('analytics.export', 'surveys.results'),
  validate(filtersSchema.extend({ format: z.enum(['csv', 'xlsx', 'pdf']).default('xlsx') }), 'query'),
  asyncHandler(async (req, res) => {
    const { format, ...filters } = q<z.infer<typeof filtersSchema> & { format: 'csv' | 'xlsx' | 'pdf' }>(req);
    const data = await svc.resultRows(pid(req), filters);
    const safeName = data.survey.title.replace(/[^a-zA-Z0-9а-яА-ЯёЁўЎқҚғҒҳҲ'’ ]/g, '').replace(/\s+/g, '_').slice(0, 60) || 'survey';
    audit({ userId: req.user!.sub, action: 'survey.export', entity: 'Survey', entityId: pid(req), meta: { format }, ip: req.ip });
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
      return res.send(exportCsv(data.header, data.rows));
    }
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
      return exportPdf(res, data);
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    await exportXlsx(res, data);
  }),
);
