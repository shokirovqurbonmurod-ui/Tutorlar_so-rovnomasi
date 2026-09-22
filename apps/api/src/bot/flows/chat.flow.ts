import dayjs from 'dayjs';
import { Markup } from 'telegraf';
import { prisma } from '../../lib/prisma.js';
import type { BotContext } from '../context.js';
import * as kb from '../keyboards/index.js';
import { esc, safeAnswerCb } from '../utils.js';
import { groupScope } from '../../lib/scope.js';
import { postGroupMessage, canPost } from '../../modules/messages/messages.routes.js';

/** Group chat via Telegram: view last messages & reply. Messages persist in DB and fan out to all members. */

const scopeOf = (ctx: BotContext) => groupScope({ sub: ctx.dbUser!.id, role: ctx.dbUser!.role, branchId: ctx.dbUser!.branchId });

export async function listChats(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const groups = await prisma.group.findMany({ where: { ...(await scopeOf(ctx)), isActive: true }, select: { id: true, name: true, _count: { select: { messages: true } } }, orderBy: { name: 'asc' } });
  if (!groups.length) return ctx.reply("💬 Sizga biriktirilgan guruhlar yo'q.");
  if (groups.length === 1) return openChat(ctx, groups[0].id);
  return ctx.reply('💬 <b>Guruh suhbatlari</b>\n\nGuruhni tanlang:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(groups.map((g) => [Markup.button.callback(`💬 ${g.name} (${g._count.messages})`, `chat:open:${g.id}`)])) });
}

export async function openChat(ctx: BotContext, groupId: string) {
  await safeAnswerCb(ctx);
  const g = await prisma.group.findFirst({ where: { id: groupId, ...(await scopeOf(ctx)) }, select: { id: true, name: true, allowParentChat: true } });
  if (!g) return ctx.reply("⛔️ Bu guruhga ruxsatingiz yo'q.");
  const msgs = await prisma.groupMessage.findMany({ where: { groupId }, include: { author: { select: { fullName: true, role: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 10 });
  const lines = [`💬 <b>${esc(g.name)} — suhbat</b>`, ''];
  if (!msgs.length) lines.push("Hali xabarlar yo'q.");
  for (const m of msgs.reverse()) lines.push(`<b>${esc(m.author.fullName)}</b> <i>(${esc(m.author.role.name)}) · ${dayjs(m.createdAt).format('DD.MM HH:mm')}</i>`, esc(m.body), '');
  const can = canPost(ctx.dbUser!.role, g.allowParentChat);
  const buttons = [] as ReturnType<typeof Markup.button.callback>[][];
  if (can) buttons.push([Markup.button.callback('✍️ Xabar yozish', `chat:reply:${groupId}`)]);
  else lines.push('<i>Bu guruhda ota-onalar yozishi o\'chirilgan.</i>');
  buttons.push([Markup.button.callback('🔄 Yangilash', `chat:open:${groupId}`), Markup.button.callback(kb.BTN.menu, 'menu:main')]);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

export async function askReply(ctx: BotContext, groupId: string) {
  await safeAnswerCb(ctx);
  const g = await prisma.group.findFirst({ where: { id: groupId, ...(await scopeOf(ctx)) }, select: { name: true, allowParentChat: true } });
  if (!g) return ctx.reply("⛔️ Ruxsat yo'q.");
  if (!canPost(ctx.dbUser!.role, g.allowParentChat)) return ctx.reply("Bu guruhda ota-onalar yozishi o'chirilgan.");
  await ctx.setFlow({ kind: 'chat', groupId });
  return ctx.reply(`✍️ <b>${esc(g.name)}</b> guruhiga xabaringizni yozing:`, { parse_mode: 'HTML', ...kb.cancelKeyboard });
}

export async function handleChatText(ctx: BotContext, text: string) {
  const st = ctx.flow as { kind: 'chat'; groupId: string };
  const u = ctx.dbUser!;
  await postGroupMessage(u.id, u.role, st.groupId, text, { source: 'telegram', groupScopeWhere: await scopeOf(ctx) });
  await ctx.setFlow({ kind: 'none' });
  return ctx.reply('✅ Xabar yuborildi. Guruh a\'zolariga yetkazildi.', kb.mainMenu(u.role));
}
