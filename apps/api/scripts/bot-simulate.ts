/**
 * Offline simulation of the Telegram bot: feeds synthetic updates through the
 * real Telegraf handlers with a mocked Telegram transport. Useful to sanity
 * check flows without network access.   tsx scripts/bot-simulate.ts
 */
import 'dotenv/config';
import { createBot } from '../src/bot/index.js';
import { prisma } from '../src/lib/prisma.js';

import { Telegram } from 'telegraf';

const bot = createBot('000:FAKE');
const out: Array<{ method: string; text?: string; buttons?: string[] }> = [];
// mock transport at prototype level (ctx.telegram is a per-update instance)
(Telegram.prototype as unknown as { callApi: (m: string, p: Record<string, unknown>) => Promise<unknown> }).callApi = async function (method: string, payload: Record<string, unknown>) {
  const kbd = (payload.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data: string }>>; keyboard?: Array<Array<{ text: string } | string>> } | undefined);
  const buttons = kbd?.inline_keyboard?.flat().map((b) => `${b.text} → ${b.callback_data}`) ?? kbd?.keyboard?.flat().map((b) => (typeof b === 'string' ? b : b.text));
  out.push({ method, text: payload.text as string | undefined, buttons });
  return method === 'getMe' ? { id: 1, is_bot: true, first_name: 'Sim', username: 'sim_bot' } : { message_id: out.length, chat: { id: payload.chat_id }, date: 0, text: payload.text };
};
(bot as unknown as { botInfo: unknown }).botInfo = { id: 1, is_bot: true, first_name: 'Sim', username: 'sim_bot' };

const TG = 900000123;
const from = { id: TG, is_bot: false, first_name: 'Sim', last_name: 'Tutor', username: 'simtutor' };
const chat = { id: TG, type: 'private' as const };
let uid = 1;
const text = (t: string) => bot.handleUpdate({ update_id: uid++, message: { message_id: uid, date: Date.now() / 1000, chat, from, text: t, ...(t.startsWith('/') ? { entities: [{ type: 'bot_command' as const, offset: 0, length: t.split(' ')[0].length }] } : {}) } });
const cb = (data: string) => bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid), from, chat_instance: 'x', data, message: { message_id: 1, date: 0, chat, text: 'msg' } } });
const contact = (phone: string) => bot.handleUpdate({ update_id: uid++, message: { message_id: uid, date: 0, chat, from, contact: { phone_number: phone, first_name: 'Sim', user_id: TG } } });
const dump = (label: string) => {
  console.log(`\n── ${label}`);
  for (const o of out.splice(0)) console.log(`  [${o.method}] ${(o.text ?? '').replace(/\n/g, ' | ').slice(0, 160)}${o.buttons ? `\n     ⌨ ${o.buttons.slice(0, 6).join(' · ')}` : ''}`);
};

async function main() {
  // clean previous sim user
  await prisma.user.updateMany({ where: { telegramId: { in: [BigInt(TG), BigInt(TG + 1)] } }, data: { telegramId: null } });
  await prisma.telegramSession.deleteMany({ where: { telegramId: BigInt(TG) } });

  await text('/start');
  dump('unknown user /start');

  // link by phone: use the demo tutor's phone
  const tutor = await prisma.user.findUniqueOrThrow({ where: { email: 'tutor@tutorsurvey.uz' } });
  await prisma.user.update({ where: { id: tutor.id }, data: { telegramId: null } });
  await cb('reg:phone');
  await contact(tutor.phone!);
  dump('link via phone');

  await text("📋 So'rovnomalar");
  dump('surveys list');

  // pick first pending survey
  const pending = await prisma.surveyAssignment.findFirst({ where: { userId: tutor.id, status: { in: ['PENDING', 'IN_PROGRESS'] }, survey: { status: 'ACTIVE' } }, include: { survey: { include: { questions: { orderBy: { order: 'asc' }, include: { options: true } } } } } });
  if (!pending) throw new Error('no pending survey for demo tutor');
  await cb(`survey:start:${pending.surveyId}`);
  dump(`start survey "${pending.survey.title}"`);

  for (const q of pending.survey.questions) {
    switch (q.type) {
      case 'RATING': await cb('ans:rate:4'); break;
      case 'YES_NO': await cb('ans:bool:1'); break;
      case 'SINGLE_CHOICE': await cb(`ans:opt:${q.options[0].id}`); break;
      case 'MULTIPLE_CHOICE': await cb(`ans:multi:${q.options[0].id}`); await cb(`ans:multi:${q.options[1].id}`); await cb('ans:multi:done'); break;
      case 'NUMBER': await text('12'); break;
      default: await text('Simulyatsiya javobi: darslar yaxshi o\'tdi, muammo yo\'q.');
    }
    dump(`answer ${q.order} (${q.type})`);
  }
  const resp = await prisma.surveyResponse.findFirst({ where: { surveyId: pending.surveyId, userId: tutor.id, submittedAt: { not: null } }, include: { answers: true }, orderBy: { submittedAt: 'desc' } });
  console.log(`\n✔ response saved: ${resp?.answers.length} answers, avgRating=${resp?.avgRating}, duration=${resp?.durationSec}s`);
  const a = await prisma.surveyAssignment.findUnique({ where: { surveyId_userId: { surveyId: pending.surveyId, userId: tutor.id } } });
  console.log(`✔ assignment status: ${a?.status}`);

  await text('📝 Hisobot topshirish');
  await cb('rep:type:DAILY');
  dump('report: type');
  const st = await prisma.telegramSession.findUnique({ where: { telegramId: BigInt(TG) } });
  const state = st?.state as { step?: string };
  if (state.step === 'group') { await cb('rep:group:none'); dump('report: group'); }
  await text("⏭ O'tkazib yuborish");
  await text("Bugun 4 ta dars o'tdim, davomat 90%, uy vazifasi bajarildi. Simulyatsiya.");
  dump('report: content → confirm');
  await cb('rep:confirm');
  dump('report: confirmed');
  const rep = await prisma.report.findFirst({ where: { authorId: tutor.id }, orderBy: { createdAt: 'desc' } });
  console.log(`✔ report saved: ${rep?.title} [${rep?.status}]`);

  await text('📊 Mening natijalarim');
  dump('my results');
  await text('👤 Profil');
  dump('profile');
  await text("📢 E'lonlar");
  dump('announcements');

  // admin via superadmin
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@tutorsurvey.uz' } });
  await prisma.user.update({ where: { id: admin.id }, data: { telegramId: BigInt(TG + 1) } });
  const adminFrom = { ...from, id: TG + 1 };
  await bot.handleUpdate({ update_id: uid++, message: { message_id: uid, date: 0, chat: { id: TG + 1, type: 'private' }, from: adminFrom, text: '/analytics', entities: [{ type: 'bot_command', offset: 0, length: 10 }] } });
  dump('admin /analytics');
  await bot.handleUpdate({ update_id: uid++, message: { message_id: uid, date: 0, chat: { id: TG + 1, type: 'private' }, from: adminFrom, text: '/admin', entities: [{ type: 'bot_command', offset: 0, length: 6 }] } });
  dump('admin /admin');

  // cleanup
  await prisma.user.update({ where: { id: admin.id }, data: { telegramId: null } });
  await prisma.report.deleteMany({ where: { id: rep?.id } });
  await prisma.telegramSession.deleteMany({ where: { telegramId: { in: [BigInt(TG), BigInt(TG + 1)] } } });
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
