/**
 * Offline simulation of the school flows (parent / teacher / komendant) through
 * the real Telegraf handlers with a mocked Telegram transport.
 *   tsx scripts/bot-simulate-school.ts
 */
import 'dotenv/config';
import { Telegram } from 'telegraf';
import { createBot } from '../src/bot/index.js';
import { prisma } from '../src/lib/prisma.js';
import { registerTelegramSender } from '../src/modules/notifications/notifications.service.js';

const bot = createBot('000:FAKE');
const out: Array<{ method: string; text?: string; buttons?: string[] }> = [];
(Telegram.prototype as unknown as { callApi: (m: string, p: Record<string, unknown>) => Promise<unknown> }).callApi = async function (method: string, payload: Record<string, unknown>) {
  const kbd = payload.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data: string }>>; keyboard?: Array<Array<{ text: string } | string>> } | undefined;
  const buttons = kbd?.inline_keyboard?.flat().map((b) => `${b.text} → ${b.callback_data}`) ?? kbd?.keyboard?.flat().map((b) => (typeof b === 'string' ? b : b.text));
  out.push({ method, text: (payload.text ?? payload.caption) as string | undefined, buttons });
  return method === 'getMe' ? { id: 1, is_bot: true, first_name: 'Sim', username: 'sim_bot' } : { message_id: out.length, chat: { id: payload.chat_id }, date: 0, text: payload.text };
};
(bot as unknown as { botInfo: unknown }).botInfo = { id: 1, is_bot: true, first_name: 'Sim', username: 'sim_bot' };
const delivered: string[] = [];
registerTelegramSender(async (chatId, text) => { delivered.push(`${chatId}: ${text.replace(/\n/g, ' | ').slice(0, 120)}`); });

let uid = 1;
const mk = (tg: number) => {
  const from = { id: tg, is_bot: false, first_name: 'Sim', username: `sim${tg}` };
  const chat = { id: tg, type: 'private' as const };
  return {
    text: (t: string) => bot.handleUpdate({ update_id: uid++, message: { message_id: uid, date: Date.now() / 1000, chat, from, text: t, ...(t.startsWith('/') ? { entities: [{ type: 'bot_command' as const, offset: 0, length: t.split(' ')[0].length }] } : {}) } }),
    cb: (data: string) => bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid), from, chat_instance: 'x', data, message: { message_id: 1, date: 0, chat, text: 'msg' } } }),
  };
};
let last: typeof out = [];
const dump = (label: string) => {
  console.log(`\n── ${label}`);
  last = out.splice(0);
  for (const o of last) console.log(`  [${o.method}] ${(o.text ?? '').replace(/\n/g, ' | ').slice(0, 220)}${o.buttons ? `\n     ⌨ ${o.buttons.slice(0, 8).join(' · ')}` : ''}`);
};
const findBtn = (label: string) => {
  const b = [...out, ...last].flatMap((o) => o.buttons ?? []).find((x) => x.includes(label))?.split(' → ')[1];
  if (!b) throw new Error(`button not found: ${label}`);
  return b;
};
const tryBtn = (label: string) => { try { return findBtn(label); } catch { return undefined; } };

async function main() {
  // ── Parent: demo parent "Baxtbek Jumayev" (Ali Jumayev 7-A) ──
  const ali = await prisma.student.findFirstOrThrow({ where: { fullName: 'Ali Jumayev' }, include: { parents: { include: { parent: { include: { user: true } } } }, group: true } });
  const parentUser = ali.parents[0].parent.user;
  const PTG = Number(parentUser.telegramId ?? 900100001);
  if (!parentUser.telegramId) await prisma.user.update({ where: { id: parentUser.id }, data: { telegramId: BigInt(PTG), telegramChatId: BigInt(PTG) } });
  await prisma.telegramSession.deleteMany({ where: { telegramId: BigInt(PTG) } });
  const P = mk(PTG);
  await P.text('/start'); dump(`PARENT ${parentUser.fullName} /start`);
  await P.text('👨‍👩‍👧 Farzandim'); dump('Farzandim');
  await P.cb(`child:grades:${ali.id}:week`); dump('Baholar (hafta)');
  await P.cb(`child:att:${ali.id}:month`); dump('Davomat (oy)');
  await P.cb(`child:sched:${ali.id}`); dump('Dars jadvali');
  await P.cb(`child:hw:${ali.id}`); dump('Uy vazifalari');
  await P.cb(`child:payments:${ali.id}`); dump("To'lovlar");
  await P.cb(`child:teachers:${ali.id}`); dump("O'qituvchilar");
  await P.cb(`child:exams:${ali.id}`); dump('Imtihonlar');
  await P.text('💬 Xabarlar'); const openBtn = tryBtn('Xabar yozish'); dump('Xabarlar');
  if (openBtn) { await P.cb(openBtn); await P.text('Rahmat, tushunarli!'); dump('Parent reply in group chat'); }

  // ── Teacher ──
  const teacher = await prisma.user.findUniqueOrThrow({ where: { email: 'teacher@target-school.uz' } });
  const TTG = Number(teacher.telegramId ?? 900100002);
  if (!teacher.telegramId) await prisma.user.update({ where: { id: teacher.id }, data: { telegramId: BigInt(TTG) } });
  await prisma.telegramSession.deleteMany({ where: { telegramId: BigInt(TTG) } });
  const T = mk(TTG);
  await T.text('/start'); dump(`TEACHER ${teacher.fullName} /start`);
  await T.text('📚 Guruhlar'); const grpBtn = findBtn('grp:open'); dump('Guruhlar');
  const groupId = grpBtn!.split(':')[2];
  await T.cb(`grp:open:${groupId}`); dump('Guruh kartasi');
  // attendance
  await T.cb(`att:start:${groupId}`); dump('Davomat boshlandi');
  await T.cb(findBtn('Kelmadi')); dump('1-o\'quvchi: kelmadi');
  await T.cb(findBtn('Kechikdi')!); dump("2-o'quvchi: kechikdi");
  await T.cb(findBtn('yakunlash')!); dump('Davomat yakunlandi');
  // grades
  await T.cb(`grade:start:${groupId}`); dump('Baho: fan tanlash / boshlash');
  const subjBtn = tryBtn('grade:subj'); if (subjBtn) { await T.cb(subjBtn); dump('Fan tanlandi'); }
  await T.cb(findBtn('5 → grade:set')!); await T.cb(findBtn('4 → grade:set')!); dump('2 ta baho');
  await T.cb('grade:finish'); dump('Baholar saqlandi');
  // homework create
  await T.cb(`hw:new:${groupId}`); dump('UV: fan');
  await T.cb(findBtn('hw:subj')!); await T.text('Sinov mavzusi'); await T.text('1-5 mashqlar'); dump('UV: mavzu+topshiriq');
  await T.cb('hw:dl:2'); dump('UV: muddat');
  await T.cb('hw:confirm'); dump('UV: yaratildi');
  // review queue
  await T.cb(`hw:list:${groupId}`); const okBtn = tryBtn('hw:ok'); dump('UV tekshirish');
  if (okBtn) { await T.cb(okBtn); dump('UV qabul qilindi'); }
  await T.text('📅 Dars jadvali'); dump('Teacher jadvali');

  // ── Komendant ──
  const kom = await prisma.user.findUniqueOrThrow({ where: { email: 'dorm@target-school.uz' } });
  const KTG = Number(kom.telegramId ?? 900100003);
  await prisma.telegramSession.deleteMany({ where: { telegramId: BigInt(KTG) } });
  const K = mk(KTG);
  await K.text('/start'); dump(`KOMENDANT ${kom.fullName} /start`);
  await K.text('🏠 Yotoqxona'); dump('Yotoqxona');
  await K.text('🛏 Xonalar'); dump('Xonalar');
  await K.cb('dorm:rollcall'); dump("Yo'qlama boshlandi");
  await K.cb(findBtn("Yo'q")!); dump('1: yo\'q');
  await K.cb('dorm:rollfinish'); dump("Yo'qlama yakunlandi");
  await K.cb('dorm:log'); dump('Incident: o\'quvchi tanlash');
  await K.cb(findBtn('dorm:log:')!); await K.cb('dorm:type:INCIDENT'); await K.text('Xonada shovqin, tartib buzildi'); dump('Incident yozildi');

  // parent now checks child card + new notifications
  await P.cb(`child:open:${ali.id}`); dump('Parent: farzand kartasi (yangilangan)');
  console.log(`\n📨 Delivered Telegram notifications during simulation: ${delivered.length}`);
  for (const d of delivered.slice(0, 12)) console.log('   ' + d);
  const errors = out.filter((o) => (o.text ?? '').includes('Xatolik'));
  if (errors.length) { console.error('❌ errors in output', errors); process.exit(1); }
  console.log('\n✅ School bot simulation finished');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
