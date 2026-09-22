import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { pid } from '../../lib/params.js';
import { actor, assertGroupAccess, groupScope, studentAudience, studentScope } from '../../lib/scope.js';
import { notifyMany } from '../notifications/notifications.service.js';
import { ExamStatus } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const examsRouter = Router();
examsRouter.use(authenticate);

const createSchema = z.object({
  title: z.string().min(2).max(160),
  groupId: z.string(),
  subjectId: z.string(),
  date: z.coerce.date(),
  maxScore: z.coerce.number().int().min(1).max(1000).default(100),
  status: z.nativeEnum(ExamStatus).default('PLANNED'),
  note: z.string().max(1000).optional().nullable(),
});

const include = {
  group: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true, color: true } },
  author: { select: { id: true, fullName: true } },
  _count: { select: { results: true } },
} satisfies Prisma.ExamInclude;

/** score → 5-point grade */
export const toFive = (score: number, max: number) => {
  const p = (score / max) * 100;
  return p >= 86 ? 5 : p >= 71 ? 4 : p >= 56 ? 3 : 2;
};

examsRouter.get(
  '/',
  requirePermission('exams.view'),
  validate(z.object({ groupId: z.string().optional(), studentId: z.string().optional(), status: z.nativeEnum(ExamStatus).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ groupId?: string; studentId?: string; status?: ExamStatus }>(req);
    const a = actor(req);
    const where: Prisma.ExamWhereInput = { ...(p.groupId ? { groupId: p.groupId } : { group: await groupScope(a) }), ...(p.status ? { status: p.status } : {}) };
    if (p.studentId) {
      const st = await prisma.student.findFirst({ where: { id: p.studentId, ...(await studentScope(a)) }, select: { groupId: true } });
      if (!st) throw notFound();
      where.groupId = st.groupId ?? '__none__';
    }
    const items = await prisma.exam.findMany({ where, include: { ...include, ...(p.studentId ? { results: { where: { studentId: p.studentId } } } : {}) }, orderBy: { date: 'desc' }, take: 200 });
    res.json(serialize(items));
  }),
);

examsRouter.get(
  '/:id',
  requirePermission('exams.view'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const e = await prisma.exam.findFirst({ where: { id: pid(req), group: await groupScope(a) }, include: { ...include, results: { include: { student: { select: { id: true, fullName: true, studentCode: true } } }, orderBy: { score: 'desc' } } } });
    if (!e) throw notFound('Imtihon topilmadi');
    const students = await prisma.student.findMany({ where: { groupId: e.groupId, status: 'ACTIVE', ...(await studentScope(a)) }, select: { id: true, fullName: true, studentCode: true }, orderBy: { fullName: 'asc' } });
    const map = new Map(e.results.map((r) => [r.studentId, r]));
    const roster = students.map((s) => ({ student: s, result: map.get(s.id) ?? null }));
    const scores = e.results.map((r) => r.score);
    const avg = scores.length ? Number((scores.reduce((x, y) => x + y, 0) / scores.length).toFixed(1)) : null;
    res.json(serialize({ ...e, roster, avg, max: scores.length ? Math.max(...scores) : null, min: scores.length ? Math.min(...scores) : null }));
  }),
);

examsRouter.post(
  '/',
  requirePermission('exams.manage'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const a = actor(req);
    await assertGroupAccess(a, body.groupId);
    const e = await prisma.exam.create({ data: { ...body, authorId: a.sub }, include });
    // announce to group families
    const students = await prisma.student.findMany({ where: { groupId: e.groupId, status: 'ACTIVE' }, select: { userId: true, parents: { select: { parent: { select: { userId: true } } } } } });
    const ids = new Set<string>();
    for (const s of students) { if (s.userId) ids.add(s.userId); for (const p of s.parents) ids.add(p.parent.userId); }
    void notifyMany([...ids], { type: 'EXAM', title: `🧪 Imtihon — ${e.subject.name}`, body: `${e.group.name}: ${e.title}\n📅 ${dayjs(e.date).format('DD.MM.YYYY HH:mm')}${e.note ? `\n${e.note}` : ''}` });
    audit({ userId: a.sub, action: 'exam.create', entity: 'Exam', entityId: e.id, meta: { title: e.title }, ip: req.ip });
    res.status(201).json(serialize(e));
  }),
);

examsRouter.patch(
  '/:id',
  requirePermission('exams.manage'),
  validate(createSchema.partial()),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const existing = await prisma.exam.findUnique({ where: { id: pid(req) } });
    if (!existing) throw notFound();
    await assertGroupAccess(a, existing.groupId);
    res.json(serialize(await prisma.exam.update({ where: { id: existing.id }, data: req.body, include })));
  }),
);

examsRouter.delete(
  '/:id',
  requirePermission('exams.manage'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const existing = await prisma.exam.findUnique({ where: { id: pid(req) } });
    if (!existing) throw notFound();
    await assertGroupAccess(a, existing.groupId);
    await prisma.exam.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);

/** Bulk enter results; marks exam DONE, writes EXAM grades and notifies parents */
examsRouter.post(
  '/:id/results',
  requirePermission('exams.manage'),
  validate(z.object({ items: z.array(z.object({ studentId: z.string(), score: z.coerce.number().int().min(0), comment: z.string().max(300).optional().nullable() })).min(1) })),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const e = await prisma.exam.findUnique({ where: { id: pid(req) }, include: { subject: true, group: true } });
    if (!e) throw notFound();
    await assertGroupAccess(a, e.groupId);
    const { items } = req.body as { items: { studentId: string; score: number; comment?: string | null }[] };
    for (const it of items) {
      const grade = toFive(it.score, e.maxScore);
      await prisma.examResult.upsert({
        where: { examId_studentId: { examId: e.id, studentId: it.studentId } },
        create: { examId: e.id, studentId: it.studentId, score: it.score, grade, comment: it.comment ?? null },
        update: { score: it.score, grade, comment: it.comment ?? null },
      });
      // mirror into gradebook (one EXAM grade per exam/student)
      const existingGrade = await prisma.grade.findFirst({ where: { studentId: it.studentId, subjectId: e.subjectId, kind: 'EXAM', comment: { startsWith: `Imtihon: ${e.title}` } } });
      const data = { studentId: it.studentId, groupId: e.groupId, subjectId: e.subjectId, teacherId: a.sub, date: dayjs(e.date).startOf('day').toDate(), value: grade, maxValue: 5, kind: 'EXAM' as const, comment: `Imtihon: ${e.title} — ${it.score}/${e.maxScore}` };
      if (existingGrade) await prisma.grade.update({ where: { id: existingGrade.id }, data });
      else await prisma.grade.create({ data });
      const aud = await studentAudience(it.studentId);
      void notifyMany([...aud.parents, ...(aud.student ? [aud.student] : [])], {
        type: 'EXAM',
        title: `🧪 Imtihon natijasi — ${e.subject.name}`,
        body: `${aud.name}\n${e.title}\n\nBall: ${it.score}/${e.maxScore} · Baho: ${grade}${it.comment ? `\nIzoh: ${it.comment}` : ''}`,
        payload: { examId: e.id, studentId: it.studentId },
      });
    }
    await prisma.exam.update({ where: { id: e.id }, data: { status: 'DONE' } });
    audit({ userId: a.sub, action: 'exam.results', entity: 'Exam', entityId: e.id, meta: { count: items.length }, ip: req.ip });
    res.json({ ok: true, saved: items.length });
  }),
);
