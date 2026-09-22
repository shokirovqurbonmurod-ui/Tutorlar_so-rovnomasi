import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { pid } from '../../lib/params.js';
import { actor, assertGroupAccess, assertStudentAccess, studentAudience, studentScope } from '../../lib/scope.js';
import { notifyMany } from '../notifications/notifications.service.js';
import { GradeKind } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const gradesRouter = Router();
gradesRouter.use(authenticate);

const listSchema = z.object({
  studentId: z.string().optional(),
  groupId: z.string().optional(),
  subjectId: z.string().optional(),
  teacherId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  period: z.enum(['day', 'week', 'month', 'quarter']).optional(),
  kind: z.nativeEnum(GradeKind).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

const gradeInput = z.object({
  studentId: z.string(),
  value: z.coerce.number().int().min(0).max(100),
  maxValue: z.coerce.number().int().min(1).max(100).default(5),
  comment: z.string().max(300).optional().nullable(),
});
const createSchema = z.object({
  groupId: z.string().optional().nullable(),
  subjectId: z.string(),
  lessonId: z.string().optional().nullable(),
  date: z.coerce.date().default(() => new Date()),
  kind: z.nativeEnum(GradeKind).default('LESSON'),
  items: z.array(gradeInput).min(1).max(100),
});

const include = {
  student: { select: { id: true, fullName: true, studentCode: true, groupId: true } },
  subject: { select: { id: true, name: true, color: true } },
  teacher: { select: { id: true, fullName: true } },
  group: { select: { id: true, name: true } },
} satisfies Prisma.GradeInclude;

const KIND_UZ: Record<GradeKind, string> = { LESSON: 'Dars', HOMEWORK: 'Uy vazifasi', QUIZ: 'Nazorat', EXAM: 'Imtihon', PROJECT: 'Loyiha', BEHAVIOR: 'Xulq' };

gradesRouter.get(
  '/',
  requirePermission('grades.view'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof listSchema>>(req);
    const a = actor(req);
    if (p.studentId) await assertStudentAccess(a, p.studentId);
    let from = p.from, to = p.to;
    if (p.period) {
      const unit = p.period === 'quarter' ? 'month' : p.period;
      from = dayjs().startOf(unit as dayjs.OpUnitType).subtract(p.period === 'quarter' ? 2 : 0, 'month').toDate();
      to = new Date();
    }
    const where: Prisma.GradeWhereInput = {
      ...(p.studentId ? { studentId: p.studentId } : { student: await studentScope(a) }),
      ...(p.groupId ? { groupId: p.groupId } : {}),
      ...(p.subjectId ? { subjectId: p.subjectId } : {}),
      ...(p.teacherId ? { teacherId: p.teacherId } : {}),
      ...(p.kind ? { kind: p.kind } : {}),
      ...(from || to ? { date: { ...(from ? { gte: dayjs(from).startOf('day').toDate() } : {}), ...(to ? { lte: dayjs(to).endOf('day').toDate() } : {}) } } : {}),
    };
    const items = await prisma.grade.findMany({ where, include, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: p.limit });
    const five = items.filter((g) => g.maxValue === 5);
    const avg = five.length ? Number((five.reduce((s, g) => s + g.value, 0) / five.length).toFixed(2)) : null;
    const bySubject: Record<string, { subject: string; count: number; avg: number | null; values: number[] }> = {};
    for (const g of five) {
      const b = (bySubject[g.subjectId] ??= { subject: g.subject.name, count: 0, avg: null, values: [] });
      b.count++;
      b.values.push(g.value);
    }
    for (const b of Object.values(bySubject)) b.avg = Number((b.values.reduce((s, v) => s + v, 0) / b.values.length).toFixed(2));
    res.json(serialize({ items, avg, count: items.length, bySubject: Object.values(bySubject).map(({ values: _v, ...r }) => r) }));
  }),
);

/** Gradebook sheet: students × recent dates for a group+subject */
gradesRouter.get(
  '/sheet',
  requirePermission('grades.view'),
  validate(z.object({ groupId: z.string(), subjectId: z.string(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ groupId: string; subjectId: string; from?: Date; to?: Date }>(req);
    const a = actor(req);
    await assertGroupAccess(a, p.groupId);
    const from = dayjs(p.from ?? dayjs().subtract(30, 'day')).startOf('day').toDate();
    const to = dayjs(p.to ?? new Date()).endOf('day').toDate();
    const [students, grades] = await Promise.all([
      prisma.student.findMany({ where: { groupId: p.groupId, status: 'ACTIVE' }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, studentCode: true } }),
      prisma.grade.findMany({ where: { subjectId: p.subjectId, student: { groupId: p.groupId }, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } }),
    ]);
    const dates = [...new Set(grades.map((g) => dayjs(g.date).format('YYYY-MM-DD')))].sort();
    const rows = students.map((s) => {
      const mine = grades.filter((g) => g.studentId === s.id);
      const cells: Record<string, { value: number; maxValue: number; kind: GradeKind; id: string }[]> = {};
      for (const g of mine) (cells[dayjs(g.date).format('YYYY-MM-DD')] ??= []).push({ value: g.value, maxValue: g.maxValue, kind: g.kind, id: g.id });
      const five = mine.filter((g) => g.maxValue === 5);
      return { student: s, cells, avg: five.length ? Number((five.reduce((x, g) => x + g.value, 0) / five.length).toFixed(2)) : null };
    });
    res.json(serialize({ dates, rows }));
  }),
);

gradesRouter.post(
  '/',
  requirePermission('grades.manage'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const a = actor(req);
    const subject = await prisma.subject.findUnique({ where: { id: body.subjectId } });
    if (!subject) throw badRequest('Fan topilmadi');
    // resolve group from first student when not given
    const first = await prisma.student.findUnique({ where: { id: body.items[0].studentId }, select: { groupId: true } });
    const groupId = body.groupId ?? first?.groupId ?? null;
    if (groupId) await assertGroupAccess(a, groupId);
    else for (const it of body.items) await assertStudentAccess(a, it.studentId);
    const date = dayjs(body.date).startOf('day').toDate();

    const created = await prisma.$transaction(
      body.items.map((it) =>
        prisma.grade.create({
          data: { studentId: it.studentId, groupId, subjectId: body.subjectId, lessonId: body.lessonId ?? null, teacherId: a.sub, date, value: it.value, maxValue: it.maxValue, kind: body.kind, comment: it.comment ?? null },
          include,
        }),
      ),
    );

    // notify parents (+ student account)
    const teacher = await prisma.user.findUnique({ where: { id: a.sub }, select: { fullName: true } });
    for (const g of created) {
      const aud = await studentAudience(g.studentId);
      const ids = [...aud.parents, ...(aud.student ? [aud.student] : [])];
      if (!ids.length) continue;
      const stars = g.maxValue === 5 ? ' ' + '⭐'.repeat(Math.max(0, Math.min(5, g.value))) : '';
      void notifyMany(ids, {
        type: 'GRADE',
        title: `📊 Yangi baho — ${subject.name}`,
        body: `${aud.name}\n${dayjs(date).format('DD.MM.YYYY')} · ${KIND_UZ[g.kind]}\n\nBaho: ${g.value}/${g.maxValue}${stars}${g.comment ? `\nIzoh: ${g.comment}` : ''}\nO'qituvchi: ${teacher?.fullName ?? ''}`,
        payload: { studentId: g.studentId, gradeId: g.id, keyboard: { inline_keyboard: [[{ text: '📊 Barcha baholar', callback_data: `child:grades:${g.studentId}` }]] } },
      });
    }
    audit({ userId: a.sub, action: 'grade.create', entity: 'Subject', entityId: body.subjectId, meta: { count: created.length, groupId, date }, ip: req.ip });
    res.status(201).json(serialize(created));
  }),
);

gradesRouter.patch(
  '/:id',
  requirePermission('grades.manage'),
  validate(z.object({ value: z.coerce.number().int().min(0).max(100).optional(), comment: z.string().max(300).optional().nullable(), kind: z.nativeEnum(GradeKind).optional(), date: z.coerce.date().optional() })),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const g = await prisma.grade.findUnique({ where: { id: pid(req) } });
    if (!g) throw notFound();
    if (g.groupId) await assertGroupAccess(a, g.groupId);
    if (a.role === 'TEACHER' && g.teacherId !== a.sub) throw badRequest("Faqat o'zingiz qo'ygan bahoni tahrirlay olasiz");
    const updated = await prisma.grade.update({ where: { id: g.id }, data: req.body, include });
    audit({ userId: a.sub, action: 'grade.update', entity: 'Grade', entityId: g.id, meta: req.body, ip: req.ip });
    res.json(serialize(updated));
  }),
);

gradesRouter.delete(
  '/:id',
  requirePermission('grades.manage'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const g = await prisma.grade.findUnique({ where: { id: pid(req) } });
    if (!g) throw notFound();
    if (g.groupId) await assertGroupAccess(a, g.groupId);
    if (a.role === 'TEACHER' && g.teacherId !== a.sub) throw badRequest("Faqat o'zingiz qo'ygan bahoni o'chira olasiz");
    await prisma.grade.delete({ where: { id: g.id } });
    audit({ userId: a.sub, action: 'grade.delete', entity: 'Grade', entityId: g.id, ip: req.ip });
    res.json({ ok: true });
  }),
);

export { KIND_UZ as GRADE_KIND_UZ };
