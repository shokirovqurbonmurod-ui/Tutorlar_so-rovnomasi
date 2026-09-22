import type { RoleKey } from '../generated/prisma/enums.js';

/**
 * Central permission catalogue. Keys follow "<resource>.<action>".
 * Roles are mapped to permission sets below; Super Admin implicitly has "*".
 */
export const PERMISSIONS = {
  // dashboard / analytics
  'dashboard.view': 'Boshqaruv panelini ko\'rish',
  'analytics.view': 'Analitikani ko\'rish',
  'analytics.business': 'Biznes darajadagi analitika',
  'analytics.export': 'Hisobotlarni eksport qilish',
  'kpi.view': 'KPI ko\'rish',
  'kpi.manage': 'KPI ko\'rsatkichlarini boshqarish',
  // users
  'users.view': 'Foydalanuvchilarni ko\'rish',
  'users.create': 'Foydalanuvchi qo\'shish',
  'users.update': 'Foydalanuvchini tahrirlash',
  'users.delete': 'Foydalanuvchini o\'chirish',
  'users.manage_roles': 'Rollarni boshqarish',
  // org
  'branches.view': 'Filiallarni ko\'rish',
  'branches.manage': 'Filiallarni boshqarish',
  'departments.manage': 'Bo\'limlarni boshqarish',
  // surveys
  'surveys.view': 'So\'rovnomalarni ko\'rish',
  'surveys.create': 'So\'rovnoma yaratish',
  'surveys.update': 'So\'rovnomani tahrirlash',
  'surveys.delete': 'So\'rovnomani o\'chirish',
  'surveys.send': 'So\'rovnoma yuborish',
  'surveys.results': 'So\'rovnoma natijalarini ko\'rish',
  'surveys.results_hr': 'HR so\'rovnoma natijalari',
  // reports
  'reports.view': 'Hisobotlarni ko\'rish',
  'reports.review': 'Hisobotlarni tasdiqlash/rad etish',
  'reports.submit': 'Hisobot topshirish',
  // announcements / tasks / notifications
  'announcements.view': 'E\'lonlarni ko\'rish',
  'announcements.manage': 'E\'lonlarni boshqarish',
  'tasks.manage': 'Vazifalarni boshqarish',
  'notifications.send': 'Bildirishnoma yuborish',
  'notifications.view': 'Bildirishnomalarni ko\'rish',
  // system
  'settings.view': 'Sozlamalarni ko\'rish',
  'settings.manage': 'Tizim sozlamalarini boshqarish',
  'audit.view': 'Audit jurnalini ko\'rish',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: ALL,
  DIRECTOR: [
    'dashboard.view', 'analytics.view', 'analytics.export', 'kpi.view',
    'users.view', 'branches.view',
    'surveys.view', 'surveys.create', 'surveys.update', 'surveys.send', 'surveys.results',
    'reports.view', 'reports.review',
    'announcements.view', 'announcements.manage', 'tasks.manage',
    'notifications.view', 'notifications.send', 'settings.view',
  ],
  CEO: [
    'dashboard.view', 'analytics.view', 'analytics.business', 'analytics.export', 'kpi.view',
    'users.view', 'branches.view', 'surveys.view', 'surveys.results',
    'reports.view', 'announcements.view', 'notifications.view', 'settings.view',
  ],
  HR_ADMIN: [
    'dashboard.view', 'analytics.view', 'kpi.view',
    'users.view', 'users.create', 'users.update', 'branches.view', 'departments.manage',
    'surveys.view', 'surveys.send', 'surveys.results_hr',
    'reports.view', 'announcements.view', 'announcements.manage',
    'notifications.view', 'notifications.send', 'settings.view',
  ],
  TUTOR: ['reports.submit', 'announcements.view', 'notifications.view'],
  TEACHER: ['reports.submit', 'announcements.view', 'notifications.view'],
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  DIRECTOR: 'Direktor',
  CEO: 'CEO',
  HR_ADMIN: 'HR / Admin',
  TUTOR: 'Tutor',
  TEACHER: "O'qituvchi",
};

/** Roles that may log into the web dashboard. */
export const DASHBOARD_ROLES: RoleKey[] = ['SUPER_ADMIN', 'DIRECTOR', 'CEO', 'HR_ADMIN'];
/** Roles that receive surveys / submit reports via Telegram. */
export const FIELD_ROLES: RoleKey[] = ['TUTOR', 'TEACHER'];

export const hasPermission = (role: RoleKey, perm: PermissionKey) =>
  role === 'SUPER_ADMIN' || ROLE_PERMISSIONS[role].includes(perm);
