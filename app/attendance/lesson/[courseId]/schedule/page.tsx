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
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('id, member_id, status, members(id, name, phone)')
    .eq('course_id', courseId)
    .in('status', ['active', 'paused']);

  // 결제 데이터 (결제 완료자 판단용)
  const enrollmentIds = (enrollments || []).map(e => e.id);
  let payments: any[] = [];
  if (enrollmentIds.length > 0) {
    const { data: payData } = await supabase
      .from('payments')
      .select('enrollment_id, payment_year, payment_month, is_paid, refund_date')
      .in('enrollment_id', enrollmentIds);
    payments = payData || [];
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <LessonScheduleClient
        course={course}
        enrollments={enrollments || []}
        payments={payments}
      />
    </div>
  );
}
