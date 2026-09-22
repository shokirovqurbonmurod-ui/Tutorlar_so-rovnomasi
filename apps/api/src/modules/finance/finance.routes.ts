import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { pid } from '../../lib/params.js';
import { paginationSchema, paged, skipTake, type Pagination } from '../../lib/pagination.js';
import { actor, assertStudentAccess, isBranchScoped, studentScope } from '../../lib/scope.js';
import { InvoiceStatus, PaymentMethod } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { financeSummary, generateMonthlyInvoices, notifyInvoice, recalcInvoice, INVOICE_STATUS_UZ, periodLabel } from './finance.service.js';

export const financeRouter = Router();
financeRouter.use(authenticate);

const rangeSchema = z.object({ branchId: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });

financeRouter.get(
  '/summary',
  requirePermission('finance.view'),
  validate(rangeSchema, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof rangeSchema>>(req);
    const a = actor(req);
    res.json(serialize(await financeSummary({ branchId: isBranchScoped(a) ? a.branchId! : p.branchId, from: p.from, to: p.to })));
  }),
);

// ── Invoices ────────────────────────────────────────────────────────────────
const invoiceList = paginationSchema.extend({ studentId: z.string().optional(), branchId: z.string().optional(), period: z.string().optional(), status: z.nativeEnum(InvoiceStatus).optional(), groupId: z.string().optional() });
const invoiceInclude = {
  student: { select: { id: true, fullName: true, studentCode: true, group: { select: { id: true, name: true } }, parents: { select: { parent: { select: { user: { select: { fullName: true, phone: true } } } } }, take: 1 } } },
  branch: { select: { id: true, name: true } },
  payments: { orderBy: { paidAt: 'desc' }, include: { recordedBy: { select: { fullName: true } } } },
} satisfies Prisma.InvoiceInclude;

financeRouter.get(
  '/invoices',
  requirePermission('finance.view'),
  validate(invoiceList, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof invoiceList>>(req);
    const a = actor(req);
    if (p.studentId) await assertStudentAccess(a, p.studentId);
    const where: Prisma.InvoiceWhereInput = {
      ...(p.studentId ? { studentId: p.studentId } : { student: await studentScope(a) }),
      ...(p.branchId ? { branchId: p.branchId } : {}),
      ...(p.period ? { period: p.period } : {}),
      ...(p.status ? { status: p.status } : {}),
      ...(p.groupId ? { student: { groupId: p.groupId } } : {}),
      ...(p.search ? { OR: [{ number: { contains: p.search, mode: 'insensitive' } }, { student: { fullName: { contains: p.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total, agg] = await Promise.all([
      prisma.invoice.findMany({ where, include: invoiceInclude, orderBy: [{ period: 'desc' }, { student: { fullName: 'asc' } }], ...skipTake(p) }),
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({ where, _sum: { total: true, paid: true } }),
    ]);
    res.json(serialize({ ...paged(items, total, p as Pagination), sumTotal: Number(agg._sum.total ?? 0), sumPaid: Number(agg._sum.paid ?? 0) }));
  }),
);

financeRouter.get(
  '/invoices/:id',
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const inv = await prisma.invoice.findFirst({ where: { id: pid(req), student: await studentScope(a) }, include: invoiceInclude });
    if (!inv) throw notFound('Invoice topilmadi');
    res.json(serialize(inv));
  }),
);

financeRouter.post(
  '/invoices',
  requirePermission('finance.manage'),
  validate(z.object({ studentId: z.string(), period: z.string().regex(/^\d{4}-\d{2}$/), amount: z.coerce.number().min(0), discount: z.coerce.number().min(0).default(0), dueDate: z.coerce.date(), title: z.string().max(120).optional(), note: z.string().max(500).optional().nullable(), notify: z.boolean().default(true) })),
  asyncHandler(async (req, res) => {
    const body = req.body as { studentId: string; period: string; amount: number; discount: number; dueDate: Date; title?: string; note?: string | null; notify: boolean };
    const s = await prisma.student.findUnique({ where: { id: body.studentId } });
    if (!s) throw badRequest("O'quvchi topilmadi");
    if (await prisma.invoice.findUnique({ where: { studentId_period: { studentId: s.id, period: body.period } } })) throw badRequest("Bu oy uchun invoice allaqachon mavjud");
    const prefix = `INV-${body.period}-`;
    const last = await prisma.invoice.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' } });
    const number = `${prefix}${String(last ? Number(last.number.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
    const inv = await prisma.invoice.create({ data: { number, studentId: s.id, branchId: s.branchId, period: body.period, title: body.title ?? `${periodLabel(body.period)} oyi to'lovi`, amount: body.amount, discount: body.discount, total: body.amount - body.discount, dueDate: body.dueDate, note: body.note ?? null, status: dayjs().isAfter(body.dueDate) ? 'OVERDUE' : 'PENDING' }, include: invoiceInclude });
    if (body.notify) void notifyInvoice(inv.id, 'PAYMENT_DUE');
    audit({ userId: req.user!.sub, action: 'invoice.create', entity: 'Invoice', entityId: inv.id, meta: { number, total: inv.total }, ip: req.ip });
    res.status(201).json(serialize(inv));
  }),
);

financeRouter.patch(
  '/invoices/:id',
  requirePermission('finance.manage'),
  validate(z.object({ amount: z.coerce.number().min(0).optional(), discount: z.coerce.number().min(0).optional(), dueDate: z.coerce.date().optional(), note: z.string().max(500).optional().nullable(), status: z.enum(['CANCELLED', 'PENDING']).optional(), title: z.string().max(120).optional() })),
  asyncHandler(async (req, res) => {
    const inv = await prisma.invoice.findUnique({ where: { id: pid(req) } });
    if (!inv) throw notFound();
    const body = req.body as { amount?: number; discount?: number; dueDate?: Date; note?: string | null; status?: 'CANCELLED' | 'PENDING'; title?: string };
    const amount = body.amount ?? Number(inv.amount), discount = body.discount ?? Number(inv.discount);
    await prisma.invoice.update({ where: { id: inv.id }, data: { amount, discount, total: amount - discount, dueDate: body.dueDate, note: body.note, title: body.title, ...(body.status ? { status: body.status } : {}) } });
    const updated = body.status === 'CANCELLED' ? await prisma.invoice.findUnique({ where: { id: inv.id }, include: invoiceInclude }) : await recalcInvoice(inv.id).then(() => prisma.invoice.findUnique({ where: { id: inv.id }, include: invoiceInclude }));
    audit({ userId: req.user!.sub, action: 'invoice.update', entity: 'Invoice', entityId: inv.id, meta: body, ip: req.ip });
    res.json(serialize(updated));
  }),
);

financeRouter.post(
  '/invoices/:id/remind',
  requirePermission('finance.manage'),
  asyncHandler(async (req, res) => {
    await notifyInvoice(pid(req), 'PAYMENT_DUE');
    res.json({ ok: true });
  }),
);

financeRouter.post(
  '/invoices/generate',
  requirePermission('finance.manage'),
  validate(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional(), branchId: z.string().optional(), dueDay: z.coerce.number().int().min(1).max(28).optional(), notify: z.boolean().default(true) })),
  asyncHandler(async (req, res) => {
    const body = req.body as { period?: string; branchId?: string; dueDay?: number; notify: boolean };
    const r = await generateMonthlyInvoices(body.period, body);
    audit({ userId: req.user!.sub, action: 'invoice.generate', meta: r, ip: req.ip });
    res.json(r);
  }),
);

// ── Payments ────────────────────────────────────────────────────────────────
const paymentList = paginationSchema.extend({ studentId: z.string().optional(), branchId: z.string().optional(), method: z.nativeEnum(PaymentMethod).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });

financeRouter.get(
  '/payments',
  requirePermission('finance.view'),
  validate(paymentList, 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof paymentList>>(req);
    const a = actor(req);
    const where: Prisma.PaymentWhereInput = {
      ...(p.studentId ? { studentId: p.studentId } : { student: await studentScope(a) }),
      ...(p.branchId ? { student: { branchId: p.branchId } } : {}),
      ...(p.method ? { method: p.method } : {}),
      ...(p.from || p.to ? { paidAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: dayjs(p.to).endOf('day').toDate() } : {}) } } : {}),
      ...(p.search ? { OR: [{ receiptNo: { contains: p.search, mode: 'insensitive' } }, { student: { fullName: { contains: p.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total, agg] = await Promise.all([
      prisma.payment.findMany({ where, include: { student: { select: { id: true, fullName: true, studentCode: true, group: { select: { name: true } } } }, invoice: { select: { id: true, number: true, period: true } }, recordedBy: { select: { fullName: true } } }, orderBy: { paidAt: 'desc' }, ...skipTake(p) }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);
    res.json(serialize({ ...paged(items, total, p as Pagination), sum: Number(agg._sum.amount ?? 0) }));
  }),
);

financeRouter.post(
  '/payments',
  requirePermission('finance.manage'),
  validate(z.object({ studentId: z.string(), invoiceId: z.string().optional().nullable(), amount: z.coerce.number().positive(), method: z.nativeEnum(PaymentMethod).default('CASH'), paidAt: z.coerce.date().optional(), receiptNo: z.string().max(60).optional().nullable(), note: z.string().max(500).optional().nullable() })),
  asyncHandler(async (req, res) => {
    const body = req.body as { studentId: string; invoiceId?: string | null; amount: number; method: PaymentMethod; paidAt?: Date; receiptNo?: string | null; note?: string | null };
    // auto-attach to oldest unpaid invoice when not specified
    let invoiceId = body.invoiceId ?? null;
    if (!invoiceId) {
      const open = await prisma.invoice.findFirst({ where: { studentId: body.studentId, status: { in: ['OVERDUE', 'PARTIAL', 'PENDING'] } }, orderBy: { dueDate: 'asc' } });
      invoiceId = open?.id ?? null;
    }
    const pay = await prisma.payment.create({ data: { ...body, invoiceId, recordedById: req.user!.sub, paidAt: body.paidAt ?? new Date() } });
    if (invoiceId) {
      await recalcInvoice(invoiceId);
      void notifyInvoice(invoiceId, 'PAYMENT_RECEIVED', { paymentAmount: body.amount });
    }
    audit({ userId: req.user!.sub, action: 'payment.create', entity: 'Payment', entityId: pay.id, meta: { amount: body.amount, method: body.method, studentId: body.studentId }, ip: req.ip });
    res.status(201).json(serialize(pay));
  }),
);

financeRouter.delete(
  '/payments/:id',
  requirePermission('finance.manage'),
  asyncHandler(async (req, res) => {
    const pay = await prisma.payment.findUnique({ where: { id: pid(req) } });
    if (!pay) throw notFound();
    await prisma.payment.delete({ where: { id: pay.id } });
    if (pay.invoiceId) await recalcInvoice(pay.invoiceId);
    audit({ userId: req.user!.sub, action: 'payment.delete', entity: 'Payment', entityId: pay.id, meta: { amount: pay.amount }, ip: req.ip });
    res.json({ ok: true });
  }),
);

// ── Debtors ─────────────────────────────────────────────────────────────────
financeRouter.get(
  '/debtors',
  requirePermission('finance.view'),
  validate(z.object({ branchId: z.string().optional(), groupId: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ branchId?: string; groupId?: string; limit: number }>(req);
    const a = actor(req);
    const rows = await prisma.invoice.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }, student: { ...(await studentScope(a)), ...(p.branchId ? { branchId: p.branchId } : {}), ...(p.groupId ? { groupId: p.groupId } : {}), status: 'ACTIVE' } },
      include: { student: { select: { id: true, fullName: true, studentCode: true, group: { select: { name: true } }, parents: { take: 1, select: { parent: { select: { user: { select: { fullName: true, phone: true, telegramId: true } } } } } } } } },
    });
    const map = new Map<string, { student: (typeof rows)[number]['student']; debt: number; overdue: number; invoices: number; oldestDue: Date }>();
    for (const r of rows) {
      const d = map.get(r.studentId) ?? { student: r.student, debt: 0, overdue: 0, invoices: 0, oldestDue: r.dueDate };
      const rest = Number(r.total) - Number(r.paid);
      d.debt += rest;
      if (r.status === 'OVERDUE') d.overdue += rest;
      d.invoices++;
      if (r.dueDate < d.oldestDue) d.oldestDue = r.dueDate;
      map.set(r.studentId, d);
    }
    const items = [...map.values()].sort((x, y) => y.debt - x.debt).slice(0, p.limit);
    res.json(serialize({ items, total: items.reduce((s, i) => s + i.debt, 0), count: map.size }));
  }),
);

// ── Expenses ────────────────────────────────────────────────────────────────
const expenseSchema = z.object({ branchId: z.string().optional().nullable(), category: z.string().min(1).max(60), title: z.string().min(1).max(160), amount: z.coerce.number().positive(), spentAt: z.coerce.date().optional(), note: z.string().max(500).optional().nullable() });

financeRouter.get(
  '/expenses',
  requirePermission('finance.view'),
  validate(paginationSchema.extend({ branchId: z.string().optional(), category: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<Pagination & { branchId?: string; category?: string; from?: Date; to?: Date }>(req);
    const where: Prisma.ExpenseWhereInput = {
      ...(p.branchId ? { branchId: p.branchId } : {}),
      ...(p.category ? { category: p.category } : {}),
      ...(p.from || p.to ? { spentAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: dayjs(p.to).endOf('day').toDate() } : {}) } } : {}),
      ...(p.search ? { title: { contains: p.search, mode: 'insensitive' } } : {}),
    };
    const [items, total, agg] = await Promise.all([
      prisma.expense.findMany({ where, include: { branch: { select: { name: true } }, recordedBy: { select: { fullName: true } } }, orderBy: { spentAt: 'desc' }, ...skipTake(p) }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    res.json(serialize({ ...paged(items, total, p), sum: Number(agg._sum.amount ?? 0) }));
  }),
);
financeRouter.post('/expenses', requirePermission('finance.manage'), validate(expenseSchema), asyncHandler(async (req, res) => {
  const e = await prisma.expense.create({ data: { ...req.body, recordedById: req.user!.sub } });
  audit({ userId: req.user!.sub, action: 'expense.create', entity: 'Expense', entityId: e.id, meta: { amount: e.amount, category: e.category }, ip: req.ip });
  res.status(201).json(serialize(e));
}));
financeRouter.patch('/expenses/:id', requirePermission('finance.manage'), validate(expenseSchema.partial()), asyncHandler(async (req, res) => res.json(serialize(await prisma.expense.update({ where: { id: pid(req) }, data: req.body })))));
financeRouter.delete('/expenses/:id', requirePermission('finance.manage'), asyncHandler(async (req, res) => { await prisma.expense.delete({ where: { id: pid(req) } }); res.json({ ok: true }); }));

// ── Export ──────────────────────────────────────────────────────────────────
financeRouter.get(
  '/export',
  requirePermission('finance.reports', 'analytics.export'),
  validate(z.object({ type: z.enum(['invoices', 'payments', 'debtors', 'expenses']), period: z.string().optional(), branchId: z.string().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<{ type: 'invoices' | 'payments' | 'debtors' | 'expenses'; period?: string; branchId?: string }>(req);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'TARGET INTERNATIONAL SCHOOL';
    const ws = wb.addWorksheet(p.type);
    if (p.type === 'invoices' || p.type === 'debtors') {
      const rows = await prisma.invoice.findMany({ where: { ...(p.period ? { period: p.period } : {}), ...(p.branchId ? { branchId: p.branchId } : {}), ...(p.type === 'debtors' ? { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } : {}) }, include: { student: { select: { fullName: true, studentCode: true, group: { select: { name: true } } } } }, orderBy: [{ period: 'desc' }, { student: { fullName: 'asc' } }] });
      ws.columns = [{ header: 'Invoice', key: 'n', width: 18 }, { header: "O'quvchi", key: 's', width: 28 }, { header: 'Kod', key: 'c', width: 18 }, { header: 'Guruh', key: 'g', width: 10 }, { header: 'Oy', key: 'p', width: 10 }, { header: 'Summa', key: 'a', width: 14 }, { header: 'Chegirma', key: 'd', width: 12 }, { header: 'Jami', key: 't', width: 14 }, { header: "To'langan", key: 'pd', width: 14 }, { header: 'Qoldiq', key: 'r', width: 14 }, { header: 'Muddat', key: 'due', width: 12 }, { header: 'Holat', key: 'st', width: 16 }];
      for (const r of rows) ws.addRow({ n: r.number, s: r.student.fullName, c: r.student.studentCode, g: r.student.group?.name ?? '', p: r.period, a: Number(r.amount), d: Number(r.discount), t: Number(r.total), pd: Number(r.paid), r: Number(r.total) - Number(r.paid), due: dayjs(r.dueDate).format('DD.MM.YYYY'), st: INVOICE_STATUS_UZ[r.status] });
    } else if (p.type === 'payments') {
      const rows = await prisma.payment.findMany({ where: { ...(p.period ? { paidAt: { gte: dayjs(`${p.period}-01`).toDate(), lte: dayjs(`${p.period}-01`).endOf('month').toDate() } } : {}), ...(p.branchId ? { student: { branchId: p.branchId } } : {}) }, include: { student: { select: { fullName: true, studentCode: true } }, invoice: { select: { number: true } }, recordedBy: { select: { fullName: true } } }, orderBy: { paidAt: 'desc' } });
      ws.columns = [{ header: 'Sana', key: 'd', width: 18 }, { header: "O'quvchi", key: 's', width: 28 }, { header: 'Kod', key: 'c', width: 18 }, { header: 'Summa', key: 'a', width: 14 }, { header: 'Usul', key: 'm', width: 10 }, { header: 'Invoice', key: 'i', width: 18 }, { header: 'Kvitansiya', key: 'r', width: 14 }, { header: 'Kiritdi', key: 'by', width: 22 }];
      for (const r of rows) ws.addRow({ d: dayjs(r.paidAt).format('DD.MM.YYYY HH:mm'), s: r.student.fullName, c: r.student.studentCode, a: Number(r.amount), m: r.method, i: r.invoice?.number ?? '', r: r.receiptNo ?? '', by: r.recordedBy?.fullName ?? '' });
    } else {
      const rows = await prisma.expense.findMany({ where: { ...(p.period ? { spentAt: { gte: dayjs(`${p.period}-01`).toDate(), lte: dayjs(`${p.period}-01`).endOf('month').toDate() } } : {}), ...(p.branchId ? { branchId: p.branchId } : {}) }, include: { branch: { select: { name: true } } }, orderBy: { spentAt: 'desc' } });
      ws.columns = [{ header: 'Sana', key: 'd', width: 14 }, { header: 'Kategoriya', key: 'c', width: 18 }, { header: 'Nomi', key: 't', width: 32 }, { header: 'Summa', key: 'a', width: 14 }, { header: 'Filial', key: 'b', width: 18 }, { header: 'Izoh', key: 'n', width: 30 }];
      for (const r of rows) ws.addRow({ d: dayjs(r.spentAt).format('DD.MM.YYYY'), c: r.category, t: r.title, a: Number(r.amount), b: r.branch?.name ?? '', n: r.note ?? '' });
    }
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="finance-${p.type}-${p.period ?? 'all'}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);
