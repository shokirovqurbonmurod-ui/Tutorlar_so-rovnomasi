import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { notifyMany } from '../../modules/notifications/notifications.service.js';
import type { BotContext, ReportFlowState } from '../context.js';
import * as kb from '../keyboards/index.js';
import { esc, safeAnswerCb } from '../utils.js';
import type { ReportType } from '../../generated/prisma/enums.js';
import { Markup } from 'telegraf';

const TYPE_LABEL: Record<ReportType, string> = {
  DAILY: '📅 Kunlik hisobot',
  WEEKLY: '🗓 Haftalik hisobot',
  MONTHLY: '📆 Oylik hisobot',
  PROBLEM: '⚠️ Muammo haqida',
  STUDENT_FEEDBACK: "💬 O'quvchi fikri",
  LESSON: '📚 Dars hisoboti',
};

const TEMPLATE: Record<ReportType, string> = {
  DAILY: "Bugun nima qildingiz? Darslar, o'quvchilar bilan ishlash, muammolar va natijalar haqida qisqacha yozing.",
  WEEKLY: "Ushbu hafta: asosiy natijalar, muammolar, keyingi haftaga reja.",
  MONTHLY: "Ushbu oy: erishilgan natijalar, guruhlar holati, takliflar.",
  PROBLEM: "Muammoni batafsil tavsiflang: nima bo'ldi, kim ishtirok etdi, qanday yordam kerak?",
  STUDENT_FEEDBACK: "O'quvchi(lar)ning darslar haqidagi fikrini yozing. Ismini ko'rsatish shart emas.",
  LESSON: "Dars mavzusi, davomat, o'zlashtirish darajasi va uy vazifasi haqida yozing.",
};

const STATUS_LABEL = { PENDING: '⏳ Kutilmoqda', APPROVED: '✅ Tasdiqlangan', REJECTED: '❌ Rad etilgan', NEEDS_REVISION: '✏️ Qayta ishlash' } as const;

export async function showReportMenu(ctx: BotContext) {
  return ctx.reply("📝 <b>Hisobot topshirish</b>\n\nQaysi turdagi hisobot topshirmoqchisiz?", { parse_mode: 'HTML', ...kb.reportTypesKeyboard() });
}

export async function chooseType(ctx: BotContext, type: ReportType) {
  await safeAnswerCb(ctx);
  const u = ctx.dbUser!;
  const groups = await prisma.group.findMany({ where: { OR: [{ tutorId: u.id }, { teacherId: u.id }], isActive: true }, select: { id: true, name: true } });
  const state: ReportFlowState = { kind: 'report', step: groups.length ? 'group' : 'title', type, groupId: null };
  await ctx.setFlow(state);
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  if (groups.length) {
    return ctx.reply(`${TYPE_LABEL[type]}\n\n🏷 Qaysi guruh bo'yicha?`, Markup.inlineKeyboard([...groups.map((g) => [Markup.button.callback(g.name, `rep:group:${g.id}`)]), [Markup.button.callback('— Umumiy (guruhsiz) —', 'rep:group:none')]]));
  }
  return askTitle(ctx, state);
}

export async function chooseGroup(ctx: BotContext, groupId: string) {
  await safeAnswerCb(ctx);
  const state = { ...(ctx.flow as ReportFlowState), groupId: groupId === 'none' ? null : groupId, step: 'title' as const };
  await ctx.setFlow(state);
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  return askTitle(ctx, state);
}

async function askTitle(ctx: BotContext, state: ReportFlowState) {
  const def = `${TYPE_LABEL[state.type as ReportType].replace(/^\S+\s/, '')} — ${dayjs().format('DD.MM.YYYY')}`;
  return ctx.reply(`📌 Hisobot sarlavhasini yozing yoki o'tkazib yuboring.\n\n<i>Standart: ${esc(def)}</i>`, { parse_mode: 'HTML', ...kb.skipCancelKeyboard });
}

export async function handleReportText(ctx: BotContext, text: string) {
  const state = ctx.flow as ReportFlowState;
  const type = state.type as ReportType;
  if (state.step === 'title') {
    const title = text === kb.BTN.skip ? `${TYPE_LABEL[type].replace(/^\S+\s/, '')} — ${dayjs().format('DD.MM.YYYY')}` : text.trim().slice(0, 200);
    await ctx.setFlow({ ...state, title, step: 'content' });
    return ctx.reply(`✍️ <b>${esc(title)}</b>\n\n${TEMPLATE[type]}\n\n<i>Matnni bitta xabar qilib yuboring.</i>`, { parse_mode: 'HTML', ...kb.cancelKeyboard });
  }
  if (state.step === 'content') {
    if (text.trim().length < 10) return ctx.reply("✍️ Iltimos, kamida 10 ta belgidan iborat hisobot yozing.");
    const content = text.trim().slice(0, 8000);
    await ctx.setFlow({ ...state, content, step: 'confirm' });
    return ctx.reply(
      `📝 <b>${esc(state.title)}</b>\n${TYPE_LABEL[type]}\n\n${esc(content)}\n\n<b>Yuborilsinmi?</b>`,
      { parse_mode: 'HTML', ...kb.confirmKeyboard('rep:confirm', 'rep:rewrite') },
    );
  }
  if (state.step === 'confirm') return ctx.reply('👇 Iltimos, tugmalardan birini tanlang.');
  return ctx.reply('👇 Tugmalardan foydalaning.');
}

export async function rewrite(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const state = ctx.flow as ReportFlowState;
  await ctx.setFlow({ ...state, step: 'content' });
  return ctx.reply('✍️ Hisobot matnini qaytadan yuboring:', kb.cancelKeyboard);
}

export async function confirmReport(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const u = ctx.dbUser!;
  const state = ctx.flow as ReportFlowState;
  if (!state.content || !state.title) return ctx.reply("⚠️ Ma'lumot yetarli emas. Qaytadan boshlang.", kb.mainMenu(u.role));
  const type = state.type as ReportType;
  const now = dayjs();
  const period = type === 'WEEKLY' ? { periodStart: now.startOf('week').toDate(), periodEnd: now.endOf('week').toDate() } : type === 'MONTHLY' ? { periodStart: now.startOf('month').toDate(), periodEnd: now.endOf('month').toDate() } : { periodStart: now.startOf('day').toDate(), periodEnd: now.endOf('day').toDate() };
  const r = await prisma.report.create({ data: { type, title: state.title, content: state.content, authorId: u.id, groupId: state.groupId ?? null, ...period } });
  await ctx.setFlow({ kind: 'none' });
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  audit({ userId: u.id, action: 'report.submit', entity: 'Report', entityId: r.id, source: 'telegram', meta: { type } });
  await ctx.reply(`✅ <b>Hisobot qabul qilindi!</b>\n\nRaqami: <code>#${r.id.slice(-6).toUpperCase()}</code>\nHolati: ⏳ Ko'rib chiqilmoqda\n\nRahmat! Natija haqida xabar beramiz.`, { parse_mode: 'HTML', ...kb.mainMenu(u.role) });

  // Notify reviewers of the same branch (web only) — Director + HR
  const reviewers = await prisma.user.findMany({ where: { status: 'ACTIVE', role: { key: { in: ['DIRECTOR', 'HR_ADMIN', 'SUPER_ADMIN'] } }, OR: [{ branchId: u.branchId }, { branchId: null }] }, select: { id: true } });
  await notifyMany(reviewers.map((x) => x.id), { type: 'SYSTEM', channel: 'WEB', title: '📝 Yangi hisobot', body: `${u.fullName}: ${state.title}`, payload: { reportId: r.id } });
}

export async function myReports(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const u = ctx.dbUser!;
  const items = await prisma.report.findMany({ where: { authorId: u.id }, orderBy: { createdAt: 'desc' }, take: 10 });
  if (!items.length) return ctx.reply("📂 Hali hisobot topshirmagansiz.", kb.backToMenu());
  const lines = items.map((r) => `• <b>${esc(r.title)}</b>\n  ${TYPE_LABEL[r.type]} · ${STATUS_LABEL[r.status]} · ${dayjs(r.createdAt).format('DD.MM')}${r.reviewNote ? `\n  💬 ${esc(r.reviewNote)}` : ''}`);
  return ctx.reply(`📂 <b>Mening hisobotlarim</b> (so'nggi ${items.length})\n\n${lines.join('\n\n')}`, { parse_mode: 'HTML', ...kb.backToMenu() });
}

export async function cancelReport(ctx: BotContext) {
  await ctx.setFlow({ kind: 'none' });
  return ctx.reply('❌ Bekor qilindi.', kb.mainMenu(ctx.dbUser?.role));
}
