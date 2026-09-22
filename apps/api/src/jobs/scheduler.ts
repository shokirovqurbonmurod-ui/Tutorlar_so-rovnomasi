import cron from 'node-cron';
import dayjs from 'dayjs';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { notify, notifyMany } from '../modules/notifications/notifications.service.js';
import { sendSurvey, closeSurvey } from '../modules/surveys/surveys.service.js';
import { computeKpi } from '../modules/kpi/kpi.service.js';
import { getSetting } from '../modules/settings/settings.routes.js';
import { runPaymentReminders, generateMonthlyInvoices } from '../modules/finance/finance.service.js';
import { studentAudience } from '../lib/scope.js';

/** Sends a reminder to everyone who hasn't finished the given survey. */
export async function remindPending(surveyId: string) {
  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey || survey.status !== 'ACTIVE') return 0;
  const pending = await prisma.surveyAssignment.findMany({ where: { surveyId, status: { in: ['PENDING', 'IN_PROGRESS'] } }, select: { id: true, userId: true } });
  if (!pending.length) return 0;
  const dl = survey.deadline ? dayjs(survey.deadline) : null;
  const dlText = dl ? (dl.isSame(dayjs(), 'day') ? `Bugun ${dl.format('HH:mm')}` : dl.format('DD.MM.YYYY HH:mm')) : null;
  const n = await notifyMany(pending.map((p) => p.userId), {
    type: 'SURVEY_DEADLINE',
    title: '⏰ Eslatma: so\'rovnoma muddati yaqin',
    body: `"${survey.title}" so'rovnomasini hali yakunlamadingiz.${dlText ? `\n\n⏰ Deadline: ${dlText}` : ''}`,
    surveyId,
    payload: { surveyId, keyboard: { inline_keyboard: [[{ text: "▶️ Hozir to'ldirish", callback_data: `survey:start:${surveyId}` }]] } },
  });
  await prisma.surveyAssignment.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { remindedAt: new Date() } });
  return n;
}

/** Launch surveys whose scheduledAt has arrived. */
export async function runScheduledSurveys() {
  const due = await prisma.survey.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } } });
  for (const s of due) {
    try {
      const r = await sendSurvey(s.id);
      logger.info({ surveyId: s.id, ...r }, 'scheduled survey sent');
    } catch (e) {
      logger.error({ err: e, surveyId: s.id }, 'scheduled survey failed');
    }
  }
  return due.length;
}

/** Remind N hours before deadline (once per assignment), then auto-close expired surveys. */
export async function runDeadlines() {
  const hoursBefore = Number(await getSetting<number>('survey.reminderHoursBefore')) || 3;
  const soon = dayjs().add(hoursBefore, 'hour').toDate();
  const surveys = await prisma.survey.findMany({ where: { status: 'ACTIVE', deadline: { gt: new Date(), lte: soon } }, select: { id: true } });
  let reminded = 0;
  for (const s of surveys) {
    const pending = await prisma.surveyAssignment.count({ where: { surveyId: s.id, status: { in: ['PENDING', 'IN_PROGRESS'] }, remindedAt: null } });
    if (pending) reminded += await remindPending(s.id);
  }
  const expired = await prisma.survey.findMany({ where: { status: 'ACTIVE', deadline: { lt: dayjs().subtract(1, 'hour').toDate() } }, select: { id: true } });
  for (const s of expired) await closeSurvey(s.id, 'COMPLETED');
  return { reminded, closed: expired.length };
}

/** Evening reminder for tutors/teachers who have not submitted a daily report today (working days only). */
export async function runDailyReportReminder() {
  const day = dayjs().day();
  if (day === 0) return 0; // Sunday
  const start = dayjs().startOf('day').toDate();
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE', telegramId: { not: null }, role: { key: { in: ['TUTOR', 'TEACHER'] } } }, select: { id: true } });
  const submitted = await prisma.report.findMany({ where: { type: 'DAILY', createdAt: { gte: start } }, select: { authorId: true } });
  const done = new Set(submitted.map((r) => r.authorId));
  const targets = users.filter((u) => !done.has(u.id)).map((u) => u.id);
  const deadline = await getSetting<string>('reports.dailyDeadline');
  return notifyMany(targets, {
    type: 'REPORT_DEADLINE',
    title: '📝 Kunlik hisobot eslatmasi',
    body: `Bugungi kunlik hisobotingizni hali topshirmadingiz.\n\n⏰ Muddat: ${deadline}`,
    payload: { keyboard: { inline_keyboard: [[{ text: '📝 Hisobot topshirish', callback_data: 'rep:type:DAILY' }]] } },
  });
}

export async function runTaskReminders() {
  const soon = dayjs().add(24, 'hour').toDate();
  const tasks = await prisma.task.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { gt: new Date(), lte: soon } }, include: { assignee: { select: { id: true } } } });
  let n = 0;
  for (const t of tasks) {
    const already = await prisma.notification.count({ where: { userId: t.assigneeId, type: 'TASK', payload: { path: ['taskId'], equals: t.id }, createdAt: { gte: dayjs().subtract(20, 'hour').toDate() }, title: { startsWith: '⏰' } } });
    if (already) continue;
    await notify({ userId: t.assigneeId, type: 'TASK', title: '⏰ Vazifa muddati yaqin', body: `"${t.title}" — muddat: ${dayjs(t.dueAt).format('DD.MM HH:mm')}`, payload: { taskId: t.id, keyboard: { inline_keyboard: [[{ text: '✅ Bajardim', callback_data: `task:done:${t.id}` }]] } } });
    n++;
  }
  return n;
}

/** Homework deadline within 24h and not submitted → remind student + parents (once per submission). */
export async function runHomeworkDeadlineReminders() {
  const soon = dayjs().add(24, 'hour').toDate();
  const subs = await prisma.homeworkSubmission.findMany({
    where: { status: { in: ['NOT_SUBMITTED', 'REVISION'] }, remindedAt: null, homework: { deadline: { gt: new Date(), lte: soon } } },
    include: { homework: { include: { subject: { select: { name: true } } } } },
    take: 500,
  });
  let n = 0;
  for (const s of subs) {
    const aud = await studentAudience(s.studentId);
    n += await notifyMany([...aud.parents, ...(aud.student ? [aud.student] : [])], {
      type: 'HOMEWORK_DEADLINE',
      title: `⏰ Uy vazifasi muddati yaqin — ${s.homework.subject.name}`,
      body: `${aud.name}\n${s.homework.title}\n\n⏰ Muddat: ${dayjs(s.homework.deadline).format('DD.MM.YYYY HH:mm')}\nHolat: ${s.status === 'REVISION' ? 'Qayta ishlash kerak' : 'Topshirilmagan'}`,
      payload: { homeworkId: s.homeworkId, studentId: s.studentId, keyboard: { inline_keyboard: [[{ text: "📝 Ko'rish", callback_data: `hw:view:${s.homeworkId}:${s.studentId}` }]] } },
    });
    await prisma.homeworkSubmission.update({ where: { id: s.id }, data: { remindedAt: new Date() } });
  }
  return n;
}

/** Tomorrow's exams → notify students + parents. */
export async function runExamReminders() {
  const from = dayjs().add(1, 'day').startOf('day').toDate();
  const to = dayjs().add(1, 'day').endOf('day').toDate();
  const exams = await prisma.exam.findMany({ where: { date: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, include: { subject: true, group: { include: { students: { where: { status: 'ACTIVE' }, select: { id: true } } } } } });
  let n = 0;
  for (const e of exams) {
    for (const s of e.group.students) {
      const aud = await studentAudience(s.id);
      n += await notifyMany([...aud.parents, ...(aud.student ? [aud.student] : [])], { type: 'EXAM', title: `📚 Ertaga imtihon — ${e.subject.name}`, body: `${aud.name}\n${e.title}\n📅 ${dayjs(e.date).format('DD.MM.YYYY HH:mm')}` });
    }
  }
  return n;
}

export function startScheduler() {
  if (env.DISABLE_CRON) {
    logger.warn('Cron jobs disabled');
    return;
  }
  const tz = env.TZ;
  cron.schedule('* * * * *', () => runScheduledSurveys().catch((e) => logger.error({ err: e }, 'scheduled surveys job')), { timezone: tz });
  cron.schedule('*/10 * * * *', () => runDeadlines().catch((e) => logger.error({ err: e }, 'deadline job')), { timezone: tz });
  cron.schedule('0 18 * * 1-6', () => runDailyReportReminder().catch((e) => logger.error({ err: e }, 'daily report reminder')), { timezone: tz });
  cron.schedule('0 9 * * *', () => runTaskReminders().catch((e) => logger.error({ err: e }, 'task reminders')), { timezone: tz });
  cron.schedule('30 23 * * 0', () => computeKpi('WEEKLY').then((r) => logger.info(r, 'weekly KPI computed')).catch((e) => logger.error({ err: e }, 'kpi weekly')), { timezone: tz });
  cron.schedule('45 23 28-31 * *', async () => {
    if (dayjs().add(1, 'day').date() !== 1) return; // last day of month only
    computeKpi('MONTHLY').then((r) => logger.info(r, 'monthly KPI computed')).catch((e) => logger.error({ err: e }, 'kpi monthly'));
  }, { timezone: tz });
  // School: payment reminders (10:00 daily), homework deadline (every hour), exams (18:00), invoices (1st of month 06:00)
  cron.schedule('0 10 * * *', () => runPaymentReminders().then((r) => logger.info(r, 'payment reminders')).catch((e) => logger.error({ err: e }, 'payment reminders')), { timezone: tz });
  cron.schedule('5 * * * *', () => runHomeworkDeadlineReminders().catch((e) => logger.error({ err: e }, 'homework deadline reminders')), { timezone: tz });
  cron.schedule('0 18 * * *', () => runExamReminders().catch((e) => logger.error({ err: e }, 'exam reminders')), { timezone: tz });
  cron.schedule('0 6 1 * *', () => generateMonthlyInvoices().then((r) => logger.info(r, 'monthly invoices generated')).catch((e) => logger.error({ err: e }, 'monthly invoices')), { timezone: tz });
  // Cleanup expired refresh tokens & link codes nightly
  cron.schedule('15 3 * * *', async () => {
    await prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: dayjs().subtract(7, 'day').toDate() } }] } });
    await prisma.telegramLinkCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }, { timezone: tz });
  logger.info({ tz }, 'Scheduler started');
}
