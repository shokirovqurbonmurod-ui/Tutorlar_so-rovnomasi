'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Survey } from '@/lib/types';
import { SurveyBuilder, surveyToDraft } from '@/components/surveys/survey-builder';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({ queryKey: ['survey', id], queryFn: () => api.get<Survey>(`/api/surveys/${id}`) });
  if (isLoading || !data) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /><Skeleton className="h-96" /></div>;
  return (
    <div>
      <PageHeader title="So‘rovnomani tahrirlash" description={data.status === 'ACTIVE' ? 'Diqqat: faol so‘rovnomada savollarni o‘zgartirish mavjud javoblar tahliliga ta’sir qilishi mumkin' : 'O‘zgarishlarni saqlashni unutmang'} />
      <SurveyBuilder key={data.updatedAt} initial={surveyToDraft(data)} surveyId={data.id} initialSurvey={data} />
    </div>
  );
}
