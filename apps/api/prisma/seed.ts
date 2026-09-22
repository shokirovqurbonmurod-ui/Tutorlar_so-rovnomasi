/**
 * TARGET INTERNATIONAL SCHOOL — database seed.
 *
 *  Always (idempotent):  roles (slug = key), permissions, role_permissions, KPI metrics,
 *                        settings, super admin from .env (SUPER_ADMIN_EMAIL / _PASSWORD / _PHONE / _NAME).
 *  Demo data (SEED_DEMO=true, default): branches, staff, subjects, rooms, groups, students,
 *                        parents, timetable, attendance, grades, homework, exams, invoices, payments,
 *                        expenses, dormitory, messages, announcements — only when DB has no students,
 *                        or when SEED_FORCE=true (wipes demo data first).
 *
 *  Nothing secret is hardcoded here: the super admin password MUST come from .env.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { AttendanceStatus, RoleKey, Weekday } from '../src/generated/prisma/enums.js';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLE_LABELS, SYSTEM_ROLE_KEYS } from '../src/lib/permissions.js';
import { KPI_DEFAULTS } from '../src/modules/kpi/kpi.service.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// deterministic pseudo-random so demo looks the same on every machine
let seed = 20260922;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p: number) => rnd() < p;
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);
const hash = (pw: string) => bcrypt.hash(pw, ROUNDS);

const BOY = ['Ali', 'Jasur', 'Sardor', 'Bobur', 'Otabek', 'Farrux', 'Shaxzod', 'Umid', 'Javohir', 'Doston', 'Rustam', 'Islom', 'Temur', 'Akmal', 'Bekzod', 'Aziz', 'Diyor', 'Samandar', 'Mirjalol', 'Abror'];
const GIRL = ['Dilnoza', 'Malika', 'Nilufar', 'Gulnora', 'Zarina', 'Madina', 'Kamola', 'Sevara', 'Nodira', 'Laylo', 'Mohira', 'Dildora', 'Shahnoza', 'Feruza', 'Nargiza', 'Ziyoda', 'Munisa', 'Sitora', 'Iroda', 'Gulbahor'];
const LAST_M = ['Karimov', 'Toshmatov', 'Abdullayev', 'Xolmatov', 'Ergashev', 'Qodirov', 'Tursunov', 'Sobirov', 'Rasulov', 'Mahmudov', 'Yusupov', 'Ismoilov', 'Saidov', 'Mirzayev', 'Nazarov', 'Alimov', 'Usmonov', 'Hamidov', 'Jalilov', 'Rahimov'];
const fem = (l: string) => l.replace(/ov$/, 'ova').replace(/ev$/, 'eva');

const SUBJECTS: Array<{ name: string; code: string; color: string }> = [
  { name: 'Matematika', code: 'MATH', color: '#2563eb' },
  { name: 'Ingliz tili', code: 'ENG', color: '#e11d48' },
  { name: 'Ona tili', code: 'UZB', color: '#16a34a' },
  { name: 'Rus tili', code: 'RUS', color: '#7c3aed' },
  { name: 'Fizika', code: 'PHYS', color: '#0891b2' },
  { name: 'Kimyo', code: 'CHEM', color: '#ea580c' },
  { name: 'Biologiya', code: 'BIO', color: '#65a30d' },
  { name: 'Tarix', code: 'HIST', color: '#a16207' },
  { name: 'Informatika', code: 'IT', color: '#0f766e' },
  { name: 'Geografiya', code: 'GEO', color: '#4f46e5' },
  { name: 'Jismoniy tarbiya', code: 'PE', color: '#db2777' },
];
const WD: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const SLOTS: Array<[string, string]> = [['08:30', '09:15'], ['09:25', '10:10'], ['10:20', '11:05'], ['11:25', '12:10'], ['12:20', '13:05'], ['13:15', '14:00']];

// ─────────────────────────────────────────────────────────────────────────────
async function ensureCore() {
  for (const key of SYSTEM_ROLE_KEYS) {
    await prisma.role.upsert({ where: { slug: key }, create: { key, slug: key, name: ROLE_LABELS[key], isSystem: true }, update: { name: ROLE_LABELS[key], key } });
  }
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, group: key.split('.')[0], description }, update: { description } });
  }
  const roles = await prisma.role.findMany({ where: { isSystem: true } });
  const perms = await prisma.permission.findMany();
  for (const r of roles) {
    const keys: string[] = r.key === 'SUPER_ADMIN' ? Object.keys(PERMISSIONS) : ROLE_PERMISSIONS[r.key];
    await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
    await prisma.rolePermission.createMany({ data: perms.filter((p) => keys.includes(p.key)).map((p) => ({ roleId: r.id, permissionId: p.id })), skipDuplicates: true });
  }
  for (const m of KPI_DEFAULTS) {
    await prisma.kpiMetric.upsert({ where: { key: m.key }, create: { ...m, appliesTo: m.key === 'TUTOR_ACTIVITY' ? ['TUTOR'] : m.key === 'TEACHER_ACTIVITY' ? ['TEACHER'] : ['TUTOR', 'TEACHER'] }, update: { name: m.name, description: m.description } });
  }
  await prisma.setting.upsert({ where: { key: 'org.name' }, create: { key: 'org.name', value: 'TARGET INTERNATIONAL SCHOOL' }, update: { value: 'TARGET INTERNATIONAL SCHOOL' } });
  await prisma.setting.upsert({ where: { key: 'org.shortName' }, create: { key: 'org.shortName', value: 'TARGET' }, update: {} });
  await prisma.setting.upsert({ where: { key: 'finance.dueDay' }, create: { key: 'finance.dueDay', value: 10 }, update: {} });
  await prisma.setting.upsert({ where: { key: 'finance.currency' }, create: { key: 'finance.currency', value: 'UZS' }, update: {} });
  console.log('✔ Roles, permissions, KPI metrics, settings ready');
}

/** Super admin — Jumayev Baxtbek (Bosh Admin, Yunusobod). Credentials come from .env only. */
async function ensureSuperAdmin(branchId: string | null) {
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'admin@target-school.uz';
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const phone = process.env.SUPER_ADMIN_PHONE ?? null;
  const fullName = process.env.SUPER_ADMIN_NAME ?? 'Jumayev Baxtbek';
  const role = await prisma.role.findUniqueOrThrow({ where: { slug: 'SUPER_ADMIN' } });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!password && !existing) {
    console.error('❌ SUPER_ADMIN_PASSWORD is not set in .env — cannot create the super admin. Add it and re-run the seed.');
    process.exit(1);
  }
  const data = { fullName, phone, roleId: role.id, branchId, position: 'Bosh Admin / Super Admin', status: 'ACTIVE' as const };
  const u = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { ...data, ...(password ? { passwordHash: await hash(password) } : {}) } })
    : await prisma.user.create({ data: { ...data, email, passwordHash: await hash(password!) } });
  console.log(`✔ Super admin: ${u.fullName} <${email}>${password ? ' (password from .env)' : ''}`);
  return u;
}

async function wipeDemo(keepEmail: string) {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(), prisma.notification.deleteMany(), prisma.kpiResult.deleteMany(), prisma.task.deleteMany(),
    prisma.announcementRead.deleteMany(), prisma.announcement.deleteMany(), prisma.report.deleteMany(),
    prisma.surveyAnswer.deleteMany(), prisma.surveyResponse.deleteMany(), prisma.surveyAssignment.deleteMany(), prisma.survey.deleteMany(),
    prisma.dormLog.deleteMany(), prisma.dormAssignment.deleteMany(), prisma.dormBed.deleteMany(), prisma.dormRoom.deleteMany(), prisma.dormBuilding.deleteMany(), prisma.dormitory.deleteMany(),
    prisma.payment.deleteMany(), prisma.invoice.deleteMany(), prisma.expense.deleteMany(),
    prisma.examResult.deleteMany(), prisma.exam.deleteMany(), prisma.homeworkSubmission.deleteMany(), prisma.homework.deleteMany(),
    prisma.grade.deleteMany(), prisma.attendance.deleteMany(), prisma.groupMessage.deleteMany(), prisma.lesson.deleteMany(), prisma.schedule.deleteMany(),
    prisma.groupTeacher.deleteMany(), prisma.studentParent.deleteMany(), prisma.student.deleteMany(), prisma.parent.deleteMany(),
    prisma.group.deleteMany(), prisma.room.deleteMany(), prisma.subject.deleteMany(),
    prisma.refreshToken.deleteMany(), prisma.telegramLinkCode.deleteMany(), prisma.telegramSession.deleteMany(),
    prisma.user.deleteMany({ where: { email: { not: keepEmail } } }), prisma.department.deleteMany(), prisma.branch.deleteMany(),
  ]);
  console.log('✔ Demo data wiped');
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedDemo(superAdminId: string) {
  const roleId = Object.fromEntries((await prisma.role.findMany({ where: { isSystem: true } })).map((r) => [r.key, r.id])) as Record<RoleKey, string>;
  const daysAgo = (n: number, h = 10) => dayjs().subtract(n, 'day').hour(h).minute(int(0, 59)).second(0).toDate();
  const demoPw = process.env.SEED_DEMO_PASSWORD ?? 'Target2026!';
  const demoHash = await hash(demoPw);

  // ── Branches ──
  const yun = await prisma.branch.create({ data: { name: 'Yunusobod', code: 'YUN', city: 'Toshkent', address: "Yunusobod tumani, Amir Temur ko'chasi 88", phone: '+998 71 200 10 02' } });
  const chl = await prisma.branch.create({ data: { name: 'Chilonzor', code: 'CHL', city: 'Toshkent', address: "Chilonzor tumani, Bunyodkor ko'chasi 12", phone: '+998 71 200 10 01' } });
  const branches = [yun, chl];
  await prisma.user.update({ where: { id: superAdminId }, data: { branchId: yun.id } });

  const deptNames = ["Akademik bo'lim", 'Tutorlik xizmati', 'Ma\'muriyat', 'Buxgalteriya', 'Yotoqxona', 'IT'];
  const depts: Record<string, string> = {};
  for (const b of branches) for (const n of deptNames) depts[`${b.code}:${n}`] = (await prisma.department.create({ data: { name: n, branchId: b.id } })).id;

  // ── Management & staff (web logins) ──
  let phoneN = 1000100;
  let tgN = 700000001;
  const nextPhone = () => `+99890${String(phoneN++).slice(-7)}`;
  const mk = async (o: { name: string; role: RoleKey; email?: string; branch?: typeof yun; position: string; dept?: string; tg?: boolean; status?: 'ACTIVE' | 'PENDING' | 'INACTIVE' }) =>
    prisma.user.create({
      data: {
        fullName: o.name, email: o.email ?? null, phone: nextPhone(), passwordHash: o.email ? demoHash : null, roleId: roleId[o.role], branchId: o.branch?.id ?? null,
        departmentId: o.branch && o.dept ? depts[`${o.branch.code}:${o.dept}`] : null, position: o.position, status: o.status ?? 'ACTIVE',
        telegramId: o.tg === false ? null : BigInt(tgN++), telegramUsername: o.tg === false ? null : o.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8), joinDate: daysAgo(int(60, 600)), lastActivityAt: daysAgo(int(0, 3), int(8, 20)), lastLoginAt: daysAgo(int(0, 5)),
      },
    });

  const ceo = await mk({ name: 'Akbar Yuldashev', role: 'CEO', email: 'ceo@target-school.uz', position: 'Bosh direktor (CEO)' });
  const dirYun = await mk({ name: 'Dilshod Rahmonov', role: 'DIRECTOR', email: 'director@target-school.uz', branch: yun, position: 'Filial direktori', dept: "Ma'muriyat" });
  const dirChl = await mk({ name: 'Nargiza Tursunova', role: 'DIRECTOR', email: 'director.chl@target-school.uz', branch: chl, position: 'Filial direktori', dept: "Ma'muriyat" });
  await prisma.branch.update({ where: { id: yun.id }, data: { directorId: dirYun.id, ceoId: ceo.id } });
  await prisma.branch.update({ where: { id: chl.id }, data: { directorId: dirChl.id, ceoId: ceo.id } });
  const hr = await mk({ name: 'Gulchehra Sattorova', role: 'HR_ADMIN', email: 'hr@target-school.uz', branch: yun, position: 'HR menejer', dept: "Ma'muriyat" });
  const accountant = await mk({ name: 'Bahodir Ergashev', role: 'ACCOUNTANT', email: 'accountant@target-school.uz', branch: yun, position: 'Bosh buxgalter', dept: 'Buxgalteriya' });
  const administrator = await mk({ name: 'Madina Alimova', role: 'ADMINISTRATOR', email: 'admin.yun@target-school.uz', branch: yun, position: 'Administrator', dept: "Ma'muriyat" });
  const komendant = await mk({ name: 'Rustam Mahmudov', role: 'DORM_MANAGER', email: 'dorm@target-school.uz', branch: yun, position: 'Yotoqxona komendanti', dept: 'Yotoqxona' });
  await mk({ name: 'Sevara Usmonova', role: 'RECEPTION', email: 'reception@target-school.uz', branch: yun, position: 'Reception', dept: "Ma'muriyat" });
  await mk({ name: 'Javohir Rasulov', role: 'MARKETING', email: 'marketing@target-school.uz', branch: yun, position: 'Marketing menejeri', dept: "Ma'muriyat" });
  await mk({ name: 'Otabek Saidov', role: 'IT_ADMIN', email: 'it@target-school.uz', branch: yun, position: 'IT administrator', dept: 'IT' });

  // ── Subjects & rooms ──
  const subjects = [] as Array<{ id: string; name: string; code: string | null }>;
  for (const s of SUBJECTS) subjects.push(await prisma.subject.create({ data: { ...s } }));
  const subj = (code: string) => subjects.find((s) => s.code === code)!;
  const rooms: Record<string, Array<{ id: string; name: string }>> = {};
  for (const b of branches) {
    rooms[b.id] = [];
    for (let f = 1; f <= 3; f++) for (let r = 1; r <= 4; r++) rooms[b.id].push(await prisma.room.create({ data: { name: `${f}0${r}`, floor: f, capacity: 24, branchId: b.id, building: 'Asosiy bino' } }));
    rooms[b.id].push(await prisma.room.create({ data: { name: 'Sport zali', floor: 1, capacity: 40, branchId: b.id } }));
    rooms[b.id].push(await prisma.room.create({ data: { name: 'IT lab', floor: 2, capacity: 20, branchId: b.id } }));
  }

  // ── Teachers & tutors ──
  type Staff = { id: string; fullName: string; branchId: string; subjectCode?: string };
  const teachers: Record<string, Staff[]> = {};
  const tutors: Record<string, Staff[]> = {};
  const usedNames = new Set<string>();
  const person = (gender: 'M' | 'F') => {
    let n = '';
    do n = gender === 'M' ? `${pick(BOY)} ${pick(LAST_M)}` : `${pick(GIRL)} ${fem(pick(LAST_M))}`;
    while (usedNames.has(n));
    usedNames.add(n);
    return n;
  };
  for (const b of branches) {
    teachers[b.id] = [];
    tutors[b.id] = [];
    const codes = b.id === yun.id ? SUBJECTS.map((s) => s.code) : SUBJECTS.slice(0, 7).map((s) => s.code);
    for (const [i, code] of codes.entries()) {
      const name = i === 0 && b.id === yun.id ? 'Sherzod Nurmatov' : person(chance(0.5) ? 'M' : 'F');
      const u = await mk({ name, role: 'TEACHER', email: i === 0 && b.id === yun.id ? 'teacher@target-school.uz' : undefined, branch: b, position: `${subj(code).name} o'qituvchisi`, dept: "Akademik bo'lim" });
      teachers[b.id].push({ id: u.id, fullName: u.fullName, branchId: b.id, subjectCode: code });
    }
    const nTutors = b.id === yun.id ? 5 : 3;
    for (let i = 0; i < nTutors; i++) {
      const name = i === 0 && b.id === yun.id ? 'Kamola Yusupova' : person(chance(0.5) ? 'M' : 'F');
      const u = await mk({ name, role: 'TUTOR', email: i === 0 && b.id === yun.id ? 'tutor@target-school.uz' : undefined, branch: b, position: 'Tutor', dept: 'Tutorlik xizmati' });
      tutors[b.id].push({ id: u.id, fullName: u.fullName, branchId: b.id });
    }
  }

  // ── Groups (classes), students, parents ──
  const parentRole = roleId.PARENT;
  const studentRole = roleId.STUDENT;
  let studentSeq = 1;
  const year = dayjs().year();
  const allStudents: Array<{ id: string; groupId: string; branchId: string; fullName: string; userId: string | null; parentUserIds: string[]; isBoarder: boolean; monthlyFee: number; discountPercent: number }> = [];
  const allGroups: Array<{ id: string; name: string; branchId: string; tutorId: string; gradeLevel: number; teacherIds: Record<string, string> }> = [];
  const schedule = await prisma.schedule.create({ data: { name: `${year}-${year + 1} I chorak`, validFrom: dayjs(`${year}-09-01`).toDate(), authorId: superAdminId } });

  let demoParentDone = false;
  for (const b of branches) {
    const levels = b.id === yun.id ? [5, 6, 7, 8, 9, 10] : [5, 6, 7];
    const letters = b.id === yun.id ? ['A', 'B'] : ['A'];
    let gi = 0;
    for (const level of levels) for (const letter of letters) {
      const tutor = tutors[b.id][gi % tutors[b.id].length];
      const room = rooms[b.id][gi % 12];
      const mainTeacher = teachers[b.id][gi % teachers[b.id].length];
      const g = await prisma.group.create({ data: { name: `${level}-${letter}`, gradeLevel: level, academicYear: `${year}-${year + 1}`, room: room.name, branchId: b.id, tutorId: tutor.id, teacherId: mainTeacher.id, allowParentChat: true } });
      // teachers per subject
      const teacherIds: Record<string, string> = {};
      const codesForLevel = SUBJECTS.filter((s) => !(level < 7 && ['PHYS', 'CHEM'].includes(s.code))).map((s) => s.code);
      for (const code of codesForLevel) {
        const t = teachers[b.id].find((x) => x.subjectCode === code) ?? pick(teachers[b.id]);
        teacherIds[code] = t.id;
        await prisma.groupTeacher.create({ data: { groupId: g.id, teacherId: t.id, subjectId: subj(code).id } });
      }
      // timetable: 6 days × 5-6 lessons
      const perDay = level >= 9 ? 6 : 5;
      for (const [di, wd] of WD.entries()) {
        const n = wd === 'SAT' ? 4 : perDay;
        for (let k = 0; k < n; k++) {
          const code = codesForLevel[(di * perDay + k + gi) % codesForLevel.length];
          const r = code === 'PE' ? rooms[b.id].find((x) => x.name === 'Sport zali')! : code === 'IT' ? rooms[b.id].find((x) => x.name === 'IT lab')! : room;
          await prisma.lesson.create({ data: { scheduleId: schedule.id, groupId: g.id, subjectId: subj(code).id, teacherId: teacherIds[code], roomId: r.id, weekday: wd, startTime: SLOTS[k][0], endTime: SLOTS[k][1], order: k + 1 } });
        }
      }
      // students
      const n = int(14, 20);
      const fee = level >= 9 ? 3_500_000 : 3_000_000;
      for (let i = 0; i < n; i++) {
        const gender = chance(0.5) ? 'MALE' : 'FEMALE';
        const last = pick(LAST_M);
        const first = gender === 'MALE' ? pick(BOY) : pick(GIRL);
        const isDemo = !demoParentDone && b.id === yun.id && level === 7 && letter === 'A' && i === 0;
        const firstName = isDemo ? 'Ali' : first;
        const lastName = isDemo ? 'Jumayev' : gender === 'MALE' ? last : fem(last);
        const fullName = `${firstName} ${lastName}`;
        const isBoarder = b.id === yun.id && level >= 8 && chance(0.3);
        const discountPercent = chance(0.15) ? pick([10, 20, 50]) : 0;
        const stUser = chance(0.5) || isDemo ? await prisma.user.create({ data: { fullName, roleId: studentRole, branchId: b.id, status: 'ACTIVE', telegramId: BigInt(tgN++), phone: nextPhone(), position: "O'quvchi" } }) : null;
        const st = await prisma.student.create({
          data: {
            userId: stUser?.id ?? null, firstName, lastName, fullName, gender, birthDate: dayjs().subtract(level + 6, 'year').subtract(int(0, 300), 'day').toDate(),
            studentCode: `TIS-${year}-${String(studentSeq++).padStart(4, '0')}`, branchId: b.id, groupId: g.id, status: 'ACTIVE', enrolledAt: daysAgo(int(20, 700)),
            monthlyFee: fee, discountPercent, discountNote: discountPercent ? pick(["Ko'p farzandli oila", 'Xodim farzandi', "A'lochi o'quvchi chegirmasi"]) : null, isBoarder,
          },
        });
        // parents: father (+ mother 60%)
        const parentUserIds: string[] = [];
        const father = isDemo ? 'Baxtbek Jumayev' : `${pick(BOY)} ${last}`;
        const fUser = await prisma.user.create({ data: { fullName: father, roleId: parentRole, branchId: b.id, status: 'ACTIVE', phone: isDemo ? (process.env.SUPER_ADMIN_PHONE ? null : nextPhone()) : nextPhone(), telegramId: chance(0.85) || isDemo ? BigInt(tgN++) : null, position: 'Ota-ona' } });
        const fParent = await prisma.parent.create({ data: { userId: fUser.id, relation: 'Ota', occupation: pick(['Tadbirkor', 'Shifokor', 'Muhandis', 'Haydovchi', "O'qituvchi", 'Dasturchi']) } });
        await prisma.studentParent.create({ data: { studentId: st.id, parentId: fParent.id, relation: 'Ota', isPrimary: true } });
        parentUserIds.push(fUser.id);
        if (chance(0.6)) {
          const mUser = await prisma.user.create({ data: { fullName: `${pick(GIRL)} ${fem(last)}`, roleId: parentRole, branchId: b.id, status: 'ACTIVE', phone: nextPhone(), telegramId: chance(0.7) ? BigInt(tgN++) : null, position: 'Ota-ona' } });
          const mParent = await prisma.parent.create({ data: { userId: mUser.id, relation: 'Ona' } });
          await prisma.studentParent.create({ data: { studentId: st.id, parentId: mParent.id, relation: 'Ona' } });
          parentUserIds.push(mUser.id);
        }
        if (isDemo) demoParentDone = true;
        allStudents.push({ id: st.id, groupId: g.id, branchId: b.id, fullName, userId: stUser?.id ?? null, parentUserIds, isBoarder, monthlyFee: fee, discountPercent });
      }
      await prisma.group.update({ where: { id: g.id }, data: { studentCount: n } });
      allGroups.push({ id: g.id, name: g.name, branchId: b.id, tutorId: tutor.id, gradeLevel: level, teacherIds });
      gi++;
    }
    await prisma.branch.update({ where: { id: b.id }, data: { studentCount: allStudents.filter((s) => s.branchId === b.id).length } });
  }
  console.log(`✔ ${allGroups.length} groups, ${allStudents.length} students`);

  // ── Attendance (last 30 days, school days) & grades ──
  const lessonsByGroup = new Map<string, Array<{ id: string; weekday: Weekday; subjectId: string; teacherId: string | null }>>();
  for (const l of await prisma.lesson.findMany({ select: { id: true, weekday: true, subjectId: true, teacherId: true, groupId: true } })) {
    if (!lessonsByGroup.has(l.groupId)) lessonsByGroup.set(l.groupId, []);
    lessonsByGroup.get(l.groupId)!.push(l);
  }
  const attRows: Array<{ studentId: string; groupId: string; date: Date; status: AttendanceStatus; lateMinutes: number | null; markedById: string }> = [];
  const gradeRows: Array<{ studentId: string; groupId: string; subjectId: string; teacherId: string | null; date: Date; value: number; maxValue: number; kind: 'LESSON' | 'HOMEWORK' | 'QUIZ' }> = [];
  for (let d = 30; d >= 0; d--) {
    const day = dayjs().subtract(d, 'day');
    const dow = day.day();
    if (dow === 0) continue;
    const wd = WD[dow - 1];
    const date = day.startOf('day').toDate();
    for (const g of allGroups) {
      const todays = (lessonsByGroup.get(g.id) ?? []).filter((l) => l.weekday === wd);
      const students = allStudents.filter((s) => s.groupId === g.id);
      for (const s of students) {
        const r = rnd();
        const status: AttendanceStatus = r < 0.9 ? 'PRESENT' : r < 0.95 ? 'LATE' : r < 0.98 ? 'ABSENT' : 'EXCUSED';
        attRows.push({ studentId: s.id, groupId: g.id, date, status, lateMinutes: status === 'LATE' ? int(3, 20) : null, markedById: g.tutorId });
        // ~1 grade per 2 lessons
        for (const l of todays) if (chance(0.45) && status !== 'ABSENT') gradeRows.push({ studentId: s.id, groupId: g.id, subjectId: l.subjectId, teacherId: l.teacherId, date, value: pick([3, 4, 4, 4, 5, 5, 5, 2, 3]), maxValue: 5, kind: chance(0.15) ? 'QUIZ' : chance(0.2) ? 'HOMEWORK' : 'LESSON' });
      }
    }
  }
  for (let i = 0; i < attRows.length; i += 2000) await prisma.attendance.createMany({ data: attRows.slice(i, i + 2000), skipDuplicates: true });
  for (let i = 0; i < gradeRows.length; i += 2000) await prisma.grade.createMany({ data: gradeRows.slice(i, i + 2000) });
  console.log(`✔ ${attRows.length} attendance rows, ${gradeRows.length} grades`);

  // ── Homework ──
  const HW = [
    ['Kasrlar ustida amallar', '45–52-mashqlar, 118-bet'], ['Present Perfect Tense', 'Workbook p. 34–36, write 10 sentences'], ['Nutq uslublari', "Insho: 'Mening maktabim' (1 sahifa)"],
    ['Nyuton qonunlari', '3-§ savollarga javob, 2 ta masala'], ['Kimyoviy reaksiyalar', 'Laboratoriya hisobotini tayyorlash'], ['Hujayra tuzilishi', 'Rasm chizish va izohlash'],
    ['Amir Temur davri', 'Xronologik jadval tuzish'], ['Python: sikllar', '5 ta dastur yozish (for/while)'], ['Iqlim mintaqalari', 'Xarita bilan ishlash'],
  ];
  let hwCount = 0;
  for (const g of allGroups) {
    const codes = Object.keys(g.teacherIds);
    for (let k = 0; k < 5; k++) {
      const code = codes[(k * 3 + g.gradeLevel) % codes.length];
      const [title, task] = HW[(k + g.gradeLevel) % HW.length];
      const created = daysAgo(k === 0 ? 0 : int(2, 25), 14);
      const deadline = dayjs(created).add(k === 0 ? 2 : int(2, 5), 'day').hour(18).minute(0).toDate();
      const h = await prisma.homework.create({ data: { groupId: g.id, subjectId: subj(code).id, authorId: g.teacherIds[code], title, task, deadline, createdAt: created, note: chance(0.3) ? 'Daftarda bajaring va rasmga olib yuboring.' : null } });
      const students = allStudents.filter((s) => s.groupId === g.id);
      const past = dayjs(deadline).isBefore(dayjs());
      await prisma.homeworkSubmission.createMany({
        data: students.map((s) => {
          const r = rnd();
          const status = !past ? (r < 0.35 ? 'SUBMITTED' : 'NOT_SUBMITTED') : r < 0.55 ? 'ACCEPTED' : r < 0.7 ? 'GRADED' : r < 0.8 ? 'REVISION' : r < 0.9 ? 'SUBMITTED' : 'NOT_SUBMITTED';
          const submitted = status !== 'NOT_SUBMITTED';
          return { homeworkId: h.id, studentId: s.id, status, content: submitted ? 'Bajarildi. Javoblar daftarda.' : null, submittedAt: submitted ? dayjs(created).add(int(4, 48), 'hour').toDate() : null, reviewedAt: ['ACCEPTED', 'GRADED', 'REVISION'].includes(status) ? dayjs(created).add(int(50, 80), 'hour').toDate() : null, reviewerId: ['ACCEPTED', 'GRADED', 'REVISION'].includes(status) ? g.teacherIds[code] : null, score: status === 'GRADED' ? pick([3, 4, 5]) : null, feedback: status === 'REVISION' ? "2 va 3-mashqlarni qayta bajaring." : null, attempts: submitted ? 1 : 0 };
        }),
      });
      hwCount++;
    }
  }
  console.log(`✔ ${hwCount} homework`);

  // ── Exams ──
  let examCount = 0;
  for (const g of allGroups) {
    const codes = Object.keys(g.teacherIds);
    for (const [k, code] of codes.slice(0, 3).entries()) {
      const done = k < 2;
      const date = done ? daysAgo(int(5, 25), 9) : dayjs().add(int(2, 10), 'day').hour(9).toDate();
      const ex = await prisma.exam.create({ data: { title: `${subj(code).name} — ${done ? 'nazorat ishi' : 'chorak imtihoni'}`, groupId: g.id, subjectId: subj(code).id, authorId: g.teacherIds[code], date, maxScore: 100, status: done ? 'DONE' : 'PLANNED' } });
      if (done) {
        const students = allStudents.filter((s) => s.groupId === g.id);
        await prisma.examResult.createMany({ data: students.map((s) => { const score = int(45, 100); return { examId: ex.id, studentId: s.id, score, grade: score >= 86 ? 5 : score >= 71 ? 4 : score >= 56 ? 3 : 2 }; }) });
      }
      examCount++;
    }
  }
  console.log(`✔ ${examCount} exams`);

  // ── Finance: invoices for last 3 months + this month, payments, expenses ──
  let invSeq: Record<string, number> = {};
  const nextInv = (period: string) => { invSeq[period] = (invSeq[period] ?? 0) + 1; return `INV-${period}-${String(invSeq[period]).padStart(4, '0')}`; };
  let invCount = 0, payCount = 0;
  for (let m = 3; m >= 0; m--) {
    const p = dayjs().subtract(m, 'month');
    const period = p.format('YYYY-MM');
    const dueDate = p.date(10).endOf('day').toDate();
    for (const s of allStudents) {
      const amount = s.monthlyFee;
      const discount = Math.round((amount * s.discountPercent) / 100);
      const total = amount - discount;
      const r = rnd();
      const paidFraction = m === 0 ? (r < 0.55 ? 1 : r < 0.7 ? 0.5 : 0) : r < 0.85 ? 1 : r < 0.93 ? 0.5 : 0;
      const paid = Math.round(total * paidFraction);
      const status = paid >= total ? 'PAID' : paid > 0 ? (dayjs().isAfter(dueDate) ? 'OVERDUE' : 'PARTIAL') : dayjs().isAfter(dueDate) ? 'OVERDUE' : 'PENDING';
      const inv = await prisma.invoice.create({ data: { number: nextInv(period), studentId: s.id, branchId: s.branchId, period, title: `${p.format('MMMM YYYY')} oyi to'lovi`, amount, discount, total, paid, dueDate, status, createdAt: p.startOf('month').toDate() } });
      invCount++;
      if (paid > 0) {
        const parts = paidFraction === 0.5 ? 1 : chance(0.2) ? 2 : 1;
        for (let i = 0; i < parts; i++) {
          await prisma.payment.create({ data: { invoiceId: inv.id, studentId: s.id, amount: Math.round(paid / parts), method: pick(['CASH', 'CARD', 'PAYME', 'CLICK', 'TRANSFER']), paidAt: p.date(int(1, 12)).hour(int(9, 18)).toDate(), recordedById: accountant.id, receiptNo: `R-${period}-${int(1000, 9999)}` } });
          payCount++;
        }
      }
    }
  }
  const EXP = [['Ish haqi', 'Xodimlar oyligi'], ['Ijara', 'Bino ijarasi'], ['Kommunal', 'Elektr va suv'], ['Ovqatlanish', 'Oshxona xarajatlari'], ['Ta\'mirlash', 'Xonalar ta\'miri'], ['Marketing', 'Reklama kampaniyasi'], ['Jihozlar', 'Proyektor va kompyuterlar']];
  for (let m = 3; m >= 0; m--) for (const b of branches) for (const [category, title] of EXP) {
    const base = category === 'Ish haqi' ? 180_000_000 : category === 'Ijara' ? 45_000_000 : int(3_000_000, 15_000_000);
    await prisma.expense.create({ data: { branchId: b.id, category, title, amount: Math.round(base * (b.id === yun.id ? 1 : 0.6)), spentAt: dayjs().subtract(m, 'month').date(int(1, 25)).toDate(), recordedById: accountant.id } });
  }
  console.log(`✔ ${invCount} invoices, ${payCount} payments, expenses`);

  // ── Dormitory (Yunusobod) ──
  const dorm = await prisma.dormitory.create({ data: { name: 'TARGET yotoqxonasi', branchId: yun.id, managerId: komendant.id, address: "Yunusobod, Bog'ishamol ko'chasi 4" } });
  const bedsFree: Array<{ id: string; roomId: string }> = [];
  for (const bname of ['A bino', 'B bino']) {
    const bld = await prisma.dormBuilding.create({ data: { dormitoryId: dorm.id, name: bname, floors: 3 } });
    for (let f = 1; f <= 3; f++) for (let r = 1; r <= 4; r++) {
      const room = await prisma.dormRoom.create({ data: { buildingId: bld.id, number: `${f}0${r}`, floor: f, capacity: 4, gender: bname === 'A bino' ? 'MALE' : 'FEMALE', condition: chance(0.9) ? 'GOOD' : 'NEEDS_REPAIR' } });
      for (const label of ['1', '2', '3', '4']) bedsFree.push({ id: (await prisma.dormBed.create({ data: { roomId: room.id, label } })).id, roomId: room.id });
    }
  }
  const boarders = allStudents.filter((s) => s.isBoarder);
  for (const [i, s] of boarders.entries()) {
    const bed = bedsFree[i];
    if (!bed) break;
    await prisma.dormAssignment.create({ data: { studentId: s.id, bedId: bed.id, checkInAt: daysAgo(int(10, 60)) } });
    for (let d = 7; d >= 1; d--) {
      const r = rnd();
      const type = r < 0.85 ? 'CHECK_IN' : r < 0.95 ? 'LATE' : 'ABSENT';
      await prisma.dormLog.create({ data: { studentId: s.id, roomId: bed.roomId, type, severity: type === 'ABSENT' ? 'WARNING' : 'INFO', title: `Kechki yo'qlama: ${type === 'CHECK_IN' ? 'joyida' : type === 'LATE' ? 'kechikdi' : 'kelmadi'}`, occurredAt: dayjs().subtract(d, 'day').hour(21).minute(int(0, 30)).toDate(), authorId: komendant.id, notified: type !== 'CHECK_IN' } });
    }
  }
  if (boarders.length) await prisma.dormLog.create({ data: { studentId: boarders[0].id, roomId: bedsFree[0].roomId, type: 'ROOM_ISSUE', severity: 'WARNING', title: 'Xonada isitish tizimi ishlamayapti', body: "Radiator sovuq, ta'mirchi chaqirildi.", occurredAt: daysAgo(2, 19), authorId: komendant.id } });
  console.log(`✔ Dormitory: ${boarders.length} boarders`);

  // ── Group messages ──
  const MSG = ["Assalomu alaykum, hurmatli ota-onalar! Ertaga soat 15:00 da ota-onalar yig'ilishi bo'ladi.", 'Bugungi uy vazifasi tizimga kiritildi, iltimos tekshiring.', "Kelasi hafta matematika fanidan nazorat ishi o'tkaziladi.", 'Eslatma: sport formasi juma kuni kerak bo\'ladi.', "Rahmat! O'quvchilar bugun juda faol qatnashdi 👏"];
  for (const g of allGroups) {
    for (let i = 0; i < int(2, 4); i++) await prisma.groupMessage.create({ data: { groupId: g.id, authorId: chance(0.6) ? g.tutorId : pick(Object.values(g.teacherIds)), body: pick(MSG), createdAt: daysAgo(int(0, 12), int(9, 19)) } });
  }

  // ── Announcements ──
  const anns = [
    { title: "Yangi o'quv choragi boshlanishi", body: "Hurmatli ota-onalar va o'quvchilar! 1-oktabrdan yangi chorak boshlanadi. Dars jadvali botda va platformada yangilandi.", priority: 'HIGH' as const, isPinned: true, d: 1 },
    { title: "Ota-onalar yig'ilishi", body: "Juma kuni soat 15:00 da barcha sinflarda ota-onalar yig'ilishi bo'lib o'tadi.", priority: 'NORMAL' as const, isPinned: false, d: 3 },
    { title: "To'lov eslatmasi", body: "Oylik to'lovlarni har oyning 10-sanasigacha amalga oshirishingizni so'raymiz. To'lov holatini botdagi 💳 To'lovlar bo'limida ko'rishingiz mumkin.", priority: 'NORMAL' as const, isPinned: false, d: 6 },
    { title: 'Sport musobaqasi', body: "Shanba kuni maktabimizda sinflararo futbol musobaqasi o'tkaziladi. Barchani tomosha qilishga taklif etamiz!", priority: 'LOW' as const, isPinned: false, d: 9 },
  ];
  for (const a of anns) await prisma.announcement.create({ data: { title: a.title, body: a.body, priority: a.priority, isPinned: a.isPinned, audience: 'ALL', authorId: pick([hr.id, dirYun.id, administrator.id]), publishAt: daysAgo(a.d, 9), createdAt: daysAgo(a.d, 9), sentCount: allStudents.length } });

  // ── Notifications history (so the panel has content) ──
  const sample = allStudents.slice(0, 40);
  for (const s of sample) for (const uid of s.parentUserIds.slice(0, 1)) {
    await prisma.notification.create({ data: { userId: uid, type: 'GRADE', channel: 'BOTH', title: '📊 Yangi baho — Matematika', body: `${s.fullName}\nBaho: 5 ⭐⭐⭐⭐⭐`, status: 'SENT', sentAt: daysAgo(int(0, 5), int(9, 16)) } });
  }

  console.log(`\n🎉 Demo ready. Demo staff accounts (password: ${demoPw}):`);
  for (const e of ['ceo@target-school.uz', 'director@target-school.uz', 'hr@target-school.uz', 'accountant@target-school.uz', 'admin.yun@target-school.uz', 'dorm@target-school.uz', 'teacher@target-school.uz', 'tutor@target-school.uz']) console.log(`   ${e}`);
}

async function main() {
  await ensureCore();
  const superEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@target-school.uz';
  const yun = await prisma.branch.findFirst({ where: { code: 'YUN' } });
  const sa = await ensureSuperAdmin(yun?.id ?? null);
  if ((process.env.SEED_DEMO ?? 'true') !== 'true') return;
  const students = await prisma.student.count();
  if (students > 0 && process.env.SEED_FORCE !== 'true') {
    console.log(`ℹ Database already has ${students} students — skipping demo data (set SEED_FORCE=true to re-seed).`);
    return;
  }
  if (students > 0 || (await prisma.user.count()) > 1) await wipeDemo(superEmail);
  await seedDemo(sa.id);
  const sa2 = await prisma.user.findUnique({ where: { email: superEmail } });
  if (sa2 && !sa2.branchId) { const y = await prisma.branch.findFirst({ where: { code: 'YUN' } }); if (y) await prisma.user.update({ where: { id: sa2.id }, data: { branchId: y.id } }); }
  console.log(`\n   Super Admin: ${superEmail}  (password: SUPER_ADMIN_PASSWORD from .env)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
