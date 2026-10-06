import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getAllowedCourseIds } from '@/lib/attendance';
import TopBar from '@/components/TopBar';
import { APPROVAL_LINE_KEY, normalizeApprovalLine } from '@/lib/approvalLine';
import AttendancePrintClient from './AttendancePrintClient';

type Course = {
  id: number;
  category: string;
  name: string;
  instructor_id: number | null;
};

type Instructor = { id: number; name: string };

export default async function AttendancePrintPageRoute() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  const supabase = await createClient();
  const allowedIds = getAllowedCourseIds(staff);

  // 결재 출석부 양식은 일반 강좌에만 있음(레슨 강좌는 별도의 개인별 스케줄 출석부 사용)
  let coursesQuery = supabase
    .from('courses')
    .select('id, category, name, instructor_id')
    .eq('is_active', true)
    .eq('is_lesson', false)
    .order('category')
    .order('name');

  if (allowedIds !== 'all') {
    if (allowedIds.length === 0) {
      coursesQuery = coursesQuery.eq('id', -1);
    } else {
      coursesQuery = coursesQuery.in('id', allowedIds);
    }
  }

  const [coursesRes, instructorsRes] = await Promise.all([
    coursesQuery,
    supabase.from('instructors').select('id, name'),
  ]);

  // 결재라인 설정 (테이블이 아직 없거나 값이 없으면 기본값 사용)
  let approvalValue: unknown = null;
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', APPROVAL_LINE_KEY).maybeSingle();
    approvalValue = data?.value ?? null;
  } catch {
    approvalValue = null;
  }
  const approvalLine = normalizeApprovalLine(approvalValue);
  const canEditApproval = staff.role !== 'tablet';

  const courses = (coursesRes.data || []) as Course[];
  const instructors = (instructorsRes.data || []) as Instructor[];

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <AttendancePrintClient courses={courses} instructors={instructors} initialApprovalLine={approvalLine} canEditApproval={canEditApproval} />
    </div>
  );
}
