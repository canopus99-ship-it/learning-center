import { redirect, notFound } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import CourseDetailClient from './CourseDetailClient';

export default async function CourseDetailPage({
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

  const [courseRes, sessionsRes, instructorsRes, enrollmentsRes, levelsRes] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
    supabase.from('course_sessions').select('*').eq('course_id', courseId),
    supabase.from('instructors').select('id, name, is_active').order('name'),
    supabase
      .from('enrollments')
      .select('*, members(id, name, phone, birth_date, region_type)')
      .eq('course_id', courseId),
    supabase.from('course_levels').select('*').eq('course_id', courseId).order('sort_order'),
  ]);

  if (courseRes.error || !courseRes.data) {
    notFound();
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <CourseDetailClient
        course={courseRes.data}
        sessions={sessionsRes.data || []}
        instructors={instructorsRes.data || []}
        initialEnrollments={enrollmentsRes.data || []}
        initialLevels={levelsRes.data || []}
      />
    </div>
  );
}
