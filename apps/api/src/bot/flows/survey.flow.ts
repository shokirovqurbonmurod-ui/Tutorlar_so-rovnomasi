import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { notifyMany } from '../../modules/notifications/notifications.service.js';
import type { BotContext, SurveyFlowState } from '../context.js';
import * as kb from '../keyboards/index.js';
import { esc, safeAnswerCb } from '../utils.js';

const surveyWithQuestions = (surveyId: string) =>
  prisma.survey.findUnique({ where: { id: surveyId }, include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } } } });

type Survey = NonNullable<Awaited<ReturnType<typeof surveyWithQuestions>>>;
type Question = Survey['questions'][number];

const TYPE_HINT: Record<Question['type'], string> = {
  TEXT: '✍️ Javobingizni yozing',
  LONG_TEXT: '✍️ Batafsil javob yozing',
  NUMBER: '🔢 Raqam kiriting',
  RATING: '⭐ 1 dan 5 gacha baholang',
  YES_NO: '👇 Tanlang',
  SINGLE_CHOICE: '👇 Bitta variantni tanlang',
  MULTIPLE_CHOICE: '👇 Bir yoki bir nechta variantni tanlang va tasdiqlang',
};

/** Lists pending surveys for the user. */
export async function showSurveys(ctx: BotContext) {
  const u = ctx.dbUser!;
  const pending = await prisma.surveyAssignment.findMany({
    where: { userId: u.id, status: { in: ['PENDING', 'IN_PROGRESS'] }, survey: { status: 'ACTIVE' } },
    include: { survey: { select: { id: true, title: true, deadline: true, _count: { select: { questions: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  const doneCount = await prisma.surveyAssignment.count({ where: { userId: u.id, status: 'COMPLETED' } });

  if (pending.length === 0) {
    return ctx.reply(
      `📋 <b>So'rovnomalar</b>\n\nHozircha sizga yangi so'rovnoma yo'q. ✅\n\nYakunlangan: <b>${doneCount}</b>`,
      { parse_mode: 'HTML', ...kb.surveysMenu([]) },
    );
  }
  const lines = pending.map((a, i) => {
    const dl = a.survey.deadline ? `⏰ ${dayjs(a.survey.deadline).format('DD.MM HH:mm')}` : '';
    const st = a.status === 'IN_PROGRESS' ? '🟡 davom etmoqda' : '🆕 yangi';
    return `${i + 1}. <b>${esc(a.survey.title)}</b>\n    ${a.survey._count.questions} ta savol · ${st} ${dl}`;
  });
  return ctx.reply(`📋 <b>So'rovnomalar</b>\n\nSizda <b>${pending.length}</b> ta faol so'rovnoma bor:\n\n${lines.join('\n\n')}\n\n👇 Boshlash uchun tanlang:`, {
    parse_mode: 'HTML',
    ...kb.surveysMenu(pending.map((a) => ({ id: a.survey.id, title: a.survey.title }))),
  });
}

export async function startSurvey(ctx: BotContext, surveyId: string) {
  const u = ctx.dbUser!;
  const survey = await surveyWithQuestions(surveyId);
  if (!survey || survey.status !== 'ACTIVE') {
    return ctx.reply("⚠️ Bu so'rovnoma faol emas yoki yakunlangan.", kb.backToMenu());
  }
  if (survey.deadline && survey.deadline < new Date()) {
    return ctx.reply("⏰ Afsuski, bu so'rovnoma muddati tugagan.", kb.backToMenu());
  }
  const assignment = await prisma.surveyAssignment.findUnique({ where: { surveyId_userId: { surveyId, userId: u.id } } });
  if (!assignment) return ctx.reply("⚠️ Bu so'rovnoma sizga tayinlanmagan.", kb.backToMenu());
  if (assignment.status === 'COMPLETED' && !survey.allowMultiple) {
    return ctx.reply("✅ Siz bu so'rovnomani allaqachon to'ldirgansiz. Rahmat!", kb.backToMenu());
  }
  if (survey.questions.length === 0) return ctx.reply("⚠️ So'rovnomada savollar yo'q.", kb.backToMenu());

  // Reuse unfinished response or start a fresh one
  let response = await prisma.surveyResponse.findFirst({ where: { surveyId, userId: u.id, submittedAt: null }, orderBy: { startedAt: 'desc' } });
  if (!response) {
    response = await prisma.surveyResponse.create({
      data: { surveyId, userId: survey.isAnonymous ? null : u.id, branchIdSnap: u.branchId, roleKeySnap: u.role, source: 'telegram' },
    });
  }
  await prisma.surveyAssignment.update({ where: { id: assignment.id }, data: { status: 'IN_PROGRESS', startedAt: assignment.startedAt ?? new Date() } });

  const answered = await prisma.surveyAnswer.count({ where: { responseId: response.id } });
  const state: SurveyFlowState = { kind: 'survey', surveyId, responseId: response.id, index: Math.min(answered, survey.questions.length - 1), startedAt: Date.now() };
  await ctx.setFlow(state);

  await ctx.reply(
    `📋 <b>${esc(survey.title)}</b>\n${survey.description ? `\n${esc(survey.description)}\n` : ''}\n${survey.questions.length} ta savol · ${survey.isAnonymous ? '🕶 Anonim' : '👤 Ochiq'}\n\nBoshlaymiz! 👇`,
    { parse_mode: 'HTML', ...kb.removeKeyboard },
  );
  return askQuestion(ctx, survey, state);
}

async function askQuestion(ctx: BotContext, survey: Survey, state: SurveyFlowState) {
  const q = survey.questions[state.index];
  if (!q) return finishSurvey(ctx, survey, state);
  const progress = `<i>${state.index + 1}/${survey.questions.length}</i>`;
  const text = `${progress}  ${esc(q.text)}${q.hint ? `\n\n💡 ${esc(q.hint)}` : ''}\n\n${TYPE_HINT[q.type]}${!q.isRequired ? ' (ixtiyoriy)' : ''}`;
  const opts = { parse_mode: 'HTML' as const };
  switch (q.type) {
    case 'RATING':
      return ctx.reply(text, { ...opts, ...kb.ratingKeyboard(q.minValue ?? 1, q.maxValue ?? 5) });
    case 'YES_NO':
      return ctx.reply(text, { ...opts, ...kb.yesNoKeyboard() });
    case 'SINGLE_CHOICE':
      return ctx.reply(text, { ...opts, ...kb.singleChoiceKeyboard(q.options) });
    case 'MULTIPLE_CHOICE':
      return ctx.reply(text, { ...opts, ...kb.multiChoiceKeyboard(q.options, state.selected ?? []) });
    default:
      return ctx.reply(text, { ...opts, ...kb.textQuestionKeyboard(!q.isRequired) });
  }
}

async function saveAnswer(state: SurveyFlowState, q: Question, data: { textValue?: string; numberValue?: number; boolValue?: boolean; optionIds?: string[] }) {
  await prisma.surveyAnswer.upsert({
    where: { responseId_questionId: { responseId: state.responseId, questionId: q.id } },
    create: { responseId: state.responseId, questionId: q.id, ...data, optionIds: data.optionIds ?? [] },
    update: { textValue: data.textValue ?? null, numberValue: data.numberValue ?? null, boolValue: data.boolValue ?? null, optionIds: data.optionIds ?? [] },
  });
}

async function advance(ctx: BotContext, survey: Survey, state: SurveyFlowState) {
  const next: SurveyFlowState = { ...state, index: state.index + 1, selected: [] };
  await ctx.setFlow(next);
  return askQuestion(ctx, survey, next);
}

/** Handles free-text (TEXT / LONG_TEXT / NUMBER) messages while in a survey. */
export async function handleSurveyText(ctx: BotContext, text: string) {
  const state = ctx.flow as SurveyFlowState;
  const survey = await surveyWithQuestions(state.surveyId);
  if (!survey) return cancelSurvey(ctx);
  const q = survey.questions[state.index];
  if (!q) return finishSurvey(ctx, survey, state);

  if (q.type === 'NUMBER') {
    const n = Number(text.replace(',', '.'));
    if (Number.isNaN(n)) return ctx.reply("🔢 Iltimos, faqat raqam kiriting.");
    if (q.minValue !== null && n < q.minValue) return ctx.reply(`🔢 Qiymat kamida ${q.minValue} bo'lishi kerak.`);
    if (q.maxValue !== null && n > q.maxValue) return ctx.reply(`🔢 Qiymat ko'pi bilan ${q.maxValue} bo'lishi kerak.`);
    await saveAnswer(state, q, { numberValue: n });
    return advance(ctx, survey, state);
  }
  if (q.type === 'TEXT' || q.type === 'LONG_TEXT') {
    if (text.trim().length < 2) return ctx.reply("✍️ Iltimos, to'liqroq javob yozing.");
    await saveAnswer(state, q, { textValue: text.trim().slice(0, 4000) });
    return advance(ctx, survey, state);
  }
  return ctx.reply('👇 Iltimos, tugmalardan birini tanlang.');
}

/** Handles inline answer callbacks: ans:rate:N / ans:bool:1 / ans:opt:ID / ans:multi:ID|done / ans:skip */
export async function handleSurveyCallback(ctx: BotContext, data: string) {
  const state = ctx.flow as SurveyFlowState;
  const survey = await surveyWithQuestions(state.surveyId);
  if (!survey) return cancelSurvey(ctx);
  const q = survey.questions[state.index];
  if (!q) return finishSurvey(ctx, survey, state);
  const [, kind, value] = data.split(':');

  if (kind === 'skip') {
    if (q.isRequired) return safeAnswerCb(ctx, 'Bu savol majburiy');
    await safeAnswerCb(ctx);
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    return advance(ctx, survey, state);
  }
  if (kind === 'rate' && q.type === 'RATING') {
    await saveAnswer(state, q, { numberValue: Number(value) });
    await safeAnswerCb(ctx, `⭐ ${value}`);
    await ctx.editMessageText(`${ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message ? esc(ctx.callbackQuery.message.text.split('\n')[0]) : ''}\n\n✅ Baho: ${'⭐'.repeat(Number(value))} (${value})`, { parse_mode: 'HTML' }).catch(() => undefined);
    return advance(ctx, survey, state);
  }
  if (kind === 'bool' && q.type === 'YES_NO') {
    const b = value === '1';
    await saveAnswer(state, q, { boolValue: b });
    await safeAnswerCb(ctx);
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await ctx.reply(b ? '✅ Ha' : "❌ Yo'q");
    return advance(ctx, survey, state);
  }
  if (kind === 'opt' && q.type === 'SINGLE_CHOICE') {
    const opt = q.options.find((o) => o.id === value);
    if (!opt) return safeAnswerCb(ctx, 'Variant topilmadi');
    await saveAnswer(state, q, { optionIds: [opt.id], textValue: opt.label });
    await safeAnswerCb(ctx);
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await ctx.reply(`☑️ ${opt.label}`);
    return advance(ctx, survey, state);
  }
  if (kind === 'multi' && q.type === 'MULTIPLE_CHOICE') {
    const selected = new Set(state.selected ?? []);
    if (value === 'done') {
      if (selected.size === 0 && q.isRequired) return safeAnswerCb(ctx, 'Kamida bitta variant tanlang');
      const labels = q.options.filter((o) => selected.has(o.id)).map((o) => o.label);
      await saveAnswer(state, q, { optionIds: [...selected], textValue: labels.join(', ') });
      await safeAnswerCb(ctx);
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await ctx.reply(labels.length ? `☑️ ${labels.join(', ')}` : "⏭ O'tkazib yuborildi");
      return advance(ctx, survey, state);
    }
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    const next = { ...state, selected: [...selected] };
    await ctx.setFlow(next);
    await safeAnswerCb(ctx);
    return ctx.editMessageReplyMarkup(kb.multiChoiceKeyboard(q.options, next.selected).reply_markup).catch(() => undefined);
  }
  return safeAnswerCb(ctx, "Noto'g'ri amal");
}

async function finishSurvey(ctx: BotContext, survey: Survey, state: SurveyFlowState) {
  const u = ctx.dbUser!;
  const answers = await prisma.surveyAnswer.findMany({ where: { responseId: state.responseId }, include: { question: { select: { type: true } } } });
  const ratings = answers.filter((a) => a.question.type === 'RATING' && a.numberValue !== null).map((a) => a.numberValue!);
  const avgRating = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : null;
  const durationSec = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));

  await prisma.$transaction([
    prisma.surveyResponse.update({ where: { id: state.responseId }, data: { submittedAt: new Date(), durationSec, avgRating } }),
    prisma.surveyAssignment.update({ where: { surveyId_userId: { surveyId: survey.id, userId: u.id } }, data: { status: 'COMPLETED', completedAt: new Date() } }),
  ]);
  await ctx.setFlow({ kind: 'none' });
  audit({ userId: u.id, action: 'survey.submit', entity: 'Survey', entityId: survey.id, source: 'telegram', meta: { responseId: state.responseId, durationSec } });

  await ctx.reply(
    `Rahmat! ✅\n\nSo'rovnomangiz muvaffaqiyatli qabul qilindi.${avgRating ? `\n\n⭐ O'rtacha bahoingiz: <b>${avgRating.toFixed(1)}</b>` : ''}`,
    { parse_mode: 'HTML', ...kb.mainMenu(u.role) },
  );

  // Notify the survey creator (web notification only, avoid Telegram spam)
  if (!survey.isAnonymous) {
    await notifyMany([survey.createdById], {
      type: 'SURVEY_COMPLETED',
      channel: 'WEB',
      title: "✅ So'rovnoma to'ldirildi",
      body: `${u.fullName} "${survey.title}" so'rovnomasini yakunladi.`,
      surveyId: survey.id,
    });
  }
}

export async function cancelSurvey(ctx: BotContext) {
  await ctx.setFlow({ kind: 'none' });
  await safeAnswerCb(ctx);
  return ctx.reply("❌ So'rovnoma to'xtatildi. Javoblaringiz saqlanib qoldi — keyinroq davom ettirishingiz mumkin.", kb.mainMenu(ctx.dbUser?.role));
}

export async function showMyResults(ctx: BotContext) {
  const u = ctx.dbUser!;
  const [completed, pending, responses, reports, kpi] = await Promise.all([
    prisma.surveyAssignment.count({ where: { userId: u.id, status: 'COMPLETED' } }),
    prisma.surveyAssignment.count({ where: { userId: u.id, status: { in: ['PENDING', 'IN_PROGRESS'] }, survey: { status: 'ACTIVE' } } }),
    prisma.surveyResponse.findMany({ where: { userId: u.id, submittedAt: { not: null } }, orderBy: { submittedAt: 'desc' }, take: 5, include: { survey: { select: { title: true } } } }),
    prisma.report.groupBy({ by: ['status'], where: { authorId: u.id }, _count: true }),
    prisma.kpiResult.findMany({ where: { userId: u.id }, orderBy: { periodStart: 'desc' }, take: 7, include: { metric: { select: { name: true, weight: true } } } }),
  ]);
  const total = completed + pending;
  const rate = total ? Math.round((completed / total) * 100) : 100;
  const rc = (s: string) => reports.find((r) => r.status === s)?._count ?? 0;
  const kpiTotal = kpi.length ? Math.round(kpi.reduce((s, r) => s + r.score * r.metric.weight, 0) / kpi.reduce((s, r) => s + r.metric.weight, 0)) : null;
  const bar = (p: number) => '█'.repeat(Math.round(p / 10)) + '░'.repeat(10 - Math.round(p / 10));

  const lines = [
    `📊 <b>Mening natijalarim</b>`,
    ``,
    `📋 So'rovnomalar: <b>${completed}</b> yakunlangan · <b>${pending}</b> kutilmoqda`,
    `${bar(rate)} ${rate}%`,
    ``,
    `📝 Hisobotlar: ✅ ${rc('APPROVED')} · ⏳ ${rc('PENDING')} · ✏️ ${rc('NEEDS_REVISION')} · ❌ ${rc('REJECTED')}`,
  ];
  if (kpiTotal !== null) {
    lines.push('', `🎯 KPI (so'nggi davr): <b>${kpiTotal}/100</b>`, `${bar(kpiTotal)}`);
    for (const r of kpi) lines.push(`  • ${esc(r.metric.name)}: ${Math.round(r.score)}`);
  }
  if (responses.length) {
    lines.push('', "🕓 So'nggi javoblar:");
    for (const r of responses) lines.push(`  • ${esc(r.survey.title)} — ${dayjs(r.submittedAt!).format('DD.MM')}${r.avgRating ? ` ⭐${r.avgRating.toFixed(1)}` : ''}`);
  }
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...kb.backToMenu() });
}
