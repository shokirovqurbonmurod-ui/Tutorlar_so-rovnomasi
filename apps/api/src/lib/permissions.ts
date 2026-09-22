import type { RoleKey } from '../generated/prisma/enums.js';

/**
 * Central permission catalogue. Keys follow "<resource>.<action>".
 * Default role → permission sets are below; Super Admin implicitly has "*".
 *
 * Effective permissions are resolved from the DATABASE (role_permissions) so the
 * Super Admin can create custom roles and edit permissions of any role at runtime.
 * The maps in this file are the defaults used by the seed and as a fallback.
 */
export const PERMISSIONS = {
  // dashboard / analytics
  'dashboard.view': "Boshqaruv panelini ko'rish",
  'analytics.view': "Analitikani ko'rish",
  'analytics.business': 'Biznes darajadagi analitika',
  'analytics.export': 'Hisobotlarni eksport qilish',
  'kpi.view': "KPI ko'rish",
  'kpi.manage': "KPI ko'rsatkichlarini boshqarish",
  // users & roles
  'users.view': "Foydalanuvchilarni ko'rish",
  'users.create': "Foydalanuvchi qo'shish",
  'users.update': 'Foydalanuvchini tahrirlash',
  'users.delete': "Foydalanuvchini o'chirish",
  'users.manage_roles': 'Rollar va huquqlarni boshqarish',
  // org
  'branches.view': "Filiallarni ko'rish",
  'branches.manage': 'Filiallarni boshqarish',
  'departments.manage': "Bo'limlarni boshqarish",
  // academics
  'students.view': "O'quvchilarni ko'rish",
  'students.manage': "O'quvchilarni qo'shish/tahrirlash",
  'parents.view': "Ota-onalarni ko'rish",
  'parents.manage': 'Ota-onalarni boshqarish',
  'groups.view': "Guruhlarni ko'rish",
  'groups.manage': 'Guruhlarni boshqarish',
  'subjects.manage': 'Fanlarni boshqarish',
  'schedule.view': "Dars jadvalini ko'rish",
  'schedule.manage': 'Dars jadvalini boshqarish',
  'attendance.view': "Davomatni ko'rish",
  'attendance.mark': "Davomat qo'yish",
  'grades.view': "Baholarni ko'rish",
  'grades.manage': "Baho qo'yish",
  'homework.view': "Uy vazifalarini ko'rish",
  'homework.manage': 'Uy vazifasi berish va tekshirish',
  'exams.view': "Imtihonlarni ko'rish",
  'exams.manage': 'Imtihonlarni boshqarish',
  'messages.view': "Guruh xabarlarini ko'rish",
  'messages.send': 'Guruhga xabar yuborish',
  // finance
  'finance.view': "Moliya bo'limini ko'rish",
  'finance.manage': "To'lov, chegirma, xarajat kiritish",
  'finance.reports': 'Moliyaviy hisobotlar',
  // dormitory
  'dorm.view': "Yotoqxonani ko'rish",
  'dorm.manage': 'Yotoqxonani boshqarish',
  // surveys
  'surveys.view': "So'rovnomalarni ko'rish",
  'surveys.create': "So'rovnoma yaratish",
  'surveys.update': "So'rovnomani tahrirlash",
  'surveys.delete': "So'rovnomani o'chirish",
  'surveys.send': "So'rovnoma yuborish",
  'surveys.results': "So'rovnoma natijalarini ko'rish",
  'surveys.results_hr': "HR so'rovnoma natijalari",
  // reports
  'reports.view': "Hisobotlarni ko'rish",
  'reports.review': 'Hisobotlarni tasdiqlash/rad etish',
  'reports.submit': 'Hisobot topshirish',
  // announcements / tasks / notifications
  'announcements.view': "E'lonlarni ko'rish",
  'announcements.manage': "E'lonlarni boshqarish",
  'tasks.manage': 'Vazifalarni boshqarish',
  'notifications.send': 'Bildirishnoma yuborish',
  'notifications.view': "Bildirishnomalarni ko'rish",
  // system
  'settings.view': "Sozlamalarni ko'rish",
  'settings.manage': 'Tizim sozlamalarini boshqarish',
  'audit.view': "Audit jurnalini ko'rish",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

const VIEW_ACADEMIC: PermissionKey[] = [
  'students.view', 'parents.view', 'groups.view', 'schedule.view', 'attendance.view', 'grades.view', 'homework.view', 'exams.view', 'messages.view',
];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  DIRECTOR: [
    'dashboard.view', 'analytics.view', 'analytics.export', 'kpi.view', 'kpi.manage',
    'users.view', 'users.create', 'users.update', 'branches.view', 'departments.manage',
    ...VIEW_ACADEMIC, 'students.manage', 'parents.manage', 'groups.manage', 'subjects.manage', 'schedule.manage',
    'attendance.mark', 'grades.manage', 'homework.manage', 'exams.manage', 'messages.send',
    'finance.view', 'finance.reports', 'dorm.view',
    'surveys.view', 'surveys.create', 'surveys.update', 'surveys.send', 'surveys.results',
    'reports.view', 'reports.review',
    'announcements.view', 'announcements.manage', 'tasks.manage',
    'notifications.view', 'notifications.send', 'settings.view', 'audit.view',
  ],
  CEO: [
    'dashboard.view', 'analytics.view', 'analytics.business', 'analytics.export', 'kpi.view',
    'users.view', 'branches.view', ...VIEW_ACADEMIC,
    'finance.view', 'finance.reports', 'dorm.view',
    'surveys.view', 'surveys.results', 'reports.view', 'announcements.view', 'notifications.view', 'settings.view',
  ],
  HR_ADMIN: [
    'dashboard.view', 'analytics.view', 'kpi.view',
    'users.view', 'users.create', 'users.update', 'branches.view', 'departments.manage',
    ...VIEW_ACADEMIC, 'students.manage', 'parents.manage', 'groups.manage',
    'surveys.view', 'surveys.send', 'surveys.results_hr',
    'reports.view', 'announcements.view', 'announcements.manage',
    'notifications.view', 'notifications.send', 'settings.view',
  ],
  ADMINISTRATOR: [
    'dashboard.view', 'users.view', 'branches.view',
    ...VIEW_ACADEMIC, 'students.manage', 'parents.manage', 'groups.manage', 'subjects.manage', 'schedule.manage',
    'attendance.mark', 'exams.manage', 'messages.send',
    'announcements.view', 'announcements.manage', 'notifications.view', 'notifications.send', 'settings.view',
  ],
  ACCOUNTANT: [
    'dashboard.view', 'students.view', 'parents.view', 'groups.view', 'branches.view',
    'finance.view', 'finance.manage', 'finance.reports', 'analytics.export',
    'announcements.view', 'notifications.view',
  ],
  DORM_MANAGER: [
    'dashboard.view', 'students.view', 'parents.view', 'groups.view',
    'dorm.view', 'dorm.manage', 'messages.send', 'announcements.view', 'notifications.view', 'notifications.send',
  ],
  RECEPTION: [
    'dashboard.view', 'students.view', 'students.manage', 'parents.view', 'parents.manage', 'groups.view', 'schedule.view',
    'finance.view', 'announcements.view', 'notifications.view',
  ],
  MARKETING: ['dashboard.view', 'analytics.view', 'students.view', 'groups.view', 'branches.view', 'announcements.view', 'announcements.manage', 'notifications.view', 'notifications.send'],
  IT_ADMIN: ['dashboard.view', 'users.view', 'users.create', 'users.update', 'branches.view', 'settings.view', 'settings.manage', 'audit.view', 'notifications.view'],
  TEACHER: [
    'dashboard.view', 'groups.view', 'students.view', 'schedule.view',
    'attendance.view', 'attendance.mark', 'grades.view', 'grades.manage', 'homework.view', 'homework.manage', 'exams.view', 'exams.manage',
    'messages.view', 'messages.send', 'reports.submit', 'announcements.view', 'notifications.view',
  ],
  TUTOR: [
    'dashboard.view', 'groups.view', 'students.view', 'parents.view', 'schedule.view',
    'attendance.view', 'attendance.mark', 'grades.view', 'homework.view', 'exams.view',
    'messages.view', 'messages.send', 'reports.submit', 'announcements.view', 'notifications.view',
  ],
  // Parents/students use Telegram; API access is additionally scoped to own children / self (see lib/scope.ts)
  PARENT: ['announcements.view', 'notifications.view', 'messages.view', 'students.view', 'schedule.view', 'attendance.view', 'grades.view', 'homework.view', 'exams.view', 'dorm.view'],
  STUDENT: ['announcements.view', 'notifications.view', 'messages.view', 'schedule.view', 'attendance.view', 'grades.view', 'homework.view', 'exams.view'],
  CUSTOM: [],
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  DIRECTOR: 'Direktor',
  CEO: 'CEO',
  HR_ADMIN: 'HR',
  ADMINISTRATOR: 'Administrator',
  ACCOUNTANT: 'Buxgalter',
  DORM_MANAGER: 'Yotoqxona komendanti',
  RECEPTION: 'Reception',
  MARKETING: 'Marketing',
  IT_ADMIN: 'IT Admin',
  TUTOR: 'Tutor',
  TEACHER: "O'qituvchi",
  PARENT: 'Ota-ona',
  STUDENT: "O'quvchi",
  CUSTOM: 'Maxsus rol',
};

/** System roles created by the seed (CUSTOM is a kind, not a concrete role). */
export const SYSTEM_ROLE_KEYS = (Object.keys(ROLE_LABELS) as RoleKey[]).filter((k) => k !== 'CUSTOM');

/** Roles that may log into the web dashboard (staff). Parents/students use Telegram. */
export const DASHBOARD_ROLES: RoleKey[] = ['SUPER_ADMIN', 'DIRECTOR', 'CEO', 'HR_ADMIN', 'ADMINISTRATOR', 'ACCOUNTANT', 'DORM_MANAGER', 'RECEPTION', 'MARKETING', 'IT_ADMIN', 'TEACHER', 'TUTOR', 'CUSTOM'];
/** Roles that receive surveys / submit reports via Telegram. */
export const FIELD_ROLES: RoleKey[] = ['TUTOR', 'TEACHER'];
/** Staff roles (everything except parent/student). */
export const STAFF_ROLES: RoleKey[] = SYSTEM_ROLE_KEYS.filter((k) => k !== 'PARENT' && k !== 'STUDENT');

// ───────────────────────────── DB-backed resolution ─────────────────────────

type Resolver = (roleId: string) => Promise<PermissionKey[] | null>;
let resolver: Resolver | null = null;
const cache = new Map<string, { perms: Set<PermissionKey>; at: number }>();
const TTL = 30_000;

/** Wired by prisma module at startup (avoids a circular import here). */
export const registerPermissionResolver = (fn: Resolver) => {
  resolver = fn;
};
export const invalidatePermissionCache = (roleId?: string) => (roleId ? cache.delete(roleId) : cache.clear());

/** Static check by role kind (sync). Used where no roleId is at hand. */
export const hasPermission = (role: RoleKey, perm: PermissionKey) => role === 'SUPER_ADMIN' || ROLE_PERMISSIONS[role].includes(perm);

/** Effective check: DB role_permissions (cached 30s) with static fallback. */
export async function hasPermissionAsync(role: RoleKey, roleId: string | undefined, perm: PermissionKey): Promise<boolean> {
  if (role === 'SUPER_ADMIN') return true;
  const set = await permissionsForRole(role, roleId);
  return set.includes(perm);
}

export async function permissionsForRole(role: RoleKey, roleId?: string): Promise<PermissionKey[]> {
  if (role === 'SUPER_ADMIN') return ALL_PERMISSIONS;
  if (roleId && resolver) {
    const hit = cache.get(roleId);
    if (hit && Date.now() - hit.at < TTL) return [...hit.perms];
    const fromDb = await resolver(roleId).catch(() => null);
    if (fromDb) {
      cache.set(roleId, { perms: new Set(fromDb), at: Date.now() });
      return fromDb;
    }
  }
  return ROLE_PERMISSIONS[role] ?? [];
}
