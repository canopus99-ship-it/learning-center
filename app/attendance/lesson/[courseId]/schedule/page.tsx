import { redirect, notFound } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import LessonScheduleClient from './LessonScheduleClient';

export default async function LessonSchedulePage({ params }: { params: { courseId: string } }) {
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

  // 이 강좌의 수강생 (enrollment + member)
  const { data: enrollmentsRaw } = await supabase
    .from('enrollments')
    .select('id, member_id, status, members(id, name, phone)')
    .eq('course_id', courseId)
    .in('status', ['active', 'paused']);

  // Supabase 관계 조회는 members를 배열로 반환할 수 있어 단일 객체로 정규화
  const enrollments = (enrollmentsRaw || []).map((e: any) => ({
    id: e.id,
    member_id: e.member_id,
    status: e.status,
    members: Array.isArray(e.members) ? (e.members[0] || null) : (e.members || null),
  }));

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <LessonScheduleClient
        course={course as any}
        enrollments={enrollments as any}
      />
    </div>
  );
}
