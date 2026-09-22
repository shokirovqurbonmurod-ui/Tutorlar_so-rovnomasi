import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';

/** Aggregated snapshot used by the student detail page and the Telegram "Farzandim" card. */
export async function studentSummary(studentId: string) {
  const from30 = dayjs().subtract(30, 'day').startOf('day').toDate();
  const [attendance, gradeAgg, recentGrades, invoices, homeworkPending, lastAttendance] = await Promise.all([
    prisma.attendance.groupBy({ by: ['status'], where: { studentId, date: { gte: from30 } }, _count: { _all: true } }),
    prisma.grade.aggregate({ where: { studentId, date: { gte: from30 }, maxValue: 5 }, _avg: { value: true }, _count: { _all: true } }),
    prisma.grade.findMany({ where: { studentId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 5, include: { subject: { select: { name: true } }, teacher: { select: { fullName: true } } } }),
    prisma.invoice.findMany({ where: { studentId }, orderBy: { period: 'desc' }, take: 3 }),
    prisma.homeworkSubmission.count({ where: { studentId, status: { in: ['NOT_SUBMITTED', 'REVISION'] }, homework: { deadline: { gte: dayjs().subtract(14, 'day').toDate() } } } }),
    prisma.attendance.findMany({ where: { studentId }, orderBy: { date: 'desc' }, take: 7, include: { lesson: { include: { subject: { select: { name: true } } } } } }),
  ]);
  const att: { PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number } = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const a of attendance) att[a.status as keyof typeof att] = a._count._all;
  const attTotal = Object.values(att).reduce((s, n) => s + n, 0);
  const attendanceRate = attTotal ? Math.round(((att.PRESENT + att.LATE) / attTotal) * 100) : null;
  const debt = invoices.reduce((s, i) => (['PENDING', 'PARTIAL', 'OVERDUE'].includes(i.status) ? s + (Number(i.total) - Number(i.paid)) : s), 0);

  return {
    summary: {
      attendance30: { ...att, total: attTotal, rate: attendanceRate },
      avgGrade30: gradeAgg._avg.value ? Number(gradeAgg._avg.value.toFixed(2)) : null,
      gradesCount30: gradeAgg._count._all,
      homeworkPending,
      debt,
    },
    recentGrades,
    recentAttendance: lastAttendance,
    recentInvoices: invoices,
  };
}
