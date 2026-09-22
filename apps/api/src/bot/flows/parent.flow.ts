import dayjs from 'dayjs';
import { Markup } from 'telegraf';
import { prisma } from '../../lib/prisma.js';
import type { BotContext } from '../context.js';
import * as kb from '../keyboards/index.js';
import { esc, safeAnswerCb } from '../utils.js';
import { parentStudentIds, studentIdOfUser } from '../../lib/scope.js';
import { studentSummary } from '../../modules/students/students.service.js';
import { timetableFor, timetableText, WEEKDAYS, DAY_UZ } from '../../modules/schedule/schedule.service.js';
import { ATTENDANCE_UZ, ATTENDANCE_ICON } from '../../modules/attendance/attendance.routes.js';
import { GRADE_KIND_UZ } from '../../modules/grades/grades.routes.js';
import { HW_STATUS_UZ, HW_STATUS_ICON } from '../../modules/homework/homework.routes.js';
import { fmtUZS, periodLabel, INVOICE_STATUS_UZ } from '../../modules/finance/finance.service.js';
import { DORM_LOG_UZ } from '../../modules/dorm/dorm.routes.js';
import type { Weekday } from '../../generated/prisma/enums.js';

/**
 * Parent & student flows. Every handler first resolves which students the
 * Telegram user may see (parent → children, student → self) — never trusts ids
 * from callback data blindly.
 */

async function myStudents(ctx: BotContext) {
  const u = ctx.dbUser!;
  if (u.role === 'STUDENT') {
    const id = await studentIdOfUser(u.id);
    return id ? prisma.student.findMany({ where: { id }, include: { group: { select: { id: true, name: true } }, branch: { select: { name: true } } } }) : [];
  }
  const ids = await parentStudentIds(u.id);
  return prisma.student.findMany({ where: { id: { in: ids }, status: { not: 'ARCHIVED' } }, include: { group: { select: { id: true, name: true } }, branch: { select: { name: true } } }, orderBy: { fullName: 'asc' } });
}

async function guard(ctx: BotContext, studentId: string) {
  const list = await myStudents(ctx);
  const s = list.find((x) => x.id === studentId);
  if (!s) {
    await ctx.reply("⛔️ Bu o'quvchi ma'lumotlariga ruxsatingiz yo'q.");
    return null;
  }
  return s;
}

/** Entry: pick a child (or go straight to card when only one) */
export async function showChildren(ctx: BotContext, action = 'open') {
  await safeAnswerCb(ctx);
  const list = await myStudents(ctx);
  if (!list.length) return ctx.reply("👨‍👩‍👧 Sizga hali farzand biriktirilmagan.\n\nIltimos, maktab administratsiyasi bilan bog'laning — telefon raqamingiz tizimga kiritilgach farzandingiz avtomatik ko'rinadi.");
  if (list.length === 1) return dispatchChild(ctx, action, list[0].id);
  return ctx.reply('👨‍👩‍👧 <b>Farzandlarim</b>\n\nKimni ko\'rmoqchisiz?', { parse_mode: 'HTML', ...kb.childPicker(list, `child:${action}`) });
}

export async function dispatchChild(ctx: BotContext, action: string, studentId: string, arg?: string) {
  switch (action) {
    case 'open': return childCard(ctx, studentId);
    case 'grades': return childGrades(ctx, studentId, (arg as 'day' | 'week' | 'month') ?? 'week');
    case 'att': return childAttendance(ctx, studentId, (arg as 'day' | 'week' | 'month') ?? 'month');
    case 'sched': return childSchedule(ctx, studentId, arg as Weekday | 'pdf' | undefined);
    case 'hw': return childHomework(ctx, studentId);
    case 'exams': return childExams(ctx, studentId);
    case 'payments': return childPayments(ctx, studentId);
    case 'dorm': return childDorm(ctx, studentId);
    case 'teachers': return childTeachers(ctx, studentId);
    case 'chat': return childChat(ctx, studentId);
    default: return childCard(ctx, studentId);
  }
}

export async function childCard(ctx: BotContext, studentId: string) {
  const s = await guard(ctx, studentId);
  if (!s) return;
  const { summary } = await studentSummary(s.id);
  const rate = summary.attendance30.rate;
  const txt = [
    `👤 <b>${esc(s.fullName)}</b>`,
    `🏫 ${esc(s.branch.name)}${s.group ? ` · ${esc(s.group.name)}` : ' · guruh biriktirilmagan'}`,
    `🆔 ${esc(s.studentCode)}`,
    '',
    `📊 O'rtacha baho (30 kun): <b>${summary.avgGrade30 ?? '—'}</b>`,
    `🟢 Davomat (30 kun): <b>${rate != null ? rate + '%' : '—'}</b>  (${summary.attendance30.ABSENT} kelmagan, ${summary.attendance30.LATE} kechikkan)`,
    `📝 Bajarilmagan uy vazifalari: <b>${summary.homeworkPending}</b>`,
    `💳 Qarzdorlik: <b>${summary.debt > 0 ? fmtUZS(summary.debt) : "yo'q ✅"}</b>`,
  ].join('\n');
  return ctx.reply(txt, { parse_mode: 'HTML', ...kb.childMenu(s.id) });
}

const periodRange = (p: 'day' | 'week' | 'month') => ({ from: dayjs().startOf(p === 'day' ? 'day' : p === 'week' ? 'week' : 'month').toDate(), label: p === 'day' ? 'Bugun' : p === 'week' ? 'Shu hafta' : 'Shu oy' });

export async function childGrades(ctx: BotContext, studentId: string, period: 'day' | 'week' | 'month') {
  const s = await guard(ctx, studentId);
  if (!s) return;
  const { from, label } = periodRange(period);
  const grades = await prisma.grade.findMany({ where: { studentId, date: { gte: from } }, include: { subject: { select: { name: true } }, teacher: { select: { fullName: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 40 });
  const lines = [`📊 <b>${esc(s.fullName)} — baholar</b>`, `<i>${label}</i>`, ''];
  if (!grades.length) lines.push('Bu davrda baho qo\'yilmagan.');
  let lastDate = '';
  for (const g of grades) {
    const d = dayjs(g.date).format('DD.MM.YYYY');
    if (d !== lastDate) { lines.push(`<b>${d}</b>`); lastDate = d; }
    const stars = g.maxValue === 5 ? '⭐'.repeat(g.value) : `${g.value}/${g.maxValue}`;
    lines.push(`  ${esc(g.subject.name)} — <b>${g.value}</b> ${stars}${g.kind !== 'LESSON' ? ` (${GRADE_KIND_UZ[g.kind]})` : ''}${g.teacher ? `\n  <i>${esc(g.teacher.fullName)}</i>` : ''}${g.comment ? `\n  💬 ${esc(g.comment)}` : ''}`);
  }
  const five = grades.filter((g) => g.maxValue === 5);
  if (five.length) lines.push('', `O'rtacha: <b>${(five.reduce((a, g) => a + g.value, 0) / five.length).toFixed(2)}</b>`);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...kb.periodPicker('child:grades', studentId) });
}

export async function childAttendance(ctx: BotContext, studentId: string, period: 'day' | 'week' | 'month') {
  const s = await guard(ctx, studentId);
  if (!s) return;
  const { from, label } = periodRange(period);
  const rows = await prisma.attendance.findMany({ where: { studentId, date: { gte: from } }, include: { lesson: { select: { startTime: true, subject: { select: { name: true } } } } }, orderBy: [{ date: 'desc' }, { lesson: { startTime: 'asc' } }], take: 60 });
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const r of rows) counts[r.status]++;
  const lines = [`🟢 <b>${esc(s.fullName)} — davomat</b>`, `<i>${label}</i>`, '', `🟢 Kelgan: ${counts.PRESENT}   🔴 Kelmagan: ${counts.ABSENT}`, `🟡 Kechikkan: ${counts.LATE}   ⚪️ Sababli: ${counts.EXCUSED}`, ''];
  if (!rows.length) lines.push('Bu davrda davomat qayd etilmagan.');
  let lastDate = '';
  for (const r of rows) {
    const d = dayjs(r.date).format('DD.MM');
    if (d !== lastDate) { lines.push(`<b>${d}</b>`); lastDate = d; }
    lines.push(`  ${ATTENDANCE_ICON[r.status]} ${ATTENDANCE_UZ[r.status]}${r.lesson ? ` · ${esc(r.lesson.subject.name)} ${r.lesson.startTime}` : ''}${r.lateMinutes ? ` (${r.lateMinutes} daq)` : ''}${r.reason ? ` — ${esc(r.reason)}` : ''}`);
  }
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...kb.periodPicker('child:att', studentId) });
}

export async function childSchedule(ctx: BotContext, studentId: string, arg?: Weekday | 'pdf') {
  const s = await guard(ctx, studentId);
  if (!s) return;
  if (!s.group) return ctx.reply("📅 O'quvchi hali guruhga biriktirilmagan.");
  const t = await timetableFor(s.group.id);
  if (arg === 'pdf') {
    const { renderSchedulePdf } = await import('../../modules/schedule/schedule.service.js');
    const { PassThrough } = await import('node:stream');
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => stream.on('end', () => resolve(Buffer.concat(chunks))));
    renderSchedulePdf(stream as unknown as import('express').Response, t, s.fullName);
    const buf = await done;
    return ctx.replyWithDocument({ source: buf, filename: `jadval-${t.group.name}.pdf` }, { caption: `📅 ${t.group.name} — dars jadvali (PDF)` });
  }
  const todayKey = WEEKDAYS[(dayjs().day() + 6) % 7];
  const day = arg && WEEKDAYS.includes(arg) ? arg : undefined;
  const text = timetableText(t, day);
  const buttons = [
    WEEKDAYS.slice(0, 6).map((d) => Markup.button.callback((d === todayKey ? '• ' : '') + DAY_UZ[d].slice(0, 3), `child:sched:${studentId}:${d}`)),
    [Markup.button.callback('📋 Butun hafta', `child:sched:${studentId}`), Markup.button.callback('📄 PDF yuklab olish', `child:sched:${studentId}:pdf`)],
    [Markup.button.callback('⬅️ Farzandim', `child:open:${studentId}`)],
  ];
  return ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

export async function childHomework(ctx: BotContext, studentId: string) {
  const s = await guard(ctx, studentId);
  if (!s) return;
  if (!s.group) return ctx.reply("📝 O'quvchi guruhga biriktirilmagan.");
  const hws = await prisma.homework.findMany({ where: { groupId: s.group.id, deadline: { gte: dayjs().subtract(14, 'day').toDate() } }, include: { subject: { select: { name: true } }, submissions: { where: { studentId } } }, orderBy: { deadline: 'asc' }, take: 15 });
  const lines = [`📝 <b>${esc(s.fullName)} — uy vazifalari</b>`, ''];
  if (!hws.length) lines.push('Faol uy vazifalari yo\'q.');
  for (const h of hws) {
    const st = h.submissions[0]?.status ?? 'NOT_SUBMITTED';
    const late = dayjs().isAfter(h.deadline) && st === 'NOT_SUBMITTED';
    lines.push(`${HW_STATUS_ICON[st]} <b>${esc(h.subject.name)}</b> — ${esc(h.title)}`, `   ⏰ ${dayjs(h.deadline).format('DD.MM HH:mm')} · ${late ? '<b>muddati o\'tgan</b>' : HW_STATUS_UZ[st]}${h.submissions[0]?.score != null ? ` · ${h.submissions[0].score}/${h.maxScore}` : ''}`);
  }
  const buttons = hws.slice(0, 6).map((h) => [Markup.button.callback(`📖 ${h.subject.name}: ${h.title.slice(0, 30)}`, `hw:view:${h.id}:${studentId}`)]);
  buttons.push([Markup.button.callback('⬅️ Farzandim', `child:open:${studentId}`)]);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

export async function viewHomework(ctx: BotContext, homeworkId: string, studentId?: string) {
  await safeAnswerCb(ctx);
  const list = await myStudents(ctx);
  const h = await prisma.homework.findUnique({ where: { id: homeworkId }, include: { subject: true, group: true, author: { select: { fullName: true } } } });
  if (!h) return ctx.reply('Uy vazifasi topilmadi.');
  const student = list.find((x) => x.id === studentId) ?? list.find((x) => x.group?.id === h.groupId);
  const isStaff = !['PARENT', 'STUDENT'].includes(ctx.dbUser!.role);
  if (!student && !isStaff) return ctx.reply("⛔️ Ruxsat yo'q.");
  const sub = student ? await prisma.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId, studentId: student.id } } }) : null;
  const lines = [
    `📝 <b>${esc(h.subject.name)} — ${esc(h.title)}</b>`,
    `👥 ${esc(h.group.name)} · 👩‍🏫 ${esc(h.author.fullName)}`,
    `⏰ Muddat: <b>${dayjs(h.deadline).format('DD.MM.YYYY HH:mm')}</b>`,
    '',
    esc(h.task),
    ...(h.note ? ['', `💡 ${esc(h.note)}`] : []),
    ...(h.fileUrl ? ['', `📎 <a href="${h.fileUrl}">${esc(h.fileName ?? 'Fayl')}</a>`] : []),
  ];
  if (sub) lines.push('', `Holat: ${HW_STATUS_ICON[sub.status]} <b>${HW_STATUS_UZ[sub.status]}</b>${sub.score != null ? ` · ${sub.score}/${h.maxScore}` : ''}${sub.feedback ? `\n💬 ${esc(sub.feedback)}` : ''}`);
  const buttons = [];
  if (student && ctx.dbUser!.role === 'STUDENT' && (!sub || ['NOT_SUBMITTED', 'REVISION'].includes(sub.status))) buttons.push([Markup.button.callback('📤 Javob yuborish', `hw:submit:${homeworkId}:${student.id}`)]);
  if (student) buttons.push([Markup.button.callback('⬅️ Uy vazifalari', `child:hw:${student.id}`)]);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...Markup.inlineKeyboard(buttons) });
}

export async function childExams(ctx: BotContext, studentId: string) {
  const s = await guard(ctx, studentId);
  if (!s) return;
  if (!s.group) return ctx.reply("🧪 O'quvchi guruhga biriktirilmagan.");
  const exams = await prisma.exam.findMany({ where: { groupId: s.group.id }, include: { subject: { select: { name: true } }, results: { where: { studentId } } }, orderBy: { date: 'desc' }, take: 12 });
  const lines = [`🧪 <b>${esc(s.fullName)} — imtihonlar</b>`, ''];
  if (!exams.length) lines.push("Imtihonlar yo'q.");
  for (const e of exams) {
    const r = e.results[0];
    lines.push(`${e.status === 'DONE' ? '✅' : e.status === 'CANCELLED' ? '❌' : '🗓'} <b>${esc(e.subject.name)}</b> — ${esc(e.title)}`, `   📅 ${dayjs(e.date).format('DD.MM.YYYY')}${r ? ` · Ball: <b>${r.score}/${e.maxScore}</b> · Baho: <b>${r.grade}</b>` : e.status === 'PLANNED' ? ' · rejalashtirilgan' : ''}`);
  }
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Farzandim', `child:open:${studentId}`)]]) });
}

export async function childPayments(ctx: BotContext, studentId: string) {
  const s = await guard(ctx, studentId);
  if (!s) return;
  const invoices = await prisma.invoice.findMany({ where: { studentId, status: { not: 'CANCELLED' } }, include: { payments: { orderBy: { paidAt: 'desc' } } }, orderBy: { period: 'desc' }, take: 6 });
  const debt = invoices.reduce((a, i) => (['PENDING', 'PARTIAL', 'OVERDUE'].includes(i.status) ? a + Number(i.total) - Number(i.paid) : a), 0);
  const lines = [`💳 <b>${esc(s.fullName)} — to'lovlar</b>`, `Oylik to'lov: <b>${fmtUZS(s.monthlyFee)}</b>${s.discountPercent ? ` (chegirma ${s.discountPercent}%)` : ''}`, `Umumiy qarzdorlik: <b>${debt > 0 ? fmtUZS(debt) : "yo'q ✅"}</b>`, ''];
  if (!invoices.length) lines.push("Hisob-fakturalar hali yaratilmagan.");
  for (const i of invoices) {
    const icon = i.status === 'PAID' ? '✅' : i.status === 'OVERDUE' ? '🔴' : i.status === 'PARTIAL' ? '🟡' : '⏳';
    lines.push(`${icon} <b>${periodLabel(i.period)}</b> — ${INVOICE_STATUS_UZ[i.status]}`, `   Jami: ${fmtUZS(i.total)} · To'langan: ${fmtUZS(i.paid)} · Qoldiq: ${fmtUZS(Number(i.total) - Number(i.paid))}`, `   Muddat: ${dayjs(i.dueDate).format('DD.MM.YYYY')}`);
    for (const p of i.payments.slice(0, 3)) lines.push(`   └ ${dayjs(p.paidAt).format('DD.MM')} · ${fmtUZS(p.amount)} (${p.method})`);
  }
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Farzandim', `child:open:${studentId}`)]]) });
}

export async function childDorm(ctx: BotContext, studentId: string) {
  const s = await guard(ctx, studentId);
  if (!s) return;
  const asg = await prisma.dormAssignment.findUnique({ where: { studentId }, include: { bed: { include: { room: { include: { building: { include: { dormitory: { include: { manager: { select: { fullName: true, phone: true } } } } } } } } } } } });
  if (!asg) return ctx.reply(`🏠 ${esc(s.fullName)} yotoqxonada yashamaydi.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Farzandim', `child:open:${studentId}`)]]) });
  const room = asg.bed.room, b = room.building, d = b.dormitory;
  const logs = await prisma.dormLog.findMany({ where: { studentId }, orderBy: { occurredAt: 'desc' }, take: 8 });
  const lines = [
    `🏠 <b>${esc(s.fullName)} — yotoqxona</b>`, '',
    `🏢 ${esc(d.name)} · ${esc(b.name)}`,
    `🚪 ${esc(room.number)}-xona, ${room.floor}-qavat · 🛏 ${esc(asg.bed.label)}-krovat`,
    `📅 Joylashgan: ${dayjs(asg.checkInAt).format('DD.MM.YYYY')}`,
    ...(d.manager ? [`👮 Komendant: ${esc(d.manager.fullName)}${d.manager.phone ? ` · ${esc(d.manager.phone)}` : ''}`] : []),
    '', '<b>So\'nggi qaydlar</b>',
  ];
  if (!logs.length) lines.push("Qaydlar yo'q.");
  for (const l of logs) lines.push(`${l.severity === 'CRITICAL' ? '🚨' : l.severity === 'WARNING' ? '⚠️' : '•'} ${dayjs(l.occurredAt).format('DD.MM HH:mm')} — ${DORM_LOG_UZ[l.type]}: ${esc(l.title)}`);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Farzandim', `child:open:${studentId}`)]]) });
}

export async function childTeachers(ctx: BotContext, studentId: string) {
  const s = await guard(ctx, studentId);
  if (!s) return;
  if (!s.group) return ctx.reply("O'quvchi guruhga biriktirilmagan.");
  const g = await prisma.group.findUnique({ where: { id: s.group.id }, include: { tutor: { select: { fullName: true, phone: true, telegramUsername: true } }, teacher: { select: { fullName: true, phone: true, telegramUsername: true } }, teachers: { include: { teacher: { select: { fullName: true, telegramUsername: true } }, subject: { select: { name: true } } } } } });
  const lines = [`👩‍🏫 <b>${esc(s.group.name)} — o'qituvchilar</b>`, ''];
  const contact = (u: { fullName: string; phone?: string | null; telegramUsername?: string | null }) => `${esc(u.fullName)}${u.telegramUsername ? ` · @${esc(u.telegramUsername)}` : ''}${u.phone ? ` · ${esc(u.phone)}` : ''}`;
  if (g?.tutor) lines.push(`🎓 <b>Tutor:</b> ${contact(g.tutor)}`);
  if (g?.teacher) lines.push(`👩‍🏫 <b>Sinf rahbari:</b> ${contact(g.teacher)}`);
  if (g?.teachers.length) { lines.push('', '<b>Fan o\'qituvchilari</b>'); for (const t of g.teachers) lines.push(`• ${esc(t.subject.name)} — ${contact(t.teacher)}`); }
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Farzandim', `child:open:${studentId}`)]]) });
}

export async function childChat(ctx: BotContext, studentId: string) {
  const s = await guard(ctx, studentId);
  if (!s) return;
  if (!s.group) return ctx.reply("O'quvchi guruhga biriktirilmagan.");
  const { openChat } = await import('./chat.flow.js');
  return openChat(ctx, s.group.id);
}
