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
import * as parent from './flows/parent.flow.js';
import * as teacher from './flows/teacher.flow.js';
import * as chat from './flows/chat.flow.js';
import * as dorm from './flows/dorm.flow.js';
import type { ReportType, AttendanceStatus, RoleKey } from '../generated/prisma/enums.js';
import fs from 'node:fs';
import path from 'node:path';

const LOGO_PATH = path.resolve(process.cwd(), 'assets/logo.png');
const isFamily = (role: RoleKey) => role === 'PARENT' || role === 'STUDENT';
const isStaffGroup = (role: RoleKey) => role === 'TEACHER' || role === 'TUTOR';
const isDorm = (role: RoleKey) => role === 'DORM_MANAGER';

/** Welcome with logo (photo) when the asset exists; falls back to text. */
async function sendWelcome(ctx: BotContext) {
  const role = ctx.dbUser!.role;
  const caption = `${reg.WELCOME}\n\n👤 ${ctx.dbUser!.fullName}\n🏷 ${kb.roleLabel(role)}${ctx.dbUser!.branchName ? ` · 🏫 ${ctx.dbUser!.branchName}` : ''}`;
  if (fs.existsSync(LOGO_PATH)) {
    try {
      return await ctx.replyWithPhoto({ source: LOGO_PATH }, { caption, parse_mode: 'HTML', ...kb.mainMenu(role) });
    } catch { /* fall through */ }
  }
  return ctx.reply(caption, { parse_mode: 'HTML', ...kb.mainMenu(role) });
}

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
    if (payload?.startsWith('hw_')) return parent.viewHomework(ctx, payload.slice(3));
    return sendWelcome(ctx);
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
  b.command('children', (ctx) => parent.showChildren(ctx));
  b.command('grades', (ctx) => (isFamily(ctx.dbUser!.role) ? parent.showChildren(ctx, 'grades') : teacher.pickGroupFor(ctx, 'grade:start', "📊 Baho qo'yish")));
  b.command('schedule', (ctx) => (isFamily(ctx.dbUser!.role) ? parent.showChildren(ctx, 'sched') : teacher.mySchedule(ctx)));
  b.command('attendance', (ctx) => (isFamily(ctx.dbUser!.role) ? parent.showChildren(ctx, 'att') : isDorm(ctx.dbUser!.role) ? dorm.startRollcall(ctx) : teacher.pickGroupFor(ctx, 'att:start', '🟢 Davomat')));
  b.command('homework', (ctx) => (isFamily(ctx.dbUser!.role) ? parent.showChildren(ctx, 'hw') : teacher.pickGroupFor(ctx, 'hw:list', '📝 Uy vazifalari')));
  b.command('payments', (ctx) => parent.showChildren(ctx, 'payments'));
  b.command('groups', (ctx) => teacher.showGroups(ctx));
  b.command('chat', (ctx) => chat.listChats(ctx));
  b.command('dorm', (ctx) => (isFamily(ctx.dbUser!.role) ? parent.showChildren(ctx, 'dorm') : dorm.dormHome(ctx)));
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
  // parent / student
  b.hears(kb.BTN.myChildren, (ctx) => parent.showChildren(ctx));
  b.hears(kb.BTN.grades, (ctx) => (isFamily(ctx.dbUser!.role) ? parent.showChildren(ctx, 'grades') : teacher.pickGroupFor(ctx, 'grade:start', "📊 Baho qo'yish")));
  b.hears(kb.BTN.schedule, (ctx) => (isFamily(ctx.dbUser!.role) ? parent.showChildren(ctx, 'sched') : teacher.mySchedule(ctx)));
  b.hears(kb.BTN.attendance, (ctx) => (isFamily(ctx.dbUser!.role) ? parent.showChildren(ctx, 'att') : isDorm(ctx.dbUser!.role) ? dorm.startRollcall(ctx) : teacher.pickGroupFor(ctx, 'att:start', '🟢 Davomat')));
  b.hears(kb.BTN.homework, (ctx) => (isFamily(ctx.dbUser!.role) ? parent.showChildren(ctx, 'hw') : teacher.pickGroupFor(ctx, 'hw:list', '📝 Uy vazifalari')));
  b.hears(kb.BTN.payments, (ctx) => parent.showChildren(ctx, 'payments'));
  b.hears(kb.BTN.dorm, (ctx) => (isFamily(ctx.dbUser!.role) ? parent.showChildren(ctx, 'dorm') : dorm.dormHome(ctx)));
  b.hears(kb.BTN.messages, (ctx) => chat.listChats(ctx));
  // teacher / tutor
  b.hears([kb.BTN.groups, kb.BTN.tGroups], (ctx) => teacher.showGroups(ctx));
  b.hears(kb.BTN.students, (ctx) => (isDorm(ctx.dbUser!.role) ? dorm.dormStudents(ctx) : teacher.parentsMenu(ctx)));
  b.hears(kb.BTN.giveHomework, (ctx) => teacher.pickGroupFor(ctx, 'hw:new', '📝 Yangi uy vazifasi'));
  b.hears(kb.BTN.parents, (ctx) => (isDorm(ctx.dbUser!.role) ? dorm.dormStudents(ctx) : teacher.parentsMenu(ctx)));
  b.hears(kb.BTN.tutorResults, (ctx) => teacher.tutorResults(ctx));
  b.hears(kb.BTN.tutorReport, (ctx) => report.showReportMenu(ctx));
  // dorm
  b.hears(kb.BTN.rooms, (ctx) => dorm.dormRooms(ctx));
  b.hears(kb.BTN.incidents, (ctx) => dorm.incidents(ctx));
  b.hears([kb.BTN.cancel, kb.BTN.back, kb.BTN.menu], async (ctx) => {
    if (ctx.flow.kind === 'survey') return survey.cancelSurvey(ctx);
    await ctx.setFlow({ kind: 'none' });
    if (!ctx.dbUser) return ctx.reply('❌ Bekor qilindi. /start', kb.removeKeyboard);
    return ctx.reply('🏠 Asosiy menyu', kb.mainMenu(ctx.dbUser.role));
  });

  // ── Contact (phone) ────────────────────────────────────────────────────────
  b.on(message('contact'), (ctx) => reg.handleContact(ctx, ctx.message.contact.phone_number, ctx.message.contact.user_id));

  // ── Files (homework submissions) ───────────────────────────────────────────
  b.on(message('document'), (ctx) => {
    if (ctx.flow.kind === 'hwsubmit') return teacher.handleSubmit(ctx, { text: ctx.message.caption, fileId: ctx.message.document.file_id, fileName: ctx.message.document.file_name });
    return ctx.reply('📎 Fayl qabul qilinmadi. Uy vazifasi topshirish uchun avval vazifani tanlang.');
  });
  b.on(message('photo'), (ctx) => {
    if (ctx.flow.kind === 'hwsubmit') {
      const best = ctx.message.photo[ctx.message.photo.length - 1];
      return teacher.handleSubmit(ctx, { text: ctx.message.caption, fileId: best.file_id, fileName: 'photo.jpg' });
    }
    return ctx.reply('🖼 Rasm qabul qilinmadi. Uy vazifasi topshirish uchun avval vazifani tanlang.');
  });

  // ── Callback queries ───────────────────────────────────────────────────────
  b.on(callbackQuery('data'), async (ctx) => {
    const data = ctx.callbackQuery.data;
    const [ns, action, ...rest] = data.split(':');
    const arg = rest.join(':');

    if (ns === 'reg') {
      if (action === 'link') return reg.askLinkCode(ctx);
      if (action === 'phone') return reg.askPhone(ctx);
      if (action === 'start') return reg.startRegister(ctx);
      if (action === 'role') return reg.chooseRole(ctx, arg as 'TUTOR' | 'TEACHER' | 'PARENT' | 'STUDENT');
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
      if (action === 'schedule') return isFamily(ctx.dbUser.role) ? parent.showChildren(ctx, 'sched') : teacher.mySchedule(ctx);
      if (action === 'children') return parent.showChildren(ctx);
    }
    // ── school flows ─────────────────────────────────────────────────────────
    if (ns === 'child') {
      const [studentId, ...more] = rest;
      if (action === 'list') return parent.showChildren(ctx);
      return parent.dispatchChild(ctx, action, studentId, more.join(':') || undefined);
    }
    if (ns === 'hw') {
      const [a1, a2] = rest;
      if (action === 'view') return parent.viewHomework(ctx, a1, a2);
      if (action === 'submit') return teacher.askSubmit(ctx, a1, a2);
      if (action === 'new') return teacher.startHomework(ctx, a1);
      if (action === 'list') return teacher.listHomeworkForReview(ctx, a1);
      if (action === 'subj') return teacher.homeworkSubject(ctx, a1);
      if (action === 'dl') return teacher.homeworkDeadline(ctx, a1);
      if (action === 'confirm') return teacher.confirmHomework(ctx);
      if (action === 'ok') return teacher.reviewHomework(ctx, a1, a2, 'ACCEPTED');
      if (action === 'rev') return teacher.reviewHomework(ctx, a1, a2, 'REVISION');
    }
    if (ns === 'chat') {
      if (action === 'list') return chat.listChats(ctx);
      if (action === 'open') return chat.openChat(ctx, arg);
      if (action === 'reply') return chat.askReply(ctx, arg);
    }
    if (ns === 'grp') {
      if (action === 'list') return teacher.showGroups(ctx);
      if (action === 'open') return teacher.openGroup(ctx, arg);
      if (action === 'students') return teacher.groupStudents(ctx, arg);
      if (action === 'sched') return teacher.groupSchedule(ctx, arg);
    }
    if (ns === 'stu') {
      if (action === 'open') return teacher.studentCard(ctx, arg);
      if (action === 'msg') return teacher.askParentMessage(ctx, arg);
    }
    if (ns === 'att') {
      if (action === 'start') return teacher.startAttendance(ctx, arg);
      if (action === 'set') {
        const [studentId, status, index] = rest;
        return teacher.setAttendance(ctx, studentId, status as AttendanceStatus, Number(index));
      }
      if (action === 'finish') return teacher.finishAttendance(ctx);
    }
    if (ns === 'grade') {
      if (action === 'start') return teacher.startGrade(ctx, arg);
      if (action === 'subj') return teacher.startGradeSubject(ctx, rest[0], rest[1]);
      if (action === 'set') return teacher.setGrade(ctx, rest[0], Number(rest[1]));
      if (action === 'skip') return teacher.setGrade(ctx, rest[0], null);
      if (action === 'finish') return teacher.finishGrade(ctx);
    }
    if (ns === 'dorm') {
      if (action === 'home') return dorm.dormHome(ctx);
      if (action === 'rooms') return dorm.dormRooms(ctx);
      if (action === 'students') return dorm.dormStudents(ctx);
      if (action === 'stu') return dorm.dormStudentCard(ctx, arg);
      if (action === 'quick') return dorm.quickLog(ctx, rest[0], rest[1] as 'CHECK_IN' | 'CHECK_OUT' | 'LATE' | 'ABSENT');
      if (action === 'rollcall') return dorm.startRollcall(ctx);
      if (action === 'roll') return dorm.setRoll(ctx, rest[0], rest[1] as 'PRESENT' | 'LATE' | 'ABSENT');
      if (action === 'rollfinish') return dorm.finishRoll(ctx);
      if (action === 'log') return dorm.startIncident(ctx, arg || undefined);
      if (action === 'type') return dorm.incidentType(ctx, arg);
      if (action === 'logs') return dorm.recentLogs(ctx);
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
      if (ctx.flow.kind === 'report') return report.cancelReport(ctx);
      await ctx.setFlow({ kind: 'none' });
      return ctx.reply('❌ Bekor qilindi.', kb.mainMenu(ctx.dbUser.role));
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
      case 'chat':
        return chat.handleChatText(ctx, text);
      case 'parentmsg':
        return teacher.handleParentMessageText(ctx, text);
      case 'homework':
        return teacher.handleHomeworkText(ctx, text);
      case 'hwsubmit':
        return teacher.handleSubmit(ctx, { text });
      case 'dormlog':
        return dorm.handleIncidentText(ctx, text);
      case 'attendance':
      case 'grade':
        return ctx.reply('👆 Yuqoridagi tugmalardan foydalaning yoki /cancel');
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
    { command: 'children', description: 'Farzandim' },
    { command: 'grades', description: 'Baholar' },
    { command: 'schedule', description: 'Dars jadvali' },
    { command: 'attendance', description: 'Davomat' },
    { command: 'homework', description: 'Uy vazifalari' },
    { command: 'payments', description: "To'lovlar" },
    { command: 'chat', description: 'Guruh xabarlari' },
    { command: 'groups', description: 'Guruhlarim' },
    { command: 'dorm', description: 'Yotoqxona' },
    { command: 'surveys', description: "So'rovnomalar" },
    { command: 'reports', description: 'Hisobot topshirish' },
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
    await bot.telegram.setMyName('TARGET INTERNATIONAL SCHOOL').catch(() => undefined);
    await bot.telegram.setMyShortDescription("TARGET INTERNATIONAL SCHOOL — ota-onalar, o'quvchilar va xodimlar uchun maktab boti").catch(() => undefined);
    await bot.telegram.setMyDescription("🎯 TARGET INTERNATIONAL SCHOOL rasmiy boti.\n\nBaholar, davomat, dars jadvali, uy vazifalari, to'lovlar, yotoqxona va xabarlar — barchasi bir joyda.").catch(() => undefined);
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
