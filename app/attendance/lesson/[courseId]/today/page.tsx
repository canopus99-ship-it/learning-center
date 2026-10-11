import { redirect, notFound } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { canAccessCourse } from '@/lib/attendance';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import TodayAttendanceClient from './TodayAttendanceClient';

export default async function TodayAttendancePage({ params }: { params: { courseId: string } }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  const supabase = await createClient();
  const courseId = parseInt(params.courseId, 10);

  // 권한 체크: 태블릿 계정은 배정된 강좌만 (일반 강좌 출석부와 동일)
  if (!canAccessCourse(staff, courseId)) redirect('/attendance?error=no_access');

  const { data: course } = await supabase
    .from('courses')
    .select('id, name, category, is_lesson')
    .eq('id', courseId)
    .single();

  if (!course) notFound();
  if (!course.is_lesson) redirect(`/attendance/${courseId}`);

  // 이 강좌의 수강생 (enrollment + member)
  const { data: enrollmentsRaw } = await supabase
    .from('enrollments')
    .select('id, member_id, status, end_date, members(id, name, phone)')
    .eq('course_id', courseId)
    // 종료한 회원도 함께 가져와서, 종료일 전까지의 레슨은 보이고 종료일부터는 자동으로 빠지게 함
    .in('status', ['active', 'paused', 'ended']);

  const enrollments = (enrollmentsRaw || []).map((e: any) => ({
    id: e.id,
    member_id: e.member_id,
    status: e.status,
    end_date: e.end_date || null,
    members: Array.isArray(e.members) ? (e.members[0] || null) : (e.members || null),
  }));

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <TodayAttendanceClient
        course={course as any}
        enrollments={enrollments as any}
      />
    </div>
  );
}
