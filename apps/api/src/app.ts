import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { branchesRouter } from './modules/branches/branches.routes.js';
import { surveysRouter } from './modules/surveys/surveys.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { analyticsRouter } from './modules/analytics/analytics.routes.js';
import { kpiRouter } from './modules/kpi/kpi.routes.js';
import { announcementsRouter } from './modules/announcements/announcements.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { tasksRouter } from './modules/tasks/tasks.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { rolesRouter } from './modules/roles/roles.routes.js';
import { studentsRouter } from './modules/students/students.routes.js';
import { parentsRouter } from './modules/parents/parents.routes.js';
import { groupsRouter } from './modules/groups/groups.routes.js';
import { subjectsRouter } from './modules/subjects/subjects.routes.js';
import { scheduleRouter } from './modules/schedule/schedule.routes.js';
import { attendanceRouter } from './modules/attendance/attendance.routes.js';
import { gradesRouter } from './modules/grades/grades.routes.js';
import { homeworkRouter } from './modules/homework/homework.routes.js';
import { examsRouter } from './modules/exams/exams.routes.js';
import { messagesRouter } from './modules/messages/messages.routes.js';
import { financeRouter } from './modules/finance/finance.routes.js';
import { dormRouter } from './modules/dorm/dorm.routes.js';
import { schoolRouter } from './modules/school/school.routes.js';
import { openapi } from './docs/openapi.js';
import { prisma } from './lib/prisma.js';
import { telegramRouter } from './bot/index.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return cb(null, true);
        // Suffix wildcards from env (e.g. "*.vercel.app") + the web dashboard's own public URL
        const allowedSuffix = env.corsOrigins.filter((o) => o.startsWith('*.')).map((o) => o.slice(1));
        if (allowedSuffix.some((suf) => origin.endsWith(suf))) return cb(null, true);
        if (env.WEB_PUBLIC_URL && origin === env.WEB_PUBLIC_URL.replace(/\/$/, '')) return cb(null, true);
        // Local dev / sandbox previews are always fine
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || /\.e2b\.app$/.test(origin)) return cb(null, true);
        // Not allowed: answer without CORS headers (browser blocks it) instead of throwing a 500
        return cb(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/parents', parentsRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/subjects', subjectsRouter);
  app.use('/api/schedule', scheduleRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/grades', gradesRouter);
  app.use('/api/homework', homeworkRouter);
  app.use('/api/exams', examsRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/finance', financeRouter);
  app.use('/api/dorm', dormRouter);
  app.use('/api/school', schoolRouter);
  app.use('/api/branches', branchesRouter);
  app.use('/api/surveys', surveysRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/kpi', kpiRouter);
  app.use('/api/announcements', announcementsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/telegram', telegramRouter);

  app.get('/api/docs.json', (_req, res) => res.json(openapi));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'TutorSurvey API' }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
