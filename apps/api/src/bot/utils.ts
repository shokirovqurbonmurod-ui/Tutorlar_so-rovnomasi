import type { BotContext } from './context.js';

export const esc = (s: string | null | undefined) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function safeAnswerCb(ctx: BotContext, text?: string) {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCbQuery(text);
  } catch {
    /* expired callback — ignore */
  }
}

export const cbData = (ctx: BotContext) => (ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '');
