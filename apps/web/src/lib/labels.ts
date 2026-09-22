import type { KpiPeriod, QuestionType, ReportStatus, ReportType, RoleKey, SurveyAudience, SurveyStatus, UserStatus } from './types';

export const ROLE_LABELS: Record<RoleKey, string> = { SUPER_ADMIN: 'Super Admin', DIRECTOR: 'Direktor', CEO: 'CEO', HR_ADMIN: 'HR / Admin', TUTOR: 'Tutor', TEACHER: "O'qituvchi" };
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
