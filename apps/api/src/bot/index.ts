import { Telegraf } from 'telegraf';
import { message, callbackQuery } from 'telegraf/filters';
import { Router } from 'express';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { sessionMiddleware, type BotContext } from './context.js';
import * as kb from './keyboards/index.js';
import { cbData, safeAnswerCb } from './utils.js';
import { registerTelegramSender, flushQueued } from '../modules/notifications/notifications.service.js';
import * as survey from './flows/survey.flow.js';
import * as report from './flows/report.flow.js';
import * as reg from './flows/register.flow.js';
import * as misc from './flows/misc.flow.js';
import * as admin from './flows/admin.flow.js';
import type { ReportType } from '../generated/prisma/enums.js';

/** Mounted by the HTTP app at /api/telegram — webhook handler is attached here at startup. */
export const telegramRouter = Router();

let bot: Telegraf<BotContext> | null = null;
let botUsername: string | null = null;

export function createBot(token: string) {
  const b = new Telegraf<BotContext>(token, { handlerTimeout: 30_000 });
  b.use(sessionMiddleware);

  // ── Gate: unknown / pending / blocked users ────────────────────────────────
  b.use(async (ctx, next) => {
    const u = ctx.dbUser;
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const data = cbData(ctx);
    const isStart = text.startsWith('/start');
    const isRegFlow = data.startsWith('reg:') || ctx.flow.kind === 'register' || ctx.flow.kind === 'link' || (ctx.message && 'contact' in ctx.message) || text === kb.BTN.cancel;

    if (!u) {
      if (isStart) return reg.startUnknown(ctx);
      if (isRegFlow) return next();
      return reg.startUnknown(ctx);
    }
    if (u.status === 'PENDING') {
      if (isStart || !isRegFlow) return ctx.reply('⏳ Hisobingiz hali tasdiqlanmagan. Administrator tasdiqlagach xabar beramiz.');
      return next();
    }
    if (u.status === 'BLOCKED' || u.status === 'INACTIVE') {
      return ctx.reply("⛔️ Hisobingiz faol emas. Administrator bilan bog'laning.");
    }
    return next();
  });

  // ── Commands ───────────────────────────────────────────────────────────────
  b.start(async (ctx) => {
    const payload = ctx.payload?.trim();
    await ctx.setFlow({ kind: 'none' });
    if (payload?.startsWith('survey_')) return survey.startSurvey(ctx, payload.slice(7));
    return ctx.reply(reg.WELCOME, kb.mainMenu(ctx.dbUser!.role));
  });
  b.command('menu', async (ctx) => {
    await ctx.setFlow({ kind: 'none' });
    return ctx.reply('🏠 Asosiy menyu', kb.mainMenu(ctx.dbUser!.role));
  });
  b.command('surveys', (ctx) => survey.showSurveys(ctx));
  b.command('reports', (ctx) => report.showReportMenu(ctx));
  b.command('profile', (ctx) => misc.showProfile(ctx));
  b.command('help', (ctx) => misc.showHelp(ctx));
  b.command('results', (ctx) => survey.showMyResults(ctx));
  b.command('tasks', (ctx) => misc.showTasks(ctx));
  b.command('link', async (ctx) => {
    const code = ctx.message.text.split(/\s+/)[1];
    if (code) return reg.handleLinkCode(ctx, code);
    return reg.askLinkCode(ctx);
  });
  b.command('cancel', async (ctx) => {
    await ctx.setFlow({ kind: 'none' });
    return ctx.reply('❌ Bekor qilindi.', kb.mainMenu(ctx.dbUser!.role));
  });
  // admin
  b.command('admin', (ctx) => admin.adminHome(ctx));
  b.command('users', (ctx) => admin.adminUsers(ctx));
  b.command('analytics', (ctx) => admin.adminAnalytics(ctx));
  b.command('pending', (ctx) => admin.adminPending(ctx));

  // ── Reply-keyboard buttons ─────────────────────────────────────────────────
  b.hears(kb.BTN.surveys, (ctx) => survey.showSurveys(ctx));
  b.hears(kb.BTN.report, (ctx) => report.showReportMenu(ctx));
  b.hears(kb.BTN.announcements, (ctx) => misc.showAnnouncements(ctx));
  b.hears(kb.BTN.results, (ctx) => survey.showMyResults(ctx));
  b.hears(kb.BTN.tasks, (ctx) => misc.showTasks(ctx));
  b.hears(kb.BTN.profile, (ctx) => misc.showProfile(ctx));
  b.hears(kb.BTN.help, (ctx) => misc.showHelp(ctx));
  b.hears(kb.BTN.admin, (ctx) => admin.adminHome(ctx));
  b.hears([kb.BTN.cancel, kb.BTN.back, kb.BTN.menu], async (ctx) => {
    if (ctx.flow.kind === 'survey') return survey.cancelSurvey(ctx);
    await ctx.setFlow({ kind: 'none' });
    if (!ctx.dbUser) return ctx.reply('❌ Bekor qilindi. /start', kb.removeKeyboard);
    return ctx.reply('🏠 Asosiy menyu', kb.mainMenu(ctx.dbUser.role));
  });

  // ── Contact (phone) ────────────────────────────────────────────────────────
  b.on(message('contact'), (ctx) => reg.handleContact(ctx, ctx.message.contact.phone_number, ctx.message.contact.user_id));

  // ── Callback queries ───────────────────────────────────────────────────────
  b.on(callbackQuery('data'), async (ctx) => {
    const data = ctx.callbackQuery.data;
    const [ns, action, ...rest] = data.split(':');
    const arg = rest.join(':');

    if (ns === 'reg') {
      if (action === 'link') return reg.askLinkCode(ctx);
      if (action === 'phone') return reg.askPhone(ctx);
      if (action === 'start') return reg.startRegister(ctx);
      if (action === 'role') return reg.chooseRole(ctx, arg as 'TUTOR' | 'TEACHER');
      if (action === 'branch') return reg.chooseBranch(ctx, arg);
    }
    if (!ctx.dbUser || ctx.dbUser.status !== 'ACTIVE') return safeAnswerCb(ctx, 'Hisob faol emas');

    if (ns === 'menu') {
      await safeAnswerCb(ctx);
      if (action === 'main') {
        await ctx.setFlow({ kind: 'none' });
        return ctx.reply('🏠 Asosiy menyu', kb.mainMenu(ctx.dbUser.role));
      }
      if (action === 'surveys') return survey.showSurveys(ctx);
    }
    if (ns === 'me' && action === 'results') {
      await safeAnswerCb(ctx);
      return survey.showMyResults(ctx);
    }
    if (ns === 'survey') {
      if (action === 'start') {
        await safeAnswerCb(ctx);
        await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
        return survey.startSurvey(ctx, arg);
      }
      if (action === 'cancel') return survey.cancelSurvey(ctx);
    }
    if (ns === 'ans') {
      if (ctx.flow.kind !== 'survey') return safeAnswerCb(ctx, "So'rovnoma faol emas. /surveys");
      return survey.handleSurveyCallback(ctx, data);
    }
    if (ns === 'rep') {
      if (action === 'type') return report.chooseType(ctx, arg as ReportType);
      if (action === 'group') return report.chooseGroup(ctx, arg);
      if (action === 'confirm') return report.confirmReport(ctx);
      if (action === 'rewrite') return report.rewrite(ctx);
      if (action === 'mine') return report.myReports(ctx);
    }
    if (ns === 'flow' && action === 'cancel') {
      await safeAnswerCb(ctx);
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return report.cancelReport(ctx);
    }
    if (ns === 'ann' && action === 'read') return misc.markAnnouncementRead(ctx, arg);
    if (ns === 'task' && action === 'done') return misc.completeTask(ctx, arg);
    if (ns === 'admin') {
      if (action === 'home') {
        await safeAnswerCb(ctx);
        return admin.adminHome(ctx);
      }
      if (action === 'users') return admin.adminUsers(ctx);
      if (action === 'pending') return admin.adminPending(ctx);
      if (action === 'surveys') return admin.adminSurveys(ctx);
      if (action === 'reports') return admin.adminReports(ctx);
      if (action === 'analytics') return admin.adminAnalytics(ctx);
      if (action === 'approve') return admin.approveUser(ctx, arg, true);
      if (action === 'reject') return admin.approveUser(ctx, arg, false);
      if (action === 'remind') return admin.adminRemind(ctx, arg);
      if (action === 'rep') {
        const [status, id] = rest as [string, string];
        return admin.adminReviewReport(ctx, status as 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION', id);
      }
    }
    return safeAnswerCb(ctx);
  });

  // ── Free text (flows) ──────────────────────────────────────────────────────
  b.on(message('text'), async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return ctx.reply("Noma'lum buyruq. /help");
    switch (ctx.flow.kind) {
      case 'survey':
        return survey.handleSurveyText(ctx, text);
      case 'report':
        return report.handleReportText(ctx, text);
      case 'register':
        return reg.handleRegisterText(ctx, text);
      case 'link':
        return reg.handleLinkCode(ctx, text);
      default:
        return ctx.reply('👇 Quyidagi menyudan tanlang:', kb.mainMenu(ctx.dbUser!.role));
    }
  });

  b.catch((err, ctx) => {
    logger.error({ err, update: ctx.update?.update_id }, 'bot error');
    ctx.reply('⚠️ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring. /menu').catch(() => undefined);
  });

  return b;
}

/** Starts the bot in polling or webhook mode and wires notification delivery. */
export async function startBot() {
  if (env.DISABLE_BOT || !env.TELEGRAM_BOT_TOKEN) {
    logger.warn('Telegram bot disabled (no token or DISABLE_BOT=true)');
    return null;
  }
  bot = createBot(env.TELEGRAM_BOT_TOKEN);

  const commands = [
    { command: 'start', description: 'Botni ishga tushirish' },
    { command: 'menu', description: 'Asosiy menyu' },
    { command: 'surveys', description: "So'rovnomalar" },
    { command: 'reports', description: 'Hisobot topshirish' },
    { command: 'results', description: 'Mening natijalarim' },
    { command: 'tasks', description: 'Vazifalarim' },
    { command: 'profile', description: 'Profil' },
    { command: 'help', description: 'Yordam' },
    { command: 'link', description: 'Akkauntni kod bilan ulash' },
    { command: 'cancel', description: 'Joriy amalni bekor qilish' },
  ];

  try {
    const me = await bot.telegram.getMe();
    botUsername = me.username;
    // Only after Telegram is reachable do we accept outbound deliveries; until then notifications stay QUEUED.
    registerTelegramSender(async (chatId, text, extra) => {
      await bot!.telegram.sendMessage(chatId.toString(), text, { parse_mode: extra?.parse_mode ?? 'HTML', reply_markup: extra?.reply_markup });
    });
    await bot.telegram.setMyCommands(commands).catch(() => undefined);
    await bot.telegram.setMyCommands([...commands, { command: 'admin', description: 'Admin panel' }, { command: 'users', description: 'Foydalanuvchilar' }, { command: 'analytics', description: 'Analitika' }, { command: 'pending', description: 'Tasdiqlash kutayotganlar' }], { scope: { type: 'all_chat_administrators' } }).catch(() => undefined);

    if (env.TELEGRAM_MODE === 'webhook') {
      const path = `/api/telegram/webhook`;
      const handler = await bot.createWebhook({ domain: env.API_PUBLIC_URL.replace(/^https?:\/\//, ''), path, secret_token: env.TELEGRAM_WEBHOOK_SECRET });
      telegramRouter.use('/webhook', (req, res, next) => {
        // Telegraf's handler matches on req.url === path; normalise the mounted URL
        req.url = path;
        return handler(req, res, next);
      });
      logger.info({ path }, 'Telegram webhook registered');
    } else {
      await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => undefined);
      bot.launch({ dropPendingUpdates: false }).catch((e) => logger.error({ err: e }, 'bot polling stopped'));
      logger.info({ username: me.username }, 'Telegram bot polling started');
    }
    flushQueued().then((n) => n && logger.info({ n }, 'flushed queued notifications')).catch(() => undefined);
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : e }, 'Telegram bot failed to start — API continues without bot; retrying every 60s');
    bot = null;
    setTimeout(() => void startBot(), 60_000).unref();
  }
  return bot;
}

export async function stopBot() {
  if (bot && env.TELEGRAM_MODE === 'polling') bot.stop('SIGTERM');
}

export async function getBotInfo() {
  if (!bot) return { running: false, username: null, mode: env.TELEGRAM_MODE };
  try {
    const me = await bot.telegram.getMe();
    const wh = await bot.telegram.getWebhookInfo();
    return { running: true, username: me.username, name: me.first_name, mode: env.TELEGRAM_MODE, webhook: wh.url || null, pendingUpdates: wh.pending_update_count, link: `https://t.me/${me.username}` };
  } catch (e) {
    return { running: false, username: botUsername, mode: env.TELEGRAM_MODE, error: e instanceof Error ? e.message : String(e) };
  }
}

export const getBot = () => bot;
