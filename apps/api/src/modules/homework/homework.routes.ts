import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { pid } from '../../lib/params.js';
import { actor, assertGroupAccess, groupScope, studentAudience, studentScope } from '../../lib/scope.js';
import { notifyMany } from '../notifications/notifications.service.js';
import { HomeworkStatus } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const homeworkRouter = Router();
homeworkRouter.use(authenticate);

export const HW_STATUS_UZ: Record<HomeworkStatus, string> = { NOT_SUBMITTED: 'Topshirilmagan', SUBMITTED: 'Tekshirilmoqda', ACCEPTED: 'Qabul qilindi', REVISION: 'Qayta ishlash kerak', GRADED: 'Baholandi' };
export const HW_STATUS_ICON: Record<HomeworkStatus, string> = { NOT_SUBMITTED: '⚪️', SUBMITTED: '🟡', ACCEPTED: '🟢', REVISION: '🟠', GRADED: '✅' };

const listSchema = z.object({ groupId: z.string().optional(), subjectId: z.string().optional(), studentId: z.string().optional(), status: z.enum(['open', 'closed']).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });

const createSchema = z.object({
  groupId: z.string(),
  subjectId: z.string(),
  title: z.string().min(2).max(160),
  task: z.string().min(2).max(5000),
  deadline: z.coerce.date(),
  fileUrl: z.string().url().max(500).optional().nullable(),
  fileName: z.string().max(200).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  maxScore: z.coerce.number().int().min(1).max(100).default(5),
});

const include = {
  group: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true, color: true } },
  author: { select: { id: true, fullName: true } },
  _count: { select: { submissions: true } },
} satisfies Prisma.HomeworkInclude;

homeworkRouter.get(
  '/',
  requirePermission('homework.view'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof listSchema>>(req);
    const a = actor(req);
    let where: Prisma.HomeworkWhereInput = { ...(p.groupId ? { groupId: p.groupId } : { group: await groupScope(a) }), ...(p.subjectId ? { subjectId: p.subjectId } : {}) };
    if (p.studentId) {
      const st = await prisma.student.findFirst({ where: { id: p.studentId, ...(await studentScope(a)) }, select: { groupId: true } });
      if (!st) throw notFound();
      where = { ...where, groupId: st.groupId ?? '__none__' };
    }
    if (p.status === 'open') where.deadline = { gte: new Date() };
    if (p.status === 'closed') where.deadline = { lt: new Date() };
    const items = await prisma.homework.findMany({ where, include, orderBy: { deadline: 'desc' }, take: p.limit });
    // per-homework status summary
    const ids = items.map((h) => h.id);
    const subs = ids.length ? await prisma.homeworkSubmission.groupBy({ by: ['homeworkId', 'status'], where: { homeworkId: { in: ids }, ...(p.studentId ? { studentId: p.studentId } : {}) }, _count: { _all: true } }) : [];
    const stat = new Map<string, Record<string, number>>();
    for (const s of subs) {
      const m = stat.get(s.homeworkId) ?? {};
      m[s.status] = s._count._all;
      stat.set(s.homeworkId, m);
    }
    let mine: Map<string, { status: HomeworkStatus; score: number | null; feedback: string | null }> | null = null;
    if (p.studentId) {
      const rows = await prisma.homeworkSubmission.findMany({ where: { homeworkId: { in: ids }, studentId: p.studentId } });
      mine = new Map(rows.map((r) => [r.homeworkId, { status: r.status, score: r.score, feedback: r.feedback }]));
    }
    res.json(serialize(items.map((h) => ({ ...h, stats: stat.get(h.id) ?? {}, mine: mine?.get(h.id) ?? (p.studentId ? { status: 'NOT_SUBMITTED', score: null, feedback: null } : undefined) }))));
  }),
);

homeworkRouter.get(
  '/:id',
  requirePermission('homework.view'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const h = await prisma.homework.findFirst({ where: { id: pid(req), group: await groupScope(a) }, include: { ...include, submissions: { include: { student: { select: { id: true, fullName: true, studentCode: true } }, reviewer: { select: { fullName: true } } }, orderBy: { student: { fullName: 'asc' } } } } });
    if (!h) throw notFound('Uy vazifasi topilmadi');
    const students = await prisma.student.findMany({ where: { groupId: h.groupId, status: 'ACTIVE', ...(await studentScope(a)) }, select: { id: true, fullName: true, studentCode: true }, orderBy: { fullName: 'asc' } });
    const subMap = new Map(h.submissions.map((s) => [s.studentId, s]));
    const roster = students.map((s) => ({ student: s, submission: subMap.get(s.id) ?? null }));
    res.json(serialize({ ...h, roster }));
  }),
);

homeworkRouter.post(
  '/',
  requirePermission('homework.manage'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const a = actor(req);
    await assertGroupAccess(a, body.groupId);
    const h = await prisma.homework.create({ data: { ...body, authorId: a.sub }, include });
    // pre-create NOT_SUBMITTED rows for roster
    const students = await prisma.student.findMany({ where: { groupId: body.groupId, status: 'ACTIVE' }, select: { id: true } });
    if (students.length) await prisma.homeworkSubmission.createMany({ data: students.map((s) => ({ homeworkId: h.id, studentId: s.id })), skipDuplicates: true });
    await notifyHomework(h.id, 'HOMEWORK', `📝 Yangi uy vazifasi — ${h.subject.name}`, `${h.group.name}\nMavzu: ${h.title}\n\n${h.task.slice(0, 400)}${h.task.length > 400 ? '…' : ''}\n\n⏰ Muddat: ${dayjs(h.deadline).format('DD.MM.YYYY HH:mm')}${h.note ? `\nIzoh: ${h.note}` : ''}`);
    audit({ userId: a.sub, action: 'homework.create', entity: 'Homework', entityId: h.id, meta: { title: h.title, groupId: h.groupId }, ip: req.ip });
    res.status(201).json(serialize(h));
  }),
);

homeworkRouter.patch(
  '/:id',
  requirePermission('homework.manage'),
  validate(createSchema.partial()),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const existing = await prisma.homework.findUnique({ where: { id: pid(req) } });
    if (!existing) throw notFound();
    await assertGroupAccess(a, existing.groupId);
    const h = await prisma.homework.update({ where: { id: existing.id }, data: req.body, include });
    audit({ userId: a.sub, action: 'homework.update', entity: 'Homework', entityId: h.id, meta: req.body, ip: req.ip });
    res.json(serialize(h));
  }),
);

homeworkRouter.delete(
  '/:id',
  requirePermission('homework.manage'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const existing = await prisma.homework.findUnique({ where: { id: pid(req) } });
    if (!existing) throw notFound();
    await assertGroupAccess(a, existing.groupId);
    await prisma.homework.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);

/** Student (or parent on behalf) submits work */
homeworkRouter.post(
  '/:id/submit',
  validate(z.object({ studentId: z.string().optional(), content: z.string().max(5000).optional().nullable(), fileUrl: z.string().max(500).optional().nullable(), fileName: z.string().max(200).optional().nullable(), telegramFileId: z.string().max(300).optional().nullable() })),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const body = req.body as { studentId?: string; content?: string | null; fileUrl?: string | null; fileName?: string | null; telegramFileId?: string | null };
    const studentId = body.studentId ?? (await prisma.student.findUnique({ where: { userId: a.sub }, select: { id: true } }))?.id;
    if (!studentId) throw badRequest("O'quvchi aniqlanmadi");
    const allowed = await prisma.student.findFirst({ where: { id: studentId, ...(await studentScope(a)) }, select: { id: true } });
    if (!allowed) throw forbidden();
    const r = await submitHomework(pid(req), studentId, body);
    res.json(serialize(r));
  }),
);

/** Teacher reviews a submission */
homeworkRouter.post(
  '/:id/review',
  requirePermission('homework.manage'),
  validate(z.object({ studentId: z.string(), status: z.enum(['ACCEPTED', 'REVISION', 'GRADED']), score: z.coerce.number().int().min(0).max(100).optional().nullable(), feedback: z.string().max(1000).optional().nullable() })),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const body = req.body as { studentId: string; status: 'ACCEPTED' | 'REVISION' | 'GRADED'; score?: number | null; feedback?: string | null };
    const h = await prisma.homework.findUnique({ where: { id: pid(req) }, include: { subject: true, group: true } });
    if (!h) throw notFound();
    await assertGroupAccess(a, h.groupId);
    const sub = await prisma.homeworkSubmission.upsert({
      where: { homeworkId_studentId: { homeworkId: h.id, studentId: body.studentId } },
      create: { homeworkId: h.id, studentId: body.studentId, status: body.status, score: body.score ?? null, feedback: body.feedback ?? null, reviewedAt: new Date(), reviewerId: a.sub },
      update: { status: body.status, score: body.score ?? null, feedback: body.feedback ?? null, reviewedAt: new Date(), reviewerId: a.sub },
    });
    // GRADED → also write a grade record so it shows up in the gradebook
    if (body.status === 'GRADED' && body.score != null) {
      await prisma.grade.create({ data: { studentId: body.studentId, groupId: h.groupId, subjectId: h.subjectId, teacherId: a.sub, date: dayjs().startOf('day').toDate(), value: body.score, maxValue: h.maxScore, kind: 'HOMEWORK', comment: `Uy vazifasi: ${h.title}` } });
    }
    const aud = await studentAudience(body.studentId);
    const ids = [...aud.parents, ...(aud.student ? [aud.student] : [])];
    void notifyMany(ids, {
      type: 'HOMEWORK_REVIEWED',
      title: `${HW_STATUS_ICON[body.status]} Uy vazifasi — ${HW_STATUS_UZ[body.status]}`,
      body: `${aud.name}\n${h.subject.name}: ${h.title}${body.score != null ? `\nBall: ${body.score}/${h.maxScore}` : ''}${body.feedback ? `\n\nIzoh: ${body.feedback}` : ''}`,
      payload: { homeworkId: h.id, studentId: body.studentId },
    });
    audit({ userId: a.sub, action: 'homework.review', entity: 'Homework', entityId: h.id, meta: body, ip: req.ip });
    res.json(serialize(sub));
  }),
);

export async function submitHomework(homeworkId: string, studentId: string, body: { content?: string | null; fileUrl?: string | null; fileName?: string | null; telegramFileId?: string | null }) {
  const h = await prisma.homework.findUnique({ where: { id: homeworkId }, include: { subject: true, group: true, author: { select: { id: true } } } });
  if (!h) throw notFound('Uy vazifasi topilmadi');
  if (!body.content && !body.fileUrl && !body.telegramFileId) throw badRequest('Javob matni yoki fayl yuboring');
  const prev = await prisma.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId, studentId } } });
  const sub = await prisma.homeworkSubmission.upsert({
    where: { homeworkId_studentId: { homeworkId, studentId } },
    create: { homeworkId, studentId, status: 'SUBMITTED', content: body.content ?? null, fileUrl: body.fileUrl ?? null, fileName: body.fileName ?? null, telegramFileId: body.telegramFileId ?? null, submittedAt: new Date(), attempts: 1 },
    update: { status: 'SUBMITTED', content: body.content ?? null, fileUrl: body.fileUrl ?? null, fileName: body.fileName ?? null, telegramFileId: body.telegramFileId ?? null, submittedAt: new Date(), attempts: (prev?.attempts ?? 0) + 1, feedback: null },
    include: { student: { select: { fullName: true } } },
  });
  const late = dayjs().isAfter(h.deadline);
  void notifyMany([h.authorId], {
    type: 'HOMEWORK',
    title: `📥 Uy vazifasi topshirildi${late ? ' (kechikib)' : ''}`,
    body: `${sub.student.fullName} — ${h.group.name}\n${h.subject.name}: ${h.title}`,
    payload: { homeworkId, studentId, keyboard: { inline_keyboard: [[{ text: '✅ Qabul', callback_data: `hw:ok:${homeworkId}:${studentId}` }, { text: '🔁 Qayta ishlash', callback_data: `hw:rev:${homeworkId}:${studentId}` }]] } },
  });
  return sub;
}

async function notifyHomework(homeworkId: string, type: 'HOMEWORK' | 'HOMEWORK_DEADLINE', title: string, body: string) {
  const h = await prisma.homework.findUnique({ where: { id: homeworkId }, select: { groupId: true } });
  if (!h) return;
  const students = await prisma.student.findMany({ where: { groupId: h.groupId, status: 'ACTIVE' }, select: { userId: true, parents: { select: { parent: { select: { userId: true } } } } } });
  const ids = new Set<string>();
  for (const s of students) {
    if (s.userId) ids.add(s.userId);
    for (const p of s.parents) ids.add(p.parent.userId);
  }
  await notifyMany([...ids], { type, title, body, payload: { homeworkId, keyboard: { inline_keyboard: [[{ text: "📝 Ko'rish", callback_data: `hw:view:${homeworkId}` }]] } } });
}
