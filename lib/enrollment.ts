export type EnrollmentStatus = 'active' | 'waiting' | 'ended' | 'paused';

export const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: '수강중',
  waiting: '대기',
  ended: '수강종료',
  paused: '일시중지',
};

export const STATUS_COLORS: Record<EnrollmentStatus, string> = {
  active: '#1D9E75',
  waiting: '#BA7517',
  ended: '#888888',
  paused: '#7B3FBF',
};

/**
 * 종료했던 수강신청을 다시 살릴 때(재신청·재개·수강변경·엑셀 재개) 공통으로 비워야 하는 종료 관련 값.
 * 예전에는 화면마다 지우는 항목이 달라서, 예전 종료일(end_date)이 남아 회원 상세에 계속 '종료'로
 * 보이거나 출석률 통계에서 빠지는 문제가 있었음 → 모든 재활성화 경로에서 이 값을 함께 저장.
 */
export const REACTIVATE_RESET = {
  ended_at: null,
  end_date: null,
  end_reason: null,
  end_from_year: null,
  end_from_month: null,
  refund_date: null,
  refund_memo: null,
  carryover_date: null,
} as const;

/**
 * 수강 시작월(1~12)의 연도.
 * 12월에 "1월 시작"으로 신청하는 것처럼, 고른 달이 지금 달보다 6개월 이상 앞이면 다음 해로 봄.
 * (10월에 9월 시작처럼 최근 지난 달을 고르는 경우는 올해 그대로)
 */
export function startYearForMonth(startMonth: number, now: Date = new Date()): number {
  const cur = now.getMonth() + 1;
  return cur - startMonth >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/** 다음 대기순번 = 현재 대기자 중 가장 큰 순번 + 1 (중간에 빠진 번호가 있어도 겹치지 않게) */
export function nextWaitingOrder(rows: { status: string; waiting_order?: number | null }[]): number {
  const orders = rows.filter(r => r.status === 'waiting').map(r => r.waiting_order || 0);
  return (orders.length ? Math.max(...orders) : 0) + 1;
}
