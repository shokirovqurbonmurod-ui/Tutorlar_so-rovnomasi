import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { pid } from '../../lib/params.js';
import { actor, assertGroupAccess, groupScope, studentScope } from '../../lib/scope.js';
import { notifyMany } from '../notifications/notifications.service.js';
import { Weekday } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { renderSchedulePdf, timetableFor } from './schedule.service.js';

export const scheduleRouter = Router();
scheduleRouter.use(authenticate);

const lessonSchema = z.object({
  groupId: z.string(),
  subjectId: z.string(),
  teacherId: z.string().optional().nullable(),
  roomId: z.string().optional().nullable(),
  weekday: z.nativeEnum(Weekday),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  order: z.coerce.number().int().min(1).max(20).default(1),
  note: z.string().max(200).optional().nullable(),
  scheduleId: z.string().optional().nullable(),
});

const include = {
  subject: { select: { id: true, name: true, color: true } },
  teacher: { select: { id: true, fullName: true } },
  room: { select: { id: true, name: true, building: true } },
  group: { select: { id: true, name: true, branchId: true } },
} satisfies Prisma.LessonInclude;

/** GET /api/schedule?groupId | teacherId | studentId → lessons grouped by weekday */
scheduleRouter.get(
  '/',
  requirePermission('schedule.view'),
  validate(z.object({ groupId: z.string().optional(), teacherId: z.string().optional(), studentId: z.string().optional(), weekday: z.nativeEnum(Weekday).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ groupId?: string; teacherId?: string; studentId?: string; weekday?: Weekday }>(req);
    const a = actor(req);
    let where: Prisma.LessonWhereInput = {};
    if (p.studentId) {
      const st = await prisma.student.findFirst({ where: { id: p.studentId, ...(await studentScope(a)) }, select: { groupId: true } });
      if (!st) throw notFound("O'quvchi topilmadi");
      if (!st.groupId) return res.json({ items: [], byDay: {} });
      where = { groupId: st.groupId };
    } else if (p.groupId) {
      await assertGroupAccess(a, p.groupId);
      where = { groupId: p.groupId };
    } else if (p.teacherId) {
      where = { teacherId: p.teacherId };
    } else if (a.role === 'TEACHER') {
      where = { teacherId: a.sub };
    } else {
      where = { group: await groupScope(a) };
    }
    if (p.weekday) where.weekday = p.weekday;
    const items = await prisma.lesson.findMany({ where, include, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] });
    const byDay: Record<string, typeof items> = {};
    for (const l of items) (byDay[l.weekday] ??= []).push(l);
    res.json(serialize({ items, byDay }));
  }),
);

/** PDF timetable for a group or student */
scheduleRouter.get(
  '/pdf',
  requirePermission('schedule.view'),
  validate(z.object({ groupId: z.string().optional(), studentId: z.string().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ groupId?: string; studentId?: string }>(req);
    const a = actor(req);
    let groupId = p.groupId;
    let title = '';
    if (p.studentId) {
      const st = await prisma.student.findFirst({ where: { id: p.studentId, ...(await studentScope(a)) }, select: { groupId: true, fullName: true } });
      if (!st?.groupId) throw notFound("O'quvchi guruhga biriktirilmagan");
      groupId = st.groupId;
      title = st.fullName;
    }
    if (!groupId) throw badRequest('groupId yoki studentId kerak');
    await assertGroupAccess(a, groupId);
    const data = await timetableFor(groupId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="jadval-${data.group.name}.pdf"`);
    renderSchedulePdf(res, data, title);
  }),
);

scheduleRouter.post(
  '/lessons',
  requirePermission('schedule.manage'),
  validate(lessonSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof lessonSchema>;
    const a = actor(req);
    await assertGroupAccess(a, body.groupId);
    if (body.startTime >= body.endTime) throw badRequest('Tugash vaqti boshlanishdan keyin bo\'lishi kerak');
    await assertNoConflict(body);
    const l = await prisma.lesson.create({ data: body, include });
    await announceChange(l.groupId, `📅 Dars jadvali yangilandi: ${dayLabel(l.weekday)} ${l.startTime}–${l.endTime} — ${l.subject.name}`);
    audit({ userId: a.sub, action: 'lesson.create', entity: 'Lesson', entityId: l.id, meta: body, ip: req.ip });
    res.status(201).json(serialize(l));
  }),
);

/** Bulk replace a group's weekly timetable */
scheduleRouter.put(
  '/groups/:id',
  requirePermission('schedule.manage'),
  validate(z.object({ lessons: z.array(lessonSchema.omit({ groupId: true })).max(100) })),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    await assertGroupAccess(a, pid(req));
    const { lessons } = req.body as { lessons: Omit<z.infer<typeof lessonSchema>, 'groupId'>[] };
    await prisma.$transaction(async (tx) => {
      await tx.lesson.deleteMany({ where: { groupId: pid(req) } });
      if (lessons.length) await tx.lesson.createMany({ data: lessons.map((l) => ({ ...l, groupId: pid(req) })) });
    });
    await announceChange(pid(req), '📅 Guruhingizning dars jadvali yangilandi. Yangi jadvalni botdan ko\'rishingiz mumkin.');
    audit({ userId: a.sub, action: 'schedule.replace', entity: 'Group', entityId: pid(req), meta: { count: lessons.length }, ip: req.ip });
    res.json(serialize(await prisma.lesson.findMany({ where: { groupId: pid(req) }, include, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] })));
  }),
);

scheduleRouter.patch(
  '/lessons/:id',
  requirePermission('schedule.manage'),
  validate(lessonSchema.partial()),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const existing = await prisma.lesson.findUnique({ where: { id: pid(req) } });
    if (!existing) throw notFound();
    await assertGroupAccess(a, existing.groupId);
    const merged = { ...existing, ...(req.body as Partial<z.infer<typeof lessonSchema>>) };
    await assertNoConflict(merged, existing.id);
    const l = await prisma.lesson.update({ where: { id: pid(req) }, data: req.body, include });
    await announceChange(l.groupId, `📅 Dars jadvalida o'zgarish: ${dayLabel(l.weekday)} ${l.startTime}–${l.endTime} — ${l.subject.name}${l.room ? `, ${l.room.name}-xona` : ''}`);
    audit({ userId: a.sub, action: 'lesson.update', entity: 'Lesson', entityId: l.id, meta: req.body, ip: req.ip });
    res.json(serialize(l));
  }),
);

scheduleRouter.delete(
  '/lessons/:id',
  requirePermission('schedule.manage'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const existing = await prisma.lesson.findUnique({ where: { id: pid(req) }, include: { subject: true } });
    if (!existing) throw notFound();
    await assertGroupAccess(a, existing.groupId);
    await prisma.lesson.delete({ where: { id: pid(req) } });
    await announceChange(existing.groupId, `📅 Dars bekor qilindi: ${dayLabel(existing.weekday)} ${existing.startTime} — ${existing.subject.name}`);
    res.json({ ok: true });
  }),
);

const DAY: Record<Weekday, string> = { MON: 'Dushanba', TUE: 'Seshanba', WED: 'Chorshanba', THU: 'Payshanba', FRI: 'Juma', SAT: 'Shanba', SUN: 'Yakshanba' };
export const dayLabel = (d: Weekday) => DAY[d];

async function assertNoConflict(l: { groupId: string; weekday: Weekday; startTime: string; endTime: string; teacherId?: string | null; roomId?: string | null }, excludeId?: string) {
  const overlap = (a: { startTime: string; endTime: string }) => a.startTime < l.endTime && l.startTime < a.endTime;
  const same = await prisma.lesson.findMany({
    where: { weekday: l.weekday, ...(excludeId ? { id: { not: excludeId } } : {}), OR: [{ groupId: l.groupId }, ...(l.teacherId ? [{ teacherId: l.teacherId }] : []), ...(l.roomId ? [{ roomId: l.roomId }] : [])] },
    include: { group: { select: { name: true } }, teacher: { select: { fullName: true } }, room: { select: { name: true } } },
  });
  for (const s of same) {
    if (!overlap(s)) continue;
    if (s.groupId === l.groupId) throw badRequest(`Bu vaqtda guruhda boshqa dars bor (${s.startTime}–${s.endTime})`);
    if (l.teacherId && s.teacherId === l.teacherId) throw badRequest(`O'qituvchi bu vaqtda band: ${s.group.name} (${s.startTime}–${s.endTime})`);
    if (l.roomId && s.roomId === l.roomId) throw badRequest(`Xona band: ${s.group.name} (${s.startTime}–${s.endTime})`);
  }
}

/** Notify students + parents + staff of a group about a timetable change (deduped, non-blocking). */
async function announceChange(groupId: string, body: string) {
  const g = await prisma.group.findUnique({
    where: { id: groupId },
    select: { name: true, tutorId: true, teacherId: true, students: { where: { status: 'ACTIVE' }, select: { userId: true, parents: { select: { parent: { select: { userId: true } } } } } } },
  });
  if (!g) return;
  const ids = new Set<string>();
  for (const s of g.students) {
    if (s.userId) ids.add(s.userId);
    for (const p of s.parents) ids.add(p.parent.userId);
  }
  if (g.tutorId) ids.add(g.tutorId);
  if (g.teacherId) ids.add(g.teacherId);
  void notifyMany([...ids], { type: 'SCHEDULE_CHANGED', title: `📅 ${g.name} — dars jadvali`, body, payload: { groupId, keyboard: { inline_keyboard: [[{ text: '📅 Jadvalni ko\'rish', callback_data: `menu:schedule:${groupId}` }]] } } });
}
