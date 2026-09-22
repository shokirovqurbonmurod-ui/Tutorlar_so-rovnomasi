import dayjs from 'dayjs';
import { Markup } from 'telegraf';
import { prisma } from '../../lib/prisma.js';
import type { BotContext, DormLogFlowState } from '../context.js';
import * as kb from '../keyboards/index.js';
import { esc, safeAnswerCb } from '../utils.js';
import { studentAudience } from '../../lib/scope.js';
import { notifyMany } from '../../modules/notifications/notifications.service.js';
import { DORM_LOG_UZ } from '../../modules/dorm/dorm.routes.js';
import type { DormLogType } from '../../generated/prisma/enums.js';
import { audit } from '../../lib/audit.js';

/** Dormitory commandant flows: overview, rooms, boarders, evening roll-call, incidents, parent messages. */

const LOG_ICON: Record<DormLogType, string> = { CHECK_IN: '🟢', CHECK_OUT: '🚪', LATE: '🟡', ABSENT: '🔴', INCIDENT: '⚠️', ROOM_ISSUE: '🛠', NOTE: '📝' };

/** Dormitories this user manages (manager) or all in branch for admins */
async function myDorms(ctx: BotContext) {
  const u = ctx.dbUser!;
  const where = u.role === 'DORM_MANAGER' ? { OR: [{ managerId: u.id }, ...(u.branchId ? [{ branchId: u.branchId }] : [])] } : u.branchId && !['SUPER_ADMIN', 'CEO'].includes(u.role) ? { branchId: u.branchId } : {};
  return prisma.dormitory.findMany({
    where,
    include: {
      buildings: {
        include: {
          rooms: {
            include: {
              beds: {
                include: {
                  assignment: {
                    include: {
                      student: { select: { id: true, fullName: true, group: { select: { name: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function dormHome(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const dorms = await myDorms(ctx);
  if (!dorms.length) return ctx.reply("🏠 Sizga yotoqxona biriktirilmagan. Administrator bilan bog'laning.");
  const lines = ['🏠 <b>Yotoqxona</b>', ''];
  const today = dayjs().startOf('day').toDate();
  for (const d of dorms) {
    const rooms = d.buildings.flatMap((b) => b.rooms);
    const beds = rooms.flatMap((r) => r.beds);
    const occupied = beds.filter((b) => b.assignment && !b.assignment.checkOutAt).length;
    const [late, absent, incidents] = await Promise.all([
      prisma.dormLog.count({ where: { type: 'LATE', occurredAt: { gte: today }, room: { building: { dormitoryId: d.id } } } }),
      prisma.dormLog.count({ where: { type: 'ABSENT', occurredAt: { gte: today }, room: { building: { dormitoryId: d.id } } } }),
      prisma.dormLog.count({ where: { type: { in: ['INCIDENT', 'ROOM_ISSUE'] }, occurredAt: { gte: dayjs().subtract(7, 'day').toDate() }, room: { building: { dormitoryId: d.id } } } }),
    ]);
    lines.push(`<b>${esc(d.name)}</b>`, `🏢 Binolar: ${d.buildings.length} · 🚪 Xonalar: ${rooms.length} · 🛏 O'rinlar: ${occupied}/${beds.length}`, `Bugun: 🟡 kechikkan ${late} · 🔴 kelmagan ${absent} · ⚠️ incident (7 kun): ${incidents}`, '');
  }
  return ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback("👨‍🎓 O'quvchilar", 'dorm:students'), Markup.button.callback('🛏 Xonalar', 'dorm:rooms')],
      [Markup.button.callback("🟢 Kechki yo'qlama", 'dorm:rollcall'), Markup.button.callback('⚠️ Incident yozish', 'dorm:log')],
      [Markup.button.callback("📋 So'nggi yozuvlar", 'dorm:logs')],
    ]),
  });
}

export async function dormRooms(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const dorms = await myDorms(ctx);
  const lines = ['🛏 <b>Xonalar</b>'];
  for (const d of dorms) for (const b of d.buildings) {
    lines.push('', `<b>${esc(d.name)} · ${esc(b.name)}</b>`);
    for (const r of b.rooms.sort((a, z) => a.floor - z.floor || a.number.localeCompare(z.number))) {
      const occ = r.beds.filter((x) => x.assignment && !x.assignment.checkOutAt);
      lines.push(`${r.condition === 'GOOD' ? '🟢' : r.condition === 'CLOSED' ? '⛔️' : '🛠'} ${r.floor}-qavat, ${esc(r.number)}-xona · ${occ.length}/${r.beds.length}${occ.length ? ` — ${occ.map((x) => esc(x.assignment!.student.fullName.split(' ')[0])).join(', ')}` : ''}`);
    }
  }
  if (lines.length === 1) lines.push('', 'Xonalar hali kiritilmagan.');
  return ctx.reply(lines.join('\n').slice(0, 4000), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Yotoqxona', 'dorm:home')]]) });
}

async function boarders(ctx: BotContext) {
  const dorms = await myDorms(ctx);
  return dorms.flatMap((d) => d.buildings.flatMap((b) => b.rooms.flatMap((r) => r.beds.filter((x) => x.assignment && !x.assignment.checkOutAt).map((x) => ({ id: x.assignment!.student.id, name: x.assignment!.student.fullName, group: x.assignment!.student.group?.name ?? '', room: `${b.name} ${r.number}/${x.label}` }))))).sort((a, z) => a.name.localeCompare(z.name));
}

export async function dormStudents(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const list = await boarders(ctx);
  if (!list.length) return ctx.reply("Yotoqxonada joylashtirilgan o'quvchilar yo'q.");
  const lines = [`👨‍🎓 <b>Yotoqxona o'quvchilari (${list.length})</b>`, ''];
  list.forEach((s, i) => lines.push(`${i + 1}. <b>${esc(s.name)}</b> ${s.group ? `· ${esc(s.group)} ` : ''}· 🛏 ${esc(s.room)}`));
  const buttons = list.slice(0, 25).map((s) => [Markup.button.callback(`📝 ${s.name}`, `dorm:stu:${s.id}`)]);
  buttons.push([Markup.button.callback('⬅️ Yotoqxona', 'dorm:home')]);
  return ctx.reply(lines.join('\n').slice(0, 4000), { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

export async function dormStudentCard(ctx: BotContext, studentId: string) {
  await safeAnswerCb(ctx);
  const asg = await prisma.dormAssignment.findUnique({ where: { studentId }, include: { student: { include: { group: true, parents: { include: { parent: { include: { user: { select: { fullName: true, phone: true } } } } } } } }, bed: { include: { room: { include: { building: { include: { dormitory: true } } } } } } } });
  if (!asg) return ctx.reply("O'quvchi yotoqxonaga joylashtirilmagan.");
  const logs = await prisma.dormLog.findMany({ where: { studentId }, orderBy: { occurredAt: 'desc' }, take: 6 });
  const s = asg.student;
  const lines = [`👤 <b>${esc(s.fullName)}</b>${s.group ? ` · ${esc(s.group.name)}` : ''}`, `🏠 ${esc(asg.bed.room.building.dormitory.name)} · ${esc(asg.bed.room.building.name)} · ${asg.bed.room.floor}-qavat · ${esc(asg.bed.room.number)}-xona · ${esc(asg.bed.label)}-o'rin`, `📅 Joylashgan: ${dayjs(asg.checkInAt).format('DD.MM.YYYY')}`];
  if (s.parents.length) lines.push('', '<b>Ota-onalar</b>', ...s.parents.map((p) => `• ${esc(p.parent.user.fullName)}${p.parent.user.phone ? ` · ${esc(p.parent.user.phone)}` : ''}`));
  if (logs.length) lines.push('', "<b>So'nggi yozuvlar</b>", ...logs.map((l) => `${LOG_ICON[l.type]} ${dayjs(l.occurredAt).format('DD.MM HH:mm')} — ${esc(l.title)}`));
  return ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🟢 Kirdi', `dorm:quick:${studentId}:CHECK_IN`), Markup.button.callback('🚪 Chiqdi', `dorm:quick:${studentId}:CHECK_OUT`)],
      [Markup.button.callback('🟡 Kechikdi', `dorm:quick:${studentId}:LATE`), Markup.button.callback('🔴 Kelmadi', `dorm:quick:${studentId}:ABSENT`)],
      [Markup.button.callback('⚠️ Incident yozish', `dorm:log:${studentId}`), Markup.button.callback('✉️ Ota-onaga xabar', `stu:msg:${studentId}`)],
      [Markup.button.callback("⬅️ O'quvchilar", 'dorm:students')],
    ]),
  });
}

export async function quickLog(ctx: BotContext, studentId: string, type: DormLogType) {
  await safeAnswerCb(ctx, `${LOG_ICON[type]} ${DORM_LOG_UZ[type]}`);
  const asg = await prisma.dormAssignment.findUnique({ where: { studentId }, select: { bed: { select: { roomId: true } } } });
  const log = await prisma.dormLog.create({ data: { studentId, roomId: asg?.bed.roomId ?? null, type, severity: type === 'ABSENT' ? 'WARNING' : 'INFO', title: DORM_LOG_UZ[type], authorId: ctx.dbUser!.id } });
  let notified = 0;
  if (type === 'ABSENT' || type === 'LATE') {
    const aud = await studentAudience(studentId);
    notified = await notifyMany(aud.parents, { type: 'DORM_INCIDENT', title: `${LOG_ICON[type]} Yotoqxona — ${DORM_LOG_UZ[type]}`, body: `Farzandingiz ${aud.name} ${dayjs(log.occurredAt).format('DD.MM.YYYY HH:mm')} da yotoqxonaga ${type === 'ABSENT' ? 'kelmadi' : 'kechikib keldi'}.` });
    if (notified) await prisma.dormLog.update({ where: { id: log.id }, data: { notified: true } });
  }
  audit({ userId: ctx.dbUser!.id, action: 'dorm.log', entity: 'DormLog', entityId: log.id, source: 'telegram', meta: { type } });
  return ctx.reply(`✅ Qayd etildi: ${LOG_ICON[type]} ${DORM_LOG_UZ[type]}${notified ? ` · ota-onaga xabar yuborildi` : ''}`);
}

/** Evening roll-call: iterate boarders */
export async function startRollcall(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const list = await boarders(ctx);
  if (!list.length) return ctx.reply("Yotoqxonada o'quvchilar yo'q.");
  const dorms = await myDorms(ctx);
  await ctx.setFlow({ kind: 'attendance', groupId: `dorm:${dorms[0].id}`, date: dayjs().format('YYYY-MM-DD'), students: list.map((s) => ({ id: s.id, name: `${s.name} (${s.room})` })), index: 0, marks: {} });
  return askRoll(ctx);
}

async function askRoll(ctx: BotContext) {
  const st = ctx.flow;
  if (st.kind !== 'attendance') return;
  const s = st.students[st.index];
  return ctx.reply(`🌙 <b>Kechki yo'qlama</b> · ${Object.keys(st.marks).length}/${st.students.length}\n\n<b>${st.index + 1}. ${esc(s.name)}</b>`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🟢 Joyida', `dorm:roll:${s.id}:PRESENT`), Markup.button.callback('🟡 Kechikdi', `dorm:roll:${s.id}:LATE`), Markup.button.callback('🔴 Yo\'q', `dorm:roll:${s.id}:ABSENT`)],
      [Markup.button.callback("✅ Qolganlar joyida — yakunlash", 'dorm:rollfinish'), Markup.button.callback(kb.BTN.cancel, 'flow:cancel')],
    ]),
  });
}

export async function setRoll(ctx: BotContext, studentId: string, status: 'PRESENT' | 'LATE' | 'ABSENT') {
  const st = ctx.flow;
  if (st.kind !== 'attendance' || !st.groupId.startsWith('dorm:')) return safeAnswerCb(ctx, "Yo'qlama faol emas");
  await safeAnswerCb(ctx);
  st.marks[studentId] = status;
  st.index++;
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  if (st.index >= st.students.length) return finishRoll(ctx);
  await ctx.setFlow(st);
  return askRoll(ctx);
}

export async function finishRoll(ctx: BotContext) {
  const st = ctx.flow;
  if (st.kind !== 'attendance') return safeAnswerCb(ctx);
  await safeAnswerCb(ctx);
  const at = new Date();
  let notified = 0;
  const c = { PRESENT: 0, LATE: 0, ABSENT: 0 };
  for (const s of st.students) {
    const status = (st.marks[s.id] ?? 'PRESENT') as 'PRESENT' | 'LATE' | 'ABSENT';
    c[status]++;
    const type: DormLogType = status === 'PRESENT' ? 'CHECK_IN' : status;
    const asg = await prisma.dormAssignment.findUnique({ where: { studentId: s.id }, select: { bed: { select: { roomId: true } } } });
    await prisma.dormLog.create({ data: { studentId: s.id, roomId: asg?.bed.roomId ?? null, type, severity: status === 'ABSENT' ? 'WARNING' : 'INFO', title: `Kechki yo'qlama: ${status === 'PRESENT' ? 'joyida' : status === 'LATE' ? 'kechikdi' : 'kelmadi'}`, occurredAt: at, authorId: ctx.dbUser!.id, notified: status !== 'PRESENT' } });
    if (status !== 'PRESENT') {
      const aud = await studentAudience(s.id);
      notified += await notifyMany(aud.parents, { type: 'DORM_INCIDENT', title: `${status === 'ABSENT' ? '🔴' : '🟡'} Yotoqxona yo'qlamasi`, body: `Farzandingiz ${aud.name} ${dayjs(at).format('DD.MM.YYYY HH:mm')} kechki yo'qlamada ${status === 'ABSENT' ? "yotoqxonada bo'lmadi" : 'kechikib keldi'}.` });
    }
  }
  await ctx.setFlow({ kind: 'none' });
  audit({ userId: ctx.dbUser!.id, action: 'dorm.rollcall', source: 'telegram', meta: c });
  return ctx.reply(`✅ <b>Yo'qlama yakunlandi</b>\n\n🟢 Joyida: ${c.PRESENT}\n🟡 Kechikkan: ${c.LATE}\n🔴 Yo'q: ${c.ABSENT}\n\n📨 Ota-onalarga ${notified} ta xabar yuborildi.`, { parse_mode: 'HTML', ...kb.mainMenu(ctx.dbUser!.role) });
}

/** Incident flow: student → type → title */
export async function startIncident(ctx: BotContext, studentId?: string) {
  await safeAnswerCb(ctx);
  if (!studentId) {
    const list = await boarders(ctx);
    if (!list.length) return ctx.reply("Yotoqxonada o'quvchilar yo'q.");
    await ctx.setFlow({ kind: 'dormlog', step: 'student' });
    return ctx.reply("⚠️ <b>Incident</b>\n\nO'quvchini tanlang:", { parse_mode: 'HTML', ...Markup.inlineKeyboard([...list.slice(0, 30).map((s) => [Markup.button.callback(s.name, `dorm:log:${s.id}`)]), [Markup.button.callback('🏢 Umumiy (o\'quvchisiz)', 'dorm:log:-')]]) });
  }
  const s = studentId === '-' ? null : await prisma.student.findUnique({ where: { id: studentId }, select: { fullName: true } });
  await ctx.setFlow({ kind: 'dormlog', step: 'type', studentId: s ? studentId : undefined, studentName: s?.fullName });
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  const types: DormLogType[] = ['INCIDENT', 'ROOM_ISSUE', 'LATE', 'ABSENT', 'NOTE'];
  return ctx.reply(`⚠️ ${s ? `<b>${esc(s.fullName)}</b>\n` : ''}Turini tanlang:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(types.map((t) => [Markup.button.callback(`${LOG_ICON[t]} ${DORM_LOG_UZ[t]}`, `dorm:type:${t}`)])) });
}

export async function incidentType(ctx: BotContext, type: string) {
  await safeAnswerCb(ctx);
  const st = ctx.flow as DormLogFlowState;
  if (st.kind !== 'dormlog') return;
  await ctx.setFlow({ ...st, type, step: 'title' });
  await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  return ctx.reply('✏️ Nima bo\'lganini qisqacha yozing:', kb.cancelKeyboard);
}

export async function handleIncidentText(ctx: BotContext, text: string) {
  const st = ctx.flow as DormLogFlowState;
  if (st.step !== 'title') return ctx.reply('👇 Tugmalardan foydalaning.');
  const type = (st.type ?? 'INCIDENT') as DormLogType;
  const severity = type === 'INCIDENT' || type === 'ABSENT' ? 'WARNING' : 'INFO';
  const asg = st.studentId ? await prisma.dormAssignment.findUnique({ where: { studentId: st.studentId }, select: { bed: { select: { roomId: true } } } }) : null;
  const log = await prisma.dormLog.create({ data: { studentId: st.studentId ?? null, roomId: asg?.bed.roomId ?? null, type, severity, title: text.slice(0, 200), body: text.length > 200 ? text : null, authorId: ctx.dbUser!.id } });
  let notified = 0;
  if (st.studentId) {
    const aud = await studentAudience(st.studentId);
    notified = await notifyMany(aud.parents, { type: 'DORM_INCIDENT', title: `${LOG_ICON[type]} Yotoqxona — ${DORM_LOG_UZ[type]}`, body: `${aud.name}\n${text}\n\n🕒 ${dayjs(log.occurredAt).format('DD.MM.YYYY HH:mm')}\nKomendant: ${ctx.dbUser!.fullName}` });
    if (notified) await prisma.dormLog.update({ where: { id: log.id }, data: { notified: true } });
  }
  if (type === 'INCIDENT') {
    const admins = await prisma.user.findMany({ where: { role: { key: { in: ['SUPER_ADMIN', 'DIRECTOR'] } }, status: 'ACTIVE', ...(ctx.dbUser!.branchId ? { OR: [{ branchId: ctx.dbUser!.branchId }, { role: { key: 'SUPER_ADMIN' } }] } : {}) }, select: { id: true } });
    void notifyMany(admins.map((u) => u.id), { type: 'DORM_INCIDENT', title: '⚠️ Yotoqxona incidenti', body: `${st.studentName ? `${st.studentName}\n` : ''}${text}\n\nKomendant: ${ctx.dbUser!.fullName}` });
  }
  await ctx.setFlow({ kind: 'none' });
  audit({ userId: ctx.dbUser!.id, action: 'dorm.log', entity: 'DormLog', entityId: log.id, source: 'telegram', meta: { type } });
  return ctx.reply(`✅ Yozuv saqlandi.${notified ? ' Ota-onaga xabar yuborildi.' : ''}`, kb.mainMenu(ctx.dbUser!.role));
}

export async function recentLogs(ctx: BotContext) {
  await safeAnswerCb(ctx);
  const dorms = await myDorms(ctx);
  const logs = await prisma.dormLog.findMany({ where: { OR: [{ room: { building: { dormitoryId: { in: dorms.map((d) => d.id) } } } }, { authorId: ctx.dbUser!.id }] }, include: { student: { select: { fullName: true } }, room: { select: { number: true } } }, orderBy: { occurredAt: 'desc' }, take: 20 });
  if (!logs.length) return ctx.reply("Yozuvlar yo'q.");
  const lines = ["📋 <b>So'nggi yozuvlar</b>", '', ...logs.map((l) => `${LOG_ICON[l.type]} ${dayjs(l.occurredAt).format('DD.MM HH:mm')} ${l.student ? `<b>${esc(l.student.fullName)}</b> ` : ''}${l.room ? `(${esc(l.room.number)}) ` : ''}— ${esc(l.title)}`)];
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Yotoqxona', 'dorm:home')]]) });
}

/** Incidents only (last 14 days) */
export async function incidents(ctx: BotContext) {
  const dorms = await myDorms(ctx);
  const logs = await prisma.dormLog.findMany({ where: { type: { in: ['INCIDENT', 'ROOM_ISSUE'] }, occurredAt: { gte: dayjs().subtract(14, 'day').toDate() }, OR: [{ room: { building: { dormitoryId: { in: dorms.map((d) => d.id) } } } }, { authorId: ctx.dbUser!.id }] }, include: { student: { select: { fullName: true } } }, orderBy: { occurredAt: 'desc' }, take: 20 });
  const lines = ['⚠️ <b>Incidentlar (14 kun)</b>', ''];
  if (!logs.length) lines.push("Incidentlar yo'q 👍");
  for (const l of logs) lines.push(`${LOG_ICON[l.type]} ${dayjs(l.occurredAt).format('DD.MM HH:mm')} ${l.student ? `<b>${esc(l.student.fullName)}</b> ` : ''}— ${esc(l.title)}${l.body ? `\n   <i>${esc(l.body.slice(0, 150))}</i>` : ''}`);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('➕ Yangi incident', 'dorm:log')]]) });
}
