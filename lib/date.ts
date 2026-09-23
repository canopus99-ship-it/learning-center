/**
 * 한국(KST, UTC+9) 기준 "오늘" 날짜 유틸리티.
 *
 * 버그 배경: 이 프로젝트 곳곳에서 "오늘 날짜"를 `new Date().toISOString().split('T')[0]`로
 * 구했는데, `toISOString()`은 항상 UTC 기준 문자열을 반환한다. 그래서 한국 시간 자정~오전 9시
 * 사이(=UTC로는 아직 전날)에는 실제로는 오늘인데 어제 날짜가 나오는 문제가 있었다.
 * (서버 컴포넌트든 클라이언트 컴포넌트든, 실행 환경의 시스템 시간대와 무관하게 발생하는 버그다 -
 *  `toISOString()`이 로컬 시간대를 무시하고 무조건 UTC로 변환하기 때문.)
 *
 * 한국은 서머타임이 없어 연중 고정 UTC+9이므로, 현재 UTC 시각에 9시간을 더한 뒤
 * 그 결과의 UTC 날짜를 읽으면 그대로 한국의 오늘 날짜가 된다 (타임존 DB 없이도 정확함).
 */
export function getTodayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

/** 주어진 Date를 한국 기준 YYYY-MM-DD 문자열로 변환 (드물게 특정 시각을 변환해야 할 때 사용) */
export function toKSTDateString(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

/** 한국 기준 오늘의 연/월 (년말~연초 자정 근처에 서버가 UTC로 동작해도 안전하게 사용) */
export function getTodayKSTYearMonth(): { year: number; month: number } {
  const s = getTodayKST();
  return { year: parseInt(s.substring(0, 4), 10), month: parseInt(s.substring(5, 7), 10) };
}
