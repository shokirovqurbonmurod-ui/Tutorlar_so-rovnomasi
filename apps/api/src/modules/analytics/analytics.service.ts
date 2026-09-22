import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import type { RoleKey } from '../../generated/prisma/enums.js';

export interface Scope {
  branchId?: string;
  from: Date;
  to: Date;
}

const dayKeys = (from: Date, to: Date) => {
  const keys: string[] = [];
  let d = dayjs(from).startOf('day');
  const end = dayjs(to).endOf('day');
  while (d.isBefore(end)) {
    keys.push(d.format('YYYY-MM-DD'));
    d = d.add(1, 'day');
  }
  return keys;
};

const userBranch = (branchId?: string) => (branchId ? { branchId } : {});

export async function overview(s: Scope) {
  const uw = userBranch(s.branchId);
  const [
    totalTutors,
    totalTeachers,
    activeUsers,
    telegramLinked,
    surveysSent,
    assignmentsTotal,
    assignmentsDone,
    pendingReports,
    reportsThisPeriod,
    avgRating,
    activeSurveys,
    overdueAssignments,
  ] = await Promise.all([
    prisma.user.count({ where: { ...uw, role: { key: 'TUTOR' }, status: { not: 'BLOCKED' } } }),
    prisma.user.count({ where: { ...uw, role: { key: 'TEACHER' }, status: { not: 'BLOCKED' } } }),
    prisma.user.count({ where: { ...uw, status: 'ACTIVE', lastActivityAt: { gte: dayjs().subtract(7, 'day').toDate() } } }),
    prisma.user.count({ where: { ...uw, telegramId: { not: null } } }),
    prisma.survey.count({ where: { sentAt: { gte: s.from, lte: s.to }, ...(s.branchId ? { OR: [{ branchId: s.branchId }, { branchId: null }] } : {}) } }),
    prisma.surveyAssignment.count({ where: { createdAt: { gte: s.from, lte: s.to }, user: uw } }),
    prisma.surveyAssignment.count({ where: { createdAt: { gte: s.from, lte: s.to }, status: 'COMPLETED', user: uw } }),
    prisma.report.count({ where: { status: 'PENDING', author: uw } }),
    prisma.report.count({ where: { createdAt: { gte: s.from, lte: s.to }, author: uw } }),
    prisma.surveyResponse.aggregate({ where: { submittedAt: { gte: s.from, lte: s.to }, avgRating: { not: null }, ...(s.branchId ? { branchIdSnap: s.branchId } : {}) }, _avg: { avgRating: true } }),
    prisma.survey.count({ where: { status: 'ACTIVE' } }),
    prisma.surveyAssignment.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, survey: { deadline: { lt: new Date() } }, user: uw } }),
  ]);

  // previous period for deltas
  const span = dayjs(s.to).diff(s.from);
  const prevFrom = dayjs(s.from).subtract(span, 'ms').toDate();
  const [prevAssignTotal, prevAssignDone, prevReports] = await Promise.all([
    prisma.surveyAssignment.count({ where: { createdAt: { gte: prevFrom, lt: s.from }, user: uw } }),
    prisma.surveyAssignment.count({ where: { createdAt: { gte: prevFrom, lt: s.from }, status: 'COMPLETED', user: uw } }),
    prisma.report.count({ where: { createdAt: { gte: prevFrom, lt: s.from }, author: uw } }),
  ]);
  const rate = assignmentsTotal ? Math.round((assignmentsDone / assignmentsTotal) * 100) : 0;
  const prevRate = prevAssignTotal ? Math.round((prevAssignDone / prevAssignTotal) * 100) : 0;

  return {
    totalTutors,
    totalTeachers,
    activeUsers,
    telegramLinked,
    surveysSent,
    surveysCompleted: assignmentsDone,
    surveysAssigned: assignmentsTotal,
    completionRate: rate,
    completionRateDelta: rate - prevRate,
    pendingReports,
    reportsThisPeriod,
    reportsDelta: reportsThisPeriod - prevReports,
    avgRating: avgRating._avg.avgRating ? Number(avgRating._avg.avgRating.toFixed(2)) : null,
    activeSurveys,
    overdueAssignments,
  };
}

export async function completionTimeline(s: Scope) {
  const rows = await prisma.$queryRaw<Array<{ day: Date; assigned: bigint; completed: bigint }>>`
    SELECT d::date AS day,
      (SELECT COUNT(*) FROM survey_assignments a JOIN users u ON u.id = a."userId"
         WHERE a."createdAt"::date = d::date AND (${s.branchId ?? null}::text IS NULL OR u."branchId" = ${s.branchId ?? null}))::bigint AS assigned,
      (SELECT COUNT(*) FROM survey_assignments a JOIN users u ON u.id = a."userId"
         WHERE a."completedAt"::date = d::date AND (${s.branchId ?? null}::text IS NULL OR u."branchId" = ${s.branchId ?? null}))::bigint AS completed
    FROM generate_series(${s.from}::timestamp, ${s.to}::timestamp, '1 day') d
    ORDER BY day`;
  return rows.map((r) => ({ date: dayjs(r.day).format('YYYY-MM-DD'), assigned: Number(r.assigned), completed: Number(r.completed) }));
}

export async function activityTimeline(s: Scope) {
  const rows = await prisma.$queryRaw<Array<{ day: Date; role: string; count: bigint }>>`
    SELECT x.day, x.role, COUNT(*)::bigint AS count FROM (
      SELECT r."submittedAt"::date AS day, ro.key::text AS role
        FROM survey_responses r JOIN users u ON u.id = r."userId" JOIN roles ro ON ro.id = u."roleId"
        WHERE r."submittedAt" BETWEEN ${s.from} AND ${s.to} AND (${s.branchId ?? null}::text IS NULL OR u."branchId" = ${s.branchId ?? null})
      UNION ALL
      SELECT rp."createdAt"::date AS day, ro.key::text AS role
        FROM reports rp JOIN users u ON u.id = rp."authorId" JOIN roles ro ON ro.id = u."roleId"
        WHERE rp."createdAt" BETWEEN ${s.from} AND ${s.to} AND (${s.branchId ?? null}::text IS NULL OR u."branchId" = ${s.branchId ?? null})
    ) x GROUP BY x.day, x.role ORDER BY x.day`;
  const keys = dayKeys(s.from, s.to);
  const map = new Map(keys.map((k) => [k, { date: k, tutors: 0, teachers: 0 }]));
  for (const r of rows) {
    const k = dayjs(r.day).format('YYYY-MM-DD');
    const e = map.get(k);
    if (!e) continue;
    if (r.role === 'TUTOR') e.tutors += Number(r.count);
    else if (r.role === 'TEACHER') e.teachers += Number(r.count);
  }
  return [...map.values()];
}

export async function branchPerformance(s: Scope) {
  const branches = await prisma.branch.findMany({ where: s.branchId ? { id: s.branchId } : {}, select: { id: true, name: true, code: true, studentCount: true } });
  const result = [];
  for (const b of branches) {
    const uw = { branchId: b.id };
    const [assigned, completed, rating, reports, approved, staff] = await Promise.all([
      prisma.surveyAssignment.count({ where: { user: uw, createdAt: { gte: s.from, lte: s.to } } }),
      prisma.surveyAssignment.count({ where: { user: uw, status: 'COMPLETED', createdAt: { gte: s.from, lte: s.to } } }),
      prisma.surveyResponse.aggregate({ where: { branchIdSnap: b.id, avgRating: { not: null }, submittedAt: { gte: s.from, lte: s.to } }, _avg: { avgRating: true } }),
      prisma.report.count({ where: { author: uw, createdAt: { gte: s.from, lte: s.to } } }),
      prisma.report.count({ where: { author: uw, status: 'APPROVED', createdAt: { gte: s.from, lte: s.to } } }),
      prisma.user.count({ where: { ...uw, status: 'ACTIVE', role: { key: { in: ['TUTOR', 'TEACHER'] } } } }),
    ]);
    const kpi = await prisma.kpiResult.aggregate({ where: { user: uw, periodStart: { gte: dayjs(s.from).subtract(1, 'month').toDate() } }, _avg: { score: true } });
    result.push({
      id: b.id,
      name: b.name,
      code: b.code,
      staff,
      students: b.studentCount,
      completionRate: assigned ? Math.round((completed / assigned) * 100) : 0,
      avgRating: rating._avg.avgRating ? Number(rating._avg.avgRating.toFixed(2)) : null,
      reports,
      approvedRate: reports ? Math.round((approved / reports) * 100) : 0,
      kpiScore: kpi._avg.score ? Math.round(kpi._avg.score) : null,
    });
  }
  return result.sort((a, b) => b.completionRate - a.completionRate);
}

export async function ratingTrend(s: Scope) {
  const rows = await prisma.$queryRaw<Array<{ week: Date; avg: number | null; n: bigint }>>`
    SELECT date_trunc('week', r."submittedAt") AS week, AVG(r."avgRating")::float AS avg, COUNT(*)::bigint AS n
    FROM survey_responses r
    WHERE r."submittedAt" BETWEEN ${s.from} AND ${s.to} AND r."avgRating" IS NOT NULL
      AND (${s.branchId ?? null}::text IS NULL OR r."branchIdSnap" = ${s.branchId ?? null})
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({ week: dayjs(r.week).format('YYYY-MM-DD'), avg: r.avg ? Number(r.avg.toFixed(2)) : null, responses: Number(r.n) }));
}

export async function reportsBreakdown(s: Scope) {
  const uw = userBranch(s.branchId);
  const [byType, byStatus, weekly] = await Promise.all([
    prisma.report.groupBy({ by: ['type'], where: { createdAt: { gte: s.from, lte: s.to }, author: uw }, _count: true }),
    prisma.report.groupBy({ by: ['status'], where: { createdAt: { gte: s.from, lte: s.to }, author: uw }, _count: true }),
    prisma.$queryRaw<Array<{ week: Date; type: string; n: bigint }>>`
      SELECT date_trunc('week', rp."createdAt") AS week, rp.type::text AS type, COUNT(*)::bigint AS n
      FROM reports rp JOIN users u ON u.id = rp."authorId"
      WHERE rp."createdAt" BETWEEN ${s.from} AND ${s.to} AND (${s.branchId ?? null}::text IS NULL OR u."branchId" = ${s.branchId ?? null})
      GROUP BY 1, 2 ORDER BY 1`,
  ]);
  const weeks = new Map<string, Record<string, number | string>>();
  for (const r of weekly) {
    const k = dayjs(r.week).format('YYYY-MM-DD');
    const e = weeks.get(k) ?? { week: k };
    e[r.type] = Number(r.n);
    weeks.set(k, e);
  }
  return {
    byType: byType.map((t) => ({ type: t.type, count: t._count })),
    byStatus: byStatus.map((t) => ({ status: t.status, count: t._count })),
    weekly: [...weeks.values()],
  };
}

export async function topPerformers(s: Scope, role?: RoleKey, limit = 8) {
  const users = await prisma.user.findMany({
    where: { ...userBranch(s.branchId), status: 'ACTIVE', role: { key: role ? role : { in: ['TUTOR', 'TEACHER'] } } },
    select: { id: true, fullName: true, avatarUrl: true, role: { select: { key: true, name: true } }, branch: { select: { name: true } } },
  });
  const ids = users.map((u) => u.id);
  const [assigned, done, reports, kpi, ratings] = await Promise.all([
    prisma.surveyAssignment.groupBy({ by: ['userId'], where: { userId: { in: ids }, createdAt: { gte: s.from, lte: s.to } }, _count: true }),
    prisma.surveyAssignment.groupBy({ by: ['userId'], where: { userId: { in: ids }, status: 'COMPLETED', createdAt: { gte: s.from, lte: s.to } }, _count: true }),
    prisma.report.groupBy({ by: ['authorId'], where: { authorId: { in: ids }, createdAt: { gte: s.from, lte: s.to } }, _count: true }),
    prisma.kpiResult.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _avg: { score: true } }),
    prisma.surveyResponse.groupBy({ by: ['userId'], where: { userId: { in: ids }, avgRating: { not: null }, submittedAt: { gte: s.from, lte: s.to } }, _avg: { avgRating: true } }),
  ]);
  const pick = <T extends { userId?: string | null; authorId?: string }>(arr: T[], id: string) => arr.find((x) => (x.userId ?? x.authorId) === id);
  return users
    .map((u) => {
      const a = pick(assigned, u.id)?._count ?? 0;
      const d = pick(done, u.id)?._count ?? 0;
      return {
        ...u,
        assigned: a,
        completed: d,
        completionRate: a ? Math.round((d / a) * 100) : 0,
        reports: pick(reports, u.id)?._count ?? 0,
        kpiScore: Math.round(pick(kpi, u.id)?._avg.score ?? 0),
        avgRating: pick(ratings, u.id)?._avg.avgRating ? Number(pick(ratings, u.id)!._avg.avgRating!.toFixed(2)) : null,
      };
    })
    .sort((x, y) => y.kpiScore - x.kpiScore || y.completionRate - x.completionRate)
    .slice(0, limit);
}

export async function recentActivity(s: Scope, limit = 12) {
  const uw = userBranch(s.branchId);
  const [responses, reports, logins] = await Promise.all([
    prisma.surveyResponse.findMany({
      where: { submittedAt: { not: null }, user: uw },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      select: { id: true, submittedAt: true, avgRating: true, user: { select: { id: true, fullName: true, avatarUrl: true } }, survey: { select: { id: true, title: true } } },
    }),
    prisma.report.findMany({
      where: { author: uw },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, createdAt: true, title: true, type: true, status: true, author: { select: { id: true, fullName: true, avatarUrl: true } } },
    }),
    prisma.auditLog.findMany({ where: { action: { in: ['survey.send', 'announcement.create', 'user.create', 'report.review'] } }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, action: true, createdAt: true, meta: true, user: { select: { id: true, fullName: true, avatarUrl: true } } } }),
  ]);
  const items = [
    ...responses.map((r) => ({ id: `r-${r.id}`, kind: 'response' as const, at: r.submittedAt!, user: r.user, title: r.survey.title, meta: { rating: r.avgRating, surveyId: r.survey.id } })),
    ...reports.map((r) => ({ id: `p-${r.id}`, kind: 'report' as const, at: r.createdAt, user: r.author, title: r.title, meta: { type: r.type, status: r.status, reportId: r.id } })),
    ...logins.map((l) => ({ id: `a-${l.id}`, kind: 'audit' as const, at: l.createdAt, user: l.user, title: l.action, meta: l.meta })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export async function upcomingDeadlines(s: Scope, limit = 6) {
  const surveys = await prisma.survey.findMany({
    where: { status: 'ACTIVE', deadline: { gte: new Date() }, ...(s.branchId ? { OR: [{ branchId: s.branchId }, { branchId: null }] } : {}) },
    orderBy: { deadline: 'asc' },
    take: limit,
    select: { id: true, title: true, deadline: true, _count: { select: { assignments: true } } },
  });
  const ids = surveys.map((x) => x.id);
  const done = await prisma.surveyAssignment.groupBy({ by: ['surveyId'], where: { surveyId: { in: ids }, status: 'COMPLETED' }, _count: true });
  return surveys.map((x) => ({ ...x, completed: done.find((d) => d.surveyId === x.id)?._count ?? 0, assigned: x._count.assignments }));
}
