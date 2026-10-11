/**
 * 레슨 강좌(피아노 등)의 "월별 개인 레슨일" 계산 공용 로직
 *
 * 출력 출석부(LessonPrintClient)와 수강생별 출석률(StudentsClient)이 같은 기준으로
 * 숫자를 내도록 한 곳에서 계산한다.
 *
 * 그 달의 각 주(월요일 기준)마다:
 *   1. 그 주에 유효한 고정 스케줄(effective_from ≤ 그 주 월요일 ≤ effective_until)을 찾고
 *   2. 그 주에 '이번 주만 변경'이 있으면 바뀐 날짜로, '이번 주 취소'면 제외
 *   3. 그 달 밖의 날짜, 토·일요일, 공휴일, 강사가 체크한 휴무일은 제외
 */
import { getHolidayName } from './holidays';

export type MonthFixed = {
  id: number;
  member_id: number;
  day_of_week: number; // 0=월~4=금
  effective_from: string;
  effective_until: string | null;
};

export type MonthOverride = {
  fixed_schedule_id: number | null;
  week_start: string;
  schedule_date: string;
  is_cancelled: boolean;
};

export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthBounds(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/** 그 달과 하루라도 겹치는 주의 월요일 목록 (YYYY-MM-DD) */
export function mondaysOverlappingMonth(year: number, month: number): string[] {
  const first = new Date(year, month - 1, 1);
  const d = new Date(first);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  const lastDay = new Date(year, month, 0);
  const result: string[] = [];
  while (d <= lastDay) {
    result.push(ymdLocal(d));
    d.setDate(d.getDate() + 7);
  }
  return result;
}

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return ymdLocal(d);
}

/** 레슨이 없는 날인지: 토·일요일, 공휴일, 강사 체크 휴무일 */
export function getOffDayReason(dateStr: string, closedDates: Set<string>): string | null {
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  if (dow === 0 || dow === 6) return '주말';
  const holiday = getHolidayName(dateStr);
  if (holiday) return holiday;
  if (closedDates.has(dateStr)) return '휴무';
  return null;
}

/**
 * 회원별 그 달 레슨 예정일 (정렬된 날짜 목록)
 */
export function buildMonthlyLessonDates(
  fixedSchedules: MonthFixed[],
  overrides: MonthOverride[],
  closedDates: Set<string>,
  year: number,
  month: number
): Map<number, string[]> {
  const { start, end } = monthBounds(year, month);
  const weeks = mondaysOverlappingMonth(year, month);
  const byMember = new Map<number, Set<string>>();

  weeks.forEach(weekStart => {
    fixedSchedules.forEach(f => {
      if (f.effective_from > weekStart) return;
      if (f.effective_until && f.effective_until < weekStart) return;

      const ovr = overrides.find(o => o.fixed_schedule_id === f.id && o.week_start === weekStart);
      if (ovr && ovr.is_cancelled) return;
      const dateStr = ovr ? ovr.schedule_date : addDaysStr(weekStart, f.day_of_week);

      if (dateStr < start || dateStr > end) return;
      if (getOffDayReason(dateStr, closedDates)) return;

      if (!byMember.has(f.member_id)) byMember.set(f.member_id, new Set());
      byMember.get(f.member_id)!.add(dateStr);
    });
  });

  const result = new Map<number, string[]>();
  byMember.forEach((set, memberId) => result.set(memberId, Array.from(set).sort()));
  return result;
}
