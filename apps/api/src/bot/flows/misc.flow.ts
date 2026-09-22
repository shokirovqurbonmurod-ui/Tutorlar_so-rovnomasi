import dayjs from 'dayjs';
import { Markup } from 'telegraf';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import type { BotContext } from '../context.js';
import * as kb from '../keyboards/index.js';
import { esc, safeAnswerCb } from '../utils.js';
import { ROLE_LABELS } from '../../lib/permissions.js';

export async function showAnnouncements(ctx: BotContext) {
  const u = ctx.dbUser!;
  const items = await prisma.announcement.findMany({
    where: {
      publishAt: { lte: new Date() },
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      AND: [{ OR: [{ audience: 'ALL' }, { audience: u.role === 'TUTOR' ? 'TUTORS' : u.role === 'TEACHER' ? 'TEACHERS' : 'ALL' }, { audience: 'BRANCH', branchId: u.branchId }] }],
    },
    orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
    take: 8,
    include: { reads: { where: { userId: u.id }, select: { userId: true } } },
  });
  if (!items.length) return ctx.reply("📢 Hozircha e'lonlar yo'q.", kb.backToMenu());
  const P: Record<string, string> = { LOW: '📢', NORMAL: '📢', HIGH: '❗️', URGENT: '🚨' };
  const text = items
    .map((a) => `${a.isPinned ? '📌 ' : ''}${P[a.priority]} <b>${esc(a.title)}</b> ${a.reads.length ? '' : '🆕'}\n<i>${dayjs(a.publishAt).format('DD.MM.YYYY')}</i>\n${esc(a.body.length > 400 ? a.body.slice(0, 400) + '…' : a.body)}`)
    .join('\n\n━━━━━━━━━━━━━━\n\n');
  const unread = items.filter((a) => !a.reads.length);
  if (unread.length) {
    await prisma.announcementRead.createMany({ data: unread.map((a) => ({ announcementId: a.id, userId: u.id })), skipDuplicates: true });
  }
  return ctx.reply(`📢 <b>E'lonlar</b>\n\n${text}`, { parse_mode: 'HTML', ...kb.backToMenu() });
}

export async function markAnnouncementRead(ctx: BotContext, id: string) {
  const u = ctx.dbUser!;
  await prisma.announcementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId: u.id } }, create: { announcementId: id, userId: u.id }, update: {} }).catch(() => undefined);
  await safeAnswerCb(ctx, "✅ O'qilgan deb belgilandi");
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
}

export async function showTasks(ctx: BotContext) {
  const u = ctx.dbUser!;
  const tasks = await prisma.task.findMany({ where: { assigneeId: u.id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { dueAt: 'asc' }, take: 10 });
  const done = await prisma.task.count({ where: { assigneeId: u.id, status: 'DONE' } });
  if (!tasks.length) return ctx.reply(`🎯 <b>Vazifalarim</b>\n\nFaol vazifalar yo'q. ✅\nBajarilgan: <b>${done}</b>`, { parse_mode: 'HTML', ...kb.backToMenu() });
  const lines = tasks.map((t, i) => {
    const overdue = t.dueAt && t.dueAt < new Date();
    return `${i + 1}. <b>${esc(t.title)}</b>${t.dueAt ? `\n    ${overdue ? '🔴' : '⏰'} ${dayjs(t.dueAt).format('DD.MM HH:mm')}` : ''}${t.description ? `\n    ${esc(t.description.slice(0, 120))}` : ''}`;
  });
  return ctx.reply(`🎯 <b>Vazifalarim</b> (${tasks.length})\n\n${lines.join('\n\n')}`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([...tasks.slice(0, 6).map((t) => [Markup.button.callback(`✅ ${t.title.slice(0, 40)}`, `task:done:${t.id}`)]), [Markup.button.callback(kb.BTN.menu, 'menu:main')]]),
  });
}

export async function completeTask(ctx: BotContext, id: string) {
  const u = ctx.dbUser!;
  const t = await prisma.task.findFirst({ where: { id, assigneeId: u.id } });
  if (!t) return safeAnswerCb(ctx, 'Vazifa topilmadi');
  await prisma.task.update({ where: { id }, data: { status: 'DONE', completedAt: new Date() } });
  await safeAnswerCb(ctx, '✅ Bajarildi!');
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  return ctx.reply(`✅ "<b>${esc(t.title)}</b>" bajarildi deb belgilandi.`, { parse_mode: 'HTML' });
}

export async function showProfile(ctx: BotContext) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: ctx.dbUser!.id }, include: { role: true, branch: true, department: true, tutorGroups: true, teacherGroups: true } });
  const groups = [...u.tutorGroups, ...u.teacherGroups].map((g) => g.name);
  const status = { ACTIVE: '🟢 Faol', INACTIVE: '⚪️ Nofaol', BLOCKED: '🔴 Bloklangan', PENDING: '🟡 Tasdiqlanmagan' }[u.status];
  const lines = [
    `👤 <b>${esc(u.fullName)}</b>`,
    ``,
    `🏷 Rol: ${esc(ROLE_LABELS[u.role.key])}`,
    u.position ? `💼 Lavozim: ${esc(u.position)}` : null,
    `🏫 Filial: ${esc(u.branch?.name ?? '—')}`,
    u.department ? `🏢 Bo'lim: ${esc(u.department.name)}` : null,
    groups.length ? `👥 Guruhlar: ${esc(groups.join(', '))}` : null,
    `📱 Telefon: ${esc(u.phone ?? '—')}`,
    `✈️ Telegram: @${esc(u.telegramUsername ?? '—')}`,
    `📅 Qo'shilgan: ${dayjs(u.joinDate).format('DD.MM.YYYY')}`,
    `${status}`,
  ].filter(Boolean);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...kb.backToMenu() });
}

export async function showHelp(ctx: BotContext) {
  const isAdmin = ctx.dbUser && kb.ADMIN_ROLES.includes(ctx.dbUser.role);
  const lines = [
    `❓ <b>Yordam</b>`,
    ``,
    `Bu bot orqali siz:`,
    `📋 So'rovnomalarni to'ldirasiz`,
    `📝 Kunlik / haftalik / oylik hisobot topshirasiz`,
    `📢 E'lonlarni o'qiysiz`,
    `📊 O'z natijalaringiz va KPI ni ko'rasiz`,
    `🎯 Vazifalaringizni boshqarasiz`,
    ``,
    `<b>Buyruqlar:</b>`,
    `/start — botni qayta ishga tushirish`,
    `/menu — asosiy menyu`,
    `/surveys — so'rovnomalar`,
    `/reports — hisobot topshirish`,
    `/profile — profil`,
    `/help — yordam`,
  ];
  if (isAdmin) lines.push(``, `<b>Admin buyruqlari:</b>`, `/admin — admin panel`, `/users — foydalanuvchilar`, `/analytics — analitika`, ``, `🌐 Web panel: ${env.WEB_PUBLIC_URL}`);
  lines.push(``, `Savollar bo'lsa, administratorga murojaat qiling.`);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...kb.backToMenu() });
}
