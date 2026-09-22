import { Suspense } from 'react';
import { UsersTable } from '@/components/users/users-table';
export const metadata = { title: 'Foydalanuvchilar' };
export default function UsersPage() {
  return <Suspense><UsersTable title="Foydalanuvchilar" description="Barcha xodimlar: rollar, holatlar va Telegram ulanishi" /></Suspense>;
}
