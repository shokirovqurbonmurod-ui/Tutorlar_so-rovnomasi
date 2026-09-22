import { LayoutDashboard, Users, GraduationCap, BookOpenText, ClipboardList, ListChecks, BarChart3, FileText, Building2, Megaphone, Target, Bell, Settings, ScrollText, CheckSquare, UsersRound, HeartHandshake, School, Library, CalendarDays, UserCheck, Star, NotebookPen, FlaskConical, Wallet, Receipt, AlertCircle, BedDouble, ShieldCheck, MessagesSquare, KeyRound, type LucideIcon } from 'lucide-react';

export interface NavItem { href: string; label: string; icon: LucideIcon; perms?: string[]; roles?: string[]; group?: string }

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perms: ['dashboard.view'] },

  { href: '/students', label: "O'quvchilar", icon: GraduationCap, perms: ['students.view'], group: "O'quv jarayoni" },
  { href: '/parents', label: 'Ota-onalar', icon: HeartHandshake, perms: ['parents.view'], group: "O'quv jarayoni" },
  { href: '/groups', label: 'Guruhlar / Sinflar', icon: UsersRound, perms: ['groups.view'], group: "O'quv jarayoni" },
  { href: '/subjects', label: 'Fanlar va xonalar', icon: Library, perms: ['subjects.manage', 'schedule.manage'], group: "O'quv jarayoni" },
  { href: '/schedule', label: 'Dars jadvali', icon: CalendarDays, perms: ['schedule.view'], group: "O'quv jarayoni" },
  { href: '/attendance', label: 'Davomat', icon: UserCheck, perms: ['attendance.view'], group: "O'quv jarayoni" },
  { href: '/grades', label: 'Baholar', icon: Star, perms: ['grades.view'], group: "O'quv jarayoni" },
  { href: '/homework', label: 'Uy vazifalari', icon: NotebookPen, perms: ['homework.view'], group: "O'quv jarayoni" },
  { href: '/exams', label: 'Imtihonlar', icon: FlaskConical, perms: ['exams.view'], group: "O'quv jarayoni" },

  { href: '/finance', label: 'Finance', icon: Wallet, perms: ['finance.view'], group: 'Moliya' },
  { href: '/finance/payments', label: "To'lovlar", icon: Receipt, perms: ['finance.view'], group: 'Moliya' },
  { href: '/finance/debts', label: 'Qarzlar', icon: AlertCircle, perms: ['finance.view'], group: 'Moliya' },

  { href: '/dorm', label: 'Yotoqxona', icon: BedDouble, perms: ['dorm.view'], group: 'Yotoqxona' },
  { href: '/dorm/logs', label: 'Komendant jurnali', icon: ShieldCheck, perms: ['dorm.view'], group: 'Yotoqxona' },

  { href: '/users', label: 'Xodimlar', icon: Users, perms: ['users.view'], group: 'Xodimlar' },
  { href: '/teachers', label: "O'qituvchilar", icon: BookOpenText, perms: ['users.view'], group: 'Xodimlar' },
  { href: '/tutors', label: 'Tutorlar', icon: School, perms: ['users.view'], group: 'Xodimlar' },
  { href: '/roles', label: 'Rollar va huquqlar', icon: KeyRound, perms: ['users.manage_roles'], group: 'Xodimlar' },
  { href: '/branches', label: 'Filiallar', icon: Building2, perms: ['branches.view'], group: 'Xodimlar' },

  { href: '/messages', label: 'Xabarlar', icon: MessagesSquare, perms: ['messages.view'], group: 'Aloqa' },
  { href: '/announcements', label: "E'lonlar", icon: Megaphone, perms: ['announcements.view'], group: 'Aloqa' },
  { href: '/tasks', label: 'Vazifalar', icon: CheckSquare, perms: ['tasks.manage'], group: 'Aloqa' },
  { href: '/notifications', label: 'Bildirishnomalar', icon: Bell, perms: ['notifications.view'], group: 'Aloqa' },

  { href: '/surveys', label: "So'rovnomalar", icon: ClipboardList, perms: ['surveys.view'], group: 'Hisobot va tahlil' },
  { href: '/questions', label: 'Savollar', icon: ListChecks, perms: ['surveys.view'], group: 'Hisobot va tahlil' },
  { href: '/reports', label: 'Hisobotlar', icon: FileText, perms: ['reports.view'], group: 'Hisobot va tahlil' },
  { href: '/analytics', label: 'Analitika', icon: BarChart3, perms: ['analytics.view'], group: 'Hisobot va tahlil' },
  { href: '/kpi', label: 'KPI', icon: Target, perms: ['kpi.view'], group: 'Hisobot va tahlil' },

  { href: '/audit', label: 'Audit jurnali', icon: ScrollText, perms: ['audit.view'], group: 'Tizim' },
  { href: '/settings', label: 'Sozlamalar', icon: Settings, perms: ['settings.view'], group: 'Tizim' },
];
