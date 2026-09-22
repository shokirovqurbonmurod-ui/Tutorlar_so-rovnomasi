import { pid } from '../../lib/params.js';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { paginationSchema, paged, skipTake } from '../../lib/pagination.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { notifyMany } from '../notifications/notifications.service.js';
import { AnnouncementPriority, SurveyAudience } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const announcementsRouter = Router();
announcementsRouter.use(authenticate);

const schema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(3).max(4000),
  priority: z.nativeEnum(AnnouncementPriority).default('NORMAL'),
  audience: z.nativeEnum(SurveyAudience).default('ALL'),
  branchId: z.string().optional().nullable(),
  isPinned: z.boolean().default(false),
  publishAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  sendTelegram: z.boolean().default(true),
});

const include = {
  author: { select: { id: true, fullName: true } },
  _count: { select: { reads: true } },
} satisfies Prisma.AnnouncementInclude;

export async function announcementRecipients(a: { audience: SurveyAudience; branchId: string | null }) {
  const where: Prisma.UserWhereInput = { status: 'ACTIVE', telegramId: { not: null } };
  if (a.audience === 'TUTORS') where.role = { key: 'TUTOR' };
  else if (a.audience === 'TEACHERS') where.role = { key: 'TEACHER' };
  else if (a.audience === 'BRANCH') where.branchId = a.branchId ?? undefined;
  return prisma.user.findMany({ where, select: { id: true } });
}

const PRIORITY_EMOJI: Record<AnnouncementPriority, string> = { LOW: '📢', NORMAL: '📢', HIGH: '❗️', URGENT: '🚨' };

announcementsRouter.get(
  '/',
  requirePermission('announcements.view'),
  validate(paginationSchema.extend({ priority: z.nativeEnum(AnnouncementPriority).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const p = q<z.infer<typeof paginationSchema> & { priority?: AnnouncementPriority }>(req);
    const where: Prisma.AnnouncementWhereInput = {
      ...(p.priority ? { priority: p.priority } : {}),
      ...(p.search ? { OR: [{ title: { contains: p.search, mode: 'insensitive' } }, { body: { contains: p.search, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.announcement.findMany({ where, include, orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }], ...skipTake(p) }),
      prisma.announcement.count({ where }),
    ]);
    res.json(serialize(paged(items, total, p)));
  }),
);

announcementsRouter.get(
  '/:id',
  requirePermission('announcements.view'),
  asyncHandler(async (req, res) => {
    const a = await prisma.announcement.findUnique({
      where: { id: pid(req) },
      include: { ...include, reads: { include: { user: { select: { id: true, fullName: true } } }, orderBy: { readAt: 'desc' }, take: 100 } },
    });
    if (!a) throw notFound("E'lon topilmadi");
    res.json(serialize(a));
  }),
);

announcementsRouter.post(
  '/',
  requirePermission('announcements.manage'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const { sendTelegram, ...data } = req.body as z.infer<typeof schema>;
    const a = await prisma.announcement.create({ data: { ...data, authorId: req.user!.sub }, include });
    let sent = 0;
    if (sendTelegram && a.publishAt <= new Date()) {
      const recipients = await announcementRecipients(a);
      sent = await notifyMany(recipients.map((r) => r.id), {
        type: 'ANNOUNCEMENT',
        title: `${PRIORITY_EMOJI[a.priority]} ${a.title}`,
        body: a.body,
        payload: { announcementId: a.id, keyboard: { inline_keyboard: [[{ text: "✅ O'qidim", callback_data: `ann:read:${a.id}` }]] } },
      });
      await prisma.announcement.update({ where: { id: a.id }, data: { sentCount: sent } });
    }
    audit({ userId: req.user!.sub, action: 'announcement.create', entity: 'Announcement', entityId: a.id, meta: { sent }, ip: req.ip });
    res.status(201).json(serialize({ ...a, sentCount: sent }));
  }),
);

announcementsRouter.patch(
  '/:id',
  requirePermission('announcements.manage'),
  validate(schema.partial()),
  asyncHandler(async (req, res) => {
    const { sendTelegram: _s, ...data } = req.body as Partial<z.infer<typeof schema>>;
    const a = await prisma.announcement.update({ where: { id: pid(req) }, data, include });
    audit({ userId: req.user!.sub, action: 'announcement.update', entity: 'Announcement', entityId: a.id, ip: req.ip });
    res.json(serialize(a));
  }),
);

announcementsRouter.post(
  '/:id/resend',
  requirePermission('announcements.manage'),
  asyncHandler(async (req, res) => {
    const a = await prisma.announcement.findUnique({ where: { id: pid(req) } });
    if (!a) throw notFound();
    const recipients = await announcementRecipients(a);
    const sent = await notifyMany(recipients.map((r) => r.id), {
      type: 'ANNOUNCEMENT',
      title: `${PRIORITY_EMOJI[a.priority]} ${a.title}`,
      body: a.body,
      payload: { announcementId: a.id, keyboard: { inline_keyboard: [[{ text: "✅ O'qidim", callback_data: `ann:read:${a.id}` }]] } },
    });
    await prisma.announcement.update({ where: { id: a.id }, data: { sentCount: { increment: sent } } });
    audit({ userId: req.user!.sub, action: 'announcement.resend', entity: 'Announcement', entityId: a.id, meta: { sent }, ip: req.ip });
    res.json({ sent });
  }),
);

announcementsRouter.delete(
  '/:id',
  requirePermission('announcements.manage'),
  asyncHandler(async (req, res) => {
    await prisma.announcement.delete({ where: { id: pid(req) } });
    audit({ userId: req.user!.sub, action: 'announcement.delete', entity: 'Announcement', entityId: pid(req), ip: req.ip });
    res.json({ ok: true });
  }),
);
