import { Suspense } from 'react';
import { UsersTable } from '@/components/users/users-table';
export const metadata = { title: 'Tutorlar' };
export default function TutorsPage() {
  return <Suspense><UsersTable role="TUTOR" title="Tutorlar" description="Sinf rahbarlari (tutorlar) — guruhlari, o‘quvchilari natijalari va ota-onalar bilan aloqa" /></Suspense>;
}
