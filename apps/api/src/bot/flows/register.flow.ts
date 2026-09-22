import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { env } from '../../config/env.js';
import { notifyMany, flushQueued } from '../../modules/notifications/notifications.service.js';
import type { BotContext, RegisterFlowState } from '../context.js';
import * as kb from '../keyboards/index.js';
import { esc, safeAnswerCb } from '../utils.js';
import { Markup } from 'telegraf';

export const WELCOME = `Assalomu alaykum! 👋\n\nXususiy maktab boshqaruv botiga xush kelibsiz.`;

/**
 * Secure verification: a Telegram account becomes a system user only via
 *  (a) a one-time link code generated in the web dashboard (/link 123456), or
 *  (b) self-registration → status PENDING → approved by HR/Admin, or
 *  (c) a pre-registered phone number that matches (contact share).
 */
export async function startUnknown(ctx: BotContext) {
  const tgId = ctx.from!.id;
  // Super admin bootstrap via env
  if (env.superAdminTelegramIds.includes(String(tgId))) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
    const u = await prisma.user.create({
      data: { fullName: [ctx.from!.first_name, ctx.from!.last_name].filter(Boolean).join(' ') || 'Super Admin', telegramId: BigInt(tgId), telegramChatId: BigInt(ctx.chat!.id), telegramUsername: ctx.from!.username, roleId: role.id, status: 'ACTIVE', position: 'Super Admin' },
    });
    audit({ userId: u.id, action: 'auth.telegram_bootstrap', source: 'telegram' });
    return ctx.reply(`${WELCOME}\n\n🛡 Siz Super Admin sifatida ro'yxatdan o'tdingiz.`, kb.mainMenu('SUPER_ADMIN'));
  }
  await ctx.setFlow({ kind: 'none' });
  return ctx.reply(
    `${WELCOME}\n\nSizni tizimda topa olmadik. Davom etish uchun variantni tanlang:`,
    Markup.inlineKeyboard([
      [Markup.button.callback("🔑 Kod bilan ulash (admin bergan)", 'reg:link')],
      [Markup.button.callback("📱 Telefon raqam orqali", 'reg:phone')],
      [Markup.button.callback("📝 Ro'yxatdan o'tish (tasdiqlash talab etiladi)", 'reg:start')],
    ]),
  );
}

export async function askLinkCode(ctx: BotContext) {
  await safeAnswerCb(ctx);
  await ctx.setFlow({ kind: 'link' });
  return ctx.reply('🔑 Web paneldagi <b>Profil → Telegramni ulash</b> bo\'limidan olingan 6 xonali kodni yuboring:', { parse_mode: 'HTML', ...kb.cancelKeyboard });
}

export async function handleLinkCode(ctx: BotContext, text: string) {
  const code = text.trim();
  if (!/^\d{6}$/.test(code)) return ctx.reply('🔑 Kod 6 ta raqamdan iborat bo\'lishi kerak. Qaytadan yuboring:');
  const rec = await prisma.telegramLinkCode.findUnique({ where: { code }, include: { user: { include: { role: true } } } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) return ctx.reply('❌ Kod noto\'g\'ri yoki muddati tugagan. Web panelda yangi kod oling.');
  const tgId = BigInt(ctx.from!.id);
  const taken = await prisma.user.findUnique({ where: { telegramId: tgId } });
  if (taken && taken.id !== rec.userId) return ctx.reply('⚠️ Bu Telegram akkaunt boshqa foydalanuvchiga ulangan. Administrator bilan bog\'laning.');
  await prisma.$transaction([
    prisma.user.update({ where: { id: rec.userId }, data: { telegramId: tgId, telegramChatId: BigInt(ctx.chat!.id), telegramUsername: ctx.from!.username, lastActivityAt: new Date() } }),
    prisma.telegramLinkCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
  ]);
  await ctx.setFlow({ kind: 'none' });
  audit({ userId: rec.userId, action: 'auth.telegram_linked', source: 'telegram', meta: { telegramId: tgId.toString() } });
  await ctx.reply(`✅ Akkaunt muvaffaqiyatli ulandi!\n\n👤 <b>${esc(rec.user.fullName)}</b>\n🏷 ${esc(rec.user.role.name)}`, { parse_mode: 'HTML', ...kb.mainMenu(rec.user.role.key) });
  await flushQueued(rec.userId);
}

export async function askPhone(ctx: BotContext) {
  await safeAnswerCb(ctx);
  await ctx.setFlow({ kind: 'register', step: 'phone' });
  return ctx.reply("📱 Tizimda ro'yxatdan o'tgan telefon raqamingizni yuboring (tugma orqali):", kb.phoneKeyboard);
}

export async function handleContact(ctx: BotContext, phoneRaw: string, contactUserId?: number) {
  if (contactUserId && contactUserId !== ctx.from!.id) return ctx.reply("⚠️ Iltimos, o'zingizning raqamingizni yuboring.");
  const phone = normalizePhone(phoneRaw);
  const state = ctx.flow;
  if (state.kind === 'register' && state.step === 'phone' && state.fullName) {
    // part of self-registration
    return continueRegister(ctx, { ...state, phone, step: 'role' });
  }
  const user = await prisma.user.findFirst({ where: { OR: [{ phone }, { phone: phone.replace('+', '') }, { phone: `+${phone.replace('+', '')}` }] }, include: { role: true } });
  if (!user) {
    await ctx.setFlow({ kind: 'none' });
    return ctx.reply("❌ Bu raqam tizimda topilmadi.\n\nRo'yxatdan o'tish uchun /start buyrug'ini bosing va \"Ro'yxatdan o'tish\"ni tanlang.", kb.removeKeyboard);
  }
  if (user.telegramId && user.telegramId !== BigInt(ctx.from!.id)) {
    return ctx.reply("⚠️ Bu raqamga boshqa Telegram akkaunt ulangan. Administrator bilan bog'laning.", kb.removeKeyboard);
  }
  await prisma.user.update({ where: { id: user.id }, data: { telegramId: BigInt(ctx.from!.id), telegramChatId: BigInt(ctx.chat!.id), telegramUsername: ctx.from!.username, lastActivityAt: new Date() } });
  await ctx.setFlow({ kind: 'none' });
  audit({ userId: user.id, action: 'auth.telegram_linked_phone', source: 'telegram' });
  await ctx.reply(`✅ Xush kelibsiz, <b>${esc(user.fullName)}</b>!\n🏷 ${esc(user.role.name)}`, { parse_mode: 'HTML', ...kb.mainMenu(user.role.key) });
  await flushQueued(user.id);
}

export async function startRegister(ctx: BotContext) {
  await safeAnswerCb(ctx);
  await ctx.setFlow({ kind: 'register', step: 'name' });
  return ctx.reply("📝 <b>Ro'yxatdan o'tish</b>\n\nTo'liq ism-familiyangizni yozing:", { parse_mode: 'HTML', ...kb.cancelKeyboard });
}

export async function handleRegisterText(ctx: BotContext, text: string) {
  const state = ctx.flow as RegisterFlowState;
  if (state.step === 'name') {
    if (text.trim().length < 3) return ctx.reply("Ism-familiya kamida 3 ta belgidan iborat bo'lishi kerak.");
    await ctx.setFlow({ ...state, fullName: text.trim().slice(0, 120), step: 'phone' });
    return ctx.reply('📱 Telefon raqamingizni yuboring:', kb.phoneKeyboard);
  }
  if (state.step === 'phone') {
    const phone = normalizePhone(text);
    if (!/^\+?\d{9,15}$/.test(phone)) return ctx.reply("Raqam noto'g'ri. Masalan: +998901234567");
    return continueRegister(ctx, { ...state, phone, step: 'role' });
  }
  return ctx.reply('👇 Tugmalardan foydalaning.');
}

async function continueRegister(ctx: BotContext, state: RegisterFlowState) {
  await ctx.setFlow(state);
  await ctx.reply('✅ Raqam qabul qilindi.', kb.removeKeyboard);
  return ctx.reply('🏷 Lavozimingizni tanlang:', kb.roleChoiceKeyboard());
}

export async function chooseRole(ctx: BotContext, role: 'TUTOR' | 'TEACHER') {
  await safeAnswerCb(ctx);
  const state = ctx.flow as RegisterFlowState;
  const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  await ctx.setFlow({ ...state, role, step: 'branch' });
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  if (!branches.length) return finishRegister(ctx, { ...state, role, step: 'done' });
  return ctx.reply('🏫 Filialingizni tanlang:', kb.branchChoiceKeyboard(branches));
}

export async function chooseBranch(ctx: BotContext, branchId: string) {
  await safeAnswerCb(ctx);
  const state = ctx.flow as RegisterFlowState;
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  return finishRegister(ctx, { ...state, branchId, step: 'done' });
}

async function finishRegister(ctx: BotContext, state: RegisterFlowState) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: state.role ?? 'TUTOR' } });
  const tgId = BigInt(ctx.from!.id);
  const user = await prisma.user.upsert({
    where: { telegramId: tgId },
    create: { fullName: state.fullName ?? 'Nomalum', phone: state.phone, telegramId: tgId, telegramChatId: BigInt(ctx.chat!.id), telegramUsername: ctx.from!.username, roleId: role.id, branchId: state.branchId ?? null, status: 'PENDING' },
    update: { fullName: state.fullName, phone: state.phone, roleId: role.id, branchId: state.branchId ?? null },
  });
  await ctx.setFlow({ kind: 'none' });
  audit({ userId: user.id, action: 'auth.telegram_register', source: 'telegram' });
  await ctx.reply(`✅ So'rovingiz qabul qilindi!\n\n👤 ${esc(user.fullName)}\n🏷 ${esc(role.name)}\n\n⏳ Administrator tasdiqlagach, sizga xabar beramiz.`, { parse_mode: 'HTML', ...kb.removeKeyboard });
  const admins = await prisma.user.findMany({ where: { status: 'ACTIVE', role: { key: { in: ['SUPER_ADMIN', 'HR_ADMIN'] } } }, select: { id: true } });
  await notifyMany(admins.map((a) => a.id), {
    type: 'SYSTEM',
    title: "🆕 Yangi ro'yxatdan o'tish so'rovi",
    body: `${user.fullName} (${role.name}) tasdiqlashni kutmoqda.`,
    payload: { userId: user.id, keyboard: { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: `admin:approve:${user.id}` }, { text: '❌ Rad etish', callback_data: `admin:reject:${user.id}` }]] } },
  });
}

export function normalizePhone(p: string) {
  const digits = p.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 9) return `+998${digits}`;
  return `+${digits}`;
}
