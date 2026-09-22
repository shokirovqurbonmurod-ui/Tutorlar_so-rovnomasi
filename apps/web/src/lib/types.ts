export type RoleKey = 'SUPER_ADMIN' | 'DIRECTOR' | 'CEO' | 'HR_ADMIN' | 'TUTOR' | 'TEACHER' | 'PARENT' | 'STUDENT' | 'ACCOUNTANT' | 'ADMINISTRATOR' | 'DORM_MANAGER' | 'RECEPTION' | 'MARKETING' | 'IT_ADMIN' | 'CUSTOM';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'PENDING';
export type SurveyStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type SurveyAudience = 'ALL' | 'TUTORS' | 'TEACHERS' | 'BRANCH' | 'CUSTOM';
export type QuestionType = 'TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'RATING' | 'YES_NO' | 'NUMBER';
export type ReportType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'PROBLEM' | 'STUDENT_FEEDBACK' | 'LESSON';
export type ReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
export type KpiPeriod = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface Role { id?: string; key: RoleKey; name: string; slug?: string }
export interface BranchRef { id: string; name: string; code?: string }
export interface DepartmentRef { id: string; name: string }

export interface AuthUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  language: string;
  position: string | null;
  status: UserStatus;
  telegramId: string | null;
  telegramUsername: string | null;
  lastLoginAt: string | null;
  role: Role;
  branch: BranchRef | null;
  department: DepartmentRef | null;
  permissions: string[];
}

export interface User extends Omit<AuthUser, 'permissions'> {
  joinDate?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  notes?: string | null;
  groups?: Array<{ id: string; name: string; subject?: string | null }>;
  tutorGroups?: Array<{ id: string; name: string }>;
  teacherGroups?: Array<{ id: string; name: string }>;
  _count?: { responses?: number; reports?: number };
  stats?: Record<string, number | null>;
}

export interface Paginated<T> { items: T[]; total: number; page: number; limit: number; pages: number }

export interface Branch {
  id: string; name: string; code: string; city: string | null; address: string | null; phone: string | null; isActive: boolean; studentCount: number | null;
  director?: { id: string; fullName: string } | null; ceo?: { id: string; fullName: string } | null;
  departments?: Array<{ id: string; name: string; _count?: { users: number } }>;
  stats?: { tutors: number; teachers: number; staff: number; responses: number; completionRate: number | null; avgRating: number | null };
  _count?: { users: number; groups: number; departments: number };
}

export interface SurveyOption { id: string; order: number; label: string; value?: string | null }
export interface SurveyQuestion { id: string; order: number; type: QuestionType; text: string; hint: string | null; isRequired: boolean; minValue: number | null; maxValue: number | null; options: SurveyOption[] }
export interface Survey {
  id: string; title: string; description: string | null; status: SurveyStatus; audience: SurveyAudience; isAnonymous: boolean; allowMultiple?: boolean;
  scheduledAt: string | null; deadline: string | null; sentAt: string | null; closedAt: string | null; createdAt: string; updatedAt: string;
  branch: BranchRef | null; branchId?: string | null; createdBy?: { id: string; fullName: string } | null;
  questions?: SurveyQuestion[];
  stats?: { assigned: number; completed: number; completionRate: number | null; avgRating: number | null };
  _count?: { questions: number; assignments: number; responses: number };
}

export interface SurveyResults {
  survey: Survey;
  summary: { participants: number; assigned: number; completed: number; completionRate: number | null; avgRating: number | null; avgDurationSec: number | null };
  questions: Array<SurveyQuestion & { answered: number; avg?: number | null; distribution?: Array<{ id?: string; label: string; count: number }>; texts?: Array<{ value: string; user?: string | null; at: string }>; yes?: number; no?: number; min?: number; max?: number }>;
  responses: Array<{ id: string; submittedAt: string; durationSec: number | null; avgRating: number | null; user: { id: string; fullName: string; role?: Role } | null; branch?: BranchRef | null; answers: Array<{ questionId: string; value: string | number | boolean | string[] | null }> }>;
  byBranch?: Array<{ branch: string; completed: number; assigned: number; avgRating: number | null }>;
}

export interface Report {
  id: string; type: ReportType; title: string; content: string; status: ReportStatus; periodStart: string | null; periodEnd: string | null; createdAt: string; reviewedAt: string | null; reviewNote: string | null;
  author: { id: string; fullName: string; role?: Role; branch?: BranchRef | null; avatarUrl?: string | null };
  reviewer?: { id: string; fullName: string } | null;
  group?: { id: string; name: string } | null;
  attachments?: Array<{ id: string; fileName: string; url: string }>;
}

export interface Announcement {
  id: string; title: string; body: string; priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'; isPinned: boolean; audience: SurveyAudience; branch: BranchRef | null; publishAt: string | null; expiresAt: string | null; sentCount: number; createdAt: string;
  author?: { id: string; fullName: string } | null; _count?: { reads: number }; readCount?: number; targetCount?: number;
}

export interface Task { id: string; title: string; description: string | null; status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'; priority: string; dueAt: string | null; completedAt: string | null; createdAt: string; assignee: { id: string; fullName: string }; createdBy?: { id: string; fullName: string } }

export interface Notification { id: string; type: string; channel: string; status: string; title: string; body: string; sentAt: string | null; createdAt: string; error: string | null; user?: { id: string; fullName: string } | null }

export interface KpiMetric { id: string; key: string; name: string; description: string | null; weight: number; unit: string | null; target: number | null; isActive: boolean; appliesTo: RoleKey[] }
export interface Performer { id: string; fullName: string; avatarUrl: string | null; role: Role; branch: { name: string } | null; assigned: number; completed: number; completionRate: number | null; reports: number; kpiScore: number | null; avgRating: number | null }

export interface KpiRow { user: { id: string; fullName: string; role: Role; branch: BranchRef | null; avatarUrl?: string | null; position?: string | null }; total: number; metrics: Array<{ key: string; name: string; weight: number; value: number; score: number }> }
export interface Leaderboard { period: KpiPeriod; range: { start: string; end: string }; average: number; count: number; items: KpiRow[] }

export interface AuditLog { id: string; action: string; entity: string; entityId: string | null; ip: string | null; source: string; meta: unknown; createdAt: string; user: { id: string; fullName: string; role?: Role } | null }

export interface DashboardData {
  overview: { totalTutors: number; totalTeachers: number; activeUsers: number; telegramLinked: number; surveysSent: number; surveysCompleted: number; surveysAssigned: number; completionRate: number; completionRateDelta: number; pendingReports: number; reportsThisPeriod: number; reportsDelta: number; avgRating: number | null; activeSurveys: number; overdueAssignments: number };
  completion: Array<{ date: string; assigned: number; completed: number }>;
  rating: Array<{ week: string; avg: number; responses: number }>;
  activity: Array<{ date: string; tutors: number; teachers: number }>;
  branches: Array<{ id: string; name: string; code: string; staff: number; students: number | null; completionRate: number | null; avgRating: number | null; reports: number; approvedRate: number | null; kpiScore: number | null }>;
  top: Performer[];
  reports: { byStatus: Array<{ status: ReportStatus; count: number }>; byType: Array<{ type: ReportType; count: number }>; weekly: Array<{ week: string; count: number; approved?: number }> };
  recent: Array<{ id: string; kind: 'response' | 'report' | 'user' | 'survey' | 'announcement'; title: string; at: string; user?: { id: string; fullName: string; avatarUrl?: string | null } | null; meta?: Record<string, unknown> }>;
  deadlines: Array<{ id: string; title: string; deadline: string; assigned: number; completed: number }>;
  scope: { from: string; to: string; branchId?: string };
}
