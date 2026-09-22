/**
 * Demo seed — creates roles, permissions, branches, ~30 employees, surveys with
 * 90 days of realistic responses, reports, announcements, tasks, KPI results.
 *
 *   npm run db:seed          (idempotent for roles/permissions/metrics;
 *                             demo data is re-created only when DB has no users)
 *   SEED_FORCE=true npm run db:seed   → wipe & re-seed demo data
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { QuestionType, ReportStatus, ReportType, RoleKey } from '../src/generated/prisma/enums.js';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLE_LABELS } from '../src/lib/permissions.js';
import { KPI_DEFAULTS, computeKpi } from '../src/modules/kpi/kpi.service.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// deterministic pseudo-random so demo looks the same on every machine
let seed = 20240917;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p: number) => rnd() < p;

const PASSWORDS = {
  SUPER_ADMIN: 'Admin123!',
  DIRECTOR: 'Director123!',
  CEO: 'Ceo123!',
  HR_ADMIN: 'Hr123!',
  TUTOR: 'Tutor123!',
  TEACHER: 'Teacher123!',
} as const;

const FIRST = ['Aziz', 'Dilnoza', 'Jasur', 'Malika', 'Sardor', 'Nilufar', 'Bobur', 'Gulnora', 'Otabek', 'Zarina', 'Farrux', 'Madina', 'Shaxzod', 'Kamola', 'Umid', 'Sevara', 'Javohir', 'Nodira', 'Doston', 'Laylo', 'Rustam', 'Mohira', 'Islom', 'Dildora', 'Temur', 'Shahnoza', 'Akmal', 'Feruza', 'Bekzod', 'Nargiza'];
const LAST = ['Karimov', 'Rahimova', 'Toshmatov', 'Yusupova', 'Abdullayev', 'Ismoilova', 'Xolmatov', 'Saidova', 'Ergashev', 'Mirzayeva', 'Qodirov', 'Nazarova', 'Tursunov', 'Alimova', 'Sobirov', 'Usmonova', 'Rasulov', 'Hamidova', 'Mahmudov', 'Jalilova'];
const SUBJECTS = ['Ingliz tili', 'Matematika', 'IELTS', 'Rus tili', 'Fizika', 'Kimyo', 'Biologiya', 'Informatika', 'Ona tili', 'Tarix'];

async function ensureCore() {
  // roles
  for (const key of Object.keys(ROLE_LABELS) as RoleKey[]) {
    await prisma.role.upsert({ where: { key }, create: { key, name: ROLE_LABELS[key] }, update: { name: ROLE_LABELS[key] } });
  }
  // permissions
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, group: key.split('.')[0], description }, update: { description } });
  }
  const roles = await prisma.role.findMany();
  const perms = await prisma.permission.findMany();
  for (const r of roles) {
    const keys = r.key === 'SUPER_ADMIN' ? Object.keys(PERMISSIONS) : ROLE_PERMISSIONS[r.key];
    await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
    await prisma.rolePermission.createMany({ data: perms.filter((p) => keys.includes(p.key)).map((p) => ({ roleId: r.id, permissionId: p.id })), skipDuplicates: true });
  }
  // KPI metrics
  for (const m of KPI_DEFAULTS) {
    await prisma.kpiMetric.upsert({ where: { key: m.key }, create: { ...m, appliesTo: m.key === 'TUTOR_ACTIVITY' ? ['TUTOR'] : m.key === 'TEACHER_ACTIVITY' ? ['TEACHER'] : ['TUTOR', 'TEACHER'] }, update: { name: m.name, description: m.description } });
  }
  console.log('✔ Roles, permissions, KPI metrics ready');
}

async function wipeDemo() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(), prisma.notification.deleteMany(), prisma.kpiResult.deleteMany(), prisma.task.deleteMany(),
    prisma.announcementRead.deleteMany(), prisma.announcement.deleteMany(), prisma.report.deleteMany(),
    prisma.surveyAnswer.deleteMany(), prisma.surveyResponse.deleteMany(), prisma.surveyAssignment.deleteMany(), prisma.survey.deleteMany(),
    prisma.group.deleteMany(), prisma.refreshToken.deleteMany(), prisma.telegramLinkCode.deleteMany(), prisma.telegramSession.deleteMany(),
    prisma.user.deleteMany(), prisma.department.deleteMany(), prisma.branch.deleteMany(), prisma.setting.deleteMany(),
  ]);
  console.log('✔ Demo data wiped');
}

async function seedDemo() {
  const roleId = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.key, r.id])) as Record<RoleKey, string>;
  const hash = async (pw: string) => bcrypt.hash(pw, 10);
  const daysAgo = (n: number, h = 10) => dayjs().subtract(n, 'day').hour(h).minute(int(0, 59)).toDate();

  // ── Branches ──
  const branchData = [
    { name: 'Chilonzor filiali', code: 'CHL', city: 'Toshkent', address: "Chilonzor tumani, Bunyodkor ko'chasi 12", phone: '+998 71 200 10 01', studentCount: 420 },
    { name: 'Yunusobod filiali', code: 'YUN', city: 'Toshkent', address: "Yunusobod tumani, Amir Temur ko'chasi 88", phone: '+998 71 200 10 02', studentCount: 365 },
    { name: 'Samarqand filiali', code: 'SAM', city: 'Samarqand', address: "Registon ko'chasi 5", phone: '+998 66 233 10 03', studentCount: 280 },
  ];
  const branches = [];
  for (const b of branchData) branches.push(await prisma.branch.create({ data: b }));

  // departments
  const deptNames = ['Akademik bo\'lim', 'Tutorlik xizmati', 'Sifat nazorati', 'HR bo\'limi'];
  const depts: Record<string, string> = {};
  for (const b of branches) for (const n of deptNames) depts[`${b.id}:${n}`] = (await prisma.department.create({ data: { name: n, branchId: b.id } })).id;

  // ── Management users ──
  const superAdmin = await prisma.user.create({ data: { fullName: 'Sherzod Nurmatov', email: 'admin@tutorsurvey.uz', phone: '+998901000001', passwordHash: await hash(PASSWORDS.SUPER_ADMIN), roleId: roleId.SUPER_ADMIN, position: 'Tizim administratori', joinDate: daysAgo(400), lastActivityAt: new Date(), lastLoginAt: daysAgo(0) } });
  const ceo = await prisma.user.create({ data: { fullName: 'Akbar Yuldashev', email: 'ceo@tutorsurvey.uz', phone: '+998901000002', passwordHash: await hash(PASSWORDS.CEO), roleId: roleId.CEO, position: 'Bosh direktor (CEO)', joinDate: daysAgo(380), lastActivityAt: daysAgo(0), lastLoginAt: daysAgo(1) } });
  const hr = await prisma.user.create({ data: { fullName: 'Gulchehra Sattorova', email: 'hr@tutorsurvey.uz', phone: '+998901000003', passwordHash: await hash(PASSWORDS.HR_ADMIN), roleId: roleId.HR_ADMIN, position: 'HR menejer', branchId: branches[0].id, departmentId: depts[`${branches[0].id}:HR bo'limi`], joinDate: daysAgo(300), lastActivityAt: daysAgo(0), lastLoginAt: daysAgo(0) } });
  const directors = [];
  const dirNames = ['Dilshod Rahmonov', 'Nargiza Tursunova', 'Bahodir Ergashev'];
  for (let i = 0; i < branches.length; i++) {
    const d = await prisma.user.create({ data: { fullName: dirNames[i], email: i === 0 ? 'director@tutorsurvey.uz' : `director.${branches[i].code.toLowerCase()}@tutorsurvey.uz`, phone: `+99890100001${i}`, passwordHash: await hash(PASSWORDS.DIRECTOR), roleId: roleId.DIRECTOR, position: 'Filial direktori', branchId: branches[i].id, joinDate: daysAgo(350 - i * 20), lastActivityAt: daysAgo(int(0, 2)), lastLoginAt: daysAgo(int(0, 3)) } });
    directors.push(d);
    await prisma.branch.update({ where: { id: branches[i].id }, data: { directorId: d.id, ceoId: ceo.id } });
  }

  // ── Tutors & teachers ──
  const staff: Array<{ id: string; role: RoleKey; branchId: string; fullName: string }> = [];
  const usedNames = new Set<string>();
  const nextName = () => {
    let n = '';
    do n = `${pick(FIRST)} ${pick(LAST)}`;
    while (usedNames.has(n));
    usedNames.add(n);
    return n;
  };
  let phoneCounter = 200;
  let tgCounter = 700000001;
  for (const [bi, b] of branches.entries()) {
    const nTutors = [5, 4, 3][bi];
    const nTeachers = [6, 5, 4][bi];
    for (let i = 0; i < nTutors + nTeachers; i++) {
      const isTutor = i < nTutors;
      const fullName = nextName();
      const demo = bi === 0 && i === 0 ? 'tutor@tutorsurvey.uz' : bi === 0 && i === nTutors ? 'teacher@tutorsurvey.uz' : null;
      const status = chance(0.9) ? 'ACTIVE' : pick(['INACTIVE', 'PENDING'] as const);
      const u = await prisma.user.create({
        data: {
          fullName,
          email: demo,
          phone: `+99890${String(1000000 + phoneCounter++).slice(-7)}`,
          passwordHash: demo ? await hash(isTutor ? PASSWORDS.TUTOR : PASSWORDS.TEACHER) : null,
          roleId: isTutor ? roleId.TUTOR : roleId.TEACHER,
          branchId: b.id,
          departmentId: depts[`${b.id}:${isTutor ? 'Tutorlik xizmati' : "Akademik bo'lim"}`],
          position: isTutor ? pick(['Tutor', 'Katta tutor', 'Tutor-mentor']) : `${pick(SUBJECTS)} o'qituvchisi`,
          status,
          telegramId: chance(0.85) ? BigInt(tgCounter++) : null,
          telegramUsername: chance(0.7) ? fullName.toLowerCase().replace(/[^a-z]/g, '').slice(0, 6) + int(10, 99) : null,
          joinDate: daysAgo(int(30, 500)),
          lastActivityAt: status === 'ACTIVE' ? daysAgo(int(0, 6), int(8, 21)) : daysAgo(int(20, 60)),
        },
      });
      staff.push({ id: u.id, role: isTutor ? 'TUTOR' : 'TEACHER', branchId: b.id, fullName });
    }
    // groups
    const tutors = staff.filter((s) => s.branchId === b.id && s.role === 'TUTOR');
    const teachers = staff.filter((s) => s.branchId === b.id && s.role === 'TEACHER');
    for (let g = 0; g < 8; g++) {
      const subj = pick(SUBJECTS);
      await prisma.group.create({ data: { name: `${subj.split(' ')[0].slice(0, 4).toUpperCase()}-${bi + 1}${g + 1}`, subject: subj, branchId: b.id, tutorId: pick(tutors).id, teacherId: pick(teachers).id, studentCount: int(8, 18) } });
    }
  }
  const active = staff.filter(Boolean);
  console.log(`✔ ${branches.length} branches, ${staff.length + 6} users`);

  // ── Surveys ──
  type Q = { type: QuestionType; text: string; hint?: string; isRequired?: boolean; options?: string[] };
  const weeklyTutorQs: Q[] = [
    { type: 'RATING', text: "Ushbu hafta darslar qanday o'tdi?", hint: '1 — juda yomon, 5 — a\'lo' },
    { type: 'LONG_TEXT', text: "O'quvchilar bilan qanday muammolar bo'ldi?", isRequired: false },
    { type: 'TEXT', text: "Qaysi guruhga qo'shimcha yordam kerak?", isRequired: false },
    { type: 'LONG_TEXT', text: 'Ushbu hafta qanday natijaga erishdingiz?' },
    { type: 'MULTIPLE_CHOICE', text: 'Maktab boshqaruvidan qanday yordam kerak?', options: ["O'quv materiallari", 'Texnik jihozlar', 'Ota-onalar bilan aloqa', "Qo'shimcha trening", 'Kerak emas'] },
    { type: 'LONG_TEXT', text: 'Takliflaringiz?', isRequired: false },
  ];
  const teacherLessonQs: Q[] = [
    { type: 'RATING', text: "Bu haftadagi darslarning sifatini baholang" },
    { type: 'NUMBER', text: "Nechta dars o'tdingiz?" },
    { type: 'SINGLE_CHOICE', text: "O'quvchilar davomati qanday?", options: ['90%+', '75-90%', '50-75%', '50% dan kam'] },
    { type: 'YES_NO', text: "O'quv rejasidan orqada qolganmisiz?" },
    { type: 'LONG_TEXT', text: "Qiyinchilik tug'dirgan mavzular", isRequired: false },
  ];
  const satisfactionQs: Q[] = [
    { type: 'RATING', text: 'Ish sharoitidan qanchalik mamnunsiz?' },
    { type: 'RATING', text: 'Rahbariyat bilan muloqotni baholang' },
    { type: 'RATING', text: 'Ish yuklamasi qanchalik maqbul?' },
    { type: 'YES_NO', text: 'Kelgusi yilda ham biz bilan ishlashni rejalashtiryapsizmi?' },
    { type: 'SINGLE_CHOICE', text: 'Eng katta motivatsiya manbai?', options: ['Maosh', 'Jamoa', "O'quvchilar natijasi", "O'sish imkoniyati", 'Boshqa'] },
    { type: 'LONG_TEXT', text: 'Nimani o\'zgartirgan bo\'lardingiz?', isRequired: false },
  ];
  const monthlyQs: Q[] = [
    { type: 'RATING', text: 'Oylik natijalaringizni baholang' },
    { type: 'NUMBER', text: 'Nechta o\'quvchi bilan individual ishladingiz?' },
    { type: 'MULTIPLE_CHOICE', text: 'Qaysi yo\'nalishlarda o\'sish bo\'ldi?', options: ['Davomat', "O'zlashtirish", 'Intizom', 'Ota-onalar bilan aloqa', 'Imtihon natijalari'] },
    { type: 'LONG_TEXT', text: 'Keyingi oy uchun rejalaringiz' },
  ];

  const makeSurvey = async (o: { title: string; description: string; qs: Q[]; audience: 'ALL' | 'TUTORS' | 'TEACHERS' | 'BRANCH'; branchId?: string; sentDaysAgo: number | null; status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'; deadlineDays?: number; anonymous?: boolean; createdBy?: string; scheduledIn?: number }) => {
    const sentAt = o.sentDaysAgo === null ? null : daysAgo(o.sentDaysAgo, 9);
    return prisma.survey.create({
      data: {
        title: o.title,
        description: o.description,
        audience: o.audience,
        branchId: o.branchId ?? null,
        isAnonymous: o.anonymous ?? false,
        status: o.status,
        sentAt,
        scheduledAt: o.scheduledIn ? dayjs().add(o.scheduledIn, 'day').hour(9).minute(0).toDate() : null,
        deadline: sentAt ? dayjs(sentAt).add(o.deadlineDays ?? 3, 'day').hour(21).minute(0).toDate() : o.scheduledIn ? dayjs().add(o.scheduledIn + 3, 'day').hour(21).toDate() : null,
        closedAt: o.status === 'COMPLETED' || o.status === 'ARCHIVED' ? dayjs(sentAt ?? new Date()).add(o.deadlineDays ?? 3, 'day').toDate() : null,
        createdById: o.createdBy ?? directors[0].id,
        createdAt: sentAt ? dayjs(sentAt).subtract(1, 'day').toDate() : daysAgo(int(1, 5)),
        questions: { create: o.qs.map((q, i) => ({ order: i + 1, type: q.type, text: q.text, hint: q.hint, isRequired: q.isRequired ?? true, minValue: q.type === 'RATING' ? 1 : null, maxValue: q.type === 'RATING' ? 5 : null, options: q.options ? { create: q.options.map((label, j) => ({ order: j + 1, label })) } : undefined })) },
      },
      include: { questions: { include: { options: true }, orderBy: { order: 'asc' } } },
    });
  };

  const surveys = [];
  // 12 weekly tutor surveys over ~90 days
  for (let w = 12; w >= 0; w--) {
    const days = w * 7 + 2;
    surveys.push(await makeSurvey({ title: `Haftalik Tutor So'rovnomasi — ${dayjs().subtract(days, 'day').format('DD.MM')}`, description: "Har hafta juma kuni to'ldiriladigan qisqa so'rovnoma. Javoblaringiz maktab ishini yaxshilashga yordam beradi.", qs: weeklyTutorQs, audience: 'TUTORS', sentDaysAgo: days, status: days <= 3 ? 'ACTIVE' : 'COMPLETED', deadlineDays: 3 }));
  }
  // 6 bi-weekly teacher lesson surveys
  for (let w = 6; w >= 1; w--) {
    const days = w * 14 - 3;
    surveys.push(await makeSurvey({ title: `O'qituvchi dars hisoboti — ${dayjs().subtract(days, 'day').format('DD.MM')}`, description: "Ikki haftalik dars sifati va davomat bo'yicha so'rovnoma.", qs: teacherLessonQs, audience: 'TEACHERS', sentDaysAgo: days, status: days <= 4 ? 'ACTIVE' : 'COMPLETED', deadlineDays: 4, createdBy: hr.id }));
  }
  // monthly
  for (let m = 3; m >= 1; m--) {
    const days = m * 30 - 5;
    surveys.push(await makeSurvey({ title: `Oylik natijalar so'rovnomasi — ${dayjs().subtract(days, 'day').format('MMMM YYYY')}`, description: 'Oylik yakunlar va rejalar.', qs: monthlyQs, audience: 'ALL', sentDaysAgo: days, status: 'COMPLETED', deadlineDays: 5, createdBy: ceo.id }));
  }
  // anonymous satisfaction (HR), active now
  surveys.push(await makeSurvey({ title: "Xodimlar qoniqish so'rovnomasi (anonim)", description: "Javoblar anonim. Iltimos, ochiq va samimiy javob bering.", qs: satisfactionQs, audience: 'ALL', sentDaysAgo: 1, status: 'ACTIVE', deadlineDays: 6, anonymous: true, createdBy: hr.id }));
  // branch-specific active
  surveys.push(await makeSurvey({ title: 'Chilonzor: yangi jadval bo\'yicha fikr', description: 'Yangi dars jadvali haqida fikringiz.', qs: [{ type: 'RATING', text: 'Yangi jadval qulaymi?' }, { type: 'YES_NO', text: 'Shanba kunlari dars o\'tishga rozimisiz?' }, { type: 'LONG_TEXT', text: 'Izoh', isRequired: false }], audience: 'BRANCH', branchId: branches[0].id, sentDaysAgo: 0, status: 'ACTIVE', deadlineDays: 2 }));
  // scheduled + drafts
  surveys.push(await makeSurvey({ title: 'Chorak yakuni: o\'quvchilar natijalari', description: 'Chorak yakunidagi natijalar tahlili.', qs: monthlyQs, audience: 'ALL', sentDaysAgo: null, status: 'SCHEDULED', scheduledIn: 3 }));
  surveys.push(await makeSurvey({ title: 'Yozgi lager tashkil etish bo\'yicha so\'rov', description: '', qs: [{ type: 'YES_NO', text: 'Yozgi lagerda ishtirok etasizmi?' }, { type: 'MULTIPLE_CHOICE', text: 'Qaysi yo\'nalishlar?', options: ['Sport', 'Ingliz tili', 'Robototexnika', 'San\'at'] }], audience: 'ALL', sentDaysAgo: null, status: 'DRAFT' }));
  surveys.push(await makeSurvey({ title: 'Ota-onalar bilan uchrashuv tayyorgarligi', description: '', qs: [{ type: 'TEXT', text: 'Qaysi sanada qulay?' }], audience: 'TUTORS', sentDaysAgo: null, status: 'DRAFT' }));
  surveys.push(await makeSurvey({ title: "2024 kuzgi qoniqish so'rovnomasi", description: 'Arxivlangan.', qs: satisfactionQs, audience: 'ALL', sentDaysAgo: 120, status: 'ARCHIVED', anonymous: true, createdBy: hr.id }));

  // ── Assignments + responses ──
  const POS = ["Darslar juda samarali o'tdi, o'quvchilar faol qatnashdi.", "Yaxshi hafta bo'ldi. Ikki guruhda test natijalari o'sdi.", "O'quvchilarning motivatsiyasi yuqori, uy vazifalari to'liq bajarilmoqda.", "Yangi metodika yaxshi natija berdi — speaking ko'nikmasi sezilarli o'sdi.", "Haftalik reja to'liq bajarildi."];
  const PROB = ["Ikki o'quvchi ketma-ket darsga kelmadi, ota-onalar bilan bog'landim.", "Proyektor ishlamayapti, darsni doskada o'tishga to'g'ri keldi.", "Guruhda intizom muammosi bor — bir o'quvchi boshqalarga xalaqit beradi.", "Ba'zi o'quvchilar uy vazifasini bajarmayapti.", "Xonada issiqlik yetarli emas, o'quvchilar shikoyat qildi."];
  const GROUPS_HELP = ['IELTS-11', 'MATE-22', 'INGL-13', 'RUS-21', 'FIZI-31', "Yo'q", 'Barcha guruhlar yaxshi'];
  const SUGG = ["Qo'shimcha o'quv materiallari kerak.", 'Speaking club tashkil etsak yaxshi bo\'lardi.', "O'qituvchilar uchun metodik seminar o'tkazish taklifi.", 'Ota-onalar uchun oylik hisobot formati kerak.', "Hozircha yo'q, hammasi yaxshi."];
  const RES = ["3 ta o'quvchi mock testda 6.5 oldi.", "Guruh o'rtacha bali 78 dan 84 ga ko'tarildi.", "Barcha o'quvchilar haftalik testdan o'tdi.", "2 ta o'quvchi olimpiadaga tayyorlandi.", 'Yangi 4 ta o\'quvchi guruhga moslashdi.'];

  let responseCount = 0;
  for (const s of surveys) {
    if (!s.sentAt) continue;
    let targets = active.filter((u) => u.role === 'TUTOR' || u.role === 'TEACHER');
    if (s.audience === 'TUTORS') targets = targets.filter((u) => u.role === 'TUTOR');
    if (s.audience === 'TEACHERS') targets = targets.filter((u) => u.role === 'TEACHER');
    if (s.audience === 'BRANCH') targets = targets.filter((u) => u.branchId === s.branchId);
    const ageDays = dayjs().diff(s.sentAt, 'day');
    for (const u of targets) {
      // completion probability grows with survey age; branch 0 slightly better, branch 2 slightly worse
      const branchBias = u.branchId === branches[0].id ? 0.08 : u.branchId === branches[2].id ? -0.1 : 0;
      const p = s.status === 'ACTIVE' ? Math.min(0.75, 0.15 + ageDays * 0.2) + branchBias : 0.82 + branchBias;
      const completed = chance(p);
      const inProgress = !completed && s.status === 'ACTIVE' && chance(0.3);
      const completedAt = completed ? dayjs(s.sentAt).add(int(1, Math.max(2, Math.min(72, ageDays * 24 || 48))), 'hour').toDate() : null;
      await prisma.surveyAssignment.create({ data: { surveyId: s.id, userId: u.id, status: completed ? 'COMPLETED' : inProgress ? 'IN_PROGRESS' : s.status === 'ACTIVE' ? 'PENDING' : 'EXPIRED', notifiedAt: s.sentAt, startedAt: completed || inProgress ? dayjs(completedAt ?? new Date()).subtract(int(3, 12), 'minute').toDate() : null, completedAt, createdAt: s.sentAt, remindedAt: chance(0.4) ? dayjs(s.sentAt).add(1, 'day').toDate() : null } });
      if (!completed) continue;
      const answers = [];
      const ratings: number[] = [];
      for (const q of s.questions) {
        if (!q.isRequired && chance(0.35)) continue;
        switch (q.type) {
          case 'RATING': {
            const base = u.branchId === branches[2].id ? 3.6 : 4.1;
            const v = Math.max(1, Math.min(5, Math.round(base + (rnd() - 0.5) * 2.4)));
            ratings.push(v);
            answers.push({ questionId: q.id, numberValue: v });
            break;
          }
          case 'NUMBER':
            answers.push({ questionId: q.id, numberValue: int(4, 22) });
            break;
          case 'YES_NO':
            answers.push({ questionId: q.id, boolValue: chance(0.7) });
            break;
          case 'SINGLE_CHOICE': {
            const o = pick(q.options);
            answers.push({ questionId: q.id, optionIds: [o.id], textValue: o.label });
            break;
          }
          case 'MULTIPLE_CHOICE': {
            const chosen = q.options.filter(() => chance(0.4));
            const list = chosen.length ? chosen : [pick(q.options)];
            answers.push({ questionId: q.id, optionIds: list.map((o) => o.id), textValue: list.map((o) => o.label).join(', ') });
            break;
          }
          default: {
            const t = q.text.toLowerCase();
            const text = t.includes('muammo') ? pick(PROB) : t.includes('taklif') || t.includes("o'zgartir") ? pick(SUGG) : t.includes('guruh') ? pick(GROUPS_HELP) : t.includes('natija') || t.includes('reja') ? pick(RES) : pick(POS);
            answers.push({ questionId: q.id, textValue: text });
          }
        }
      }
      const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
      await prisma.surveyResponse.create({ data: { surveyId: s.id, userId: s.isAnonymous ? null : u.id, branchIdSnap: u.branchId, roleKeySnap: u.role, source: 'telegram', startedAt: dayjs(completedAt!).subtract(int(3, 12), 'minute').toDate(), submittedAt: completedAt!, durationSec: int(120, 720), avgRating, answers: { create: answers } } });
      responseCount++;
    }
  }
  console.log(`✔ ${surveys.length} surveys, ${responseCount} responses`);

  // ── Reports ──
  const REPORT_TITLES: Record<ReportType, string[]> = {
    DAILY: ['Kunlik hisobot', 'Bugungi darslar', 'Kunlik faoliyat'],
    WEEKLY: ['Haftalik hisobot', 'Hafta yakuni'],
    MONTHLY: ['Oylik hisobot', 'Oy yakuni'],
    PROBLEM: ["Proyektor nosozligi", "O'quvchi davomati muammosi", 'Xonada issiqlik muammosi', 'Darslik yetishmovchiligi'],
    STUDENT_FEEDBACK: ["O'quvchilar fikri — IELTS guruhi", "Ota-ona murojaati", "O'quvchi taklifi"],
    LESSON: ['Dars hisoboti: Present Perfect', 'Dars hisoboti: Kvadrat tenglamalar', "Dars hisoboti: Nutq o'stirish", 'Dars hisoboti: Listening practice'],
  };
  const REPORT_BODY = ["Bugun 4 ta dars o'tdim. Davomat 92%. Uy vazifasi 85% bajarildi. IELTS-11 guruhida writing bo'yicha qo'shimcha mashq berildi.", "Hafta davomida 18 ta dars, 2 ta nazorat ishi. O'rtacha ball 81. Ikki o'quvchi bilan individual suhbat o'tkazildi.", "Guruhda 14 o'quvchi, 13 tasi qatnashdi. Mavzu to'liq o'zlashtirildi, keyingi darsga test rejalashtirilgan.", "Ota-onalar bilan 5 ta suhbat, 3 ta o'quvchi bo'yicha reja tuzildi. Guruh natijalari barqaror.", "Speaking club o'tkazildi, 22 o'quvchi ishtirok etdi. Faollik yuqori bo'ldi."];
  const groups = await prisma.group.findMany({ select: { id: true, tutorId: true, teacherId: true } });
  let reportCount = 0;
  for (const u of active) {
    const myGroups = groups.filter((g) => g.tutorId === u.id || g.teacherId === u.id);
    const n = int(8, 22);
    for (let i = 0; i < n; i++) {
      const type: ReportType = u.role === 'TEACHER' ? pick(['DAILY', 'LESSON', 'LESSON', 'WEEKLY', 'STUDENT_FEEDBACK', 'PROBLEM']) : pick(['DAILY', 'DAILY', 'WEEKLY', 'PROBLEM', 'STUDENT_FEEDBACK', 'MONTHLY']);
      const d = int(0, 85);
      const created = daysAgo(d, int(15, 21));
      const status: ReportStatus = d < 2 ? (chance(0.6) ? 'PENDING' : 'APPROVED') : pick(['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'NEEDS_REVISION', 'REJECTED', 'PENDING']);
      const reviewer = status === 'PENDING' ? null : pick([directors.find((x) => x.branchId === u.branchId)!, hr]);
      await prisma.report.create({ data: { type, title: `${pick(REPORT_TITLES[type])} — ${dayjs(created).format('DD.MM')}`, content: pick(REPORT_BODY), status, authorId: u.id, groupId: myGroups.length && chance(0.7) ? pick(myGroups).id : null, periodStart: dayjs(created).startOf(type === 'WEEKLY' ? 'week' : type === 'MONTHLY' ? 'month' : 'day').toDate(), periodEnd: dayjs(created).endOf(type === 'WEEKLY' ? 'week' : type === 'MONTHLY' ? 'month' : 'day').toDate(), reviewerId: reviewer?.id ?? null, reviewedAt: reviewer ? dayjs(created).add(int(2, 30), 'hour').toDate() : null, reviewNote: status === 'NEEDS_REVISION' ? "Iltimos, davomat raqamlarini aniqlashtiring." : status === 'REJECTED' ? "Hisobot juda qisqa, batafsil yozing." : null, createdAt: created, updatedAt: created } });
      reportCount++;
    }
  }
  console.log(`✔ ${reportCount} reports`);

  // ── Announcements ──
  const anns = [
    { title: "Yangi o'quv choragi boshlanishi", body: "Hurmatli hamkasblar! 1-oktabrdan yangi o'quv choragi boshlanadi. Barcha tutorlar guruh ro'yxatlarini 28-sentabrgacha yangilashlari so'raladi.", priority: 'HIGH' as const, isPinned: true, d: 1 },
    { title: 'Metodik seminar', body: "Juma kuni soat 15:00 da Chilonzor filialida \"Interfaol darslar\" mavzusida seminar bo'lib o'tadi. Ishtirok ixtiyoriy, lekin tavsiya etiladi.", priority: 'NORMAL' as const, isPinned: false, d: 3 },
    { title: "Haftalik so'rovnoma eslatmasi", body: "Har juma kuni haftalik so'rovnomani soat 21:00 gacha to'ldirishni unutmang. Bu KPI hisobiga ta'sir qiladi.", priority: 'NORMAL' as const, isPinned: false, d: 6 },
    { title: 'Diqqat: tizimda texnik ishlar', body: "Yakshanba kuni 02:00–04:00 oralig'ida tizimda texnik ishlar olib boriladi. Bot vaqtincha ishlamasligi mumkin.", priority: 'URGENT' as const, isPinned: false, d: 10 },
    { title: "O'qituvchilar kuni bilan!", body: "Barcha o'qituvchi va tutorlarimizni kasb bayrami bilan tabriklaymiz! Sizning mehnatingiz — bizning kelajagimiz. 🎉", priority: 'LOW' as const, isPinned: false, d: 18 },
    { title: 'Yangi hisobot formati', body: "Kunlik hisobotlarda endi guruh nomini ko'rsatish majburiy. Bot orqali hisobot topshirishda guruhni tanlang.", priority: 'HIGH' as const, isPinned: false, d: 25 },
  ];
  for (const a of anns) {
    const ann = await prisma.announcement.create({ data: { title: a.title, body: a.body, priority: a.priority, isPinned: a.isPinned, audience: 'ALL', authorId: pick([hr, directors[0], superAdmin]).id, publishAt: daysAgo(a.d, 9), createdAt: daysAgo(a.d, 9), sentCount: active.length } });
    const readers = active.filter(() => chance(0.65));
    if (readers.length) await prisma.announcementRead.createMany({ data: readers.map((r) => ({ announcementId: ann.id, userId: r.id, readAt: daysAgo(Math.max(0, a.d - int(0, 2)), int(9, 22)) })) });
  }
  console.log(`✔ ${anns.length} announcements`);

  // ── Tasks ──
  const TASKS = ["Guruh ro'yxatini yangilash", 'Ota-onalar yig\'ilishini o\'tkazish', 'Mock test natijalarini kiritish', "O'quvchilar davomatini tekshirish", 'Yangi darslik bo\'yicha reja tuzish', 'Speaking club tashkil etish', 'Sinf xonasini inventarizatsiya qilish'];
  for (const u of active) {
    for (let i = 0; i < int(1, 4); i++) {
      const d = int(-10, 20);
      const status = d < 0 ? (chance(0.75) ? 'DONE' : 'OPEN') : chance(0.3) ? 'DONE' : chance(0.3) ? 'IN_PROGRESS' : 'OPEN';
      await prisma.task.create({ data: { title: pick(TASKS), description: chance(0.5) ? 'Batafsil ma\'lumot direktor bilan kelishiladi.' : null, status, dueAt: dayjs().add(d, 'day').hour(18).toDate(), assigneeId: u.id, createdById: pick([directors.find((x) => x.branchId === u.branchId)!, hr]).id, completedAt: status === 'DONE' ? dayjs().add(Math.min(d, 0) - 1, 'day').toDate() : null, createdAt: daysAgo(int(5, 30)) } });
    }
  }

  // ── Notifications (history) ──
  const sentSurveys = surveys.filter((s) => s.sentAt).slice(-6);
  for (const s of sentSurveys) {
    const assigns = await prisma.surveyAssignment.findMany({ where: { surveyId: s.id }, select: { userId: true } });
    await prisma.notification.createMany({ data: assigns.map((a) => ({ userId: a.userId, type: 'SURVEY_ASSIGNED' as const, channel: 'BOTH' as const, title: "📋 Yangi so'rovnoma!", body: `Sizga yangi so'rovnoma yuborildi:\n${s.title}`, surveyId: s.id, status: 'SENT' as const, sentAt: s.sentAt, createdAt: s.sentAt! })) });
  }

  // ── Audit logs ──
  const actions = ['auth.login', 'survey.create', 'survey.send', 'user.update', 'report.review', 'announcement.create', 'settings.update', 'survey.export'];
  for (let i = 0; i < 80; i++) {
    const actor = pick([superAdmin, ceo, hr, ...directors]);
    await prisma.auditLog.create({ data: { userId: actor.id, action: pick(actions), entity: 'Survey', ip: `192.168.1.${int(2, 250)}`, userAgent: 'Mozilla/5.0 (Macintosh) Chrome/128', source: 'web', createdAt: daysAgo(int(0, 40), int(8, 20)) } });
  }

  // ── Settings ──
  await prisma.setting.upsert({ where: { key: 'org.name' }, create: { key: 'org.name', value: 'Bright Future Private School' }, update: {} });

  // ── KPI: compute for last 8 weeks + last 3 months ──
  for (let w = 8; w >= 0; w--) await computeKpi('WEEKLY', dayjs().subtract(w, 'week').toDate());
  for (let m = 3; m >= 0; m--) await computeKpi('MONTHLY', dayjs().subtract(m, 'month').toDate());
  console.log('✔ KPI computed');
}

async function main() {
  await ensureCore();
  const users = await prisma.user.count();
  if (users > 0 && process.env.SEED_FORCE !== 'true') {
    console.log(`ℹ Database already has ${users} users — skipping demo data (set SEED_FORCE=true to re-seed).`);
    return;
  }
  if (users > 0) await wipeDemo();
  await seedDemo();
  console.log('\n🎉 Seed complete. Demo accounts (password in brackets):');
  console.log('   Super Admin  admin@tutorsurvey.uz     [Admin123!]');
  console.log('   Director     director@tutorsurvey.uz  [Director123!]');
  console.log('   CEO          ceo@tutorsurvey.uz       [Ceo123!]');
  console.log('   HR Admin     hr@tutorsurvey.uz        [Hr123!]');
  console.log('   Tutor        tutor@tutorsurvey.uz     [Tutor123!]   (Telegram-only role — links via bot)');
  console.log('   Teacher      teacher@tutorsurvey.uz   [Teacher123!] (Telegram-only role — links via bot)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
