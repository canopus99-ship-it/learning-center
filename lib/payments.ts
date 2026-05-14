/**
 * 수강료 자동 계산 로직
 */

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'zeropay';
export type EndReason = 'unregistered' | 'refund' | 'other';
export type DiscountType = 'discount_50' | 'discount_100' | null;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '현금',
  card: '카드',
  transfer: '계좌이체',
  zeropay: '제로페이',
};

export const END_REASON_LABELS: Record<EndReason, string> = {
  unregistered: '미등록',
  refund: '환불',
  other: '기타',
};

export const END_REASON_COLORS: Record<EndReason, string> = {
  unregistered: '#888888',
  refund: '#A32D2D',
  other: '#666666',
};

/**
 * 회원의 거주구분 + 감면 정보로 실제 수강료 계산
 */
export function calculateFee(
  feeJungGu: number,
  feeOther: number,
  isJungGu: boolean,
  isDiscount50: boolean,
  isDiscount100: boolean,
  isFree: boolean
): { amount: number; discountType: DiscountType; description: string } {
  if (isFree) {
    return { amount: 0, discountType: null, description: '무료 강좌' };
  }

  const baseFee = isJungGu ? feeJungGu : feeOther;
  const baseLabel = isJungGu ? '중구민가' : '타구민가';

  if (isDiscount100) {
    return {
      amount: 0,
      discountType: 'discount_100',
      description: `${baseLabel} ${baseFee.toLocaleString()}원에서 100% 감면 → 0원`,
    };
  }

  if (isDiscount50) {
    const amount = Math.round(baseFee / 2);
    return {
      amount,
      discountType: 'discount_50',
      description: `${baseLabel} ${baseFee.toLocaleString()}원에서 50% 감면 → ${amount.toLocaleString()}원`,
    };
  }

  return {
    amount: baseFee,
    discountType: null,
    description: `${baseLabel} ${baseFee.toLocaleString()}원`,
  };
}

/**
 * 연납 가능 여부 확인 (1~12월 전체 운영하는 강좌만)
 */
export function isAnnualAvailable(operationMonths: string | null): boolean {
  if (!operationMonths) return false;
  const months = operationMonths.split(',').filter(Boolean).map(Number);
  // 1월부터 12월까지 모두 있어야 연납 가능
  for (let m = 1; m <= 12; m++) {
    if (!months.includes(m)) return false;
  }
  return true;
}

/**
 * 연납 금액 계산 (10개월분, 1월 OT 제외)
 */
export function calculateAnnualFee(monthlyFee: number): number {
  return monthlyFee * 10;
}

/**
 * 현재 월/년 가져오기
 */
export function getCurrentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

/**
 * 운영월 문자열 파싱
 */
export function parseOperationMonths(operationMonths: string | null): number[] {
  if (!operationMonths) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return operationMonths.split(',').filter(Boolean).map(Number);
}

/**
 * 결제 일자가 환불일 이후인지 확인
 */
export function isAfterRefund(date: string, refundDate: string | null): boolean {
  if (!refundDate) return false;
  return date > refundDate;
}

/**
 * 특정 회원-강좌 조합이 특정 월에 종료 처리된 상태인지 확인
 *
 * 종료 조건:
 *   1. status='ended' (즉시 종료) → 모든 월 종료
 *   2. end_from_year/month 있고 그 월 이상 → 종료
 *   3. refund_date 있고 그 월 1일 이후 → 종료 (환불)
 */
export function isEndedAtMonth(
  enrollment: {
    status: string;
    end_from_year: number | null;
    end_from_month: number | null;
    refund_date: string | null;
  },
  year: number,
  month: number
): boolean {
  // 즉시 종료
  if (enrollment.status === 'ended') return true;

  // 종료 예약
  if (enrollment.end_from_year && enrollment.end_from_month) {
    if (year > enrollment.end_from_year) return true;
    if (year === enrollment.end_from_year && month >= enrollment.end_from_month) return true;
  }

  // 환불
  if (enrollment.refund_date) {
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    if (enrollment.refund_date < monthStart) return true;
  }

  return false;
}

/**
 * 셀 상태 결정 (등록/미등록/미납/수강종료/운영X)
 */
export type CellStatus = 'paid' | 'unregistered' | 'unpaid' | 'ended' | 'not_operating';

export function getCellStatus(
  isPaid: boolean,
  isOperating: boolean,
  isEnded: boolean,
  isPastOrCurrent: boolean,
  feeAmount: number
): CellStatus {
  if (!isOperating) return 'not_operating';
  if (isEnded) return 'ended';
  if (isPaid) return 'paid';
  // 자동완료 (0원) - 결제 기록 없어도 "등록"으로 보임
  if (feeAmount === 0 && isPastOrCurrent) return 'paid';
  if (isPastOrCurrent) return 'unpaid';
  return 'unregistered';
}
