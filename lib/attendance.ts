/**
 * 출석 관련 유틸리티
 */

/**
 * 특정 회원의 특정 수업 날짜에 출석체크 가능한지 확인
 *
 * 차단 조건:
 *   1. 휴강된 수업
 *   2. 수강 종료된 회원 (status === 'ended')
 *      - 종료일(end_date) 당일부터 차단 (종료일 전날까지만 출석 가능)
 *   3. 환불된 결제 (그 월 payment.refund_date 있음)
 *      - 환불일 1~15일: 환불일 다음날부터 차단 (15일까지는 출석 가능)
 *      - 환불일 16~말일: 그 월 말일까지 출석 가능 (다음달 첫날부터는 그 회원이 명단에서 빠지므로 자동 차단)
 */
export function canCheckAttendance(
  enrollment: {
    status: string;
    end_date?: string | null;
  },
  classDate: string,        // 'YYYY-MM-DD'
  isCancelled: boolean,     // 휴강 여부
  refundDate?: string | null  // 해당 월 결제의 환불일 (있으면)
): { canCheck: boolean; reason: string | null } {
  // 1. 휴강
  if (isCancelled) {
    return { canCheck: false, reason: '휴강된 수업입니다' };
  }

  // 2. 수강 종료 (종료일 당일부터 차단 → 종료일 전날까지만 출석 가능)
  if (enrollment.status === 'ended') {
    if (enrollment.end_date && classDate < enrollment.end_date) {
      // 종료일 전날까지는 출석 가능 (단, 환불 케이스 아래에서 추가 확인)
    } else {
      return {
        canCheck: false,
        reason: enrollment.end_date
          ? `종료일(${enrollment.end_date})부터는 출석할 수 없습니다`
          : '수강 종료된 회원입니다',
      };
    }
  }

  // 3. 환불된 결제: 환불일 기준으로 출석 가능 범위 제한
  if (refundDate) {
    // 환불일의 일(day) 추출
    const refundDay = parseInt(refundDate.substring(8, 10), 10);
    if (refundDay <= 15) {
      // 1~15일 환불: 1~15일 수업까지만 출석 가능
      // 수업일의 일(day)로 비교 (같은 월 안에서만 비교, 다음달은 위에서 이미 명단에서 제외됨)
      const classDay = parseInt(classDate.substring(8, 10), 10);
      if (classDay > 15) {
        return { canCheck: false, reason: `환불일(${refundDate}) 이후 수업입니다` };
      }
    }
    // 16~말일 환불: 그 월 모든 수업 출석 가능 (다음달 자동 차단됨)
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
