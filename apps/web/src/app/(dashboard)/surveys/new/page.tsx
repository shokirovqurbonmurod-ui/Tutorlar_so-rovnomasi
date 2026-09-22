'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { SurveyBuilder, TEMPLATES, templateToDraft } from '@/components/surveys/survey-builder';
import { PageHeader } from '@/components/shared/page-header';

function Inner() {
  const sp = useSearchParams();
  const t = TEMPLATES.find((x) => x.id === sp.get('template'));
  const initial = t ? { title: t.name, description: '', audience: t.audience, branchId: '', isAnonymous: t.id === 'satisfaction', allowMultiple: false, deadline: '', questions: templateToDraft(t) } : undefined;
  return <SurveyBuilder key={t?.id ?? 'blank'} initial={initial} />;
}

export default function NewSurveyPage() {
  return (
    <div>
      <PageHeader title="Yangi so‘rovnoma" description="Savollarni tuzing, auditoriyani tanlang va Telegram orqali yuboring" />
      <React.Suspense><Inner /></React.Suspense>
    </div>
  );
}
