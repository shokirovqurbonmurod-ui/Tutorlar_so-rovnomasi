import { Markup } from 'telegraf';
import type { RoleKey } from '../../generated/prisma/enums.js';

export const BTN = {
  surveys: "📋 So'rovnomalar",
  report: '📝 Hisobot topshirish',
  announcements: "📢 E'lonlar",
  results: '📊 Mening natijalarim',
  tasks: '🎯 Vazifalarim',
  profile: '👤 Profil',
  help: '❓ Yordam',
  admin: '🛠 Admin panel',
  back: '⬅️ Orqaga',
  cancel: '❌ Bekor qilish',
  skip: "⏭ O'tkazib yuborish",
  menu: '🏠 Asosiy menyu',
} as const;

export const ADMIN_ROLES: RoleKey[] = ['SUPER_ADMIN', 'DIRECTOR', 'CEO', 'HR_ADMIN'];

export function mainMenu(role?: RoleKey) {
  const rows: string[][] = [
    [BTN.surveys, BTN.report],
    [BTN.announcements, BTN.results],
    [BTN.tasks, BTN.profile],
    [BTN.help],
  ];
  if (role && ADMIN_ROLES.includes(role)) rows.push([BTN.admin]);
  return Markup.keyboard(rows).resize();
}

export const cancelKeyboard = Markup.keyboard([[BTN.cancel]]).resize();
export const skipCancelKeyboard = Markup.keyboard([[BTN.skip], [BTN.cancel]]).resize();
export const removeKeyboard = Markup.removeKeyboard();

export const surveysMenu = (pending: Array<{ id: string; title: string }>) =>
  Markup.inlineKeyboard([
    ...pending.slice(0, 8).map((s) => [Markup.button.callback(`📝 ${s.title.slice(0, 40)}`, `survey:start:${s.id}`)]),
    [Markup.button.callback('📊 Mening natijalarim', 'me:results')],
    [Markup.button.callback('🔄 Yangilash', 'menu:surveys')],
  ]);

export const ratingKeyboard = (min = 1, max = 5) =>
  Markup.inlineKeyboard([
    Array.from({ length: max - min + 1 }, (_, i) => Markup.button.callback(`${'⭐'.repeat(1)} ${min + i}`, `ans:rate:${min + i}`)),
    [Markup.button.callback(BTN.cancel, 'survey:cancel')],
  ]);

export const yesNoKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✅ Ha', 'ans:bool:1'), Markup.button.callback("❌ Yo'q", 'ans:bool:0')],
    [Markup.button.callback(BTN.cancel, 'survey:cancel')],
  ]);

export const singleChoiceKeyboard = (options: Array<{ id: string; label: string }>) =>
  Markup.inlineKeyboard([
    ...options.map((o) => [Markup.button.callback(o.label.slice(0, 60), `ans:opt:${o.id}`)]),
    [Markup.button.callback(BTN.cancel, 'survey:cancel')],
  ]);

export const multiChoiceKeyboard = (options: Array<{ id: string; label: string }>, selected: string[]) =>
  Markup.inlineKeyboard([
    ...options.map((o) => [Markup.button.callback(`${selected.includes(o.id) ? '☑️' : '⬜️'} ${o.label.slice(0, 56)}`, `ans:multi:${o.id}`)]),
    [Markup.button.callback('✅ Tasdiqlash', 'ans:multi:done')],
    [Markup.button.callback(BTN.cancel, 'survey:cancel')],
  ]);

export const textQuestionKeyboard = (optional: boolean) =>
  Markup.inlineKeyboard([
    ...(optional ? [[Markup.button.callback(BTN.skip, 'ans:skip')]] : []),
    [Markup.button.callback(BTN.cancel, 'survey:cancel')],
  ]);

export const reportTypesKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📅 Kunlik hisobot', 'rep:type:DAILY'), Markup.button.callback('🗓 Haftalik hisobot', 'rep:type:WEEKLY')],
    [Markup.button.callback('📆 Oylik hisobot', 'rep:type:MONTHLY'), Markup.button.callback('📚 Dars hisoboti', 'rep:type:LESSON')],
    [Markup.button.callback('⚠️ Muammo haqida', 'rep:type:PROBLEM'), Markup.button.callback("💬 O'quvchi fikri", 'rep:type:STUDENT_FEEDBACK')],
    [Markup.button.callback('📂 Mening hisobotlarim', 'rep:mine')],
  ]);

export const confirmKeyboard = (yes: string, no: string) =>
  Markup.inlineKeyboard([[Markup.button.callback('✅ Yuborish', yes), Markup.button.callback('✏️ Qayta yozish', no)], [Markup.button.callback(BTN.cancel, 'flow:cancel')]]);

export const backToMenu = () => Markup.inlineKeyboard([[Markup.button.callback(BTN.menu, 'menu:main')]]);

export const adminMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('👥 Foydalanuvchilar', 'admin:users'), Markup.button.callback("📋 So'rovnomalar", 'admin:surveys')],
    [Markup.button.callback('📝 Hisobotlar', 'admin:reports'), Markup.button.callback('📊 Analitika', 'admin:analytics')],
    [Markup.button.callback('⏳ Tasdiqlash kutayotganlar', 'admin:pending')],
  ]);

export const roleChoiceKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback('🎓 Tutor', 'reg:role:TUTOR'), Markup.button.callback("👩‍🏫 O'qituvchi", 'reg:role:TEACHER')]]);

export const branchChoiceKeyboard = (branches: Array<{ id: string; name: string }>) =>
  Markup.inlineKeyboard(branches.map((b) => [Markup.button.callback(`🏫 ${b.name}`, `reg:branch:${b.id}`)]));

export const phoneKeyboard = Markup.keyboard([[Markup.button.contactRequest('📱 Telefon raqamni yuborish')], [BTN.cancel]]).resize().oneTime();
