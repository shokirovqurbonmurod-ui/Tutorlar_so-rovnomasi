import type { Context } from 'telegraf';
import type { Update } from 'telegraf/types';
import { prisma } from '../lib/prisma.js';
import type { RoleKey, UserStatus } from '../generated/prisma/enums.js';

export interface SurveyFlowState {
  kind: 'survey';
  surveyId: string;
  responseId: string;
  index: number; // current question index
  selected?: string[]; // for MULTIPLE_CHOICE
  startedAt: number;
}

export interface ReportFlowState {
  kind: 'report';
  step: 'type' | 'group' | 'title' | 'content' | 'confirm';
  type?: string;
  groupId?: string | null;
  title?: string;
  content?: string;
}

export interface RegisterFlowState {
  kind: 'register';
  step: 'name' | 'phone' | 'role' | 'branch' | 'done';
  fullName?: string;
  phone?: string;
  role?: 'TUTOR' | 'TEACHER';
  branchId?: string;
}

export type FlowState = SurveyFlowState | ReportFlowState | RegisterFlowState | { kind: 'none' } | { kind: 'link' };

export interface BotUser {
  id: string;
  fullName: string;
  status: UserStatus;
  role: RoleKey;
  branchId: string | null;
  branchName: string | null;
  language: string;
}

export interface BotContext extends Context<Update> {
  dbUser: BotUser | null;
  flow: FlowState;
  setFlow: (s: FlowState) => Promise<void>;
}

/** Loads user + persisted flow state from DB and attaches to ctx. */
export async function sessionMiddleware(ctx: BotContext, next: () => Promise<void>) {
  const tgId = ctx.from?.id;
  if (!tgId) return next();
  const telegramId = BigInt(tgId);

  const [user, session] = await Promise.all([
    prisma.user.findUnique({
      where: { telegramId },
      select: { id: true, fullName: true, status: true, branchId: true, language: true, role: { select: { key: true } }, branch: { select: { name: true } } },
    }),
    prisma.telegramSession.findUnique({ where: { telegramId } }),
  ]);

  ctx.dbUser = user
    ? { id: user.id, fullName: user.fullName, status: user.status, role: user.role.key, branchId: user.branchId, branchName: user.branch?.name ?? null, language: user.language }
    : null;
  ctx.flow = ((session?.state as FlowState | undefined) ?? { kind: 'none' }) as FlowState;
  ctx.setFlow = async (state) => {
    ctx.flow = state;
    await prisma.telegramSession.upsert({
      where: { telegramId },
      create: { telegramId, userId: user?.id ?? null, state: state as object },
      update: { state: state as object, userId: user?.id ?? null },
    });
  };

  // touch activity + chat id (cheap, async)
  if (user) {
    const chatId = ctx.chat?.id;
    prisma.user
      .update({ where: { id: user.id }, data: { lastActivityAt: new Date(), ...(chatId ? { telegramChatId: BigInt(chatId) } : {}), telegramUsername: ctx.from?.username ?? undefined } })
      .catch(() => undefined);
  }
  return next();
}
