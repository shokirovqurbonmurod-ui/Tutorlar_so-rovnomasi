import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate, q } from '../../middleware/validate.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { serialize } from '../../lib/json.js';
import { pid } from '../../lib/params.js';
import { actor, groupScope, isGlobal, isBranchScoped } from '../../lib/scope.js';
import { notifyMany } from '../notifications/notifications.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { RoleKey } from '../../generated/prisma/enums.js';

/**
 * Group chat: teachers/tutors/admins post; parents & students may reply when
 * group.allowParentChat is on. Every message is stored and fanned out to
 * Telegram for members who are not the author.
 */
export const messagesRouter = Router();
messagesRouter.use(authenticate);

const include = {
  author: { select: { id: true, fullName: true, avatarUrl: true, role: { select: { key: true, name: true } } } },
  replyTo: { select: { id: true, body: true, author: { select: { fullName: true } } } },
} satisfies Prisma.GroupMessageInclude;

/** Conversations list: groups the actor belongs to with last message + unread-ish count */
messagesRouter.get(
  '/groups',
  requirePermission('messages.view'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const groups = await prisma.group.findMany({
      where: { ...(await groupScope(a)), isActive: true },
      select: { id: true, name: true, allowParentChat: true, branch: { select: { name: true } }, tutor: { select: { fullName: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { author: { select: { fullName: true } } } }, _count: { select: { messages: true, students: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(serialize(groups.map((g) => ({ ...g, lastMessage: g.messages[0] ?? null, messages: undefined }))));
  }),
);

messagesRouter.get(
  '/groups/:id',
  requirePermission('messages.view'),
  validate(z.object({ before: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), 'query'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const p = q<{ before?: string; limit: number }>(req);
    const g = await prisma.group.findFirst({ where: { id: pid(req), ...(await groupScope(a)) }, select: { id: true, name: true, allowParentChat: true } });
    if (!g) throw notFound('Guruh topilmadi');
    const items = await prisma.groupMessage.findMany({
      where: { groupId: g.id, ...(p.before ? { createdAt: { lt: new Date(p.before) } } : {}) },
      include,
      orderBy: { createdAt: 'desc' },
      take: p.limit,
    });
    res.json(serialize({ group: g, items: items.reverse(), canPost: canPost(a.role, g.allowParentChat) }));
  }),
);

messagesRouter.post(
  '/groups/:id',
  requirePermission('messages.view'),
  validate(z.object({ body: z.string().min(1).max(4000), replyToId: z.string().optional().nullable(), source: z.enum(['web', 'telegram']).default('web') })),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const { body, replyToId, source } = req.body as { body: string; replyToId?: string | null; source: 'web' | 'telegram' };
    const m = await postGroupMessage(a.sub, a.role, pid(req), body, { replyToId, source, groupScopeWhere: await groupScope(a) });
    audit({ userId: a.sub, action: 'message.send', entity: 'Group', entityId: pid(req), source, ip: req.ip });
    res.status(201).json(serialize(m));
  }),
);

messagesRouter.delete(
  '/:id',
  requirePermission('messages.view'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const m = await prisma.groupMessage.findUnique({ where: { id: pid(req) } });
    if (!m) throw notFound();
    if (m.authorId !== a.sub && !isGlobal(a) && !isBranchScoped(a)) throw forbidden();
    await prisma.groupMessage.delete({ where: { id: m.id } });
    res.json({ ok: true });
  }),
);

messagesRouter.post(
  '/:id/pin',
  requirePermission('messages.send'),
  asyncHandler(async (req, res) => {
    const m = await prisma.groupMessage.findUnique({ where: { id: pid(req) } });
    if (!m) throw notFound();
    res.json(serialize(await prisma.groupMessage.update({ where: { id: m.id }, data: { isPinned: !m.isPinned }, include })));
  }),
);

export const canPost = (role: RoleKey, allowParentChat: boolean) => (role === 'PARENT' || role === 'STUDENT' ? allowParentChat : true);

/** Shared by web + Telegram bot. */
export async function postGroupMessage(authorId: string, role: RoleKey, groupId: string, body: string, opts: { replyToId?: string | null; source?: 'web' | 'telegram'; groupScopeWhere?: Record<string, unknown> } = {}) {
  const g = await prisma.group.findFirst({
    where: { id: groupId, ...(opts.groupScopeWhere ?? {}) },
    select: { id: true, name: true, allowParentChat: true, tutorId: true, teacherId: true, teachers: { select: { teacherId: true } }, students: { where: { status: 'ACTIVE' }, select: { userId: true, parents: { select: { parent: { select: { userId: true } } } } } } },
  });
  if (!g) throw notFound('Guruh topilmadi');
  if (!canPost(role, g.allowParentChat)) throw forbidden("Bu guruhda ota-onalar yozishi o'chirilgan");
  const m = await prisma.groupMessage.create({ data: { groupId, authorId, body, replyToId: opts.replyToId ?? null, source: opts.source ?? 'web' }, include });

  const recipients = new Set<string>();
  if (g.tutorId) recipients.add(g.tutorId);
  if (g.teacherId) recipients.add(g.teacherId);
  for (const t of g.teachers) recipients.add(t.teacherId);
  for (const s of g.students) {
    if (s.userId) recipients.add(s.userId);
    for (const p of s.parents) recipients.add(p.parent.userId);
  }
  recipients.delete(authorId);
  const who = `${m.author.fullName} (${m.author.role.name})`;
  void notifyMany([...recipients], {
    type: 'GROUP_MESSAGE',
    title: `💬 ${g.name}`,
    body: `${who}:\n${body}`,
    payload: { groupId, messageId: m.id, keyboard: g.allowParentChat || true ? { inline_keyboard: [[{ text: '↩️ Javob yozish', callback_data: `chat:reply:${groupId}` }, { text: '💬 Suhbat', callback_data: `chat:open:${groupId}` }]] } : undefined },
  });
  return m;
}
