import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import dayjs from 'dayjs';
import type { Response } from 'express';
import { fileURLToPath } from 'node:url';

type Cell = string | number;
interface ExportData {
  header: string[];
  rows: Cell[][];
  survey: { title: string; description?: string | null; createdAt: Date };
  summary: { participants: number; assigned: number; completed: number; completionRate: number; avgRating: number | null };
}

const csvEscape = (v: Cell) => {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(header: string[], rows: Cell[][]) {
  // BOM so Excel opens UTF-8 (Uzbek/Cyrillic) correctly
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

export async function exportXlsx(res: Response, data: ExportData) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TutorSurvey';
  const summary = wb.addWorksheet('Xulosa');
  summary.columns = [{ width: 28 }, { width: 40 }];
  summary.addRows([
    ["So'rovnoma", data.survey.title],
    ['Yaratilgan', dayjs(data.survey.createdAt).format('DD.MM.YYYY')],
    ['Eksport sanasi', dayjs().format('DD.MM.YYYY HH:mm')],
    [],
    ['Ishtirokchilar', data.summary.participants],
    ['Tayinlangan', data.summary.assigned],
    ['Yakunlagan', data.summary.completed],
    ['Bajarilish foizi', `${data.summary.completionRate}%`],
    ["O'rtacha baho", data.summary.avgRating ?? '—'],
  ]);
  summary.getColumn(1).font = { bold: true };

  const ws = wb.addWorksheet('Javoblar');
  ws.addRow(data.header);
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  for (const r of data.rows) ws.addRow(r);
  ws.columns.forEach((c, i) => {
    c.width = i < 2 ? 14 : i < 5 ? 22 : 40;
    c.alignment = { wrapText: true, vertical: 'top' };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  await wb.xlsx.write(res);
  res.end();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.resolve(__dirname, '../../../assets/fonts');
const REG = path.join(fontDir, 'DejaVuSans.ttf');
const BOLD = path.join(fontDir, 'DejaVuSans-Bold.ttf');

export function exportPdf(res: Response, data: ExportData) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', info: { Title: data.survey.title, Author: 'TutorSurvey' } });
  doc.pipe(res);
  const hasFont = fs.existsSync(REG);
  if (hasFont) {
    doc.registerFont('R', REG);
    doc.registerFont('B', fs.existsSync(BOLD) ? BOLD : REG);
  }
  const R = hasFont ? 'R' : 'Helvetica';
  const B = hasFont ? 'B' : 'Helvetica-Bold';

  doc.font(B).fontSize(18).fillColor('#111827').text(data.survey.title);
  doc.moveDown(0.3);
  doc.font(R).fontSize(10).fillColor('#6B7280').text(`Eksport: ${dayjs().format('DD.MM.YYYY HH:mm')}  •  TutorSurvey`);
  doc.moveDown(1);

  const stats: Array<[string, string]> = [
    ['Ishtirokchilar', String(data.summary.participants)],
    ['Tayinlangan', String(data.summary.assigned)],
    ['Bajarilish', `${data.summary.completionRate}%`],
    ["O'rtacha baho", data.summary.avgRating?.toFixed(2) ?? '—'],
  ];
  const cardW = (doc.page.width - 80 - 30) / 4;
  let x = 40;
  const y = doc.y;
  for (const [label, val] of stats) {
    doc.roundedRect(x, y, cardW, 50, 8).fillAndStroke('#F3F4F6', '#E5E7EB');
    doc.fillColor('#6B7280').font(R).fontSize(8).text(label.toUpperCase(), x + 10, y + 10, { width: cardW - 20 });
    doc.fillColor('#111827').font(B).fontSize(16).text(val, x + 10, y + 24, { width: cardW - 20 });
    x += cardW + 10;
  }
  doc.y = y + 70;
  doc.x = 40;

  doc.font(B).fontSize(12).fillColor('#111827').text('Javoblar');
  doc.moveDown(0.5);
  const qHeaders = data.header.slice(5);
  data.rows.forEach((row, idx) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.roundedRect(40, doc.y, doc.page.width - 80, 18, 4).fill('#EFF6FF');
    doc.fillColor('#1D4ED8').font(B).fontSize(9).text(`#${row[0]}  ${row[2]}  •  ${row[3]}  •  ${row[4]}  •  ${row[1]}`, 48, doc.y + 5);
    doc.moveDown(0.9);
    qHeaders.forEach((qh, qi) => {
      const val = row[5 + qi];
      if (val === '' || val === undefined) return;
      if (doc.y > doc.page.height - 80) doc.addPage();
      doc.font(R).fontSize(8.5).fillColor('#6B7280').text(qh, 48, doc.y, { width: doc.page.width - 96 });
      doc.font(R).fontSize(10).fillColor('#111827').text(String(val), 48, doc.y, { width: doc.page.width - 96 });
      doc.moveDown(0.4);
    });
    doc.moveDown(0.6);
    void idx;
  });
  if (data.rows.length === 0) doc.font(R).fontSize(10).fillColor('#6B7280').text("Hozircha javoblar yo'q");
  doc.end();
}
