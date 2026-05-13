import { redirect, notFound } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import DatesClient from './DatesClient';

export default async function CourseDatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect('/login?error=no_access');
  }

  const { id } = await params;
  const courseId = parseInt(id, 10);

  if (isNaN(courseId)) {
    notFound();
  }

  const supabase = await createClient();

  const [courseRes, datesRes] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
    supabase.from('course_dates').select('*').eq('course_id', courseId).order('class_date').order('start_time'),
  ]);

  if (courseRes.error || !courseRes.data) {
    notFound();
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <DatesClient
        course={courseRes.data}
        initialDates={datesRes.data || []}
      />
    </div>
  );
}
