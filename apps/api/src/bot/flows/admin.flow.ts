import dayjs from 'dayjs';
import { Markup } from 'telegraf';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { audit } from '../../lib/audit.js';
import { notify } from '../../modules/notifications/notifications.service.js';
import * as analytics from '../../modules/analytics/analytics.service.js';
import type { BotContext } from '../context.js';
import * as kb from '../keyboards/index.js';
import { esc, safeAnswerCb } from '../utils.js';
import { ROLE_LABELS } from '../../lib/permissions.js';

export const isAdmin = (ctx: BotContext) => Boolean(ctx.dbUser && kb.ADMIN_ROLES.includes(ctx.dbUser.role));

export async function adminHome(ctx: BotContext) {
  if (!isAdmin(ctx)) return ctx.reply("⛔️ Bu bo'lim faqat boshqaruv xodimlari uchun.");
  const [pendingUsers, activeSurveys, pendingReports] = await Promise.all([
    prisma.user.count({ where: { status: 'PENDING' } }),
    prisma.survey.count({ where: { status: 'ACTIVE' } }),
    prisma.report.count({ where: { status: 'PENDING' } }),
  ]);
  return ctx.reply(
    `🛠 <b>Admin panel</b>\n\n⏳ Tasdiqlash kutayotganlar: <b>${pendingUsers}</b>\n📋 Faol so'rovnomalar: <b>${activeSurveys}</b>\n📝 Ko'rilmagan hisobotlar: <b>${pendingReports}</b>\n\n🌐 To'liq boshqaruv: ${env.WEB_PUBLIC_URL}`,
    { parse_mode: 'HTML', ...kb.adminMenu() },
  );
}

export async function adminUsers(ctx: BotContext) {
  if (!isAdmin(ctx)) return;
  await safeAnswerCb(ctx);
  const rows = await prisma.user.groupBy({ by: ['roleId', 'status'], _count: true });
  const roles = await prisma.role.findMany();
  const byRole = roles.map((r) => {
    const mine = rows.filter((x) => x.roleId === r.id);
    const n = (s: string) => mine.find((x) => x.status === s)?._count ?? 0;
    return `• ${ROLE_LABELS[r.key]}: <b>${mine.reduce((s, x) => s + x._count, 0)}</b> (🟢${n('ACTIVE')} ⚪️${n('INACTIVE')} 🟡${n('PENDING')} 🔴${n('BLOCKED')})`;
  });
  const linked = await prisma.user.count({ where: { telegramId: { not: null } } });
  const total = await prisma.user.count();
  return ctx.reply(`👥 <b>Foydalanuvchilar</b> — jami ${total}\n✈️ Telegram ulangan: ${linked}\n\n${byRole.join('\n')}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⏳ Tasdiqlash kutayotganlar', 'admin:pending')], [Markup.button.callback('⬅️ Admin panel', 'admin:home')]]) });
}

export async function adminPending(ctx: BotContext) {
  if (!isAdmin(ctx)) return;
  await safeAnswerCb(ctx);
  const users = await prisma.user.findMany({ where: { status: 'PENDING' }, include: { role: true, branch: true }, orderBy: { createdAt: 'desc' }, take: 10 });
  if (!users.length) return ctx.reply('✅ Tasdiqlash kutayotgan foydalanuvchilar yo\'q.', Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin panel', 'admin:home')]]));
  for (const u of users) {
    await ctx.reply(
      `🆕 <b>${esc(u.fullName)}</b>\n🏷 ${esc(u.role.name)} · 🏫 ${esc(u.branch?.name ?? '—')}\n📱 ${esc(u.phone ?? '—')} · @${esc(u.telegramUsername ?? '—')}\n📅 ${dayjs(u.createdAt).format('DD.MM.YYYY HH:mm')}`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Tasdiqlash', `admin:approve:${u.id}`), Markup.button.callback('❌ Rad etish', `admin:reject:${u.id}`)]]) },
    );
  }
}

export async function approveUser(ctx: BotContext, userId: string, approve: boolean) {
  if (!isAdmin(ctx)) return safeAnswerCb(ctx, 'Ruxsat yo\'q');
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!u) return safeAnswerCb(ctx, 'Topilmadi');
  if (u.status !== 'PENDING') return safeAnswerCb(ctx, 'Allaqachon ko\'rib chiqilgan');
  await prisma.user.update({ where: { id: userId }, data: { status: approve ? 'ACTIVE' : 'BLOCKED' } });
  audit({ userId: ctx.dbUser!.id, action: approve ? 'user.approve' : 'user.reject', entity: 'User', entityId: userId, source: 'telegram' });
  await safeAnswerCb(ctx, approve ? '✅ Tasdiqlandi' : '❌ Rad etildi');
  await ctx.editMessageText(`${approve ? '✅ Tasdiqlandi' : '❌ Rad etildi'}: <b>${esc(u.fullName)}</b> (${esc(u.role.name)})`, { parse_mode: 'HTML' }).catch(() => undefined);
  if (approve) {
    await notify({ userId, type: 'SYSTEM', title: '🎉 Hisobingiz tasdiqlandi!', body: `Xush kelibsiz, ${u.fullName}! Endi so'rovnomalar va hisobotlar bilan ishlashingiz mumkin. /menu`, payload: { keyboard: { inline_keyboard: [[{ text: '🏠 Asosiy menyu', callback_data: 'menu:main' }]] } } });
  }
}

export async function adminSurveys(ctx: BotContext) {
  if (!isAdmin(ctx)) return;
  await safeAnswerCb(ctx);
  const surveys = await prisma.survey.findMany({ where: { status: { in: ['ACTIVE', 'SCHEDULED'] } }, orderBy: { createdAt: 'desc' }, take: 8, include: { _count: { select: { assignments: true } } } });
  if (!surveys.length) return ctx.reply("📋 Faol so'rovnomalar yo'q.", Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin panel', 'admin:home')]]));
  const done = await prisma.surveyAssignment.groupBy({ by: ['surveyId'], where: { surveyId: { in: surveys.map((s) => s.id) }, status: 'COMPLETED' }, _count: true });
  const lines = surveys.map((s) => {
    const d = done.find((x) => x.surveyId === s.id)?._count ?? 0;
    const pct = s._count.assignments ? Math.round((d / s._count.assignments) * 100) : 0;
    return `${s.status === 'ACTIVE' ? '🟢' : '🕓'} <b>${esc(s.title)}</b>\n    ${d}/${s._count.assignments} · ${pct}%${s.deadline ? ` · ⏰ ${dayjs(s.deadline).format('DD.MM HH:mm')}` : ''}`;
  });
  return ctx.reply(`📋 <b>So'rovnomalar</b>\n\n${lines.join('\n\n')}`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([...surveys.filter((s) => s.status === 'ACTIVE').slice(0, 4).map((s) => [Markup.button.callback(`🔔 Eslatma: ${s.title.slice(0, 30)}`, `admin:remind:${s.id}`)]), [Markup.button.callback('⬅️ Admin panel', 'admin:home')]]),
  });
}

export async function adminRemind(ctx: BotContext, surveyId: string) {
  if (!isAdmin(ctx)) return;
  const { remindPending } = await import('../../jobs/scheduler.js');
  const n = await remindPending(surveyId);
  audit({ userId: ctx.dbUser!.id, action: 'survey.remind', entity: 'Survey', entityId: surveyId, source: 'telegram', meta: { reminded: n } });
  return safeAnswerCb(ctx, `🔔 ${n} kishiga eslatma yuborildi`);
}

export async function adminReports(ctx: BotContext) {
  if (!isAdmin(ctx)) return;
  await safeAnswerCb(ctx);
  const reports = await prisma.report.findMany({ where: { status: 'PENDING' }, include: { author: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' }, take: 5 });
  if (!reports.length) return ctx.reply("✅ Ko'rib chiqilmagan hisobotlar yo'q.", Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin panel', 'admin:home')]]));
  for (const r of reports) {
    await ctx.reply(`📝 <b>${esc(r.title)}</b>\n👤 ${esc(r.author.fullName)} · ${dayjs(r.createdAt).format('DD.MM HH:mm')}\n\n${esc(r.content.slice(0, 700))}${r.content.length > 700 ? '…' : ''}`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('✅ Tasdiqlash', `admin:rep:APPROVED:${r.id}`), Markup.button.callback('✏️ Qayta ishlash', `admin:rep:NEEDS_REVISION:${r.id}`), Markup.button.callback('❌ Rad', `admin:rep:REJECTED:${r.id}`)]]),
    });
  }
  const more = await prisma.report.count({ where: { status: 'PENDING' } });
  if (more > 5) await ctx.reply(`… va yana ${more - 5} ta. To'liq ro'yxat: ${env.WEB_PUBLIC_URL}/reports`);
}

export async function adminReviewReport(ctx: BotContext, status: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION', id: string) {
  if (!isAdmin(ctx)) return safeAnswerCb(ctx, 'Ruxsat yo\'q');
  const r = await prisma.report.findUnique({ where: { id } });
  if (!r || r.status !== 'PENDING') return safeAnswerCb(ctx, 'Allaqachon ko\'rib chiqilgan');
  await prisma.report.update({ where: { id }, data: { status, reviewerId: ctx.dbUser!.id, reviewedAt: new Date() } });
  const label = { APPROVED: '✅ Tasdiqlangan', REJECTED: '❌ Rad etilgan', NEEDS_REVISION: '✏️ Qayta ishlash kerak' }[status];
  audit({ userId: ctx.dbUser!.id, action: 'report.review', entity: 'Report', entityId: id, source: 'telegram', meta: { status } });
  await safeAnswerCb(ctx, label);
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  await ctx.reply(`${label}: <b>${esc(r.title)}</b>`, { parse_mode: 'HTML' });
  await notify({ userId: r.authorId, type: 'REPORT_REVIEWED', title: `${label.split(' ')[0]} Hisobotingiz ko'rib chiqildi`, body: `"${r.title}" — ${label.slice(2)}`, payload: { reportId: id } });
}

export async function adminAnalytics(ctx: BotContext) {
  if (!isAdmin(ctx)) return;
  await safeAnswerCb(ctx);
  const s = { from: dayjs().subtract(30, 'day').startOf('day').toDate(), to: dayjs().endOf('day').toDate(), branchId: ctx.dbUser!.role === 'DIRECTOR' ? ctx.dbUser!.branchId ?? undefined : undefined };
  const [o, branches, top] = await Promise.all([analytics.overview(s), analytics.branchPerformance(s), analytics.topPerformers(s, undefined, 5)]);
  const bar = (p: number) => '█'.repeat(Math.round(p / 10)) + '░'.repeat(10 - Math.round(p / 10));
  const lines = [
    `📊 <b>Analitika</b> — so'nggi 30 kun`,
    ``,
    `👨‍🏫 Tutorlar: <b>${o.totalTutors}</b> · 👩‍🏫 O'qituvchilar: <b>${o.totalTeachers}</b>`,
    `🟢 Faol (7 kun): <b>${o.activeUsers}</b> · ✈️ Telegram: <b>${o.telegramLinked}</b>`,
    ``,
    `📋 Yuborilgan: <b>${o.surveysSent}</b> · Yakunlangan: <b>${o.surveysCompleted}/${o.surveysAssigned}</b>`,
    `${bar(o.completionRate)} ${o.completionRate}% ${o.completionRateDelta >= 0 ? '📈' : '📉'} ${o.completionRateDelta > 0 ? '+' : ''}${o.completionRateDelta}%`,
    `⭐ O'rtacha baho: <b>${o.avgRating ?? '—'}</b>`,
    `📝 Hisobotlar: <b>${o.reportsThisPeriod}</b> (kutilmoqda: ${o.pendingReports})`,
    `🔴 Muddati o'tgan: <b>${o.overdueAssignments}</b>`,
  ];
  if (branches.length > 1) {
    lines.push('', '🏫 <b>Filiallar</b>');
    for (const b of branches) lines.push(`• ${esc(b.name)}: ${b.completionRate}% · ⭐${b.avgRating ?? '—'} · KPI ${b.kpiScore ?? '—'}`);
  }
  if (top.length) {
    lines.push('', "🏆 <b>Eng faol xodimlar</b>");
    top.forEach((t, i) => lines.push(`${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${esc(t.fullName)} — KPI ${t.kpiScore} · ${t.completionRate}%`));
  }
  lines.push('', `🌐 Batafsil: ${env.WEB_PUBLIC_URL}/analytics`);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin panel', 'admin:home')]]) });
}
