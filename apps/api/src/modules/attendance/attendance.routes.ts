import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { badRequest } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { actor, assertGroupAccess, assertStudentAccess, groupScope, studentAudience, studentScope } from '../../lib/scope.js';
import { notifyMany } from '../notifications/notifications.service.js';
import { AttendanceStatus } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

const STATUS_UZ: Record<AttendanceStatus, string> = { PRESENT: 'Kelgan', ABSENT: 'Kelmagan', LATE: 'Kechikkan', EXCUSED: 'Sababli' };
const STATUS_ICON: Record<AttendanceStatus, string> = { PRESENT: '🟢', ABSENT: '🔴', LATE: '🟡', EXCUSED: '⚪️' };
export const attendanceLabel = (s: AttendanceStatus) => `${STATUS_ICON[s]} ${STATUS_UZ[s]}`;

const listSchema = z.object({
  studentId: z.string().optional(),
  groupId: z.string().optional(),
  branchId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  date: z.coerce.date().optional(),
});

const markSchema = z.object({
  groupId: z.string(),
  date: z.coerce.date(),
  lessonId: z.string().optional().nullable(),
  items: z.array(z.object({ studentId: z.string(), status: z.nativeEnum(AttendanceStatus), lateMinutes: z.coerce.number().int().min(0).max(600).optional().nullable(), reason: z.string().max(200).optional().nullable() })).min(1),
});

const include = {
  student: { select: { id: true, fullName: true, studentCode: true, avatarUrl: true } },
  group: { select: { id: true, name: true } },
  lesson: { select: { id: true, startTime: true, endTime: true, subject: { select: { name: true } } } },
  markedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AttendanceInclude;

attendanceRouter.get(
  '/',
  requirePermission('attendance.view'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof listSchema>>(req);
    const a = actor(req);
    const where: Prisma.AttendanceWhereInput = {
      ...(p.studentId ? { studentId: p.studentId } : { student: await studentScope(a) }),
      ...(p.groupId ? { groupId: p.groupId } : {}),
      ...(p.branchId ? { group: { branchId: p.branchId } } : {}),
      ...(p.status ? { status: p.status } : {}),
      ...(p.date ? { date: dayjs(p.date).startOf('day').toDate() } : {}),
      ...(p.from || p.to ? { date: { ...(p.from ? { gte: dayjs(p.from).startOf('day').toDate() } : {}), ...(p.to ? { lte: dayjs(p.to).endOf('day').toDate() } : {}) } } : {}),
    };
    if (p.studentId) await assertStudentAccess(a, p.studentId);
    const items = await prisma.attendance.findMany({ where, include, orderBy: [{ date: 'desc' }, { student: { fullName: 'asc' } }], take: 1000 });
    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as Record<AttendanceStatus, number>;
    for (const i of items) counts[i.status]++;
    res.json(serialize({ items, counts, total: items.length }));
  }),
);

/** Sheet for marking: students of a group with today's (or given date's) status pre-filled. */
attendanceRouter.get(
  '/sheet',
  requirePermission('attendance.mark', 'attendance.view'),
  validate(z.object({ groupId: z.string(), date: z.coerce.date().optional(), lessonId: z.string().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ groupId: string; date?: Date; lessonId?: string }>(req);
    const a = actor(req);
    await assertGroupAccess(a, p.groupId);
    const date = dayjs(p.date ?? new Date()).startOf('day').toDate();
    const [students, existing, lessons] = await Promise.all([
      prisma.student.findMany({ where: { groupId: p.groupId, status: 'ACTIVE' }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, studentCode: true, avatarUrl: true } }),
      prisma.attendance.findMany({ where: { groupId: p.groupId, date, ...(p.lessonId ? { lessonId: p.lessonId } : {}) } }),
      prisma.lesson.findMany({ where: { groupId: p.groupId, weekday: weekdayOf(date) }, include: { subject: { select: { name: true } } }, orderBy: { startTime: 'asc' } }),
    ]);
    const map = new Map(existing.map((e) => [e.studentId, e]));
    res.json(serialize({ date, lessons, items: students.map((s) => ({ student: s, status: map.get(s.id)?.status ?? null, lateMinutes: map.get(s.id)?.lateMinutes ?? null, reason: map.get(s.id)?.reason ?? null })) }));
  }),
);

/** Mark attendance for a group (upsert per student) and notify parents of absent/late students. */
attendanceRouter.post(
  '/mark',
  requirePermission('attendance.mark'),
  validate(markSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof markSchema>;
    const a = actor(req);
    await assertGroupAccess(a, body.groupId);
    const date = dayjs(body.date).startOf('day').toDate();
    if (dayjs(date).isAfter(dayjs(), 'day')) throw badRequest('Kelajak sana uchun davomat qo\'yib bo\'lmaydi');
    const lesson = body.lessonId ? await prisma.lesson.findUnique({ where: { id: body.lessonId }, include: { subject: true } }) : null;

    const results = [] as { studentId: string; status: AttendanceStatus; changed: boolean }[];
    for (const it of body.items) {
      const prev = await prisma.attendance.findFirst({ where: { studentId: it.studentId, date, lessonId: body.lessonId ?? null } });
      const row = prev
        ? await prisma.attendance.update({ where: { id: prev.id }, data: { status: it.status, lateMinutes: it.lateMinutes ?? null, reason: it.reason ?? null, markedById: a.sub } })
        : await prisma.attendance.create({ data: { studentId: it.studentId, groupId: body.groupId, lessonId: body.lessonId ?? null, date, status: it.status, lateMinutes: it.lateMinutes ?? null, reason: it.reason ?? null, markedById: a.sub } });
      results.push({ studentId: row.studentId, status: row.status, changed: !prev || prev.status !== row.status });
    }

    // notify parents (only when status is new/changed and not PRESENT)
    const dateText = dayjs(date).format('DD.MM.YYYY');
    for (const r of results.filter((r) => r.changed && r.status !== 'PRESENT')) {
      const aud = await studentAudience(r.studentId);
      const lessonText = lesson ? ` (${lesson.subject.name}, ${lesson.startTime})` : '';
      const it = body.items.find((i) => i.studentId === r.studentId)!;
      const text =
        r.status === 'ABSENT'
          ? `Farzandingiz ${aud.name} bugun (${dateText}) darsga kelmadi${lessonText}.${it.reason ? `\nSabab: ${it.reason}` : ''}\n\nAgar sabab bo'lsa, iltimos tutor bilan bog'laning.`
          : r.status === 'LATE'
            ? `Farzandingiz ${aud.name} bugun (${dateText}) darsga kechikdi${lessonText}${it.lateMinutes ? ` — ${it.lateMinutes} daqiqa` : ''}.`
            : `Farzandingiz ${aud.name} uchun ${dateText} kuni sababli yo'qlik qayd etildi${lessonText}.${it.reason ? `\nSabab: ${it.reason}` : ''}`;
      void notifyMany(aud.parents, { type: 'ATTENDANCE', title: `${STATUS_ICON[r.status]} Davomat — ${aud.groupName ?? ''}`, body: text, payload: { studentId: r.studentId, status: r.status, date } });
    }
    audit({ userId: a.sub, action: 'attendance.mark', entity: 'Group', entityId: body.groupId, meta: { date, count: body.items.length }, ip: req.ip });
    res.json({ ok: true, marked: results.length, notified: results.filter((r) => r.changed && r.status !== 'PRESENT').length });
  }),
);

/** Monthly calendar for a student: date → status */
attendanceRouter.get(
  '/student/:id/calendar',
  requirePermission('attendance.view'),
  validate(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const studentId = String(req.params.id);
    await assertStudentAccess(a, studentId);
    const { month } = q<{ month?: string }>(req);
    const start = dayjs(month ? `${month}-01` : undefined).startOf('month');
    const rows = await prisma.attendance.findMany({ where: { studentId, date: { gte: start.toDate(), lte: start.endOf('month').toDate() } }, include: { lesson: { select: { subject: { select: { name: true } }, startTime: true } } }, orderBy: { date: 'asc' } });
    const days: Record<string, { status: AttendanceStatus; items: typeof rows }> = {};
    for (const r of rows) {
      const k = dayjs(r.date).format('YYYY-MM-DD');
      const d = (days[k] ??= { status: r.status, items: [] });
      d.items.push(r);
      // worst status wins for the day badge
      const rank: Record<AttendanceStatus, number> = { ABSENT: 3, LATE: 2, EXCUSED: 1, PRESENT: 0 };
      if (rank[r.status] > rank[d.status]) d.status = r.status;
    }
    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as Record<AttendanceStatus, number>;
    for (const d of Object.values(days)) counts[d.status]++;
    res.json(serialize({ month: start.format('YYYY-MM'), days, counts }));
  }),
);

/** Group/branch attendance stats for dashboards */
attendanceRouter.get(
  '/stats',
  requirePermission('attendance.view'),
  validate(z.object({ groupId: z.string().optional(), branchId: z.string().optional(), days: z.coerce.number().int().min(1).max(365).default(30) }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ groupId?: string; branchId?: string; days: number }>(req);
    const a = actor(req);
    const from = dayjs().subtract(p.days, 'day').startOf('day').toDate();
    const where: Prisma.AttendanceWhereInput = { date: { gte: from }, ...(p.groupId ? { groupId: p.groupId } : { group: { ...(await groupScope(a)), ...(p.branchId ? { branchId: p.branchId } : {}) } }) };
    const rows = await prisma.attendance.findMany({ where, select: { date: true, status: true } });
    const byDay = new Map<string, Record<AttendanceStatus, number>>();
    for (const r of rows) {
      const k = dayjs(r.date).format('YYYY-MM-DD');
      const d = byDay.get(k) ?? { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
      d[r.status]++;
      byDay.set(k, d);
    }
    const series = [...byDay.entries()].sort().map(([date, c]) => ({ date, ...c, rate: Math.round(((c.PRESENT + c.LATE) / Math.max(1, c.PRESENT + c.ABSENT + c.LATE + c.EXCUSED)) * 100) }));
    const total = rows.length;
    const present = rows.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    res.json({ rate: total ? Math.round((present / total) * 100) : null, total, series });
  }),
);

function weekdayOf(d: Date) {
  return (['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const)[dayjs(d).day()];
}

export { STATUS_UZ as ATTENDANCE_UZ, STATUS_ICON as ATTENDANCE_ICON };
