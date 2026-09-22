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
import { actor, assertStudentAccess, isBranchScoped, isGlobal, studentAudience, studentScope } from '../../lib/scope.js';
import { notifyMany } from '../notifications/notifications.service.js';
import { DormLogSeverity, DormLogType, Gender } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const dormRouter = Router();
dormRouter.use(authenticate);

export const DORM_LOG_UZ: Record<DormLogType, string> = { CHECK_IN: 'Kirish', CHECK_OUT: 'Chiqish', LATE: 'Kechikish', ABSENT: 'Kelmagan', INCIDENT: 'Incident', ROOM_ISSUE: 'Xona muammosi', NOTE: 'Izoh' };
const LOG_ICON: Record<DormLogType, string> = { CHECK_IN: '🟢', CHECK_OUT: '🚪', LATE: '🟡', ABSENT: '🔴', INCIDENT: '⚠️', ROOM_ISSUE: '🛠', NOTE: '📝' };

/** Dorm managers only see dormitories they manage (or their branch). */
async function dormWhere(a: ReturnType<typeof actor>): Promise<Prisma.DormitoryWhereInput> {
  if (isGlobal(a)) return {};
  if (a.role === 'DORM_MANAGER') return { OR: [{ managerId: a.sub }, ...(a.branchId ? [{ branchId: a.branchId }] : [])] };
  if (isBranchScoped(a)) return { branchId: a.branchId! };
  return { id: '__none__' };
}

const structureInclude = {
  branch: { select: { id: true, name: true } },
  manager: { select: { id: true, fullName: true, phone: true } },
  buildings: {
    orderBy: { name: 'asc' },
    include: {
      rooms: {
        orderBy: [{ floor: 'asc' }, { number: 'asc' }],
        include: {
          beds: {
            orderBy: { label: 'asc' },
            include: { assignment: { include: { student: { select: { id: true, fullName: true, studentCode: true, group: { select: { name: true } } } } } } },
          },
        },
      },
    },
  },
} satisfies Prisma.DormitoryInclude;

// ── Overview ────────────────────────────────────────────────────────────────
dormRouter.get(
  '/',
  requirePermission('dorm.view'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const dorms = await prisma.dormitory.findMany({ where: await dormWhere(a), include: structureInclude, orderBy: { name: 'asc' } });
    const shaped = dorms.map((d) => {
      const rooms = d.buildings.flatMap((b) => b.rooms);
      const beds = rooms.flatMap((r) => r.beds);
      const occupied = beds.filter((b) => b.assignment).length;
      return { ...d, stats: { buildings: d.buildings.length, rooms: rooms.length, beds: beds.length, occupied, free: beds.length - occupied, occupancy: beds.length ? Math.round((occupied / beds.length) * 100) : 0, needsRepair: rooms.filter((r) => r.condition !== 'GOOD').length } };
    });
    const todayLogs = await prisma.dormLog.groupBy({ by: ['type'], where: { occurredAt: { gte: dayjs().startOf('day').toDate() } }, _count: { _all: true } });
    res.json(serialize({ items: shaped, today: Object.fromEntries(todayLogs.map((t) => [t.type, t._count._all])) }));
  }),
);

const dormSchema = z.object({ name: z.string().min(1).max(80), address: z.string().max(200).optional().nullable(), branchId: z.string(), managerId: z.string().optional().nullable() });
dormRouter.post('/', requirePermission('dorm.manage'), validate(dormSchema), asyncHandler(async (req, res) => {
  const d = await prisma.dormitory.create({ data: req.body, include: structureInclude });
  audit({ userId: req.user!.sub, action: 'dorm.create', entity: 'Dormitory', entityId: d.id, ip: req.ip });
  res.status(201).json(serialize(d));
}));
dormRouter.patch('/:id', requirePermission('dorm.manage'), validate(dormSchema.partial()), asyncHandler(async (req, res) => res.json(serialize(await prisma.dormitory.update({ where: { id: pid(req) }, data: req.body, include: structureInclude })))));
dormRouter.delete('/:id', requirePermission('dorm.manage'), asyncHandler(async (req, res) => { await prisma.dormitory.delete({ where: { id: pid(req) } }); res.json({ ok: true }); }));

// ── Buildings / rooms / beds ────────────────────────────────────────────────
dormRouter.post('/buildings', requirePermission('dorm.manage'), validate(z.object({ dormitoryId: z.string(), name: z.string().min(1).max(60), floors: z.coerce.number().int().min(1).max(50).default(1) })), asyncHandler(async (req, res) => res.status(201).json(await prisma.dormBuilding.create({ data: req.body }))));
dormRouter.patch('/buildings/:id', requirePermission('dorm.manage'), validate(z.object({ name: z.string().min(1).max(60).optional(), floors: z.coerce.number().int().min(1).max(50).optional() })), asyncHandler(async (req, res) => res.json(await prisma.dormBuilding.update({ where: { id: pid(req) }, data: req.body }))));
dormRouter.delete('/buildings/:id', requirePermission('dorm.manage'), asyncHandler(async (req, res) => { await prisma.dormBuilding.delete({ where: { id: pid(req) } }); res.json({ ok: true }); }));

const roomSchema = z.object({ buildingId: z.string(), number: z.string().min(1).max(20), floor: z.coerce.number().int().min(0).max(50), capacity: z.coerce.number().int().min(1).max(20).default(4), gender: z.nativeEnum(Gender).optional().nullable(), condition: z.enum(['GOOD', 'NEEDS_REPAIR', 'CLOSED']).default('GOOD'), note: z.string().max(300).optional().nullable() });
dormRouter.post('/rooms', requirePermission('dorm.manage'), validate(roomSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof roomSchema>;
  const room = await prisma.dormRoom.create({ data: { ...body, beds: { create: Array.from({ length: body.capacity }, (_, i) => ({ label: String(i + 1) })) } }, include: { beds: true } });
  res.status(201).json(room);
}));
dormRouter.patch('/rooms/:id', requirePermission('dorm.manage'), validate(roomSchema.partial().omit({ buildingId: true })), asyncHandler(async (req, res) => {
  const body = req.body as Partial<z.infer<typeof roomSchema>>;
  const room = await prisma.dormRoom.update({ where: { id: pid(req) }, data: body, include: { beds: true } });
  // grow beds when capacity increases
  if (body.capacity && body.capacity > room.beds.length) {
    await prisma.dormBed.createMany({ data: Array.from({ length: body.capacity - room.beds.length }, (_, i) => ({ roomId: room.id, label: String(room.beds.length + i + 1) })), skipDuplicates: true });
  }
  if (body.condition && body.condition !== 'GOOD') await prisma.dormLog.create({ data: { roomId: room.id, type: 'ROOM_ISSUE', severity: 'WARNING', title: `${room.number}-xona holati: ${body.condition === 'CLOSED' ? 'yopiq' : "ta'mir talab"}`, body: body.note ?? null, authorId: req.user!.sub } });
  res.json(await prisma.dormRoom.findUnique({ where: { id: room.id }, include: { beds: true } }));
}));
dormRouter.delete('/rooms/:id', requirePermission('dorm.manage'), asyncHandler(async (req, res) => {
  const occupied = await prisma.dormAssignment.count({ where: { bed: { roomId: pid(req) } } });
  if (occupied) throw badRequest("Xonada o'quvchilar bor");
  await prisma.dormRoom.delete({ where: { id: pid(req) } });
  res.json({ ok: true });
}));

// ── Assignments ─────────────────────────────────────────────────────────────
dormRouter.get(
  '/students',
  requirePermission('dorm.view'),
  validate(z.object({ dormitoryId: z.string().optional(), search: z.string().optional(), unassigned: z.enum(['yes']).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ dormitoryId?: string; search?: string; unassigned?: 'yes' }>(req);
    const a = actor(req);
    if (p.unassigned === 'yes') {
      const items = await prisma.student.findMany({ where: { isBoarder: true, status: 'ACTIVE', dormAssignment: null, ...(isBranchScoped(a) ? { branchId: a.branchId! } : {}), ...(p.search ? { fullName: { contains: p.search, mode: 'insensitive' } } : {}) }, select: { id: true, fullName: true, studentCode: true, gender: true, group: { select: { name: true } } }, orderBy: { fullName: 'asc' } });
      return res.json(serialize(items));
    }
    const items = await prisma.dormAssignment.findMany({
      where: { bed: { room: { building: { dormitory: { ...(await dormWhere(a)), ...(p.dormitoryId ? { id: p.dormitoryId } : {}) } } } }, ...(p.search ? { student: { fullName: { contains: p.search, mode: 'insensitive' } } } : {}) },
      include: { student: { select: { id: true, fullName: true, studentCode: true, gender: true, phone: true, group: { select: { name: true } }, parents: { take: 1, select: { parent: { select: { user: { select: { fullName: true, phone: true } } } } } } } }, bed: { include: { room: { include: { building: { include: { dormitory: { select: { id: true, name: true } } } } } } } } },
      orderBy: { student: { fullName: 'asc' } },
    });
    res.json(serialize(items));
  }),
);

dormRouter.post(
  '/assign',
  requirePermission('dorm.manage'),
  validate(z.object({ studentId: z.string(), bedId: z.string(), note: z.string().max(300).optional().nullable(), checkInAt: z.coerce.date().optional() })),
  asyncHandler(async (req, res) => {
    const body = req.body as { studentId: string; bedId: string; note?: string | null; checkInAt?: Date };
    const bed = await prisma.dormBed.findUnique({ where: { id: body.bedId }, include: { assignment: true, room: { include: { building: { include: { dormitory: true } } } } } });
    if (!bed) throw notFound('Krovat topilmadi');
    if (bed.assignment) throw badRequest('Bu krovat band');
    const student = await prisma.student.findUnique({ where: { id: body.studentId } });
    if (!student) throw notFound("O'quvchi topilmadi");
    if (bed.room.gender && student.gender && bed.room.gender !== student.gender) throw badRequest("Xona jinsi o'quvchiga mos emas");
    await prisma.dormAssignment.deleteMany({ where: { studentId: student.id } });
    const asg = await prisma.dormAssignment.create({ data: { studentId: student.id, bedId: bed.id, note: body.note ?? null, checkInAt: body.checkInAt ?? new Date() } });
    await prisma.student.update({ where: { id: student.id }, data: { isBoarder: true } });
    await prisma.dormLog.create({ data: { studentId: student.id, roomId: bed.roomId, type: 'CHECK_IN', title: `${student.fullName} ${bed.room.building.name}, ${bed.room.number}-xona, ${bed.label}-krovatga joylashtirildi`, authorId: req.user!.sub, occurredAt: asg.checkInAt } });
    const aud = await studentAudience(student.id);
    void notifyMany(aud.parents, { type: 'DORM_INCIDENT', title: '🏠 Yotoqxona', body: `Farzandingiz ${student.fullName} yotoqxonaga joylashtirildi.\n\n🏢 ${bed.room.building.dormitory.name} · ${bed.room.building.name}\n🚪 ${bed.room.number}-xona, ${bed.room.floor}-qavat\n🛏 ${bed.label}-krovat\n📅 ${dayjs(asg.checkInAt).format('DD.MM.YYYY')}` });
    audit({ userId: req.user!.sub, action: 'dorm.assign', entity: 'Student', entityId: student.id, meta: { bedId: bed.id }, ip: req.ip });
    res.status(201).json(serialize(asg));
  }),
);

dormRouter.post(
  '/checkout/:studentId',
  requirePermission('dorm.manage'),
  validate(z.object({ note: z.string().max(300).optional().nullable() })),
  asyncHandler(async (req, res) => {
    const studentId = String(req.params.studentId);
    const asg = await prisma.dormAssignment.findUnique({ where: { studentId }, include: { bed: { include: { room: true } }, student: true } });
    if (!asg) throw notFound("O'quvchi yotoqxonaga joylashtirilmagan");
    await prisma.dormAssignment.delete({ where: { id: asg.id } });
    await prisma.dormLog.create({ data: { studentId, roomId: asg.bed.roomId, type: 'CHECK_OUT', title: `${asg.student.fullName} yotoqxonadan chiqarildi (${asg.bed.room.number}-xona)`, body: (req.body as { note?: string | null }).note ?? null, authorId: req.user!.sub } });
    audit({ userId: req.user!.sub, action: 'dorm.checkout', entity: 'Student', entityId: studentId, ip: req.ip });
    res.json({ ok: true });
  }),
);

// ── Logs (attendance / incidents / issues) ──────────────────────────────────
const logList = z.object({ studentId: z.string().optional(), roomId: z.string().optional(), type: z.nativeEnum(DormLogType).optional(), severity: z.nativeEnum(DormLogSeverity).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });
dormRouter.get(
  '/logs',
  requirePermission('dorm.view'),
  validate(logList, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof logList>>(req);
    const a = actor(req);
    if (p.studentId) await assertStudentAccess(a, p.studentId);
    const where: Prisma.DormLogWhereInput = {
      ...(p.studentId ? { studentId: p.studentId } : a.role === 'PARENT' || a.role === 'STUDENT' ? { student: await studentScope(a) } : {}),
      ...(p.roomId ? { roomId: p.roomId } : {}),
      ...(p.type ? { type: p.type } : {}),
      ...(p.severity ? { severity: p.severity } : {}),
      ...(p.from || p.to ? { occurredAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: dayjs(p.to).endOf('day').toDate() } : {}) } } : {}),
    };
    const items = await prisma.dormLog.findMany({ where, include: { student: { select: { id: true, fullName: true, studentCode: true } }, room: { select: { number: true, floor: true, building: { select: { name: true } } } }, author: { select: { fullName: true } } }, orderBy: { occurredAt: 'desc' }, take: p.limit });
    res.json(serialize(items));
  }),
);

dormRouter.post(
  '/logs',
  requirePermission('dorm.manage'),
  validate(z.object({ studentId: z.string().optional().nullable(), roomId: z.string().optional().nullable(), type: z.nativeEnum(DormLogType), severity: z.nativeEnum(DormLogSeverity).default('INFO'), title: z.string().min(2).max(200), body: z.string().max(2000).optional().nullable(), occurredAt: z.coerce.date().optional(), notifyParents: z.boolean().default(true) })),
  asyncHandler(async (req, res) => {
    const b = req.body as { studentId?: string | null; roomId?: string | null; type: DormLogType; severity: DormLogSeverity; title: string; body?: string | null; occurredAt?: Date; notifyParents: boolean };
    let roomId = b.roomId ?? null;
    if (!roomId && b.studentId) roomId = (await prisma.dormAssignment.findUnique({ where: { studentId: b.studentId }, select: { bed: { select: { roomId: true } } } }))?.bed.roomId ?? null;
    const log = await prisma.dormLog.create({ data: { studentId: b.studentId ?? null, roomId, type: b.type, severity: b.severity, title: b.title, body: b.body ?? null, occurredAt: b.occurredAt ?? new Date(), authorId: req.user!.sub } });
    let notified = 0;
    const important = b.severity !== 'INFO' || ['ABSENT', 'LATE', 'INCIDENT'].includes(b.type);
    if (b.studentId && b.notifyParents && important) {
      const aud = await studentAudience(b.studentId);
      notified = await notifyMany(aud.parents, { type: 'DORM_INCIDENT', title: `${LOG_ICON[b.type]} Yotoqxona — ${DORM_LOG_UZ[b.type]}`, body: `${aud.name}\n${b.title}${b.body ? `\n\n${b.body}` : ''}\n\n🕒 ${dayjs(log.occurredAt).format('DD.MM.YYYY HH:mm')}` });
      await prisma.dormLog.update({ where: { id: log.id }, data: { notified: notified > 0 } });
    }
    // critical → also alert director/admins of the branch
    if (b.severity === 'CRITICAL') {
      const admins = await prisma.user.findMany({ where: { role: { key: { in: ['SUPER_ADMIN', 'DIRECTOR'] } }, status: 'ACTIVE', ...(req.user!.branchId ? { OR: [{ branchId: req.user!.branchId }, { role: { key: 'SUPER_ADMIN' } }] } : {}) }, select: { id: true } });
      void notifyMany(admins.map((u) => u.id), { type: 'DORM_INCIDENT', title: '🚨 Yotoqxonada muhim holat', body: `${b.title}${b.body ? `\n\n${b.body}` : ''}` });
    }
    audit({ userId: req.user!.sub, action: 'dorm.log', entity: 'DormLog', entityId: log.id, meta: { type: b.type, severity: b.severity }, ip: req.ip });
    res.status(201).json(serialize({ ...log, notified }));
  }),
);

/** Evening roll-call: mark all boarders of a dormitory in one call */
dormRouter.post(
  '/rollcall',
  requirePermission('dorm.manage'),
  validate(z.object({ dormitoryId: z.string(), date: z.coerce.date().optional(), items: z.array(z.object({ studentId: z.string(), status: z.enum(['PRESENT', 'LATE', 'ABSENT']), note: z.string().max(200).optional().nullable() })).min(1) })),
  asyncHandler(async (req, res) => {
    const b = req.body as { dormitoryId: string; date?: Date; items: { studentId: string; status: 'PRESENT' | 'LATE' | 'ABSENT'; note?: string | null }[] };
    const at = b.date ?? new Date();
    let notified = 0;
    for (const it of b.items) {
      const type: DormLogType = it.status === 'PRESENT' ? 'CHECK_IN' : it.status;
      const asg = await prisma.dormAssignment.findUnique({ where: { studentId: it.studentId }, select: { bed: { select: { roomId: true } }, student: { select: { fullName: true } } } });
      await prisma.dormLog.create({ data: { studentId: it.studentId, roomId: asg?.bed.roomId ?? null, type, severity: it.status === 'ABSENT' ? 'WARNING' : 'INFO', title: `Kechki yo'qlama: ${it.status === 'PRESENT' ? 'joyida' : it.status === 'LATE' ? 'kechikdi' : 'kelmadi'}`, body: it.note ?? null, occurredAt: at, authorId: req.user!.sub, notified: it.status !== 'PRESENT' } });
      if (it.status !== 'PRESENT') {
        const aud = await studentAudience(it.studentId);
        notified += await notifyMany(aud.parents, { type: 'DORM_INCIDENT', title: `${it.status === 'ABSENT' ? '🔴' : '🟡'} Yotoqxona yo'qlamasi`, body: `Farzandingiz ${aud.name} ${dayjs(at).format('DD.MM.YYYY HH:mm')} kechki yo'qlamada ${it.status === 'ABSENT' ? 'yotoqxonada bo\'lmadi' : 'kechikib keldi'}.${it.note ? `\n${it.note}` : ''}` });
      }
    }
    audit({ userId: req.user!.sub, action: 'dorm.rollcall', meta: { count: b.items.length }, ip: req.ip });
    res.json({ ok: true, notified });
  }),
);

/** Parent view: child's dorm card */
dormRouter.get(
  '/student/:id',
  requirePermission('dorm.view', 'notifications.view'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    await assertStudentAccess(a, pid(req));
    const asg = await prisma.dormAssignment.findUnique({ where: { studentId: pid(req) }, include: { bed: { include: { room: { include: { building: { include: { dormitory: { include: { manager: { select: { fullName: true, phone: true } } } } } } } } } } } });
    const logs = await prisma.dormLog.findMany({ where: { studentId: pid(req) }, orderBy: { occurredAt: 'desc' }, take: 20 });
    if (!asg) return res.json(serialize({ assignment: null, logs }));
    res.json(serialize({ assignment: asg, logs }));
  }),
);
