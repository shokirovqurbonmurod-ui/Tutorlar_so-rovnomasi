import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { paginationSchema, paged, skipTake, type Pagination } from '../../lib/pagination.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { pid } from '../../lib/params.js';
import { actor, assertStudentAccess, studentScope } from '../../lib/scope.js';
import { hashPassword } from '../auth/auth.service.js';
import { Gender, StudentStatus } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { studentSummary } from './students.service.js';

export const studentsRouter = Router();
studentsRouter.use(authenticate);

const listSchema = paginationSchema.extend({
  branchId: z.string().optional(),
  groupId: z.string().optional(),
  status: z.nativeEnum(StudentStatus).optional(),
  boarder: z.enum(['yes', 'no']).optional(),
  debt: z.enum(['yes']).optional(),
  unassigned: z.enum(['yes']).optional(),
});

const parentInput = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().min(7).max(20),
  relation: z.string().max(30).optional(),
  telegramUsername: z.string().max(64).optional().nullable(),
  telegramId: z.string().regex(/^\d+$/).optional().nullable(),
  isPrimary: z.boolean().default(true),
});

const createSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  middleName: z.string().max(60).optional().nullable(),
  gender: z.nativeEnum(Gender).optional().nullable(),
  birthDate: z.coerce.date().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  branchId: z.string(),
  groupId: z.string().optional().nullable(),
  status: z.nativeEnum(StudentStatus).default('ACTIVE'),
  enrolledAt: z.coerce.date().optional(),
  monthlyFee: z.coerce.number().min(0).default(0),
  discountPercent: z.coerce.number().int().min(0).max(100).default(0),
  discountNote: z.string().max(200).optional().nullable(),
  isBoarder: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
  studentCode: z.string().max(30).optional(),
  /** Optionally create parents inline (or link existing by parentIds). */
  parents: z.array(parentInput).max(4).optional(),
  parentIds: z.array(z.string()).max(4).optional(),
  /** Optional student Telegram/web account */
  createAccount: z.boolean().default(false),
  telegramId: z.string().regex(/^\d+$/).optional().nullable(),
  password: z.string().min(6).optional(),
});
const updateSchema = createSchema.partial().omit({ parents: true, parentIds: true, createAccount: true });

const include = {
  branch: { select: { id: true, name: true, code: true } },
  group: { select: { id: true, name: true, gradeLevel: true, tutor: { select: { id: true, fullName: true } } } },
  parents: { include: { parent: { include: { user: { select: { id: true, fullName: true, phone: true, telegramId: true, telegramUsername: true } } } } } },
  user: { select: { id: true, telegramId: true, telegramUsername: true, status: true } },
  dormAssignment: { include: { bed: { include: { room: { include: { building: { select: { name: true } } } } } } } },
} satisfies Prisma.StudentInclude;

async function nextStudentCode(branchCode: string) {
  const year = dayjs().year();
  const prefix = `TIS-${branchCode}-${year}-`;
  const last = await prisma.student.findFirst({ where: { studentCode: { startsWith: prefix } }, orderBy: { studentCode: 'desc' }, select: { studentCode: true } });
  const n = last ? Number(last.studentCode.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

async function upsertParent(input: z.infer<typeof parentInput>) {
  const parentRole = await prisma.role.findUniqueOrThrow({ where: { slug: 'PARENT' } });
  let user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        fullName: input.fullName,
        phone: input.phone,
        roleId: parentRole.id,
        telegramUsername: input.telegramUsername?.replace(/^@/, '') ?? null,
        telegramId: input.telegramId ? BigInt(input.telegramId) : null,
        status: 'ACTIVE',
      },
    });
  }
  const parent = await prisma.parent.upsert({ where: { userId: user.id }, create: { userId: user.id, relation: input.relation ?? null }, update: { relation: input.relation ?? undefined } });
  return parent;
}

studentsRouter.get(
  '/',
  requirePermission('students.view'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof listSchema>>(req);
    const a = actor(req);
    const where: Prisma.StudentWhereInput = {
      ...(await studentScope(a)),
      ...(p.branchId ? { branchId: p.branchId } : {}),
      ...(p.groupId ? { groupId: p.groupId } : {}),
      ...(p.status ? { status: p.status } : {}),
      ...(p.boarder === 'yes' ? { isBoarder: true } : p.boarder === 'no' ? { isBoarder: false } : {}),
      ...(p.unassigned === 'yes' ? { groupId: null } : {}),
      ...(p.debt === 'yes' ? { invoices: { some: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } } } : {}),
      ...(p.search
        ? { OR: [{ fullName: { contains: p.search, mode: 'insensitive' } }, { studentCode: { contains: p.search, mode: 'insensitive' } }, { phone: { contains: p.search } }] }
        : {}),
    };
    const orderBy = ['fullName', 'createdAt', 'enrolledAt'].includes(p.sort ?? '') ? { [p.sort!]: p.order } : { fullName: 'asc' as const };
    const [items, total] = await Promise.all([prisma.student.findMany({ where, include, orderBy, ...skipTake(p) }), prisma.student.count({ where })]);
    // attach debt per student
    const ids = items.map((s) => s.id);
    const debts = ids.length
      ? await prisma.invoice.groupBy({ by: ['studentId'], where: { studentId: { in: ids }, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } }, _sum: { total: true, paid: true } })
      : [];
    const debtMap = new Map(debts.map((d) => [d.studentId, Number(d._sum.total ?? 0) - Number(d._sum.paid ?? 0)]));
    res.json(serialize(paged(items.map((s) => ({ ...s, debt: debtMap.get(s.id) ?? 0 })), total, p as Pagination)));
  }),
);

studentsRouter.get(
  '/export',
  requirePermission('students.view'),
  validate(z.object({ branchId: z.string().optional(), groupId: z.string().optional(), status: z.nativeEnum(StudentStatus).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ branchId?: string; groupId?: string; status?: StudentStatus }>(req);
    const where: Prisma.StudentWhereInput = { ...(await studentScope(actor(req))), ...(p.branchId ? { branchId: p.branchId } : {}), ...(p.groupId ? { groupId: p.groupId } : {}), status: p.status ?? 'ACTIVE' };
    const rows = await prisma.student.findMany({ where, include, orderBy: [{ group: { name: 'asc' } }, { fullName: 'asc' }] });
    const wb = new ExcelJS.Workbook();
    wb.creator = 'TARGET INTERNATIONAL SCHOOL';
    const ws = wb.addWorksheet("O'quvchilar");
    ws.columns = [
      { header: 'Kod', key: 'code', width: 20 }, { header: 'F.I.Sh', key: 'name', width: 30 }, { header: 'Guruh', key: 'group', width: 10 }, { header: 'Filial', key: 'branch', width: 16 },
      { header: 'Telefon', key: 'phone', width: 16 }, { header: 'Ota-ona', key: 'parent', width: 28 }, { header: 'Ota-ona tel', key: 'pphone', width: 16 }, { header: 'Telegram', key: 'tg', width: 10 },
      { header: "Oylik to'lov", key: 'fee', width: 14 }, { header: 'Chegirma %', key: 'disc', width: 10 }, { header: 'Yotoqxona', key: 'dorm', width: 22 }, { header: 'Holat', key: 'status', width: 10 }, { header: 'Qabul', key: 'enrolled', width: 12 },
    ];
    for (const s of rows) {
      const pr = s.parents.find((x) => x.isPrimary) ?? s.parents[0];
      const d = s.dormAssignment;
      ws.addRow({ code: s.studentCode, name: s.fullName, group: s.group?.name ?? '', branch: s.branch.name, phone: s.phone ?? '', parent: pr?.parent.user.fullName ?? '', pphone: pr?.parent.user.phone ?? '', tg: pr?.parent.user.telegramId ? 'Ha' : "Yo'q", fee: Number(s.monthlyFee), disc: s.discountPercent, dorm: d ? `${d.bed.room.building.name} · ${d.bed.room.number}-xona · ${d.bed.label}` : '', status: s.status, enrolled: dayjs(s.enrolledAt).format('DD.MM.YYYY') });
    }
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="students-${dayjs().format('YYYY-MM-DD')}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

studentsRouter.get(
  '/:id',
  requirePermission('students.view'),
  asyncHandler(async (req, res) => {
    await assertStudentAccess(actor(req), pid(req));
    const s = await prisma.student.findUnique({ where: { id: pid(req) }, include });
    if (!s) throw notFound("O'quvchi topilmadi");
    const summary = await studentSummary(s.id);
    res.json(serialize({ ...s, ...summary }));
  }),
);

studentsRouter.post(
  '/',
  requirePermission('students.manage'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const a = actor(req);
    if (a.role === 'DIRECTOR' && a.branchId && body.branchId !== a.branchId) throw badRequest("Faqat o'z filialingizga o'quvchi qo'sha olasiz");
    const branch = await prisma.branch.findUnique({ where: { id: body.branchId } });
    if (!branch) throw badRequest('Filial topilmadi');
    const fullName = `${body.lastName} ${body.firstName}${body.middleName ? ' ' + body.middleName : ''}`.trim();
    const studentCode = body.studentCode ?? (await nextStudentCode(branch.code));

    let userId: string | null = null;
    if (body.createAccount || body.telegramId) {
      const studentRole = await prisma.role.findUniqueOrThrow({ where: { slug: 'STUDENT' } });
      const u = await prisma.user.create({
        data: {
          fullName,
          phone: body.phone ?? null,
          roleId: studentRole.id,
          branchId: body.branchId,
          telegramId: body.telegramId ? BigInt(body.telegramId) : null,
          passwordHash: body.password ? await hashPassword(body.password) : null,
        },
      });
      userId = u.id;
    }

    const parentIds = [...(body.parentIds ?? [])];
    for (const pi of body.parents ?? []) parentIds.push((await upsertParent(pi)).id);

    const student = await prisma.student.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        middleName: body.middleName ?? null,
        fullName,
        gender: body.gender ?? null,
        birthDate: body.birthDate ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        studentCode,
        branchId: body.branchId,
        groupId: body.groupId ?? null,
        status: body.status,
        enrolledAt: body.enrolledAt,
        monthlyFee: body.monthlyFee,
        discountPercent: body.discountPercent,
        discountNote: body.discountNote ?? null,
        isBoarder: body.isBoarder,
        notes: body.notes ?? null,
        userId,
        parents: { create: [...new Set(parentIds)].map((parentId, i) => ({ parentId, isPrimary: i === 0, relation: body.parents?.[i]?.relation ?? null })) },
      },
      include,
    });
    if (student.groupId) await syncGroupCount(student.groupId);
    audit({ userId: a.sub, action: 'student.create', entity: 'Student', entityId: student.id, meta: { fullName, studentCode }, ip: req.ip });
    res.status(201).json(serialize(student));
  }),
);

studentsRouter.patch(
  '/:id',
  requirePermission('students.manage'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const a = actor(req);
    await assertStudentAccess(a, pid(req));
    const existing = await prisma.student.findUnique({ where: { id: pid(req) } });
    if (!existing) throw notFound("O'quvchi topilmadi");
    const firstName = body.firstName ?? existing.firstName;
    const lastName = body.lastName ?? existing.lastName;
    const middleName = body.middleName === undefined ? existing.middleName : body.middleName;
    const fullName = `${lastName} ${firstName}${middleName ? ' ' + middleName : ''}`.trim();
    const student = await prisma.student.update({
      where: { id: existing.id },
      data: {
        firstName, lastName, middleName, fullName,
        gender: body.gender, birthDate: body.birthDate, phone: body.phone, address: body.address,
        branchId: body.branchId, groupId: body.groupId, status: body.status, enrolledAt: body.enrolledAt,
        monthlyFee: body.monthlyFee, discountPercent: body.discountPercent, discountNote: body.discountNote,
        isBoarder: body.isBoarder, notes: body.notes, studentCode: body.studentCode,
      },
      include,
    });
    if (existing.groupId) await syncGroupCount(existing.groupId);
    if (student.groupId && student.groupId !== existing.groupId) await syncGroupCount(student.groupId);
    if (student.userId) await prisma.user.update({ where: { id: student.userId }, data: { fullName } }).catch(() => undefined);
    audit({ userId: a.sub, action: 'student.update', entity: 'Student', entityId: student.id, meta: body, ip: req.ip });
    res.json(serialize(student));
  }),
);

studentsRouter.delete(
  '/:id',
  requirePermission('students.manage'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    await assertStudentAccess(a, pid(req));
    const s = await prisma.student.findUnique({ where: { id: pid(req) } });
    if (!s) throw notFound();
    // Soft delete — keep grades/finance history
    await prisma.student.update({ where: { id: s.id }, data: { status: 'ARCHIVED', groupId: null } });
    if (s.groupId) await syncGroupCount(s.groupId);
    audit({ userId: a.sub, action: 'student.archive', entity: 'Student', entityId: s.id, ip: req.ip });
    res.json({ ok: true });
  }),
);

/** Link / unlink parents */
studentsRouter.post(
  '/:id/parents',
  requirePermission('students.manage', 'parents.manage'),
  validate(z.object({ parentId: z.string().optional(), parent: parentInput.optional(), relation: z.string().max(30).optional() })),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    await assertStudentAccess(a, pid(req));
    const body = req.body as { parentId?: string; parent?: z.infer<typeof parentInput>; relation?: string };
    const parentId = body.parentId ?? (body.parent ? (await upsertParent(body.parent)).id : null);
    if (!parentId) throw badRequest('Ota-ona tanlanmagan');
    await prisma.studentParent.upsert({
      where: { studentId_parentId: { studentId: pid(req), parentId } },
      create: { studentId: pid(req), parentId, relation: body.relation ?? body.parent?.relation ?? null },
      update: { relation: body.relation ?? undefined },
    });
    audit({ userId: a.sub, action: 'student.link_parent', entity: 'Student', entityId: pid(req), meta: { parentId }, ip: req.ip });
    res.json({ ok: true });
  }),
);

studentsRouter.delete(
  '/:id/parents/:parentId',
  requirePermission('students.manage', 'parents.manage'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    await assertStudentAccess(a, pid(req));
    await prisma.studentParent.deleteMany({ where: { studentId: pid(req), parentId: String(req.params.parentId) } });
    res.json({ ok: true });
  }),
);

export async function syncGroupCount(groupId: string) {
  const n = await prisma.student.count({ where: { groupId, status: 'ACTIVE' } });
  await prisma.group.update({ where: { id: groupId }, data: { studentCount: n } }).catch(() => undefined);
}
