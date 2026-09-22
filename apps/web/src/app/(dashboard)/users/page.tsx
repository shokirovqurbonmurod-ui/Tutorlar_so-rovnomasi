import { Suspense } from 'react';
import { UsersTable } from '@/components/users/users-table';
export const metadata = { title: 'Xodimlar' };
export default function UsersPage() {
  return <Suspense><UsersTable title="Xodimlar" description="Barcha xodimlar: direktor, o‘qituvchi, tutor, buxgalter, komendant va boshqalar — rollar, filial va Telegram ulanishi" /></Suspense>;
}
