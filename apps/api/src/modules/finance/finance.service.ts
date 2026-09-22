import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { notifyMany } from '../notifications/notifications.service.js';
import { studentAudience } from '../../lib/scope.js';
import type { InvoiceStatus } from '../../generated/prisma/enums.js';

export const fmtUZS = (n: number | string | { toString(): string }) => `${Math.round(Number(n)).toLocaleString('ru-RU').replace(/,/g, ' ')} so'm`;
export const periodLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  return `${MONTHS[m - 1]} ${y}`;
};

export const INVOICE_STATUS_UZ: Record<InvoiceStatus, string> = { PENDING: 'Kutilmoqda', PARTIAL: "Qisman to'langan", PAID: "To'langan", OVERDUE: "Muddati o'tgan", CANCELLED: 'Bekor qilingan' };

export function invoiceStatus(total: number, paid: number, dueDate: Date, current: InvoiceStatus): InvoiceStatus {
  if (current === 'CANCELLED') return current;
  if (paid >= total - 0.01) return 'PAID';
  if (paid > 0) return dayjs().isAfter(dueDate, 'day') ? 'OVERDUE' : 'PARTIAL';
  return dayjs().isAfter(dueDate, 'day') ? 'OVERDUE' : 'PENDING';
}

async function nextInvoiceNumber(period: string) {
  const prefix = `INV-${period}-`;
  const last = await prisma.invoice.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

/** Create monthly invoices for all active students (idempotent per student/period). */
export async function generateMonthlyInvoices(period = dayjs().format('YYYY-MM'), opts: { branchId?: string; dueDay?: number; notify?: boolean } = {}) {
  const dueDay = opts.dueDay ?? 10;
  const students = await prisma.student.findMany({ where: { status: 'ACTIVE', monthlyFee: { gt: 0 }, ...(opts.branchId ? { branchId: opts.branchId } : {}) }, select: { id: true, branchId: true, monthlyFee: true, discountPercent: true, fullName: true } });
  let created = 0;
  for (const s of students) {
    const exists = await prisma.invoice.findUnique({ where: { studentId_period: { studentId: s.id, period } } });
    if (exists) continue;
    const amount = Number(s.monthlyFee);
    const discount = Math.round((amount * s.discountPercent) / 100);
    const total = amount - discount;
    const dueDate = dayjs(`${period}-01`).date(Math.min(dueDay, 28)).endOf('day').toDate();
    const inv = await prisma.invoice.create({ data: { number: await nextInvoiceNumber(period), studentId: s.id, branchId: s.branchId, period, title: `${periodLabel(period)} oyi to'lovi`, amount, discount, total, dueDate, status: dayjs().isAfter(dueDate) ? 'OVERDUE' : 'PENDING' } });
    created++;
    if (opts.notify !== false) await notifyInvoice(inv.id, 'PAYMENT_DUE');
  }
  return { period, created, students: students.length };
}

/** Recompute paid/status from payments */
export async function recalcInvoice(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!inv) return null;
  const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
  const status = invoiceStatus(Number(inv.total), paid, inv.dueDate, inv.status);
  return prisma.invoice.update({ where: { id: inv.id }, data: { paid, status } });
}

export async function notifyInvoice(invoiceId: string, type: 'PAYMENT_DUE' | 'PAYMENT_RECEIVED', extra?: { paymentAmount?: number }) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return;
  const aud = await studentAudience(inv.studentId);
  if (!aud.parents.length) return;
  const total = Number(inv.total), paid = Number(inv.paid), rest = Math.max(0, total - paid);
  const lines = [`Farzandingiz ${aud.name} uchun ${periodLabel(inv.period).toLowerCase()} oyi to'lovi:`, '', `Jami: ${fmtUZS(total)}`, ...(Number(inv.discount) > 0 ? [`Chegirma: ${fmtUZS(inv.discount)}`] : []), `To'langan: ${fmtUZS(paid)}`, `Qoldiq: ${fmtUZS(rest)}`];
  if (type === 'PAYMENT_DUE') lines.push('', `⏰ To'lov muddati: ${dayjs(inv.dueDate).format('DD.MM.YYYY')}`);
  if (type === 'PAYMENT_RECEIVED' && extra?.paymentAmount) lines.unshift(`✅ ${fmtUZS(extra.paymentAmount)} to'lov qabul qilindi. Rahmat!`, '');
  await notifyMany(aud.parents, {
    type,
    title: type === 'PAYMENT_DUE' ? "💳 To'lov eslatmasi" : "💳 To'lov qabul qilindi",
    body: lines.join('\n'),
    payload: { invoiceId, studentId: inv.studentId, keyboard: { inline_keyboard: [[{ text: "💳 To'lovlar", callback_data: `child:payments:${inv.studentId}` }]] } },
  });
  if (type === 'PAYMENT_DUE') await prisma.invoice.update({ where: { id: inv.id }, data: { reminderSentAt: new Date() } });
}

/** Cron: mark overdue + remind 3 days before due and on due day */
export async function runPaymentReminders() {
  const today = dayjs().startOf('day');
  await prisma.invoice.updateMany({ where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: today.toDate() } }, data: { status: 'OVERDUE' } });
  const soon = await prisma.invoice.findMany({
    where: {
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      OR: [{ dueDate: { gte: today.add(3, 'day').toDate(), lt: today.add(4, 'day').toDate() } }, { dueDate: { gte: today.toDate(), lt: today.add(1, 'day').toDate() } }, { status: 'OVERDUE', reminderSentAt: { lt: today.subtract(7, 'day').toDate() } }],
    },
    select: { id: true },
  });
  for (const i of soon) await notifyInvoice(i.id, 'PAYMENT_DUE');
  return soon.length;
}

export async function financeSummary(opts: { branchId?: string; from?: Date; to?: Date }) {
  const from = dayjs(opts.from ?? dayjs().startOf('month')).toDate();
  const to = dayjs(opts.to ?? dayjs().endOf('month')).toDate();
  const invWhere = { ...(opts.branchId ? { branchId: opts.branchId } : {}) };
  const [income, expenses, invoicesAll, overdueAgg, byMethod, recentPayments, monthly] = await Promise.all([
    prisma.payment.aggregate({ where: { paidAt: { gte: from, lte: to }, student: opts.branchId ? { branchId: opts.branchId } : undefined }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.aggregate({ where: { spentAt: { gte: from, lte: to }, ...(opts.branchId ? { branchId: opts.branchId } : {}) }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ['status'], where: invWhere, _sum: { total: true, paid: true }, _count: { _all: true } }),
    prisma.invoice.aggregate({ where: { ...invWhere, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } }, _sum: { total: true, paid: true }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ['method'], where: { paidAt: { gte: from, lte: to } }, _sum: { amount: true } }),
    prisma.payment.findMany({ where: { student: opts.branchId ? { branchId: opts.branchId } : undefined }, orderBy: { paidAt: 'desc' }, take: 8, include: { student: { select: { id: true, fullName: true, group: { select: { name: true } } } }, invoice: { select: { period: true } } } }),
    monthlySeries(opts.branchId),
  ]);
  const expByCat = await prisma.expense.groupBy({ by: ['category'], where: { spentAt: { gte: from, lte: to }, ...(opts.branchId ? { branchId: opts.branchId } : {}) }, _sum: { amount: true } });
  const inc = Number(income._sum.amount ?? 0), exp = Number(expenses._sum.amount ?? 0);
  return {
    range: { from, to },
    income: inc,
    expenses: exp,
    profit: inc - exp,
    paymentsCount: income._count._all,
    debt: Number(overdueAgg._sum.total ?? 0) - Number(overdueAgg._sum.paid ?? 0),
    debtors: overdueAgg._count._all,
    invoices: invoicesAll.map((i) => ({ status: i.status, count: i._count._all, total: Number(i._sum.total ?? 0), paid: Number(i._sum.paid ?? 0) })),
    byMethod: byMethod.map((m) => ({ method: m.method, amount: Number(m._sum.amount ?? 0) })),
    expensesByCategory: expByCat.map((e) => ({ category: e.category, amount: Number(e._sum.amount ?? 0) })),
    recentPayments,
    monthly,
  };
}

async function monthlySeries(branchId?: string) {
  const start = dayjs().subtract(11, 'month').startOf('month');
  const [pays, exps, invs] = await Promise.all([
    prisma.payment.findMany({ where: { paidAt: { gte: start.toDate() }, student: branchId ? { branchId } : undefined }, select: { paidAt: true, amount: true } }),
    prisma.expense.findMany({ where: { spentAt: { gte: start.toDate() }, ...(branchId ? { branchId } : {}) }, select: { spentAt: true, amount: true } }),
    prisma.invoice.findMany({ where: { period: { gte: start.format('YYYY-MM') }, ...(branchId ? { branchId } : {}) }, select: { period: true, total: true } }),
  ]);
  const out: { month: string; income: number; expenses: number; expected: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const m = start.add(i, 'month');
    const key = m.format('YYYY-MM');
    out.push({
      month: m.format('MMM'),
      income: pays.filter((p) => dayjs(p.paidAt).format('YYYY-MM') === key).reduce((s, p) => s + Number(p.amount), 0),
      expenses: exps.filter((e) => dayjs(e.spentAt).format('YYYY-MM') === key).reduce((s, e) => s + Number(e.amount), 0),
      expected: invs.filter((v) => v.period === key).reduce((s, v) => s + Number(v.total), 0),
    });
  }
  return out;
}
