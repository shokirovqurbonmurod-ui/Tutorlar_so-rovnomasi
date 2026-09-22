import { Suspense } from 'react';
import { UsersTable } from '@/components/users/users-table';
export const metadata = { title: 'Tutorlar' };
export default function TutorsPage() {
  return <Suspense><UsersTable role="TUTOR" title="Tutorlar" description="Guruh tutorlari (mentorlar) — Telegram bot orqali so‘rovnoma va hisobot topshiradi" /></Suspense>;
}
