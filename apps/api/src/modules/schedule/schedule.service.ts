import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import type { Weekday } from '../../generated/prisma/enums.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.resolve(__dirname, '../../../assets/fonts');
const REG = path.join(fontDir, 'DejaVuSans.ttf');
const BOLD = path.join(fontDir, 'DejaVuSans-Bold.ttf');
const LOGO = path.resolve(__dirname, '../../../assets/logo.png');

export const WEEKDAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const DAY_UZ: Record<Weekday, string> = { MON: 'Dushanba', TUE: 'Seshanba', WED: 'Chorshanba', THU: 'Payshanba', FRI: 'Juma', SAT: 'Shanba', SUN: 'Yakshanba' };

export async function timetableFor(groupId: string) {
  const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId }, include: { branch: { select: { name: true } }, tutor: { select: { fullName: true } } } });
  const lessons = await prisma.lesson.findMany({
    where: { groupId },
    include: { subject: { select: { name: true, color: true } }, teacher: { select: { fullName: true } }, room: { select: { name: true } } },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  });
  return { group, lessons };
}

export type Timetable = Awaited<ReturnType<typeof timetableFor>>;

/** Telegram text rendering of a timetable (HTML). */
export function timetableText(t: Timetable, day?: Weekday) {
  const days = day ? [day] : WEEKDAYS;
  const lines: string[] = [`<b>📅 ${t.group.name} — dars jadvali</b>`];
  let any = false;
  for (const d of days) {
    const ls = t.lessons.filter((l) => l.weekday === d);
    if (!ls.length) continue;
    any = true;
    lines.push('', `<b>${DAY_UZ[d]}</b>`);
    for (const l of ls) lines.push(`${l.startTime}–${l.endTime}  ${l.subject.name}${l.teacher ? ` · ${l.teacher.fullName}` : ''}${l.room ? ` · ${l.room.name}-xona` : ''}`);
  }
  if (!any) lines.push('', 'Jadval hali kiritilmagan.');
  return lines.join('\n');
}

export function renderSchedulePdf(res: Response, t: Timetable, subtitle = '') {
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape', info: { Title: `Dars jadvali — ${t.group.name}`, Author: 'TARGET INTERNATIONAL SCHOOL' } });
  doc.pipe(res);
  const hasFont = fs.existsSync(REG);
  if (hasFont) {
    doc.registerFont('R', REG);
    doc.registerFont('B', fs.existsSync(BOLD) ? BOLD : REG);
  }
  const R = hasFont ? 'R' : 'Helvetica';
  const B = hasFont ? 'B' : 'Helvetica-Bold';

  // header
  if (fs.existsSync(LOGO)) {
    try { doc.image(LOGO, 36, 28, { height: 34 }); } catch { /* ignore */ }
  }
  doc.font(B).fontSize(16).fillColor('#0f172a').text('TARGET INTERNATIONAL SCHOOL', 200, 30, { align: 'right' });
  doc.font(R).fontSize(10).fillColor('#64748b').text(t.group.branch.name, 200, 50, { align: 'right' });
  doc.moveDown(2);
  doc.font(B).fontSize(20).fillColor('#e11d48').text(`Dars jadvali — ${t.group.name}`, 36, 80);
  if (subtitle) doc.font(R).fontSize(11).fillColor('#334155').text(subtitle, 36, 106);
  if (t.group.tutor) doc.font(R).fontSize(10).fillColor('#64748b').text(`Tutor: ${t.group.tutor.fullName}`, 36, subtitle ? 122 : 106);

  // grid: columns = weekdays with lessons (at least MON..SAT)
  const days = WEEKDAYS.filter((d) => d !== 'SUN' || t.lessons.some((l) => l.weekday === 'SUN'));
  const left = 36, top = 145, width = doc.page.width - 72;
  const colW = width / days.length;
  const maxRows = Math.max(1, ...days.map((d) => t.lessons.filter((l) => l.weekday === d).length));
  const rowH = Math.min(58, (doc.page.height - top - 60) / (maxRows + 1));

  days.forEach((d, i) => {
    const x = left + i * colW;
    doc.rect(x, top, colW, 26).fill('#0f172a');
    doc.font(B).fontSize(11).fillColor('#ffffff').text(DAY_UZ[d], x, top + 7, { width: colW, align: 'center' });
  });
  for (let r = 0; r < maxRows; r++) {
    const y = top + 26 + r * rowH;
    days.forEach((d, i) => {
      const x = left + i * colW;
      const l = t.lessons.filter((x) => x.weekday === d)[r];
      doc.rect(x, y, colW, rowH).strokeColor('#e2e8f0').lineWidth(0.8).stroke();
      if (!l) return;
      const accent = l.subject.color ?? '#e11d48';
      doc.rect(x + 4, y + 6, 3, rowH - 12).fill(accent);
      doc.font(B).fontSize(10).fillColor('#0f172a').text(l.subject.name, x + 12, y + 7, { width: colW - 16, ellipsis: true });
      doc.font(R).fontSize(8.5).fillColor('#475569').text(`${l.startTime} – ${l.endTime}`, x + 12, y + 21, { width: colW - 16 });
      const meta = [l.teacher?.fullName, l.room ? `${l.room.name}-xona` : null].filter(Boolean).join(' · ');
      if (meta) doc.font(R).fontSize(8).fillColor('#64748b').text(meta, x + 12, y + 33, { width: colW - 16, ellipsis: true });
    });
  }
  doc.font(R).fontSize(8).fillColor('#94a3b8').text(`Yaratildi: ${new Date().toLocaleString('uz-UZ')} · target-school`, left, doc.page.height - 40, { width, align: 'right' });
  doc.end();
}
