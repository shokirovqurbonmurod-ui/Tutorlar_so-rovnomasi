import dayjs from 'dayjs';
import { Markup } from 'telegraf';
import { prisma } from '../../lib/prisma.js';
import type { BotContext } from '../context.js';
import * as kb from '../keyboards/index.js';
import { esc, safeAnswerCb } from '../utils.js';
import { staffGroupIds, studentAudience } from '../../lib/scope.js';
import { notifyMany } from '../../modules/notifications/notifications.service.js';
import { timetableFor, timetableText, WEEKDAYS } from '../../modules/schedule/schedule.service.js';
import { ATTENDANCE_ICON, ATTENDANCE_UZ } from '../../modules/attendance/attendance.routes.js';
import { HW_STATUS_ICON, HW_STATUS_UZ } from '../../modules/homework/homework.routes.js';
import type { AttendanceStatus } from '../../generated/prisma/enums.js';
import { audit } from '../../lib/audit.js';

/** Teacher / tutor flows: groups, students, attendance, grades, homework, parents. */

import type { AttendanceFlowState as AttendanceFlow, GradeFlowState as GradeFlow, HomeworkFlowState as HomeworkFlow, ParentMsgFlowState as ParentMsgFlow } from '../context.js';

async function myGroups(ctx: BotContext) {
  const ids = await staffGroupIds(ctx.dbUser!.id);
  return prisma.group.findMany({ where: { id: { in: ids }, isActive: true }, include: { _count: { select: { students: true } }, teachers: { where: { teacherId: ctx.dbUser!.id }, include: { subject: true } } }, orderBy: { name: 'asc' } });
}

async function ownsGroup(ctx: BotContext, groupId: string) {
  const ids = await staffGroupIds(ctx.dbUser!.id);
  if (!ids.includes(groupId)) { await ctx.reply('⛔️ Siz bu guruhga biriktirilmagansiz.'); return false; }
  return true;
}

export async function showGroups(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const groups = await myGroups(ctx);
  if (!groups.length) return ctx.reply("👥 Sizga hali guruh biriktirilmagan. Administrator bilan bog'laning.");
  const lines = ['👥 <b>Mening guruhlarim</b>', ''];
  for (const g of groups) lines.push(`• <b>${esc(g.name)}</b> — ${g._count.students} o'quvchi${g.teachers.length ? ` · ${g.teachers.map((t) => t.subject.name).join(', ')}` : ''}`);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...kb.groupPicker(groups, 'grp:open') });
}

export async function openGroup(ctx: BotContext, groupId: string) {
  await safeAnswerCb(ctx);
  if (!(await ownsGroup(ctx, groupId))) return;
  const g = await prisma.group.findUniqueOrThrow({ where: { id: groupId }, include: { tutor: { select: { fullName: true } }, teacher: { select: { fullName: true } }, _count: { select: { students: true } } } });
  const today = dayjs().startOf('day').toDate();
  const [att, hwOpen] = await Promise.all([prisma.attendance.count({ where: { groupId, date: today } }), prisma.homework.count({ where: { groupId, deadline: { gte: new Date() } } })]);
  const txt = [`👥 <b>${esc(g.name)}</b>`, `O'quvchilar: ${g._count.students}${g.tutor ? ` · Tutor: ${esc(g.tutor.fullName)}` : ''}`, `Bugungi davomat: ${att ? '✅ qo\'yilgan' : '⏳ qo\'yilmagan'} · Faol uy vazifalari: ${hwOpen}`].join('\n');
  return ctx.reply(txt, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback("👨‍🎓 O'quvchilar", `grp:students:${groupId}`), Markup.button.callback('🟢 Davomat', `att:start:${groupId}`)],
      [Markup.button.callback('📊 Baho qo\'yish', `grade:start:${groupId}`), Markup.button.callback('📝 Uy vazifasi', `hw:new:${groupId}`)],
      [Markup.button.callback('📅 Jadval', `grp:sched:${groupId}`), Markup.button.callback('💬 Suhbat', `chat:open:${groupId}`)],
      [Markup.button.callback('📋 Uy vazifalarini tekshirish', `hw:list:${groupId}`)],
      [Markup.button.callback('⬅️ Guruhlar', 'grp:list')],
    ]),
  });
}

export async function groupStudents(ctx: BotContext, groupId: string) {
  await safeAnswerCb(ctx);
  if (!(await ownsGroup(ctx, groupId))) return;
  const students = await prisma.student.findMany({ where: { groupId, status: 'ACTIVE' }, orderBy: { fullName: 'asc' }, include: { parents: { take: 1, include: { parent: { include: { user: { select: { fullName: true, phone: true, telegramId: true } } } } } } } });
  const g = await prisma.group.findUnique({ where: { id: groupId }, select: { name: true } });
  const lines = [`👨‍🎓 <b>${esc(g?.name ?? '')} — o'quvchilar (${students.length})</b>`, ''];
  students.forEach((s, i) => {
    const p = s.parents[0]?.parent.user;
    lines.push(`${i + 1}. <b>${esc(s.fullName)}</b>${p ? `\n    👨‍👩‍👧 ${esc(p.fullName)}${p.phone ? ` · ${esc(p.phone)}` : ''} ${p.telegramId ? '✈️' : ''}` : ''}`);
  });
  const buttons = students.slice(0, 20).map((s) => [Markup.button.callback(`👤 ${s.fullName}`, `stu:open:${s.id}`)]);
  buttons.push([Markup.button.callback('⬅️ Guruh', `grp:open:${groupId}`)]);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

export async function studentCard(ctx: BotContext, studentId: string) {
  await safeAnswerCb(ctx);
  const s = await prisma.student.findUnique({ where: { id: studentId }, include: { group: true, parents: { include: { parent: { include: { user: { select: { id: true, fullName: true, phone: true, telegramId: true } } } } } } } });
  if (!s || !s.groupId || !(await ownsGroup(ctx, s.groupId))) return;
  const { studentSummary } = await import('../../modules/students/students.service.js');
  const { summary, recentGrades } = await studentSummary(s.id);
  const lines = [`👤 <b>${esc(s.fullName)}</b> · ${esc(s.group!.name)}`, '', `📊 O'rtacha (30 kun): <b>${summary.avgGrade30 ?? '—'}</b>`, `🟢 Davomat: <b>${summary.attendance30.rate ?? '—'}%</b> (${summary.attendance30.ABSENT} kelmagan)`, `📝 Bajarilmagan UV: ${summary.homeworkPending}`, ''];
  if (recentGrades.length) { lines.push('<b>So\'nggi baholar</b>'); for (const g of recentGrades) lines.push(`• ${dayjs(g.date).format('DD.MM')} ${esc(g.subject.name)} — <b>${g.value}</b>`); }
  if (s.parents.length) { lines.push('', '<b>Ota-onalar</b>'); for (const p of s.parents) lines.push(`• ${esc(p.parent.user.fullName)}${p.relation ? ` (${esc(p.relation)})` : ''}${p.parent.user.phone ? ` · ${esc(p.parent.user.phone)}` : ''} ${p.parent.user.telegramId ? '✈️' : '—'}`); }
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✉️ Ota-onaga xabar', `stu:msg:${s.id}`)], [Markup.button.callback('⬅️ O\'quvchilar', `grp:students:${s.groupId}`)]]) });
}

export async function askParentMessage(ctx: BotContext, studentId: string) {
  await safeAnswerCb(ctx);
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { fullName: true, groupId: true } });
  if (!s?.groupId || !(await ownsGroup(ctx, s.groupId))) return;
  await ctx.setFlow({ kind: 'parentmsg', studentId } as ParentMsgFlow);
  return ctx.reply(`✉️ <b>${esc(s.fullName)}</b>ning ota-onasiga yuboriladigan xabarni yozing:`, { parse_mode: 'HTML', ...kb.cancelKeyboard });
}

export async function handleParentMessageText(ctx: BotContext, text: string) {
  const st = ctx.flow as ParentMsgFlow;
  const aud = await studentAudience(st.studentId);
  const me = ctx.dbUser!;
  const n = await notifyMany(aud.parents, { type: 'ADMIN_MESSAGE', title: `✉️ ${me.role === 'TUTOR' ? 'Tutor' : "O'qituvchi"}dan xabar — ${aud.name}`, body: `${me.fullName}:\n\n${text}` });
  await prisma.groupMessage.create({ data: { groupId: (await prisma.student.findUnique({ where: { id: st.studentId }, select: { groupId: true } }))!.groupId!, authorId: me.id, body: `[${aud.name} ota-onasiga] ${text}`, source: 'telegram' } }).catch(() => undefined);
  await ctx.setFlow({ kind: 'none' });
  audit({ userId: me.id, action: 'message.parent', entity: 'Student', entityId: st.studentId, source: 'telegram' });
  return ctx.reply(n ? `✅ Xabar ${n} ta ota-onaga yuborildi.` : "⚠️ Ota-ona Telegramga ulanmagan — xabar navbatga qo'yildi.", kb.mainMenu(me.role));
}

export async function groupSchedule(ctx: BotContext, groupId: string) {
  await safeAnswerCb(ctx);
  if (!(await ownsGroup(ctx, groupId))) return;
  const t = await timetableFor(groupId);
  return ctx.reply(timetableText(t), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Guruh', `grp:open:${groupId}`)]]) });
}

/** Teacher's own weekly timetable */
export async function mySchedule(ctx: BotContext) {
  const lessons = await prisma.lesson.findMany({ where: { OR: [{ teacherId: ctx.dbUser!.id }, { group: { tutorId: ctx.dbUser!.id } }] }, include: { group: { select: { name: true } }, subject: { select: { name: true } }, room: { select: { name: true } } }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] });
  if (!lessons.length) return ctx.reply('📅 Sizga darslar biriktirilmagan.');
  const { DAY_UZ } = await import('../../modules/schedule/schedule.service.js');
  const lines = ['📅 <b>Mening dars jadvalim</b>'];
  for (const d of WEEKDAYS) {
    const ls = lessons.filter((l) => l.weekday === d);
    if (!ls.length) continue;
    lines.push('', `<b>${DAY_UZ[d]}</b>`);
    for (const l of ls) lines.push(`${l.startTime}–${l.endTime}  ${esc(l.subject.name)} · ${esc(l.group.name)}${l.room ? ` · ${esc(l.room.name)}` : ''}`);
  }
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

// ── Attendance ───────────────────────────────────────────────────────────────
export async function pickGroupFor(ctx: BotContext, prefix: 'att:start' | 'grade:start' | 'hw:new' | 'hw:list', title: string) {
  await safeAnswerCb(ctx);
  const groups = await myGroups(ctx);
  if (!groups.length) return ctx.reply("👥 Sizga guruh biriktirilmagan.");
  if (groups.length === 1) {
    if (prefix === 'att:start') return startAttendance(ctx, groups[0].id);
    if (prefix === 'grade:start') return startGrade(ctx, groups[0].id);
    if (prefix === 'hw:new') return startHomework(ctx, groups[0].id);
    return listHomeworkForReview(ctx, groups[0].id);
  }
  return ctx.reply(`${title}\n\nGuruhni tanlang:`, kb.groupPicker(groups, prefix));
}

export async function startAttendance(ctx: BotContext, groupId: string) {
  await safeAnswerCb(ctx);
  if (!(await ownsGroup(ctx, groupId))) return;
  const students = await prisma.student.findMany({ where: { groupId, status: 'ACTIVE' }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } });
  if (!students.length) return ctx.reply("Guruhda o'quvchilar yo'q.");
  const st: AttendanceFlow = { kind: 'attendance', groupId, date: dayjs().format('YYYY-MM-DD'), students: students.map((s) => ({ id: s.id, name: s.fullName })), index: 0, marks: {} };
  await ctx.setFlow(st);
  return askAttendance(ctx, st);
}

async function askAttendance(ctx: BotContext, st: AttendanceFlow) {
  const s = st.students[st.index];
  const done = Object.keys(st.marks).length;
  return ctx.reply(`🟢 <b>Davomat</b> · ${dayjs(st.date).format('DD.MM.YYYY')} · ${done}/${st.students.length}\n\n<b>${st.index + 1}. ${esc(s.name)}</b>`, { parse_mode: 'HTML', ...kb.attendanceKeyboard(s.id, st.index) });
}

export async function setAttendance(ctx: BotContext, studentId: string, status: AttendanceStatus, index: number) {
  const st = ctx.flow as AttendanceFlow;
  if (st.kind !== 'attendance') return safeAnswerCb(ctx, 'Davomat sessiyasi faol emas');
  await safeAnswerCb(ctx, `${ATTENDANCE_ICON[status]} ${ATTENDANCE_UZ[status]}`);
  st.marks[studentId] = status;
  st.index = Math.min(index + 1, st.students.length);
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  if (st.index >= st.students.length) return finishAttendance(ctx, st);
  await ctx.setFlow(st);
  return askAttendance(ctx, st);
}

export async function finishAttendance(ctx: BotContext, stIn?: AttendanceFlow) {
  const st = stIn ?? (ctx.flow as AttendanceFlow);
  if (st.kind !== 'attendance') return safeAnswerCb(ctx);
  await safeAnswerCb(ctx);
  for (const s of st.students) st.marks[s.id] ??= 'PRESENT';
  const date = dayjs(st.date).startOf('day').toDate();
  const me = ctx.dbUser!;
  let notified = 0;
  for (const s of st.students) {
    const status = st.marks[s.id];
    const prev = await prisma.attendance.findFirst({ where: { studentId: s.id, date, lessonId: null } });
    if (prev) await prisma.attendance.update({ where: { id: prev.id }, data: { status, markedById: me.id } });
    else await prisma.attendance.create({ data: { studentId: s.id, groupId: st.groupId, date, status, markedById: me.id } });
    if (status !== 'PRESENT' && prev?.status !== status) {
      const aud = await studentAudience(s.id);
      const txt = status === 'ABSENT' ? `Farzandingiz ${aud.name} bugun (${dayjs(date).format('DD.MM.YYYY')}) darsga kelmadi.\n\nAgar sabab bo'lsa, iltimos tutor bilan bog'laning.` : status === 'LATE' ? `Farzandingiz ${aud.name} bugun (${dayjs(date).format('DD.MM.YYYY')}) darsga kechikdi.` : `Farzandingiz ${aud.name} uchun ${dayjs(date).format('DD.MM.YYYY')} kuni sababli yo'qlik qayd etildi.`;
      notified += await notifyMany(aud.parents, { type: 'ATTENDANCE', title: `${ATTENDANCE_ICON[status]} Davomat — ${aud.groupName ?? ''}`, body: txt, payload: { studentId: s.id, status } });
    }
  }
  await ctx.setFlow({ kind: 'none' });
  const c = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as Record<AttendanceStatus, number>;
  for (const v of Object.values(st.marks)) c[v]++;
  audit({ userId: me.id, action: 'attendance.mark', entity: 'Group', entityId: st.groupId, source: 'telegram', meta: { date: st.date, ...c } });
  return ctx.reply(`✅ <b>Davomat saqlandi</b> — ${dayjs(date).format('DD.MM.YYYY')}\n\n🟢 Kelgan: ${c.PRESENT}\n🔴 Kelmagan: ${c.ABSENT}\n🟡 Kechikkan: ${c.LATE}\n⚪️ Sababli: ${c.EXCUSED}\n\n📨 Ota-onalarga ${notified} ta xabar yuborildi.`, { parse_mode: 'HTML', ...kb.mainMenu(me.role) });
}

// ── Grades ───────────────────────────────────────────────────────────────────
export async function startGrade(ctx: BotContext, groupId: string) {
  await safeAnswerCb(ctx);
  if (!(await ownsGroup(ctx, groupId))) return;
  const me = ctx.dbUser!;
  // subjects this teacher teaches in the group (fallback: all subjects with lessons in the group, then all)
  let subjects = (await prisma.groupTeacher.findMany({ where: { groupId, teacherId: me.id }, include: { subject: true } })).map((t) => t.subject);
  if (!subjects.length) subjects = (await prisma.lesson.findMany({ where: { groupId }, distinct: ['subjectId'], include: { subject: true } })).map((l) => l.subject);
  if (!subjects.length) subjects = await prisma.subject.findMany({ where: { isActive: true }, take: 12 });
  if (subjects.length === 1) return startGradeSubject(ctx, groupId, subjects[0].id);
  return ctx.reply('📊 <b>Baho qo\'yish</b>\n\nFanni tanlang:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(subjects.map((s) => [Markup.button.callback(s.name, `grade:subj:${groupId}:${s.id}`)])) });
}

export async function startGradeSubject(ctx: BotContext, groupId: string, subjectId: string) {
  await safeAnswerCb(ctx);
  if (!(await ownsGroup(ctx, groupId))) return;
  const students = await prisma.student.findMany({ where: { groupId, status: 'ACTIVE' }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } });
  if (!students.length) return ctx.reply("Guruhda o'quvchilar yo'q.");
  const st: GradeFlow = { kind: 'grade', groupId, subjectId, students: students.map((s) => ({ id: s.id, name: s.fullName })), index: 0, marks: {} };
  await ctx.setFlow(st);
  return askGrade(ctx, st);
}

async function askGrade(ctx: BotContext, st: GradeFlow) {
  const s = st.students[st.index];
  const subj = await prisma.subject.findUnique({ where: { id: st.subjectId }, select: { name: true } });
  return ctx.reply(`📊 <b>${esc(subj?.name ?? '')}</b> · ${Object.keys(st.marks).length} ta baho\n\n<b>${st.index + 1}. ${esc(s.name)}</b>\nBahoni tanlang:`, { parse_mode: 'HTML', ...kb.gradeKeyboard(s.id) });
}

export async function setGrade(ctx: BotContext, studentId: string, value: number | null) {
  const st = ctx.flow as GradeFlow;
  if (st.kind !== 'grade') return safeAnswerCb(ctx, 'Baholash sessiyasi faol emas');
  await safeAnswerCb(ctx, value ? `${value} ⭐` : "O'tkazildi");
  if (value) st.marks[studentId] = value;
  st.index++;
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  if (st.index >= st.students.length) return finishGrade(ctx, st);
  await ctx.setFlow(st);
  return askGrade(ctx, st);
}

export async function finishGrade(ctx: BotContext, stIn?: GradeFlow) {
  const st = stIn ?? (ctx.flow as GradeFlow);
  if (st.kind !== 'grade') return safeAnswerCb(ctx);
  await safeAnswerCb(ctx);
  const me = ctx.dbUser!;
  const subj = await prisma.subject.findUniqueOrThrow({ where: { id: st.subjectId } });
  const date = dayjs().startOf('day').toDate();
  let n = 0;
  for (const [studentId, value] of Object.entries(st.marks)) {
    await prisma.grade.create({ data: { studentId, groupId: st.groupId, subjectId: st.subjectId, teacherId: me.id, date, value, maxValue: 5, kind: 'LESSON' } });
    n++;
    const aud = await studentAudience(studentId);
    void notifyMany([...aud.parents, ...(aud.student ? [aud.student] : [])], { type: 'GRADE', title: `📊 Yangi baho — ${subj.name}`, body: `${aud.name}\n${dayjs(date).format('DD.MM.YYYY')}\n\nBaho: ${value} ${'⭐'.repeat(value)}\nO'qituvchi: ${me.fullName}`, payload: { studentId, keyboard: { inline_keyboard: [[{ text: '📊 Barcha baholar', callback_data: `child:grades:${studentId}` }]] } } });
  }
  await ctx.setFlow({ kind: 'none' });
  audit({ userId: me.id, action: 'grade.create', entity: 'Subject', entityId: st.subjectId, source: 'telegram', meta: { count: n, groupId: st.groupId } });
  return ctx.reply(`✅ ${n} ta baho saqlandi (${subj.name}). Ota-onalarga xabar yuborildi.`, kb.mainMenu(me.role));
}

// ── Homework ─────────────────────────────────────────────────────────────────
export async function startHomework(ctx: BotContext, groupId: string) {
  await safeAnswerCb(ctx);
  if (!(await ownsGroup(ctx, groupId))) return;
  const me = ctx.dbUser!;
  let subjects = (await prisma.groupTeacher.findMany({ where: { groupId, teacherId: me.id }, include: { subject: true } })).map((t) => t.subject);
  if (!subjects.length) subjects = (await prisma.lesson.findMany({ where: { groupId }, distinct: ['subjectId'], include: { subject: true } })).map((l) => l.subject);
  if (!subjects.length) subjects = await prisma.subject.findMany({ where: { isActive: true }, take: 12 });
  await ctx.setFlow({ kind: 'homework', step: 'subject', groupId } as HomeworkFlow);
  return ctx.reply('📝 <b>Yangi uy vazifasi</b>\n\nFanni tanlang:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(subjects.map((s) => [Markup.button.callback(s.name, `hw:subj:${s.id}`)])) });
}

export async function homeworkSubject(ctx: BotContext, subjectId: string) {
  await safeAnswerCb(ctx);
  const st = ctx.flow as HomeworkFlow;
  if (st.kind !== 'homework') return;
  await ctx.setFlow({ ...st, subjectId, step: 'title' });
  return ctx.reply('✏️ Mavzuni yozing (masalan: <i>Kasrlar. 45–48-mashqlar</i>):', { parse_mode: 'HTML', ...kb.cancelKeyboard });
}

export async function handleHomeworkText(ctx: BotContext, text: string) {
  const st = ctx.flow as HomeworkFlow;
  if (st.step === 'title') {
    await ctx.setFlow({ ...st, title: text.slice(0, 160), step: 'task' });
    return ctx.reply('📋 Topshiriq matnini yozing:', kb.cancelKeyboard);
  }
  if (st.step === 'task') {
    await ctx.setFlow({ ...st, task: text.slice(0, 5000), step: 'deadline' });
    return ctx.reply('⏰ Muddatni tanlang yoki yozing (masalan <code>25.09 18:00</code>):', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('Ertaga 18:00', 'hw:dl:1'), Markup.button.callback('2 kundan keyin', 'hw:dl:2')], [Markup.button.callback('Bir haftadan keyin', 'hw:dl:7')]]),
    });
  }
  if (st.step === 'deadline') {
    const m = /^(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?$/.exec(text.trim());
    if (!m) return ctx.reply("Format noto'g'ri. Masalan: 25.09 18:00");
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : dayjs().year();
    const d = dayjs(`${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')} ${m[4] ?? '18'}:${m[5] ?? '00'}`);
    if (!d.isValid() || d.isBefore(dayjs())) return ctx.reply("Muddat kelajakda bo'lishi kerak. Qaytadan kiriting:");
    return homeworkDeadline(ctx, d.toISOString());
  }
}

export async function homeworkDeadline(ctx: BotContext, isoOrDays: string) {
  await safeAnswerCb(ctx);
  const st = ctx.flow as HomeworkFlow;
  if (st.kind !== 'homework') return;
  const deadline = /^\d+$/.test(isoOrDays) ? dayjs().add(Number(isoOrDays), 'day').hour(18).minute(0).second(0).toISOString() : isoOrDays;
  const subj = await prisma.subject.findUnique({ where: { id: st.subjectId! }, select: { name: true } });
  const g = await prisma.group.findUnique({ where: { id: st.groupId }, select: { name: true } });
  await ctx.setFlow({ ...st, deadline, step: 'confirm' });
  return ctx.reply(`📝 <b>Tasdiqlang</b>\n\n👥 ${esc(g?.name ?? '')} · 📚 ${esc(subj?.name ?? '')}\n<b>${esc(st.title ?? '')}</b>\n${esc(st.task ?? '')}\n\n⏰ Muddat: ${dayjs(deadline).format('DD.MM.YYYY HH:mm')}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Yuborish', 'hw:confirm'), Markup.button.callback(kb.BTN.cancel, 'flow:cancel')]]) });
}

export async function confirmHomework(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const st = ctx.flow as HomeworkFlow;
  if (st.kind !== 'homework' || st.step !== 'confirm') return;
  const me = ctx.dbUser!;
  const h = await prisma.homework.create({ data: { groupId: st.groupId, subjectId: st.subjectId!, authorId: me.id, title: st.title!, task: st.task!, deadline: new Date(st.deadline!) }, include: { subject: true, group: true } });
  const students = await prisma.student.findMany({ where: { groupId: st.groupId, status: 'ACTIVE' }, select: { id: true, userId: true, parents: { select: { parent: { select: { userId: true } } } } } });
  if (students.length) await prisma.homeworkSubmission.createMany({ data: students.map((s) => ({ homeworkId: h.id, studentId: s.id })), skipDuplicates: true });
  const ids = new Set<string>();
  for (const s of students) { if (s.userId) ids.add(s.userId); for (const p of s.parents) ids.add(p.parent.userId); }
  const n = await notifyMany([...ids], { type: 'HOMEWORK', title: `📝 Yangi uy vazifasi — ${h.subject.name}`, body: `${h.group.name}\nMavzu: ${h.title}\n\n${h.task.slice(0, 400)}\n\n⏰ Muddat: ${dayjs(h.deadline).format('DD.MM.YYYY HH:mm')}`, payload: { homeworkId: h.id, keyboard: { inline_keyboard: [[{ text: "📝 Ko'rish", callback_data: `hw:view:${h.id}` }]] } } });
  await ctx.setFlow({ kind: 'none' });
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  audit({ userId: me.id, action: 'homework.create', entity: 'Homework', entityId: h.id, source: 'telegram' });
  return ctx.reply(`✅ Uy vazifasi yaratildi va ${n} kishiga yuborildi.`, kb.mainMenu(me.role));
}

export async function listHomeworkForReview(ctx: BotContext, groupId: string) {
  await safeAnswerCb(ctx);
  if (!(await ownsGroup(ctx, groupId))) return;
  const subs = await prisma.homeworkSubmission.findMany({ where: { status: 'SUBMITTED', homework: { groupId } }, include: { student: { select: { fullName: true } }, homework: { include: { subject: { select: { name: true } } } } }, orderBy: { submittedAt: 'asc' }, take: 15 });
  if (!subs.length) return ctx.reply('📋 Tekshirish kutayotgan uy vazifalari yo\'q.', Markup.inlineKeyboard([[Markup.button.callback('⬅️ Guruh', `grp:open:${groupId}`)]]));
  const lines = [`📋 <b>Tekshirish kutilmoqda (${subs.length})</b>`, ''];
  for (const s of subs) lines.push(`• <b>${esc(s.student.fullName)}</b> — ${esc(s.homework.subject.name)}: ${esc(s.homework.title)}${s.content ? `\n  <i>${esc(s.content.slice(0, 120))}</i>` : ''}${s.telegramFileId ? '\n  📎 fayl' : ''}`);
  const buttons = subs.slice(0, 8).map((s) => [Markup.button.callback(`✅ ${s.student.fullName.split(' ')[0]}`, `hw:ok:${s.homeworkId}:${s.studentId}`), Markup.button.callback(`🔁 ${s.student.fullName.split(' ')[0]}`, `hw:rev:${s.homeworkId}:${s.studentId}`)]);
  buttons.push([Markup.button.callback('⬅️ Guruh', `grp:open:${groupId}`)]);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

export async function reviewHomework(ctx: BotContext, homeworkId: string, studentId: string, status: 'ACCEPTED' | 'REVISION') {
  const h = await prisma.homework.findUnique({ where: { id: homeworkId }, include: { subject: true } });
  if (!h || !(await ownsGroup(ctx, h.groupId))) return safeAnswerCb(ctx, "Ruxsat yo'q");
  await safeAnswerCb(ctx, status === 'ACCEPTED' ? '✅ Qabul qilindi' : '🔁 Qayta ishlashga yuborildi');
  await prisma.homeworkSubmission.upsert({ where: { homeworkId_studentId: { homeworkId, studentId } }, create: { homeworkId, studentId, status, reviewedAt: new Date(), reviewerId: ctx.dbUser!.id }, update: { status, reviewedAt: new Date(), reviewerId: ctx.dbUser!.id } });
  const aud = await studentAudience(studentId);
  void notifyMany([...aud.parents, ...(aud.student ? [aud.student] : [])], { type: 'HOMEWORK_REVIEWED', title: `${HW_STATUS_ICON[status]} Uy vazifasi — ${HW_STATUS_UZ[status]}`, body: `${aud.name}\n${h.subject.name}: ${h.title}` });
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  return ctx.reply(`${HW_STATUS_ICON[status]} ${esc(aud.name)} — ${HW_STATUS_UZ[status]}`, { parse_mode: 'HTML' });
}

/** Student submits from Telegram (text or document/photo) */
export async function askSubmit(ctx: BotContext, homeworkId: string, studentId: string) {
  await safeAnswerCb(ctx);
  await ctx.setFlow({ kind: 'hwsubmit', homeworkId, studentId } as { kind: 'hwsubmit'; homeworkId: string; studentId: string });
  return ctx.reply('📤 Javobingizni matn, rasm yoki fayl sifatida yuboring:', kb.cancelKeyboard);
}

export async function handleSubmit(ctx: BotContext, payload: { text?: string; fileId?: string; fileName?: string }) {
  const st = ctx.flow as { kind: 'hwsubmit'; homeworkId: string; studentId: string };
  const { submitHomework } = await import('../../modules/homework/homework.routes.js');
  await submitHomework(st.homeworkId, st.studentId, { content: payload.text ?? null, telegramFileId: payload.fileId ?? null, fileName: payload.fileName ?? null });
  await ctx.setFlow({ kind: 'none' });
  return ctx.reply("✅ Javobingiz yuborildi. O'qituvchi tekshirgach xabar beramiz.", kb.mainMenu(ctx.dbUser!.role));
}

/** Tutor: results overview per group */
export async function tutorResults(ctx: BotContext) {
  const groups = await myGroups(ctx);
  if (!groups.length) return ctx.reply("Guruh biriktirilmagan.");
  const from = dayjs().subtract(30, 'day').toDate();
  const lines = ['📊 <b>Guruh natijalari (30 kun)</b>', ''];
  for (const g of groups) {
    const [avg, att] = await Promise.all([
      prisma.grade.aggregate({ where: { groupId: g.id, date: { gte: from }, maxValue: 5 }, _avg: { value: true } }),
      prisma.attendance.groupBy({ by: ['status'], where: { groupId: g.id, date: { gte: from } }, _count: { _all: true } }),
    ]);
    const t = att.reduce((s, a) => s + a._count._all, 0);
    const p = att.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').reduce((s, a) => s + a._count._all, 0);
    lines.push(`<b>${esc(g.name)}</b> — ${g._count.students} o'quvchi`, `  📊 O'rtacha baho: ${avg._avg.value ? avg._avg.value.toFixed(2) : '—'} · 🟢 Davomat: ${t ? Math.round((p / t) * 100) + '%' : '—'}`);
  }
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...kb.groupPicker(groups, 'grp:open') });
}

/** Parents list for tutor: pick student → message */
export async function parentsMenu(ctx: BotContext) {
  const groups = await myGroups(ctx);
  if (!groups.length) return ctx.reply('Guruh biriktirilmagan.');
  if (groups.length === 1) return groupStudents(ctx, groups[0].id);
  return ctx.reply('💬 <b>Ota-onalar bilan aloqa</b>\n\nGuruhni tanlang:', { parse_mode: 'HTML', ...kb.groupPicker(groups, 'grp:students') });
}
