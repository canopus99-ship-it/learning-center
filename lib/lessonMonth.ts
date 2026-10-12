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
  enrollment_id?: number;
  day_of_week: number; // 0=월~4=금
  start_time?: string;
  effective_from: string;
  effective_until: string | null;
};

export type MonthOverride = {
  fixed_schedule_id: number | null;
  week_start: string;
  schedule_date: string;
  start_time?: string;
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
 * 수강 종료 정보: enrollment_id → 이 날짜부터 레슨에서 빠짐 ('' = 언제나 빠짐)
 * - 종료(ended): 종료일부터
 * - 이월로 대기(waiting)가 된 회원: 이월 처리일(carryover_date)부터 (대기 중에는 레슨 없음)
 * - 처음부터 대기인 회원(carryover_date 없음): 언제나 제외
 */
export function buildEndedMap(
  enrollments: { id: number; status: string; end_date?: string | null; carryover_date?: string | null }[]
): Map<number, string> {
  const map = new Map<number, string>();
  enrollments.forEach(e => {
    if (e.status === 'ended') map.set(e.id, e.end_date || '');
    else if (e.status === 'waiting') map.set(e.id, e.carryover_date ? e.carryover_date.substring(0, 10) : '');
  });
  return map;
}

/**
 * 그 날짜에 이미 수강이 끝난 상태인지.
 * 종료일 당일부터 레슨에서 빠짐 (출석체크 규칙과 동일: 종료일 전날까지만 출석 가능)
 */
export function isEndedOn(endedMap: Map<number, string>, enrollmentId: number | undefined, dateStr: string): boolean {
  if (enrollmentId === undefined) return false;
  const end = endedMap.get(enrollmentId);
  if (end === undefined) return false;
  return end === '' || dateStr >= end;
}

export type LessonOccurrence = {
  date: string;     // YYYY-MM-DD
  fixedId: number;  // 어느 고정 스케줄의 레슨인지 (같은 날 오전·오후 2회 받는 회원 구분용)
};

/** 출석 기록과 레슨을 짝지을 때 쓰는 키 (고정 스케줄 id + 날짜) */
export function lessonKey(fixedId: number | null | undefined, date: string): string {
  return `${fixedId ?? 'x'}|${date}`;
}

/**
 * 회원별 그 달 레슨 목록 (날짜순)
 * 같은 날 레슨이 2번(오전·오후)이면 그 날짜가 2번 들어감.
 */
export function buildMonthlyLessons(
  fixedSchedules: MonthFixed[],
  overrides: MonthOverride[],
  closedDates: Set<string>,
  year: number,
  month: number,
  endedMap?: Map<number, string>
): Map<number, LessonOccurrence[]> {
  const { start, end } = monthBounds(year, month);
  const weeks = mondaysOverlappingMonth(year, month);
  const byMember = new Map<number, Map<string, LessonOccurrence & { time: string }>>();

  weeks.forEach(weekStart => {
    fixedSchedules.forEach(f => {
      if (f.effective_from > weekStart) return;
      if (f.effective_until && f.effective_until < weekStart) return;

      const ovr = overrides.find(o => o.fixed_schedule_id === f.id && o.week_start === weekStart);
      if (ovr && ovr.is_cancelled) return;
      const dateStr = ovr ? ovr.schedule_date : addDaysStr(weekStart, f.day_of_week);

      if (dateStr < start || dateStr > end) return;
      if (getOffDayReason(dateStr, closedDates)) return;
      if (endedMap && isEndedOn(endedMap, f.enrollment_id, dateStr)) return;

      if (!byMember.has(f.member_id)) byMember.set(f.member_id, new Map());
      byMember.get(f.member_id)!.set(lessonKey(f.id, dateStr), {
        date: dateStr,
        fixedId: f.id,
        time: (ovr?.start_time || f.start_time || ''),
      });
    });
  });

  const result = new Map<number, LessonOccurrence[]>();
  byMember.forEach((map, memberId) => {
    const list = Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .map(({ date, fixedId }) => ({ date, fixedId }));
    result.set(memberId, list);
  });
  return result;
}
