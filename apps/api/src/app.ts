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
        if (!origin || env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) return cb(null, true);
        // Allow preview hosts (e.g. *.e2b.app / *.vercel.app) when explicitly whitelisted by suffix
        if (env.corsOrigins.some((o) => o.startsWith('*.') && origin.endsWith(o.slice(1)))) return cb(null, true);
        return cb(new Error('CORS: origin not allowed'));
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
