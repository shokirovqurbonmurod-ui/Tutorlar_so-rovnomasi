import { Suspense } from 'react';
import { UsersTable } from '@/components/users/users-table';
export const metadata = { title: "O'qituvchilar" };
export default function TeachersPage() {
  return <Suspense><UsersTable role="TEACHER" title="O‘qituvchilar" description="Fan o‘qituvchilari — guruhlar, davomat, baholar, uy vazifalari va ota-onalar bilan aloqa" /></Suspense>;
}
