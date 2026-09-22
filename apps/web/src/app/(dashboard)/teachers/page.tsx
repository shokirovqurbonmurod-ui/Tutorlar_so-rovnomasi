import { Suspense } from 'react';
import { UsersTable } from '@/components/users/users-table';
export const metadata = { title: "O'qituvchilar" };
export default function TeachersPage() {
  return <Suspense><UsersTable role="TEACHER" title="O‘qituvchilar" description="Fan o‘qituvchilari — dars hisobotlari va so‘rovnomalar" /></Suspense>;
}
