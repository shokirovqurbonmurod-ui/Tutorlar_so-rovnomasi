import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import type { KpiMetricKey, KpiPeriod } from '../../generated/prisma/enums.js';

export const KPI_DEFAULTS: Array<{ key: KpiMetricKey; name: string; description: string; weight: number; unit: string }> = [
  { key: 'ATTENDANCE', name: 'Davomat', description: "Ish kunlaridagi faollik (Telegram orqali kunlik faoliyat)", weight: 15, unit: '%' },
  { key: 'REPORTS_SUBMITTED', name: 'Hisobotlar', description: 'Kutilgan hisobotlarning topshirilgan ulushi', weight: 20, unit: '%' },
  { key: 'SURVEY_COMPLETION', name: "So'rovnoma bajarilishi", description: "Tayinlangan so'rovnomalarning muddatida yakunlangan ulushi", weight: 20, unit: '%' },
  { key: 'STUDENT_FEEDBACK', name: "O'quvchi fikri", description: "O'quvchilar bergan bahoning o'rtachasi (1-5 → 0-100)", weight: 15, unit: '%' },
  { key: 'TASK_COMPLETION', name: 'Vazifalar', description: 'Muddatida bajarilgan vazifalar ulushi', weight: 10, unit: '%' },
  { key: 'TUTOR_ACTIVITY', name: 'Tutor faolligi', description: "Haftalik faoliyat ko'rsatkichi (javob + hisobot soni)", weight: 10, unit: '%' },
  { key: 'TEACHER_ACTIVITY', name: "O'qituvchi faolligi", description: "Dars hisobotlari va fikr-mulohazalar", weight: 10, unit: '%' },
];

export function periodRange(period: KpiPeriod, ref = new Date()) {
  const d = dayjs(ref);
  if (period === 'WEEKLY') return { start: d.startOf('week').add(1, 'day').toDate(), end: d.startOf('week').add(1, 'day').add(7, 'day').toDate() }; // Mon–Sun
  if (period === 'MONTHLY') return { start: d.startOf('month').toDate(), end: d.endOf('month').toDate() };
  const qStart = d.month(Math.floor(d.month() / 3) * 3).startOf('month');
  return { start: qStart.toDate(), end: qStart.add(3, 'month').toDate() };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Computes KPI results for every field employee for the given period. */
export async function computeKpi(period: KpiPeriod, ref = new Date()) {
  const { start, end } = periodRange(period, ref);
  const metrics = await prisma.kpiMetric.findMany({ where: { isActive: true } });
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE', role: { key: { in: ['TUTOR', 'TEACHER'] } } }, select: { id: true, role: { select: { key: true } } } });
  const workDays = Math.max(1, Math.round(dayjs(end).diff(start, 'day') * 6 / 7));
  const expectedReports = period === 'WEEKLY' ? 6 : period === 'MONTHLY' ? 24 : 72; // ~5 daily + 1 weekly per week

  let written = 0;
  for (const u of users) {
    const [assigned, onTime, reports, approvedReports, tasks, tasksDone, feedback, activeDays, responses] = await Promise.all([
      prisma.surveyAssignment.count({ where: { userId: u.id, createdAt: { gte: start, lt: end } } }),
      prisma.surveyAssignment.count({ where: { userId: u.id, createdAt: { gte: start, lt: end }, status: 'COMPLETED' } }),
      prisma.report.count({ where: { authorId: u.id, createdAt: { gte: start, lt: end } } }),
      prisma.report.count({ where: { authorId: u.id, createdAt: { gte: start, lt: end }, status: 'APPROVED' } }),
      prisma.task.count({ where: { assigneeId: u.id, createdAt: { gte: start, lt: end } } }),
      prisma.task.count({ where: { assigneeId: u.id, createdAt: { gte: start, lt: end }, status: 'DONE' } }),
      prisma.surveyResponse.aggregate({ where: { userId: u.id, submittedAt: { gte: start, lt: end }, avgRating: { not: null } }, _avg: { avgRating: true } }),
      prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(DISTINCT d)::bigint AS n FROM (
          SELECT "submittedAt"::date d FROM survey_responses WHERE "userId" = ${u.id} AND "submittedAt" >= ${start} AND "submittedAt" < ${end}
          UNION SELECT "createdAt"::date FROM reports WHERE "authorId" = ${u.id} AND "createdAt" >= ${start} AND "createdAt" < ${end}
          UNION SELECT "createdAt"::date FROM audit_logs WHERE "userId" = ${u.id} AND "createdAt" >= ${start} AND "createdAt" < ${end}
        ) x`,
      prisma.surveyResponse.count({ where: { userId: u.id, submittedAt: { gte: start, lt: end } } }),
    ]);
    const active = Number(activeDays[0]?.n ?? 0);
    const activityRaw = responses + reports;
    const activityTarget = period === 'WEEKLY' ? 8 : period === 'MONTHLY' ? 32 : 96;

    const values: Record<KpiMetricKey, { value: number; score: number }> = {
      ATTENDANCE: { value: active, score: clamp((active / workDays) * 100) },
      REPORTS_SUBMITTED: { value: reports, score: clamp((reports / expectedReports) * 70 + (reports ? (approvedReports / reports) * 30 : 0)) },
      SURVEY_COMPLETION: { value: onTime, score: assigned ? clamp((onTime / assigned) * 100) : 100 },
      STUDENT_FEEDBACK: { value: feedback._avg.avgRating ?? 0, score: feedback._avg.avgRating ? clamp((feedback._avg.avgRating / 5) * 100) : 60 },
      TASK_COMPLETION: { value: tasksDone, score: tasks ? clamp((tasksDone / tasks) * 100) : 100 },
      TUTOR_ACTIVITY: { value: activityRaw, score: clamp((activityRaw / activityTarget) * 100) },
      TEACHER_ACTIVITY: { value: activityRaw, score: clamp((activityRaw / activityTarget) * 100) },
    };

    for (const m of metrics) {
      if (!m.appliesTo.includes(u.role.key)) continue;
      const v = values[m.key];
      await prisma.kpiResult.upsert({
        where: { metricId_userId_period_periodStart: { metricId: m.id, userId: u.id, period, periodStart: start } },
        create: { metricId: m.id, userId: u.id, period, periodStart: start, periodEnd: end, value: v.value, score: v.score },
        update: { value: v.value, score: v.score, periodEnd: end, computedAt: new Date() },
      });
      written++;
    }
  }
  return { period, start, end, users: users.length, written };
}

/** Weighted total score for a user in a period (0-100). */
export function weightedScore(results: Array<{ score: number; metric: { weight: number } }>) {
  const w = results.reduce((s, r) => s + r.metric.weight, 0);
  if (!w) return 0;
  return Math.round(results.reduce((s, r) => s + r.score * r.metric.weight, 0) / w);
}

/** Default reference date = last *complete* period, so dashboards don't show a half-empty current week. */
export function defaultRef(period: KpiPeriod) {
  const d = dayjs();
  if (period === 'WEEKLY') return d.subtract(1, 'week').toDate();
  if (period === 'MONTHLY') return d.subtract(1, 'month').toDate();
  return d.subtract(3, 'month').toDate();
}

export async function leaderboard(period: KpiPeriod, ref?: Date, branchId?: string) {
  const { start } = periodRange(period, ref ?? defaultRef(period));
  const results = await prisma.kpiResult.findMany({
    where: { period, periodStart: start, ...(branchId ? { user: { branchId } } : {}) },
    include: { metric: { select: { key: true, name: true, weight: true } }, user: { select: { id: true, fullName: true, avatarUrl: true, position: true, role: { select: { key: true, name: true } }, branch: { select: { id: true, name: true, code: true } } } } },
  });
  const byUser = new Map<string, { user: (typeof results)[number]['user']; results: typeof results }>();
  for (const r of results) {
    const e = byUser.get(r.userId) ?? { user: r.user, results: [] };
    e.results.push(r);
    byUser.set(r.userId, e);
  }
  return [...byUser.values()]
    .map((e) => ({
      user: e.user,
      total: weightedScore(e.results),
      metrics: e.results.map((r) => ({ key: r.metric.key, name: r.metric.name, weight: r.metric.weight, value: r.value, score: r.score })),
    }))
    .sort((a, b) => b.total - a.total);
}
