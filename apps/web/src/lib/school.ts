'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Paginated } from './types';

/** Types mirrored from the API (serialized: Decimal→string, BigInt→string). */
export interface Ref { id: string; name: string }
export interface UserRef { id: string; fullName: string; phone?: string | null; avatarUrl?: string | null; telegramId?: string | null; telegramUsername?: string | null }
export interface Subject { id: string; name: string; code: string | null; color: string | null; branchId: string | null; isActive: boolean; _count?: { lessons: number; grades: number; homeworks: number; groupTeachers: number } }
export interface Room { id: string; name: string; building: string | null; floor: number | null; capacity: number | null; branchId: string; branch?: Ref; _count?: { lessons: number } }
export interface Group {
  id: string; name: string; subject: string | null; gradeLevel: number | null; academicYear: string | null; room: string | null; branchId: string; tutorId: string | null; teacherId: string | null; studentCount: number; isActive: boolean; allowParentChat: boolean;
  branch?: { id: string; name: string; code: string }; tutor?: UserRef | null; teacher?: UserRef | null;
  teachers?: Array<{ groupId: string; teacherId: string; subjectId: string; teacher: UserRef; subject: { id: string; name: string; color: string | null } }>;
  _count?: { students: number; homeworks: number; messages: number; lessons: number };
  students?: Student[];
}
export interface ParentLink { relation: string | null; isPrimary: boolean; parent: { id: string; relation: string | null; occupation?: string | null; user: UserRef & { status?: string } } }
export interface Student {
  id: string; userId: string | null; firstName: string; lastName: string; middleName: string | null; fullName: string; gender: 'MALE' | 'FEMALE' | null; birthDate: string | null; studentCode: string; phone: string | null; address: string | null; avatarUrl: string | null;
  branchId: string; groupId: string | null; status: string; enrolledAt: string; monthlyFee: string; discountPercent: number; discountNote: string | null; isBoarder: boolean; notes: string | null;
  branch?: { id: string; name: string; code: string }; group?: { id: string; name: string; gradeLevel?: number | null; tutor?: UserRef | null } | null; parents?: ParentLink[]; user?: { id: string; telegramId: string | null; telegramUsername: string | null; status: string } | null;
  dormAssignment?: { id: string; checkInAt: string; bed?: { label: string; room: { number: string; floor: number; building: { name: string; dormitory: { name: string } } } } } | null;
  debt?: number;
}
export interface StudentDetail extends Student {
  summary: { attendance30: { PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number; total: number; rate: number | null }; avgGrade30: number | null; gradesCount30: number; homeworkPending: number; debt: number };
  recentGrades: Grade[]; recentAttendance: Attendance[]; recentInvoices: Invoice[];
}
export interface Parent { id: string; userId: string; relation: string | null; occupation: string | null; workplace: string | null; address: string | null; user: UserRef & { status: string; email?: string | null }; children: Array<{ relation: string | null; isPrimary: boolean; student: { id: string; fullName: string; studentCode: string; group?: Ref | null; branch?: Ref } }> }
export interface Lesson { id: string; groupId: string; subjectId: string; teacherId: string | null; roomId: string | null; weekday: string; startTime: string; endTime: string; order: number; note: string | null; subject: { id: string; name: string; color: string | null }; teacher: UserRef | null; room: { id: string; name: string; building: string | null } | null; group: { id: string; name: string; branchId: string } }
export interface Attendance { id: string; studentId: string; groupId: string; lessonId: string | null; date: string; status: string; lateMinutes: number | null; reason: string | null; student?: { id: string; fullName: string; studentCode: string }; group?: Ref; markedBy?: UserRef | null; lesson?: { subject: Ref } | null }
export interface Grade { id: string; studentId: string; groupId: string | null; subjectId: string; teacherId: string | null; date: string; value: number; maxValue: number; kind: string; comment: string | null; student?: { id: string; fullName: string; studentCode?: string; group?: Ref | null }; subject: { id: string; name: string; color?: string | null }; teacher?: UserRef | null }
export interface Homework { id: string; groupId: string; subjectId: string; authorId: string; title: string; task: string; fileUrl: string | null; fileName: string | null; note: string | null; deadline: string; maxScore: number; createdAt: string; group: Ref; subject: { id: string; name: string; color?: string | null }; author: UserRef; stats?: Record<string, number>; _count?: { submissions: number }; submissions?: Submission[] }
export interface Submission { id: string; homeworkId: string; studentId: string; status: string; content: string | null; fileUrl: string | null; fileName: string | null; telegramFileId: string | null; score: number | null; feedback: string | null; submittedAt: string | null; reviewedAt: string | null; student: { id: string; fullName: string; studentCode?: string } }
export interface Exam { id: string; title: string; groupId: string; subjectId: string; date: string; maxScore: number; status: string; note: string | null; group: Ref; subject: Ref; author?: UserRef | null; _count?: { results: number }; results?: Array<{ studentId: string; score: number; grade: number | null; comment: string | null; student: { id: string; fullName: string } }>; avg?: number | null }
export interface Invoice { id: string; number: string; studentId: string; branchId: string; period: string; title: string; amount: string; discount: string; total: string; paid: string; dueDate: string; status: string; note: string | null; student?: { id: string; fullName: string; studentCode: string; group?: Ref | null; parents?: ParentLink[] }; branch?: Ref; payments?: Payment[] }
export interface Payment { id: string; invoiceId: string | null; studentId: string; amount: string; method: string; paidAt: string; receiptNo: string | null; note: string | null; student?: { id: string; fullName: string; studentCode: string; group?: Ref | null }; invoice?: { id: string; number: string; period: string } | null; recordedBy?: UserRef | null }
export interface Expense { id: string; branchId: string | null; category: string; title: string; amount: string; spentAt: string; note: string | null; branch?: Ref | null; recordedBy?: UserRef | null }
export interface FinanceSummary { range: { from: string; to: string }; income: number; expenses: number; profit: number; paymentsCount: number; debt: number; debtors: number; invoices: Array<{ status: string; count: number; total: number; paid: number }>; byMethod: Array<{ method: string; amount: number }>; expensesByCategory: Array<{ category: string; amount: number }>; recentPayments: Payment[]; monthly: Array<{ month: string; income: number; expenses: number; expected: number }> }
export interface Debtor { student: { id: string; fullName: string; studentCode: string; group?: Ref | null; branch?: Ref; parents?: ParentLink[] }; debt: number; invoices: number; oldestDue: string | null }
export interface DormBed { id: string; label: string; assignment?: { id: string; checkInAt: string; checkOutAt: string | null; student: { id: string; fullName: string; studentCode: string; group?: Ref | null } } | null }
export interface DormRoom { id: string; number: string; floor: number; capacity: number; gender: string | null; condition: string; note: string | null; beds: DormBed[] }
export interface DormBuilding { id: string; name: string; floors: number; rooms: DormRoom[] }
export interface Dormitory { id: string; name: string; address: string | null; branchId: string; managerId: string | null; branch?: Ref; manager?: UserRef | null; buildings: DormBuilding[]; stats?: { beds: number; occupied: number; free: number; rooms: number } }
export interface DormLog { id: string; studentId: string | null; roomId: string | null; type: string; severity: string; title: string; body: string | null; occurredAt: string; notified: boolean; student?: { id: string; fullName: string; studentCode: string } | null; room?: { number: string; floor: number; building: { name: string } } | null; author?: UserRef | null }
export interface GroupMessage { id: string; groupId: string; authorId: string; body: string; source: string; isPinned: boolean; createdAt: string; author: UserRef & { role?: { key: string; name: string } }; replyTo?: { id: string; body: string; author: { fullName: string } } | null }
export interface ChatGroup { id: string; name: string; allowParentChat: boolean; branch?: Ref; tutor?: UserRef | null; _count: { messages: number; students: number }; lastMessage?: GroupMessage | null }
export interface RoleFull { id: string; key: string; slug: string; name: string; description: string | null; color: string | null; isSystem: boolean; users: number; permissions: string[] }
export interface Overview {
  counts: { students: number; newStudents: number; boarders: number; teachers: number; tutors: number; staff: number; groups: number; parentsLinked: number; parentsTotal: number };
  attendance: { today: { rate: number | null; total: number; absent: number; late: number }; month: { rate: number | null; total: number; absent: number; late: number }; trend: Array<{ d: string; present: number; absent: number; late: number }> };
  grades: { avg: number | null; count: number; distribution: Array<{ value: number; count: number }> };
  homework: { open: number; pendingReview: number }; reportsPending: number; dormToday: number;
  upcomingExams: Exam[];
  finance: { income: number; expenses: number; profit: number; debt: number; debtors: number; monthly: Array<{ month: string; income: number; expenses: number; expected: number }> };
  branches: Array<{ id: string; name: string; code: string; students: number; attendance: number | null; income: number; debt: number }>;
}

// ── hooks ────────────────────────────────────────────────────────────────────
export const useSubjects = () => useQuery({ queryKey: ['subjects'], queryFn: () => api.get<Subject[]>('/api/subjects'), staleTime: 5 * 60_000 });
export const useRooms = (branchId?: string) => useQuery({ queryKey: ['rooms', branchId ?? 'all'], queryFn: () => api.get<Room[]>('/api/subjects/rooms', { branchId: branchId || undefined }), staleTime: 5 * 60_000 });
export const useSchoolGroups = (branchId?: string) => useQuery({ queryKey: ['school-groups', branchId ?? 'all'], queryFn: () => api.get<Group[]>('/api/groups', { branchId: branchId || undefined, active: 'yes' }), staleTime: 60_000 });
export const useGroup = (id?: string) => useQuery({ queryKey: ['group', id], queryFn: () => api.get<Group>(`/api/groups/${id}`), enabled: !!id });
export const useStaff = (role: 'TEACHER' | 'TUTOR' | 'DORM_MANAGER', branchId?: string) => useQuery({ queryKey: ['staff', role, branchId ?? 'all'], queryFn: () => api.get<Paginated<UserRef & { branch?: Ref | null; position?: string | null }>>('/api/users', { role, status: 'ACTIVE', limit: 200, branchId: branchId || undefined }), staleTime: 60_000, select: (d) => d.items });
export const useStudentsLite = (params: { groupId?: string; branchId?: string; search?: string; unassigned?: boolean; limit?: number }) =>
  useQuery({ queryKey: ['students-lite', params], queryFn: () => api.get<Paginated<Student>>('/api/students', { groupId: params.groupId || undefined, branchId: params.branchId || undefined, search: params.search || undefined, unassigned: params.unassigned ? 'yes' : undefined, limit: params.limit ?? 100, status: 'ACTIVE' }), staleTime: 30_000, select: (d) => d.items });
export const useOverview = (branchId?: string) => useQuery({ queryKey: ['school-overview', branchId ?? 'all'], queryFn: () => api.get<Overview>('/api/school/overview', { branchId: branchId || undefined }), refetchInterval: 60_000 });

export const monthOptions = (n = 12) => {
  const out: Array<{ value: string; label: string }> = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const v = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value: v, label: m.toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' }) });
  }
  return out;
};
export const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const today = () => new Date().toISOString().slice(0, 10);
export const gradeTone = (v: number) => (v >= 5 ? 'bg-success/15 text-success' : v >= 4 ? 'bg-info/15 text-info' : v >= 3 ? 'bg-warning/20 text-amber-700 dark:text-warning' : 'bg-destructive/12 text-destructive');
