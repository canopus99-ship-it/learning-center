/**
 * 출석 관련 유틸리티
 */

/**
 * 특정 회원의 특정 수업 날짜에 출석체크 가능한지 확인
 *
 * 차단 조건:
 *   1. 휴강된 수업 (course_dates.is_cancelled = true)
 *   2. 환불일 이후 수업 (refund_date < class_date)
 *   3. 종료 예약된 월 이후 수업 (end_from_year/month 이후)
 *   4. 즉시 종료된 수강 (status = 'ended')
 *
 * @returns { canCheck: boolean, reason: string | null }
 */
/**
 * 특정 회원의 특정 수업 날짜에 출석체크 가능한지 확인
 *
 * 차단 조건:
 *   1. 휴강된 수업
 *   2. 수강 종료된 회원 (enrollment.status === 'ended')
 *      - end_date 이후 수업도 차단 (종료일 다음날부터)
 */
export function canCheckAttendance(
  enrollment: {
    status: string;
    end_date?: string | null;
  },
  classDate: string,        // 'YYYY-MM-DD'
  isCancelled: boolean       // 휴강 여부
): { canCheck: boolean; reason: string | null } {
  // 1. 휴강
  if (isCancelled) {
    return { canCheck: false, reason: '휴강된 수업입니다' };
  }

  // 2. 수강 종료
  if (enrollment.status === 'ended') {
    // 종료일이 있고, 수업일이 종료일 당일까지면 출석 가능
    if (enrollment.end_date && classDate <= enrollment.end_date) {
      return { canCheck: true, reason: null };
    }
    return {
      canCheck: false,
      reason: enrollment.end_date
        ? `종료일(${enrollment.end_date}) 이후 수업입니다`
        : '수강 종료된 회원입니다',
    };
  }

  return { canCheck: true, reason: null };
}

/**
 * 강좌 접근 권한 체크
 * - 관리자: 모든 강좌 접근 가능 (allowed_course_ids = null)
 * - 태블릿: allowed_course_ids에 있는 강좌만 접근
 */
export function canAccessCourse(
  staff: { role: string; allowed_course_ids: string | null },
  courseId: number
): boolean {
  if (staff.role === 'admin') return true;
  if (!staff.allowed_course_ids) return false;
  const allowed = staff.allowed_course_ids.split(',').filter(Boolean).map(Number);
  return allowed.includes(courseId);
}

/**
 * 직원이 접근 가능한 강좌 ID 목록 반환
 */
export function getAllowedCourseIds(staff: { role: string; allowed_course_ids: string | null }): number[] | 'all' {
  if (staff.role === 'admin') return 'all';
  if (!staff.allowed_course_ids) return [];
  return staff.allowed_course_ids.split(',').filter(Boolean).map(Number);
}

/**
 * 출석 통계: 특정 강좌의 특정 월 출석 현황
 */
export function calculateMonthlyAttendance(
  classDates: { id: number; class_date: string; is_cancelled: boolean }[],
  attendances: { course_date_id: number; enrollment_id: number; is_present: boolean }[],
  year: number,
  month: number
): {
  classDatesInMonth: { id: number; class_date: string; is_cancelled: boolean }[];
  perDateCount: Record<number, number>; // 각 수업일별 출석자 수 (일계)
  totalAttendance: number; // 총 출석 인원 (월 실적)
} {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const classDatesInMonth = classDates.filter(d =>
    d.class_date.startsWith(monthPrefix)
  );

  const perDateCount: Record<number, number> = {};
  let totalAttendance = 0;

  classDatesInMonth.forEach(d => {
    if (d.is_cancelled) {
      perDateCount[d.id] = 0;
      return;
    }
    const count = attendances.filter(a =>
      a.course_date_id === d.id && a.is_present
    ).length;
    perDateCount[d.id] = count;
    totalAttendance += count;
  });

  return { classDatesInMonth, perDateCount, totalAttendance };
}
