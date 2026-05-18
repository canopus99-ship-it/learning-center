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
export function canCheckAttendance(
  enrollment: {
    status: string;
    end_date?: string | null;
    end_from_year: number | null;
    end_from_month: number | null;
    refund_date: string | null;
  },
  classDate: string,        // 'YYYY-MM-DD'
  isCancelled: boolean       // \ud734\uac15 \uc5ec\ubd80
): { canCheck: boolean; reason: string | null } {
  // 1. \ud734\uac15
  if (isCancelled) {
    return { canCheck: false, reason: '\ud734\uac15\ub41c \uc218\uc5c5\uc785\ub2c8\ub2e4' };
  }

  // 2. \uc989\uc2dc \uc218\uac15\uc885\ub8cc
  if (enrollment.status === 'ended') {
    return { canCheck: false, reason: '\uc218\uac15 \uc885\ub8cc\ub41c \ud68c\uc6d0\uc785\ub2c8\ub2e4' };
  }

  // 3. \ucc98\ub9ac\uc77c(end_date) \uc774\ud6c4 \ucc28\ub2e8 - \ub0a0\uc9dc \ub2e8\uc704\ub85c \uc815\ud655\ud788
  //    \ucc98\ub9ac\uc77c \ub2f9\uc77c\uae4c\uc9c0\ub294 \ucd9c\uc11d \uac00\ub2a5, \ub2e4\uc74c\ub0a0\ubd80\ud130 \ucc28\ub2e8
  if (enrollment.end_date) {
    if (classDate > enrollment.end_date) {
      return { canCheck: false, reason: `\ucc98\ub9ac\uc77c(${enrollment.end_date}) \uc774\ud6c4 \uc218\uc5c5\uc785\ub2c8\ub2e4` };
    }
    return { canCheck: true, reason: null };
  }

  // (\uad6c \ubc84\uc804 \ud638\ud658) \ud658\ubd88\uc77c \uc774\ud6c4 \ucc28\ub2e8
  if (enrollment.refund_date) {
    if (classDate > enrollment.refund_date) {
      return { canCheck: false, reason: `\ud658\ubd88 \ucc98\ub9ac\uc77c(${enrollment.refund_date}) \uc774\ud6c4 \uc218\uc5c5\uc785\ub2c8\ub2e4` };
    }
  }

  // (\uad6c \ubc84\uc804 \ud638\ud658) \uc6d4 \uae30\ubc18 \uc885\ub8cc \uc608\uc57d - \ub2e4\uc74c \ub2ec\ubd80\ud130 \ucc28\ub2e8
  if (enrollment.end_from_year && enrollment.end_from_month) {
    const classYear = parseInt(classDate.substring(0, 4), 10);
    const classMonth = parseInt(classDate.substring(5, 7), 10);
    if (classYear > enrollment.end_from_year) {
      return { canCheck: false, reason: `${enrollment.end_from_year}.${enrollment.end_from_month}\uc6d4 \uc774\ud6c4 \uc218\uac15 \uc885\ub8cc\ub41c \ud68c\uc6d0\uc785\ub2c8\ub2e4` };
    }
    if (classYear === enrollment.end_from_year && classMonth > enrollment.end_from_month) {
      return { canCheck: false, reason: `${enrollment.end_from_year}.${enrollment.end_from_month}\uc6d4 \uc774\ud6c4 \uc218\uac15 \uc885\ub8cc\ub41c \ud68c\uc6d0\uc785\ub2c8\ub2e4` };
    }
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
