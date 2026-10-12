import { redirect, notFound } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { canAccessCourse } from '@/lib/attendance';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import { APPROVAL_LINE_KEY, normalizeApprovalLine } from '@/lib/approvalLine';
import LessonPrintClient from './LessonPrintClient';

export default async function LessonPrintPage({ params }: { params: { courseId: string } }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  const supabase = await createClient();
  const courseId = parseInt(params.courseId, 10);

  // 권한 체크: 태블릿 계정은 배정된 강좌만 (일반 강좌 출석부와 동일)
  if (!canAccessCourse(staff, courseId)) redirect('/attendance?error=no_access');

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
  // 지난달 출석부를 다시 출력할 때 그 사이 종료한 회원도 이름이 나와야 하므로 ended까지 포함.
  // (실제 명단은 "그 달에 레슨 일정이나 출석이 있었던 회원"으로 화면에서 걸러짐)
  const { data: enrollmentsRaw } = await supabase
    .from('enrollments')
    .select('id, member_id, status, end_date, carryover_date, members(id, name, phone)')
    .eq('course_id', courseId)
    .in('status', ['active', 'paused', 'ended', 'waiting']);

  // 결재라인 설정 (일반 강좌 출석부와 같은 설정을 사용)
  let approvalValue: unknown = null;
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', APPROVAL_LINE_KEY).maybeSingle();
    approvalValue = data?.value ?? null;
  } catch {
    approvalValue = null;
  }
  const approvalLine = normalizeApprovalLine(approvalValue);

  const enrollments = (enrollmentsRaw || []).map((e: any) => ({
    id: e.id,
    member_id: e.member_id,
    status: e.status,
    end_date: e.end_date || null,
    carryover_date: e.carryover_date || null,
    members: Array.isArray(e.members) ? (e.members[0] || null) : (e.members || null),
  }));

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <LessonPrintClient
        course={course as any}
        instructorName={instructorName}
        enrollments={enrollments as any}
        approvalLine={approvalLine}
      />
    </div>
  );
}
