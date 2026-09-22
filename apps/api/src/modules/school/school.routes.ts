import { Router } from 'express';
import { z } from 'zod';
import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { serialize } from '../../lib/json.js';
import { actor, isBranchScoped, staffGroupIds, parentStudentIds } from '../../lib/scope.js';
import { financeSummary } from '../finance/finance.service.js';
import { studentSummary } from '../students/students.service.js';

/**
 * School-level dashboards:
 *   GET /api/school/overview   → director / CEO / admin home
 *   GET /api/school/me         → role-specific "my" data (teacher groups, parent children, …)
 */
export const schoolRouter = Router();
schoolRouter.use(authenticate);

schoolRouter.get(
  '/overview',
  requirePermission('dashboard.view'),
  validate(z.object({ branchId: z.string().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const { branchId: qb } = q<{ branchId?: string }>(req);
    const branchId = isBranchScoped(a) ? a.branchId! : qb;
    const B = branchId ? { branchId } : {};
    const today = dayjs().startOf('day').toDate();
    const monthStart = dayjs().startOf('month').toDate();
    const d30 = dayjs().subtract(30, 'day').toDate();

    const [students, newStudents, boarders, teachers, tutors, staff, groups, parentsLinked, parentsTotal, attToday, attMonth, gradesMonth, hwOpen, hwPending, reportsPending, dormToday, exams, branches] = await Promise.all([
      prisma.student.count({ where: { ...B, status: 'ACTIVE' } }),
      prisma.student.count({ where: { ...B, status: 'ACTIVE', enrolledAt: { gte: monthStart } } }),
      prisma.student.count({ where: { ...B, status: 'ACTIVE', isBoarder: true } }),
      prisma.user.count({ where: { ...B, status: 'ACTIVE', role: { key: 'TEACHER' } } }),
      prisma.user.count({ where: { ...B, status: 'ACTIVE', role: { key: 'TUTOR' } } }),
      prisma.user.count({ where: { ...B, status: 'ACTIVE', role: { key: { notIn: ['PARENT', 'STUDENT'] } } } }),
      prisma.group.count({ where: { ...B, isActive: true } }),
      prisma.user.count({ where: { role: { key: 'PARENT' }, telegramId: { not: null }, ...(branchId ? { parentProfile: { children: { some: { student: { branchId } } } } } : {}) } }),
      prisma.user.count({ where: { role: { key: 'PARENT' }, ...(branchId ? { parentProfile: { children: { some: { student: { branchId } } } } } : {}) } }),
      prisma.attendance.groupBy({ by: ['status'], where: { date: today, group: B }, _count: { _all: true } }),
      prisma.attendance.groupBy({ by: ['status'], where: { date: { gte: d30 }, group: B }, _count: { _all: true } }),
      prisma.grade.aggregate({ where: { date: { gte: d30 }, maxValue: 5, student: B }, _avg: { value: true }, _count: { _all: true } }),
      prisma.homework.count({ where: { deadline: { gte: new Date() }, group: B } }),
      prisma.homeworkSubmission.count({ where: { status: 'SUBMITTED', homework: { group: B } } }),
      prisma.report.count({ where: { status: 'PENDING', ...(branchId ? { author: { branchId } } : {}) } }),
      prisma.dormLog.count({ where: { occurredAt: { gte: today }, type: { in: ['INCIDENT', 'ABSENT', 'LATE'] } } }),
      prisma.exam.findMany({ where: { date: { gte: new Date() }, group: B }, take: 5, orderBy: { date: 'asc' }, include: { group: { select: { name: true } }, subject: { select: { name: true } } } }),
      prisma.branch.findMany({ where: { isActive: true, ...(branchId ? { id: branchId } : {}) }, select: { id: true, name: true, code: true } }),
    ]);

    const attRate = (rows: { status: string; _count: { _all: number } }[]) => {
      const t = rows.reduce((s, r) => s + r._count._all, 0);
      const p = rows.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').reduce((s, r) => s + r._count._all, 0);
      return { rate: t ? Math.round((p / t) * 100) : null, total: t, absent: rows.find((r) => r.status === 'ABSENT')?._count._all ?? 0, late: rows.find((r) => r.status === 'LATE')?._count._all ?? 0 };
    };

    const finance = await financeSummary({ branchId });

    // attendance trend 14 days
    const att14 = await prisma.attendance.findMany({ where: { date: { gte: dayjs().subtract(13, 'day').startOf('day').toDate() }, group: B }, select: { date: true, status: true } });
    const trend: Record<string, { d: string; present: number; absent: number; late: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const k = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
      trend[k] = { d: dayjs(k).format('DD.MM'), present: 0, absent: 0, late: 0 };
    }
    for (const r of att14) {
      const k = dayjs(r.date).format('YYYY-MM-DD');
      if (!trend[k]) continue;
      if (r.status === 'PRESENT' || r.status === 'EXCUSED') trend[k].present++;
      else if (r.status === 'ABSENT') trend[k].absent++;
      else trend[k].late++;
    }

    // grade distribution 30d
    const dist = await prisma.grade.groupBy({ by: ['value'], where: { date: { gte: d30 }, maxValue: 5, student: B }, _count: { _all: true } });

    // per-branch table (CEO)
    const perBranch = await Promise.all(
      branches.map(async (b) => {
        const [st, att, debt] = await Promise.all([
          prisma.student.count({ where: { branchId: b.id, status: 'ACTIVE' } }),
          prisma.attendance.groupBy({ by: ['status'], where: { date: { gte: d30 }, group: { branchId: b.id } }, _count: { _all: true } }),
          prisma.invoice.aggregate({ where: { branchId: b.id, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } }, _sum: { total: true, paid: true } }),
        ]);
        const inc = await prisma.payment.aggregate({ where: { paidAt: { gte: monthStart }, student: { branchId: b.id } }, _sum: { amount: true } });
        return { ...b, students: st, attendance: attRate(att).rate, income: Number(inc._sum.amount ?? 0), debt: Number(debt._sum.total ?? 0) - Number(debt._sum.paid ?? 0) };
      }),
    );

    res.json(
      serialize({
        counts: { students, newStudents, boarders, teachers, tutors, staff, groups, parentsLinked, parentsTotal },
        attendance: { today: attRate(attToday), month: attRate(attMonth), trend: Object.values(trend) },
        grades: { avg: gradesMonth._avg.value ? Number(gradesMonth._avg.value.toFixed(2)) : null, count: gradesMonth._count._all, distribution: [2, 3, 4, 5].map((v) => ({ value: v, count: dist.find((d) => d.value === v)?._count._all ?? 0 })) },
        homework: { open: hwOpen, pendingReview: hwPending },
        reportsPending,
        dormToday,
        upcomingExams: exams,
        finance: { income: finance.income, expenses: finance.expenses, profit: finance.profit, debt: finance.debt, debtors: finance.debtors, monthly: finance.monthly },
        branches: perBranch,
      }),
    );
  }),
);

/** Role-aware "mine" endpoint for teacher/tutor/parent/student panels. */
schoolRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const a = actor(req);
    if (a.role === 'PARENT') {
      const ids = await parentStudentIds(a.sub);
      const children = await prisma.student.findMany({ where: { id: { in: ids } }, include: { group: { select: { id: true, name: true, tutor: { select: { fullName: true, phone: true } } } }, branch: { select: { name: true } } } });
      const detailed = await Promise.all(children.map(async (c) => ({ ...c, ...(await studentSummary(c.id)) })));
      return res.json(serialize({ role: a.role, children: detailed }));
    }
    if (a.role === 'STUDENT') {
      const s = await prisma.student.findUnique({ where: { userId: a.sub }, include: { group: { select: { id: true, name: true } } } });
      return res.json(serialize({ role: a.role, student: s ? { ...s, ...(await studentSummary(s.id)) } : null }));
    }
    if (a.role === 'TEACHER' || a.role === 'TUTOR') {
      const gids = await staffGroupIds(a.sub);
      const groups = await prisma.group.findMany({ where: { id: { in: gids } }, include: { _count: { select: { students: true } }, teachers: { where: { teacherId: a.sub }, include: { subject: true } } }, orderBy: { name: 'asc' } });
      const today = (['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const)[dayjs().day()];
      const lessonsToday = await prisma.lesson.findMany({ where: { weekday: today, OR: [{ teacherId: a.sub }, { groupId: { in: gids }, group: { tutorId: a.sub } }] }, include: { group: { select: { id: true, name: true } }, subject: true, room: true }, orderBy: { startTime: 'asc' } });
      const [pendingHw, unmarked] = await Promise.all([
        prisma.homeworkSubmission.count({ where: { status: 'SUBMITTED', homework: { authorId: a.sub } } }),
        Promise.all(gids.map(async (g) => ((await prisma.attendance.count({ where: { groupId: g, date: dayjs().startOf('day').toDate() } })) ? null : g))).then((r) => r.filter(Boolean).length),
      ]);
      return res.json(serialize({ role: a.role, groups, lessonsToday, pendingHomework: pendingHw, groupsWithoutAttendanceToday: unmarked }));
    }
    res.json({ role: a.role });
  }),
);
