import { redirect, notFound } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import StudentsClient from './StudentsClient';

export default async function LessonStudentsPage({ params }: { params: { courseId: string } }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  const supabase = await createClient();
  const courseId = parseInt(params.courseId, 10);

  const { data: course } = await supabase
    .from('courses')
    .select('id, name, category, is_lesson')
    .eq('id', courseId)
    .single();

  if (!course) notFound();
  if (!course.is_lesson) redirect(`/attendance/${courseId}`);

  // 수강생 목록 (감면·무료 여부 포함)
  const { data: enrollmentsRaw } = await supabase
    .from('enrollments')
    .select('id, member_id, status, members(id, name, phone, is_discount_50, is_discount_100)')
    .eq('course_id', courseId)
    .in('status', ['active', 'paused']);

  const enrollments = (enrollmentsRaw || []).map((e: any) => ({
    id: e.id,
    member_id: e.member_id,
    status: e.status,
    members: Array.isArray(e.members) ? (e.members[0] || null) : (e.members || null),
  }));

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <StudentsClient
        course={course as any}
        enrollments={enrollments as any}
      />
    </div>
  );
}
