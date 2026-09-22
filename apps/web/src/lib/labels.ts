import type { KpiPeriod, QuestionType, ReportStatus, ReportType, RoleKey, SurveyAudience, SurveyStatus, UserStatus } from './types';

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin', DIRECTOR: 'Direktor', CEO: 'CEO', HR_ADMIN: 'HR', ADMINISTRATOR: 'Administrator', ACCOUNTANT: 'Buxgalter', DORM_MANAGER: 'Komendant',
  RECEPTION: 'Reception', MARKETING: 'Marketing', IT_ADMIN: 'IT Admin', TUTOR: 'Tutor', TEACHER: "O'qituvchi", PARENT: 'Ota-ona', STUDENT: "O'quvchi", CUSTOM: 'Maxsus rol',
};
export const USER_STATUS: Record<UserStatus, { label: string; variant: 'success' | 'muted' | 'destructive' | 'warning' }> = {
  ACTIVE: { label: 'Faol', variant: 'success' },
  INACTIVE: { label: 'Nofaol', variant: 'muted' },
  BLOCKED: { label: 'Bloklangan', variant: 'destructive' },
  PENDING: { label: 'Kutilmoqda', variant: 'warning' },
};
export const SURVEY_STATUS: Record<SurveyStatus, { label: string; variant: 'muted' | 'info' | 'success' | 'primary' | 'secondary' }> = {
  DRAFT: { label: 'Qoralama', variant: 'muted' },
  SCHEDULED: { label: 'Rejalashtirilgan', variant: 'info' },
  ACTIVE: { label: 'Faol', variant: 'success' },
  COMPLETED: { label: 'Yakunlangan', variant: 'primary' },
  ARCHIVED: { label: 'Arxiv', variant: 'secondary' },
};
export const AUDIENCE: Record<SurveyAudience, string> = { ALL: 'Barcha xodimlar', TUTORS: 'Tutorlar', TEACHERS: "O'qituvchilar", BRANCH: 'Filial', CUSTOM: 'Tanlangan' };
export const QUESTION_TYPES: Record<QuestionType, { label: string; icon: string }> = {
  TEXT: { label: 'Qisqa matn', icon: '✍️' },
  LONG_TEXT: { label: 'Uzun matn', icon: '📝' },
  SINGLE_CHOICE: { label: 'Bitta tanlov', icon: '🔘' },
  MULTIPLE_CHOICE: { label: "Ko'p tanlov", icon: '☑️' },
  RATING: { label: 'Baho (1–5)', icon: '⭐' },
  YES_NO: { label: 'Ha / Yo‘q', icon: '👍' },
  NUMBER: { label: 'Raqam', icon: '🔢' },
};
export const REPORT_TYPES: Record<ReportType, { label: string; icon: string }> = {
  DAILY: { label: 'Kunlik', icon: '📅' },
  WEEKLY: { label: 'Haftalik', icon: '🗓' },
  MONTHLY: { label: 'Oylik', icon: '📆' },
  LESSON: { label: 'Dars', icon: '📚' },
  PROBLEM: { label: 'Muammo', icon: '⚠️' },
  STUDENT_FEEDBACK: { label: "O'quvchi fikri", icon: '💬' },
};
export const REPORT_STATUS: Record<ReportStatus, { label: string; variant: 'warning' | 'success' | 'destructive' | 'info' }> = {
  PENDING: { label: 'Kutilmoqda', variant: 'warning' },
  APPROVED: { label: 'Tasdiqlangan', variant: 'success' },
  REJECTED: { label: 'Rad etilgan', variant: 'destructive' },
  NEEDS_REVISION: { label: 'Qayta ishlash', variant: 'info' },
};
export const KPI_PERIODS: Record<KpiPeriod, string> = { WEEKLY: 'Haftalik', MONTHLY: 'Oylik', QUARTERLY: 'Choraklik' };
export const PRIORITY: Record<string, { label: string; variant: 'muted' | 'secondary' | 'warning' | 'destructive' }> = {
  LOW: { label: 'Past', variant: 'muted' }, NORMAL: { label: 'Oddiy', variant: 'secondary' }, HIGH: { label: 'Yuqori', variant: 'warning' }, URGENT: { label: 'Shoshilinch', variant: 'destructive' },
};
export const TASK_STATUS: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'muted' }> = {
  OPEN: { label: 'Ochiq', variant: 'info' }, IN_PROGRESS: { label: 'Jarayonda', variant: 'warning' }, DONE: { label: 'Bajarilgan', variant: 'success' }, CANCELLED: { label: 'Bekor', variant: 'muted' },
};
export const NOTIF_TYPES: Record<string, string> = {
  SURVEY_ASSIGNED: "Yangi so'rovnoma", SURVEY_REMINDER: 'Eslatma', SURVEY_DEADLINE: 'Muddat', SURVEY_COMPLETED: 'Yakunlandi', ANNOUNCEMENT: "E'lon", TASK_ASSIGNED: 'Vazifa', TASK_REMINDER: 'Vazifa eslatmasi', REPORT_REMINDER: 'Hisobot eslatmasi', REPORT_REVIEWED: 'Hisobot ko‘rildi', ADMIN_MESSAGE: 'Admin xabari', SYSTEM: 'Tizim',
};

// ── School ───────────────────────────────────────────────────────────────────
export const ATTENDANCE: Record<string, { label: string; short: string; variant: 'success' | 'destructive' | 'warning' | 'muted'; dot: string }> = {
  PRESENT: { label: 'Kelgan', short: 'K', variant: 'success', dot: 'bg-success' },
  ABSENT: { label: 'Kelmagan', short: 'Y', variant: 'destructive', dot: 'bg-destructive' },
  LATE: { label: 'Kechikkan', short: 'Kch', variant: 'warning', dot: 'bg-warning' },
  EXCUSED: { label: 'Sababli', short: 'S', variant: 'muted', dot: 'bg-muted-foreground/50' },
};
export const HW_STATUS: Record<string, { label: string; variant: 'muted' | 'warning' | 'success' | 'destructive' | 'primary' }> = {
  NOT_SUBMITTED: { label: 'Topshirilmagan', variant: 'muted' },
  SUBMITTED: { label: 'Tekshirilmoqda', variant: 'warning' },
  ACCEPTED: { label: 'Qabul qilindi', variant: 'success' },
  REVISION: { label: 'Qayta ishlash', variant: 'destructive' },
  GRADED: { label: 'Baholandi', variant: 'primary' },
};
export const INVOICE_STATUS: Record<string, { label: string; variant: 'muted' | 'warning' | 'success' | 'destructive' | 'info' }> = {
  PENDING: { label: 'Kutilmoqda', variant: 'info' },
  PARTIAL: { label: 'Qisman', variant: 'warning' },
  PAID: { label: "To'langan", variant: 'success' },
  OVERDUE: { label: "Muddati o'tgan", variant: 'destructive' },
  CANCELLED: { label: 'Bekor', variant: 'muted' },
};
export const STUDENT_STATUS: Record<string, { label: string; variant: 'success' | 'muted' | 'warning' | 'destructive' }> = {
  ACTIVE: { label: 'Faol', variant: 'success' }, INACTIVE: { label: 'Nofaol', variant: 'muted' }, GRADUATED: { label: 'Bitirgan', variant: 'warning' }, ARCHIVED: { label: 'Arxiv', variant: 'destructive' }, EXPELLED: { label: 'Chetlashtirilgan', variant: 'destructive' }, TRANSFERRED: { label: "Ko'chgan", variant: 'muted' },
};
export const GRADE_KIND: Record<string, string> = { LESSON: 'Dars', HOMEWORK: 'Uy vazifasi', QUIZ: 'Nazorat', EXAM: 'Imtihon', PROJECT: 'Loyiha', BEHAVIOR: 'Xulq' };
export const PAYMENT_METHOD: Record<string, string> = { CASH: 'Naqd', CARD: 'Karta', TRANSFER: "O'tkazma", PAYME: 'Payme', CLICK: 'Click', OTHER: 'Boshqa' };
export const EXAM_STATUS: Record<string, { label: string; variant: 'info' | 'success' | 'muted' }> = { PLANNED: { label: 'Rejalashtirilgan', variant: 'info' }, DONE: { label: "O'tkazildi", variant: 'success' }, CANCELLED: { label: 'Bekor', variant: 'muted' } };
export const DORM_LOG: Record<string, { label: string; variant: 'success' | 'muted' | 'warning' | 'destructive' | 'info' }> = {
  CHECK_IN: { label: 'Kirish', variant: 'success' }, CHECK_OUT: { label: 'Chiqish', variant: 'muted' }, LATE: { label: 'Kechikish', variant: 'warning' }, ABSENT: { label: 'Kelmagan', variant: 'destructive' }, INCIDENT: { label: 'Incident', variant: 'destructive' }, ROOM_ISSUE: { label: 'Xona muammosi', variant: 'warning' }, NOTE: { label: 'Izoh', variant: 'info' },
};
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export const DAY_UZ: Record<string, string> = { MON: 'Dushanba', TUE: 'Seshanba', WED: 'Chorshanba', THU: 'Payshanba', FRI: 'Juma', SAT: 'Shanba', SUN: 'Yakshanba' };
export const DAY_SHORT: Record<string, string> = { MON: 'Du', TUE: 'Se', WED: 'Ch', THU: 'Pa', FRI: 'Ju', SAT: 'Sh', SUN: 'Ya' };
export const fmtUZS = (n?: number | string | null) => (n === null || n === undefined ? '—' : `${Math.round(Number(n)).toLocaleString('ru-RU').replace(/,/g, ' ')} so'm`);
export const fmtUZSshort = (n?: number | string | null) => {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} mlrd`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} mln`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)} ming`;
  return String(v);
};
