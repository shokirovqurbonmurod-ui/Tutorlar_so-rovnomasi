import { Markup } from 'telegraf';
import type { RoleKey } from '../../generated/prisma/enums.js';

export const BTN = {
  // legacy staff
  surveys: "📋 So'rovnomalar",
  report: '📝 Hisobot',
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
  // parent
  myChildren: '👨‍👩‍👧 Farzandim',
  grades: '📊 Baholar',
  schedule: '📅 Dars jadvali',
  attendance: '🟢 Davomat',
  homework: '📝 Uy vazifalari',
  payments: "💳 To'lovlar",
  dorm: '🏠 Yotoqxona',
  messages: '💬 Xabarlar',
  // teacher / tutor
  groups: '📚 Guruhlar',
  tGroups: '👥 Guruhlar',
  students: "👨‍🎓 O'quvchilar",
  markAttendance: '🟢 Davomat',
  giveGrade: '📊 Baholar',
  giveHomework: '📝 Uy vazifasi',
  parents: '💬 Ota-onalar',
  tutorResults: '📊 Natijalar',
  tutorReport: '📝 Hisobot',
  // dorm
  rooms: '🛏 Xonalar',
  incidents: '⚠️ Incidentlar',
} as const;

export const ADMIN_ROLES: RoleKey[] = ['SUPER_ADMIN', 'DIRECTOR', 'CEO', 'HR_ADMIN', 'ADMINISTRATOR', 'IT_ADMIN'];

export function mainMenu(role?: RoleKey) {
  let rows: string[][];
  switch (role) {
    case 'PARENT':
      rows = [[BTN.myChildren, BTN.grades], [BTN.schedule, BTN.attendance], [BTN.homework, BTN.payments], [BTN.dorm, BTN.messages], [BTN.announcements, BTN.profile]];
      break;
    case 'STUDENT':
      rows = [[BTN.grades, BTN.schedule], [BTN.attendance, BTN.homework], [BTN.messages, BTN.announcements], [BTN.profile, BTN.help]];
      break;
    case 'TEACHER':
      rows = [[BTN.groups, BTN.students], [BTN.markAttendance, BTN.giveGrade], [BTN.giveHomework, BTN.messages], [BTN.schedule, BTN.surveys], [BTN.announcements, BTN.profile]];
      break;
    case 'TUTOR':
      rows = [[BTN.tGroups, BTN.students], [BTN.tutorResults, BTN.markAttendance], [BTN.parents, BTN.tutorReport], [BTN.surveys, BTN.announcements], [BTN.profile, BTN.help]];
      break;
    case 'DORM_MANAGER':
      rows = [[BTN.dorm, BTN.students], [BTN.rooms, BTN.markAttendance], [BTN.incidents, BTN.parents], [BTN.announcements, BTN.profile]];
      break;
    case 'ACCOUNTANT':
      rows = [[BTN.payments, BTN.students], [BTN.announcements, BTN.profile], [BTN.help]];
      break;
    default:
      rows = [[BTN.surveys, BTN.report], [BTN.announcements, BTN.results], [BTN.tasks, BTN.profile], [BTN.help]];
      if (role && ADMIN_ROLES.includes(role)) rows.push([BTN.admin]);
  }
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
    Array.from({ length: max - min + 1 }, (_, i) => Markup.button.callback(`⭐ ${min + i}`, `ans:rate:${min + i}`)),
    [Markup.button.callback(BTN.cancel, 'survey:cancel')],
  ]);

export const yesNoKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✅ Ha', 'ans:bool:1'), Markup.button.callback("❌ Yo'q", 'ans:bool:0')],
    [Markup.button.callback(BTN.cancel, 'survey:cancel')],
  ]);

export const singleChoiceKeyboard = (options: Array<{ id: string; label: string }>) =>
  Markup.inlineKeyboard([...options.map((o) => [Markup.button.callback(o.label.slice(0, 60), `ans:opt:${o.id}`)]), [Markup.button.callback(BTN.cancel, 'survey:cancel')]]);

export const multiChoiceKeyboard = (options: Array<{ id: string; label: string }>, selected: string[]) =>
  Markup.inlineKeyboard([
    ...options.map((o) => [Markup.button.callback(`${selected.includes(o.id) ? '☑️' : '⬜️'} ${o.label.slice(0, 56)}`, `ans:multi:${o.id}`)]),
    [Markup.button.callback('✅ Tasdiqlash', 'ans:multi:done')],
    [Markup.button.callback(BTN.cancel, 'survey:cancel')],
  ]);

export const textQuestionKeyboard = (optional: boolean) =>
  Markup.inlineKeyboard([...(optional ? [[Markup.button.callback(BTN.skip, 'ans:skip')]] : []), [Markup.button.callback(BTN.cancel, 'survey:cancel')]]);

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
  Markup.inlineKeyboard([
    [Markup.button.callback('👨‍👩‍👧 Ota-ona', 'reg:role:PARENT'), Markup.button.callback("🎓 O'quvchi", 'reg:role:STUDENT')],
    [Markup.button.callback('🎓 Tutor', 'reg:role:TUTOR'), Markup.button.callback("👩‍🏫 O'qituvchi", 'reg:role:TEACHER')],
  ]);

export const branchChoiceKeyboard = (branches: Array<{ id: string; name: string }>) => Markup.inlineKeyboard(branches.map((b) => [Markup.button.callback(`🏫 ${b.name}`, `reg:branch:${b.id}`)]));

export const phoneKeyboard = Markup.keyboard([[Markup.button.contactRequest('📱 Telefon raqamni yuborish')], [BTN.cancel]]).resize().oneTime();

/** Child picker for parents with several children. `prefix` e.g. "child:grades" */
export const childPicker = (children: Array<{ id: string; fullName: string; group?: { name: string } | null }>, prefix: string) =>
  Markup.inlineKeyboard(children.map((c) => [Markup.button.callback(`👤 ${c.fullName}${c.group ? ` · ${c.group.name}` : ''}`, `${prefix}:${c.id}`)]));

/** Actions under a selected child */
export const childMenu = (studentId: string) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📊 Baholar', `child:grades:${studentId}`), Markup.button.callback('🟢 Davomat', `child:att:${studentId}`)],
    [Markup.button.callback('📅 Dars jadvali', `child:sched:${studentId}`), Markup.button.callback('📝 Uy vazifalari', `child:hw:${studentId}`)],
    [Markup.button.callback('🧪 Imtihonlar', `child:exams:${studentId}`), Markup.button.callback("💳 To'lovlar", `child:payments:${studentId}`)],
    [Markup.button.callback('🏠 Yotoqxona', `child:dorm:${studentId}`), Markup.button.callback("👩‍🏫 O'qituvchilar", `child:teachers:${studentId}`)],
    [Markup.button.callback('💬 Guruh suhbati', `child:chat:${studentId}`)],
  ]);

export const periodPicker = (prefix: string, studentId: string) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('Bugun', `${prefix}:${studentId}:day`), Markup.button.callback('Hafta', `${prefix}:${studentId}:week`), Markup.button.callback('Oy', `${prefix}:${studentId}:month`)],
    [Markup.button.callback('⬅️ Farzandim', `child:open:${studentId}`)],
  ]);

export const groupPicker = (groups: Array<{ id: string; name: string }>, prefix: string) =>
  Markup.inlineKeyboard(groups.map((g) => [Markup.button.callback(`👥 ${g.name}`, `${prefix}:${g.id}`)]));

export const attendanceKeyboard = (studentId: string, index: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🟢 Keldi', `att:set:${studentId}:PRESENT:${index}`), Markup.button.callback('🔴 Kelmadi', `att:set:${studentId}:ABSENT:${index}`)],
    [Markup.button.callback('🟡 Kechikdi', `att:set:${studentId}:LATE:${index}`), Markup.button.callback('⚪️ Sababli', `att:set:${studentId}:EXCUSED:${index}`)],
    [Markup.button.callback('✅ Qolganlarni "Keldi" qilib yakunlash', `att:finish:${index}`), Markup.button.callback(BTN.cancel, 'flow:cancel')],
  ]);

export const gradeKeyboard = (studentId: string) =>
  Markup.inlineKeyboard([
    [2, 3, 4, 5].map((v) => Markup.button.callback(`${v}`, `grade:set:${studentId}:${v}`)),
    [Markup.button.callback("⏭ O'tkazish", `grade:skip:${studentId}`), Markup.button.callback('✅ Yakunlash', 'grade:finish')],
    [Markup.button.callback(BTN.cancel, 'flow:cancel')],
  ]);

export const ROLE_UZ: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin', DIRECTOR: 'Direktor', CEO: 'CEO', HR_ADMIN: 'HR', TUTOR: 'Tutor', TEACHER: "O'qituvchi", PARENT: 'Ota-ona', STUDENT: "O'quvchi",
  ACCOUNTANT: 'Buxgalter', ADMINISTRATOR: 'Administrator', DORM_MANAGER: 'Komendant', RECEPTION: 'Reception', MARKETING: 'Marketing', IT_ADMIN: 'IT admin', CUSTOM: 'Xodim',
} as Record<RoleKey, string>;
export const roleLabel = (r: RoleKey) => ROLE_UZ[r] ?? r;
