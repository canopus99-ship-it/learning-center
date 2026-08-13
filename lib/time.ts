// 시간 표시 관련 공용 유틸.
// DB에는 "HH:MM" 24시간제 문자열로 저장·비교하지만, 강사·수강생이 보는 화면/인쇄물이나
// 시간을 직접 고르는 드롭다운 등에서는 "오전/오후 N시" 12시간제로 보여주는 게 더 편해서
// 표시용 변환 함수만 따로 둠. 저장되는 값(24시간제 문자열) 자체는 그대로 유지.

/** "14:30" → "오후 2시 30분", "10:00" → "오전 10시" */
export function formatTime12(t: string | null | undefined): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isNaN(h)) return '';
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${period} ${h12}시` : `${period} ${h12}시 ${m}분`;
}

/** 시간표 행 라벨처럼 "오전"/"10시"를 따로 써야 할 때. 예: hour=14 → { period: '오후', text: '2시' } */
export function hourLabel12(hour: number): { period: string; text: string } {
  const period = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return { period, text: `${h12}시` };
}
