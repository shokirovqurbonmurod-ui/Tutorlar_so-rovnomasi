import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import type { NotificationType, NotificationChannel } from '../../generated/prisma/enums.js';
import type { InlineKeyboardMarkup } from 'telegraf/types';

/**
 * Telegram delivery is injected by the bot module at startup so this service
 * has no hard dependency on Telegraf (API can run without the bot).
 */
export type TelegramSender = (chatId: bigint | number | string, text: string, extra?: { reply_markup?: InlineKeyboardMarkup; parse_mode?: 'HTML' }) => Promise<void>;
let telegramSender: TelegramSender | null = null;
export const registerTelegramSender = (fn: TelegramSender) => {
  telegramSender = fn;
};

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  channel?: NotificationChannel;
  surveyId?: string;
  payload?: Record<string, unknown>;
  keyboard?: InlineKeyboardMarkup;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Creates the DB record and (if the user has Telegram) pushes it immediately. */
export async function notify(input: NotifyInput) {
  const n = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      channel: input.channel ?? 'BOTH',
      title: input.title,
      body: input.body,
      surveyId: input.surveyId,
      payload: input.payload as object | undefined,
    },
  });
  if (n.channel === 'WEB') {
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: new Date() } });
    return n;
  }
  await deliver(n.id, input.keyboard);
  return n;
}

export async function deliver(notificationId: string, keyboard?: InlineKeyboardMarkup) {
  const n = await prisma.notification.findUnique({ where: { id: notificationId }, include: { user: true } });
  if (!n) return;
  const chatId = n.user.telegramChatId ?? n.user.telegramId;
  if (!telegramSender || !chatId) {
    await prisma.notification.update({
      where: { id: n.id },
      data: { status: telegramSender ? 'FAILED' : 'QUEUED', error: telegramSender ? 'Telegram ulanmagan' : 'Bot ishga tushmagan' },
    });
    return;
  }
  try {
    const text = `<b>${esc(n.title)}</b>\n\n${esc(n.body)}`;
    await telegramSender(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard ?? (n.payload as { keyboard?: InlineKeyboardMarkup } | null)?.keyboard });
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: new Date(), error: null } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ err: msg, userId: n.userId }, 'telegram delivery failed');
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED', error: msg.slice(0, 300) } });
  }
}

export async function notifyMany(userIds: string[], base: Omit<NotifyInput, 'userId'>) {
  let sent = 0;
  for (const userId of userIds) {
    try {
      await notify({ ...base, userId });
      sent++;
    } catch (e) {
      logger.warn({ err: e, userId }, 'notify failed');
    }
  }
  return sent;
}

/** Re-attempt delivery of queued notifications (e.g. after the bot came online or user linked Telegram). */
export async function flushQueued(userId?: string) {
  const items = await prisma.notification.findMany({
    where: { status: 'QUEUED', channel: { not: 'WEB' }, ...(userId ? { userId } : {}) },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  for (const n of items) await deliver(n.id);
  return items.length;
}
