import { LayoutDashboard, Users, GraduationCap, BookOpenText, ClipboardList, ListChecks, BarChart3, FileText, Building2, Megaphone, Target, Bell, Settings, ScrollText, CheckSquare, type LucideIcon } from 'lucide-react';

export interface NavItem { href: string; label: string; icon: LucideIcon; perms?: string[]; roles?: string[]; group?: string }

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Bosh sahifa', icon: LayoutDashboard, perms: ['dashboard.view'] },
  { href: '/users', label: 'Foydalanuvchilar', icon: Users, perms: ['users.view'], group: 'Xodimlar' },
  { href: '/tutors', label: 'Tutorlar', icon: GraduationCap, perms: ['users.view'], group: 'Xodimlar' },
  { href: '/teachers', label: "O'qituvchilar", icon: BookOpenText, perms: ['users.view'], group: 'Xodimlar' },
  { href: '/branches', label: 'Filiallar', icon: Building2, perms: ['branches.view'], group: 'Xodimlar' },
  { href: '/surveys', label: "So'rovnomalar", icon: ClipboardList, perms: ['surveys.view'], group: 'Ma’lumot yig‘ish' },
  { href: '/questions', label: 'Savollar', icon: ListChecks, perms: ['surveys.view'], group: 'Ma’lumot yig‘ish' },
  { href: '/reports', label: 'Hisobotlar', icon: FileText, perms: ['reports.view'], group: 'Ma’lumot yig‘ish' },
  { href: '/analytics', label: 'Analitika', icon: BarChart3, perms: ['analytics.view'], group: 'Tahlil' },
  { href: '/kpi', label: 'KPI', icon: Target, perms: ['kpi.view'], group: 'Tahlil' },
  { href: '/announcements', label: "E'lonlar", icon: Megaphone, perms: ['announcements.view'], group: 'Aloqa' },
  { href: '/tasks', label: 'Vazifalar', icon: CheckSquare, perms: ['tasks.manage'], group: 'Aloqa' },
  { href: '/notifications', label: 'Bildirishnomalar', icon: Bell, perms: ['notifications.view'], group: 'Aloqa' },
  { href: '/audit', label: 'Audit jurnali', icon: ScrollText, perms: ['audit.view'], group: 'Tizim' },
  { href: '/settings', label: 'Sozlamalar', icon: Settings, perms: ['settings.view'], group: 'Tizim' },
];
