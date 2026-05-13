/**
 * 운영월과 세션 정보로부터 실제 수업 날짜 목록을 자동 생성
 *
 * 예시:
 *   year: 2026, months: [4, 5], sessions: [{frequency: 'weekly', day_of_week: 1, ...}]
 *   → 4월의 모든 월요일 + 5월의 모든 월요일
 */

export type SessionConfig = {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  day_of_week: number;  // 1(월) ~ 7(일)
  start_time: string;
  end_time: string;
};

export type GeneratedDate = {
  class_date: string;  // 'YYYY-MM-DD'
  start_time: string;
  end_time: string;
  session_index: number;
};

/**
 * 특정 월의 특정 요일에 해당하는 모든 날짜 반환
 * @param year 연도
 * @param month 월 (1~12)
 * @param dayOfWeek 1(월)~7(일)
 */
function getDatesOfDayInMonth(year: number, month: number, dayOfWeek: number): Date[] {
  const dates: Date[] = [];
  const date = new Date(year, month - 1, 1);
  // JavaScript Date의 getDay(): 0(일)~6(토)
  // 우리 시스템: 1(월)~7(일)
  // 변환: 우리 1(월) → JS 1, 우리 7(일) → JS 0
  const jsDayOfWeek = dayOfWeek === 7 ? 0 : dayOfWeek;

  while (date.getMonth() === month - 1) {
    if (date.getDay() === jsDayOfWeek) {
      dates.push(new Date(date));
    }
    date.setDate(date.getDate() + 1);
  }
  return dates;
}

/**
 * 정기 강좌의 수업 날짜 자동 생성
 */
export function generateRegularDates(
  year: number,
  operationMonths: number[],
  sessions: SessionConfig[]
): GeneratedDate[] {
  const result: GeneratedDate[] = [];

  sessions.forEach((session, sessionIndex) => {
    operationMonths.forEach((month) => {
      const monthDates = getDatesOfDayInMonth(year, month, session.day_of_week);

      if (session.frequency === 'weekly') {
        // 매주: 모든 해당 요일
        monthDates.forEach((d) => {
          result.push({
            class_date: formatDate(d),
            start_time: session.start_time,
            end_time: session.end_time,
            session_index: sessionIndex,
          });
        });
      } else if (session.frequency === 'biweekly') {
        // 격주: 1, 3번째 (또는 2, 4번째)
        monthDates.forEach((d, i) => {
          if (i % 2 === 0) {
            result.push({
              class_date: formatDate(d),
              start_time: session.start_time,
              end_time: session.end_time,
              session_index: sessionIndex,
            });
          }
        });
      } else if (session.frequency === 'monthly') {
        // 매월: 첫 번째 해당 요일
        if (monthDates.length > 0) {
          result.push({
            class_date: formatDate(monthDates[0]),
            start_time: session.start_time,
            end_time: session.end_time,
            session_index: sessionIndex,
          });
        }
      }
    });
  });

  // 날짜순 정렬
  result.sort((a, b) => {
    const dateCompare = a.class_date.localeCompare(b.class_date);
    if (dateCompare !== 0) return dateCompare;
    return a.start_time.localeCompare(b.start_time);
  });

  return result;
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const DAY_LABELS: Record<number, string> = {
  1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일',
};

export const FREQUENCY_LABELS: Record<string, string> = {
  weekly: '매주',
  biweekly: '격주',
  monthly: '매월',
};
