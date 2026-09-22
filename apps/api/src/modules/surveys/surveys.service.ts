import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { notifyMany } from '../notifications/notifications.service.js';
import { env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { QuestionType, RoleKey, SurveyAudience, SurveyStatus } from '../../generated/prisma/enums.js';

export const surveyInclude = {
  createdBy: { select: { id: true, fullName: true } },
  branch: { select: { id: true, name: true, code: true } },
  questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } },
  _count: { select: { assignments: true, responses: true } },
} satisfies Prisma.SurveyInclude;

export interface QuestionInput {
  id?: string;
  type: QuestionType;
  text: string;
  hint?: string | null;
  isRequired?: boolean;
  minValue?: number | null;
  maxValue?: number | null;
  options?: Array<{ id?: string; label: string; value?: string | null }>;
}

export interface SurveyInput {
  title: string;
  description?: string | null;
  audience?: SurveyAudience;
  branchId?: string | null;
  isAnonymous?: boolean;
  allowMultiple?: boolean;
  scheduledAt?: Date | null;
  deadline?: Date | null;
  questions?: QuestionInput[];
  targetUserIds?: string[];
}

function questionCreateData(qs: QuestionInput[]): Prisma.SurveyQuestionCreateWithoutSurveyInput[] {
  return qs.map((q, i) => ({
    order: i + 1,
    type: q.type,
    text: q.text,
    hint: q.hint ?? null,
    isRequired: q.isRequired ?? true,
    minValue: q.type === 'RATING' ? q.minValue ?? 1 : q.minValue ?? null,
    maxValue: q.type === 'RATING' ? q.maxValue ?? 5 : q.maxValue ?? null,
    options:
      q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE'
        ? { create: (q.options ?? []).map((o, j) => ({ order: j + 1, label: o.label, value: o.value ?? null })) }
        : undefined,
  }));
}

export async function createSurvey(input: SurveyInput, createdById: string) {
  const survey = await prisma.survey.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      audience: input.audience ?? 'ALL',
      branchId: input.branchId ?? null,
      isAnonymous: input.isAnonymous ?? false,
      allowMultiple: input.allowMultiple ?? false,
      scheduledAt: input.scheduledAt ?? null,
      deadline: input.deadline ?? null,
      status: input.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      createdById,
      questions: { create: questionCreateData(input.questions ?? []) },
    },
    include: surveyInclude,
  });
  if (input.audience === 'SELECTED' && input.targetUserIds?.length) {
    await prisma.surveyAssignment.createMany({
      data: input.targetUserIds.map((userId) => ({ surveyId: survey.id, userId })),
      skipDuplicates: true,
    });
  }
  return survey;
}

export async function updateSurvey(id: string, input: Partial<SurveyInput>) {
  const existing = await prisma.survey.findUnique({ where: { id }, include: { _count: { select: { responses: true } } } });
  if (!existing) throw notFound("So'rovnoma topilmadi");
  const locked = existing._count.responses > 0;
  if (locked && input.questions) {
    throw badRequest("Javoblar mavjud bo'lgan so'rovnoma savollarini o'zgartirib bo'lmaydi. Nusxa oling.");
  }
  return prisma.$transaction(async (tx) => {
    if (input.questions) {
      await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
    }
    const status: SurveyStatus | undefined =
      existing.status === 'DRAFT' && input.scheduledAt ? 'SCHEDULED' : existing.status === 'SCHEDULED' && input.scheduledAt === null ? 'DRAFT' : undefined;
    const survey = await tx.survey.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        audience: input.audience,
        branchId: input.branchId,
        isAnonymous: input.isAnonymous,
        allowMultiple: input.allowMultiple,
        scheduledAt: input.scheduledAt,
        deadline: input.deadline,
        status,
        questions: input.questions ? { create: questionCreateData(input.questions) } : undefined,
      },
      include: surveyInclude,
    });
    if (input.audience === 'SELECTED' && input.targetUserIds && existing.status === 'DRAFT') {
      await tx.surveyAssignment.deleteMany({ where: { surveyId: id, status: 'PENDING', notifiedAt: null } });
      await tx.surveyAssignment.createMany({
        data: input.targetUserIds.map((userId) => ({ surveyId: id, userId })),
        skipDuplicates: true,
      });
    }
    return survey;
  });
}

export async function duplicateSurvey(id: string, createdById: string) {
  const src = await prisma.survey.findUnique({ where: { id }, include: surveyInclude });
  if (!src) throw notFound("So'rovnoma topilmadi");
  return prisma.survey.create({
    data: {
      title: `${src.title} (nusxa)`,
      description: src.description,
      audience: src.audience,
      branchId: src.branchId,
      isAnonymous: src.isAnonymous,
      allowMultiple: src.allowMultiple,
      status: 'DRAFT',
      createdById,
      questions: {
        create: src.questions.map((q) => ({
          order: q.order,
          type: q.type,
          text: q.text,
          hint: q.hint,
          isRequired: q.isRequired,
          minValue: q.minValue,
          maxValue: q.maxValue,
          options: { create: q.options.map((o) => ({ order: o.order, label: o.label, value: o.value })) },
        })),
      },
    },
    include: surveyInclude,
  });
}

/** Resolves the list of recipients based on audience settings. */
export async function resolveRecipients(survey: { id: string; audience: SurveyAudience; branchId: string | null }, override?: { userIds?: string[]; branchId?: string; roles?: RoleKey[] }) {
  if (override?.userIds?.length) {
    return prisma.user.findMany({ where: { id: { in: override.userIds }, status: 'ACTIVE' }, select: { id: true } });
  }
  const where: Prisma.UserWhereInput = { status: 'ACTIVE' };
  const fieldRoles: RoleKey[] = ['TUTOR', 'TEACHER'];
  switch (survey.audience) {
    case 'TUTORS':
      where.role = { key: 'TUTOR' };
      break;
    case 'TEACHERS':
      where.role = { key: 'TEACHER' };
      break;
    case 'BRANCH':
      where.role = { key: { in: override?.roles ?? fieldRoles } };
      where.branchId = override?.branchId ?? survey.branchId ?? undefined;
      break;
    case 'SELECTED': {
      const existing = await prisma.surveyAssignment.findMany({ where: { surveyId: survey.id }, select: { userId: true } });
      return existing.map((a) => ({ id: a.userId }));
    }
    default:
      where.role = { key: { in: override?.roles ?? fieldRoles } };
  }
  return prisma.user.findMany({ where, select: { id: true } });
}

function formatDeadline(d: Date | null) {
  if (!d) return null;
  const dj = dayjs(d);
  const today = dayjs();
  if (dj.isSame(today, 'day')) return `Bugun ${dj.format('HH:mm')}`;
  if (dj.isSame(today.add(1, 'day'), 'day')) return `Ertaga ${dj.format('HH:mm')}`;
  return dj.format('DD.MM.YYYY HH:mm');
}

/** Activates the survey, creates assignments and pushes Telegram notifications. */
export async function sendSurvey(id: string, opts: { userIds?: string[]; branchId?: string; roles?: RoleKey[]; deadline?: Date | null } = {}) {
  const survey = await prisma.survey.findUnique({ where: { id }, include: { _count: { select: { questions: true } } } });
  if (!survey) throw notFound("So'rovnoma topilmadi");
  if (survey._count.questions === 0) throw badRequest("So'rovnomada savollar yo'q");
  if (['COMPLETED', 'ARCHIVED'].includes(survey.status)) throw badRequest("Yakunlangan so'rovnomani yuborib bo'lmaydi");

  const recipients = await resolveRecipients(survey, opts);
  if (recipients.length === 0) throw badRequest('Qabul qiluvchilar topilmadi');

  const deadline = opts.deadline === undefined ? survey.deadline : opts.deadline;
  await prisma.$transaction([
    prisma.survey.update({
      where: { id },
      data: { status: 'ACTIVE', sentAt: survey.sentAt ?? new Date(), deadline, scheduledAt: null },
    }),
    prisma.surveyAssignment.createMany({
      data: recipients.map((r) => ({ surveyId: id, userId: r.id, notifiedAt: new Date() })),
      skipDuplicates: true,
    }),
  ]);

  const deadlineText = formatDeadline(deadline);
  const sent = await notifyMany(
    recipients.map((r) => r.id),
    {
      type: 'SURVEY_ASSIGNED',
      title: "📋 Yangi so'rovnoma!",
      body: `Sizga yangi so'rovnoma yuborildi:\n${survey.title}${deadlineText ? `\n\n⏰ Deadline: ${deadlineText}` : ''}`,
      surveyId: id,
      payload: { surveyId: id, keyboard: { inline_keyboard: [[{ text: "▶️ So'rovnomani boshlash", callback_data: `survey:start:${id}` }]] } },
    },
  );
  return { recipients: recipients.length, notified: sent };
}

export async function closeSurvey(id: string, status: 'COMPLETED' | 'ARCHIVED' = 'COMPLETED') {
  await prisma.$transaction([
    prisma.survey.update({ where: { id }, data: { status, closedAt: new Date() } }),
    prisma.surveyAssignment.updateMany({ where: { surveyId: id, status: { in: ['PENDING', 'IN_PROGRESS'] } }, data: { status: 'EXPIRED' } }),
  ]);
}

// ── Results & analytics ───────────────────────────────────────────────────────

export interface ResultFilters {
  from?: Date;
  to?: Date;
  branchId?: string;
  userId?: string;
  role?: RoleKey;
}

export async function surveyResults(id: string, f: ResultFilters = {}) {
  const survey = await prisma.survey.findUnique({ where: { id }, include: surveyInclude });
  if (!survey) throw notFound("So'rovnoma topilmadi");

  const where: Prisma.SurveyResponseWhereInput = {
    surveyId: id,
    submittedAt: { not: null, ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) },
    ...(f.branchId ? { branchIdSnap: f.branchId } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.role ? { roleKeySnap: f.role } : {}),
  };

  const [responses, assignmentsTotal, assignmentsDone, agg] = await Promise.all([
    prisma.surveyResponse.findMany({
      where,
      include: {
        user: survey.isAnonymous ? false : { select: { id: true, fullName: true, avatarUrl: true, role: { select: { key: true, name: true } }, branch: { select: { id: true, name: true } } } },
        answers: { include: { question: { select: { id: true, type: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
    }),
    prisma.surveyAssignment.count({ where: { surveyId: id } }),
    prisma.surveyAssignment.count({ where: { surveyId: id, status: 'COMPLETED' } }),
    prisma.surveyResponse.aggregate({ where: { ...where, avgRating: { not: null } }, _avg: { avgRating: true, durationSec: true } }),
  ]);

  // per-question aggregation
  const questions = survey.questions.map((qn) => {
    const answers = responses.flatMap((r) => r.answers.filter((a) => a.questionId === qn.id));
    const base = { id: qn.id, order: qn.order, type: qn.type, text: qn.text, answered: answers.length };
    switch (qn.type) {
      case 'RATING':
      case 'NUMBER': {
        const nums = answers.map((a) => a.numberValue).filter((n): n is number => typeof n === 'number');
        const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
        const dist: Record<string, number> = {};
        if (qn.type === 'RATING') for (let i = qn.minValue ?? 1; i <= (qn.maxValue ?? 5); i++) dist[i] = 0;
        for (const n of nums) dist[String(n)] = (dist[String(n)] ?? 0) + 1;
        return { ...base, avg: avg === null ? null : Number(avg.toFixed(2)), min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null, distribution: Object.entries(dist).map(([label, count]) => ({ label, count })) };
      }
      case 'YES_NO': {
        const yes = answers.filter((a) => a.boolValue === true).length;
        const no = answers.filter((a) => a.boolValue === false).length;
        return { ...base, distribution: [{ label: 'Ha', count: yes }, { label: "Yo'q", count: no }], yesRate: answers.length ? Math.round((yes / answers.length) * 100) : 0 };
      }
      case 'SINGLE_CHOICE':
      case 'MULTIPLE_CHOICE': {
        const counts = new Map<string, number>();
        for (const a of answers) for (const oid of a.optionIds) counts.set(oid, (counts.get(oid) ?? 0) + 1);
        return { ...base, distribution: qn.options.map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) ?? 0 })) };
      }
      default:
        return { ...base, texts: answers.filter((a) => a.textValue).map((a) => ({ responseId: a.responseId, text: a.textValue! })) };
    }
  });

  // completion timeline (per day)
  const timeline = new Map<string, number>();
  for (const r of responses) {
    const k = dayjs(r.submittedAt!).format('YYYY-MM-DD');
    timeline.set(k, (timeline.get(k) ?? 0) + 1);
  }

  return {
    survey,
    summary: {
      participants: responses.length,
      assigned: assignmentsTotal,
      completed: assignmentsDone,
      completionRate: assignmentsTotal ? Math.round((assignmentsDone / assignmentsTotal) * 100) : 0,
      avgRating: agg._avg.avgRating ? Number(agg._avg.avgRating.toFixed(2)) : null,
      avgDurationSec: agg._avg.durationSec ? Math.round(agg._avg.durationSec) : null,
    },
    questions,
    timeline: [...timeline.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    responses: responses.map((r) => ({
      id: r.id,
      submittedAt: r.submittedAt,
      durationSec: r.durationSec,
      avgRating: r.avgRating,
      source: r.source,
      user: survey.isAnonymous ? null : (r as { user?: unknown }).user ?? null,
      branchId: r.branchIdSnap,
      role: r.roleKeySnap,
      answers: r.answers.map((a) => ({ questionId: a.questionId, textValue: a.textValue, numberValue: a.numberValue, boolValue: a.boolValue, optionIds: a.optionIds })),
    })),
  };
}

/** Flat rows for CSV/XLSX export. */
export async function resultRows(id: string, f: ResultFilters = {}) {
  const r = await surveyResults(id, f);
  const optionLabel = new Map<string, string>();
  for (const qn of r.survey.questions) for (const o of qn.options) optionLabel.set(o.id, o.label);
  const header = ['#', 'Sana', 'Xodim', 'Rol', 'Filial', ...r.survey.questions.map((qn) => qn.text)];
  const rows = r.responses.map((resp, i) => {
    const u = resp.user as { fullName?: string; role?: { name: string }; branch?: { name: string } } | null;
    return [
      i + 1,
      dayjs(resp.submittedAt!).format('DD.MM.YYYY HH:mm'),
      r.survey.isAnonymous ? 'Anonim' : u?.fullName ?? '—',
      u?.role?.name ?? resp.role ?? '—',
      u?.branch?.name ?? '—',
      ...r.survey.questions.map((qn) => {
        const a = resp.answers.find((x) => x.questionId === qn.id);
        if (!a) return '';
        if (a.textValue) return a.textValue;
        if (a.numberValue !== null && a.numberValue !== undefined) return a.numberValue;
        if (a.boolValue !== null && a.boolValue !== undefined) return a.boolValue ? 'Ha' : "Yo'q";
        if (a.optionIds.length) return a.optionIds.map((o) => optionLabel.get(o) ?? o).join(', ');
        return '';
      }),
    ];
  });
  return { header, rows, survey: r.survey, summary: r.summary };
}

export const webUrl = (path: string) => `${env.WEB_PUBLIC_URL}${path}`;
