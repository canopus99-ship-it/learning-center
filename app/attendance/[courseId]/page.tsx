import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { canAccessCourse } from '@/lib/attendance';
import { fetchAllRows } from '@/lib/fetchAll';
import TopBar from '@/components/TopBar';
import CourseAttendanceClient from './CourseAttendanceClient';

export default async function CourseAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ date?: string; year?: string; month?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) {
    redirect('/login?error=no_access');
  }

  const { courseId: courseIdStr } = await params;
  const { date, year, month } = await searchParams;
  const courseId = parseInt(courseIdStr, 10);

  // 권한 체크
  if (!canAccessCourse(staff, courseId)) {
    redirect('/attendance?error=no_access');
  }

  const supabase = await createClient();

  const [courseRes, instructorsRes, datesRes, enrollmentsRes] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('instructors').select('id, name'),
    supabase.from('course_dates').select('*').eq('course_id', courseId).order('class_date').order('start_time'),
    supabase
      .from('enrollments')
      .select('*, members(id, name, phone, birth_date, region_type)')
      .eq('course_id', courseId)
      .in('status', ['active', 'paused', 'ended']),
  ]);

  if (!courseRes.data) notFound();

  // 이 강좌의 enrollment id 모음 → 출석/결제도 이 강좌 것만 좁혀서 조회
  // (전체 테이블을 필터 없이 가져오면 1000행 제한에 걸려 데이터가 조용히 누락될 수 있음)
  const courseEnrollmentIds = (enrollmentsRes.data || []).map(e => e.id);

  const [attendanceRes, paymentsRes] = await Promise.all([
    fetchAllRows<any>((from, to) =>
      supabase
        .from('attendance')
        .select('*, course_dates!inner(course_id)')
        .eq('course_dates.course_id', courseId)
        .range(from, to)
    ),
    courseEnrollmentIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : fetchAllRows<any>((from, to) =>
          supabase
            .from('payments')
            .select('id, enrollment_id, payment_year, payment_month, is_paid, refund_date')
            .in('enrollment_id', courseEnrollmentIds)
            .range(from, to)
        ),
  ]);

  const coursePayments = paymentsRes.data || [];

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <CourseAttendanceClient
        course={courseRes.data}
        instructors={instructorsRes.data || []}
        initialDates={datesRes.data || []}
        initialEnrollments={enrollmentsRes.data || []}
        initialAttendance={attendanceRes.data || []}
        initialPayments={coursePayments}
        initialDate={date || null}
        initialYear={year ? parseInt(year, 10) : new Date().getFullYear()}
        initialMonth={month ? parseInt(month, 10) : new Date().getMonth() + 1}
        staffRole={staff.role}
        staffName={staff.name || staff.email}
      />
    </div>
  );
}
