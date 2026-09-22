import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';
import { env } from '../../config/env.js';

export const settingsRouter = Router();
settingsRouter.use(authenticate);

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  'org.name': 'Xususiy maktab',
  'org.timezone': 'Asia/Tashkent',
  'org.language': 'UZ',
  'survey.defaultDeadlineHours': 48,
  'survey.reminderHoursBefore': 3,
  'reports.dailyDeadline': '20:00',
  'reports.weeklyDay': 5, // Friday
  'notifications.telegramEnabled': true,
  'kpi.autoComputeWeekly': true,
};

export async function getSetting<T = unknown>(key: string): Promise<T> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return (s?.value as T) ?? (DEFAULT_SETTINGS[key] as T);
}

settingsRouter.get(
  '/',
  requirePermission('settings.view'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.setting.findMany();
    const values = { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
    res.json({
      values,
      system: {
        version: '1.0.0',
        env: env.NODE_ENV,
        botMode: env.TELEGRAM_MODE,
        botConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
        webUrl: env.WEB_PUBLIC_URL,
        apiUrl: env.API_PUBLIC_URL,
        timezone: env.TZ,
      },
    });
  }),
);

settingsRouter.put(
  '/',
  requirePermission('settings.manage'),
  validate(z.record(z.string(), z.unknown())),
  asyncHandler(async (req, res) => {
    const entries = Object.entries(req.body as Record<string, unknown>).filter(([k]) => k in DEFAULT_SETTINGS);
    await prisma.$transaction(entries.map(([key, value]) => prisma.setting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } })));
    audit({ userId: req.user!.sub, action: 'settings.update', meta: Object.fromEntries(entries), ip: req.ip });
    res.json({ ok: true });
  }),
);

settingsRouter.get(
  '/bot',
  requirePermission('settings.view'),
  asyncHandler(async (_req, res) => {
    const { getBotInfo } = await import('../../bot/index.js');
    res.json(await getBotInfo());
  }),
);
