import { redirect, notFound } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import LessonPrintClient from './LessonPrintClient';

export default async function LessonPrintPage({ params }: { params: { courseId: string } }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  const supabase = await createClient();
  const courseId = parseInt(params.courseId, 10);

  const { data: course } = await supabase
    .from('courses')
    .select('id, name, category, is_lesson, instructor_id')
    .eq('id', courseId)
    .single();

  if (!course) notFound();
  if (!course.is_lesson) redirect(`/attendance/${courseId}`);

  // 강사명
  let instructorName = '';
  if (course.instructor_id) {
    const { data: instr } = await supabase
      .from('instructors')
      .select('name')
      .eq('id', course.instructor_id)
      .single();
    instructorName = instr?.name || '';
  }

  // 수강생 목록
  const { data: enrollmentsRaw } = await supabase
    .from('enrollments')
    .select('id, member_id, status, members(id, name, phone)')
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
      <LessonPrintClient
        course={course as any}
        instructorName={instructorName}
        enrollments={enrollments as any}
      />
    </div>
  );
}
