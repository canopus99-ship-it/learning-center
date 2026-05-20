/**
 * 수강료 자동 계산 로직
 */

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'zeropay';
export type EndReason = 'self_request' | 'staff_action';
export type DiscountType = 'discount_50' | 'discount_100' | null;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '현금',
  card: '카드',
  transfer: '계좌이체',
  zeropay: '제로페이',
};

export const END_REASON_LABELS: Record<EndReason, string> = {
  self_request: '본인 요청',
  staff_action: '직원 조치',
};

export const END_REASON_COLORS: Record<EndReason, string> = {
  self_request: '#185FA5',
  staff_action: '#A32D2D',
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
/**
 * 특정 월에 수강 종료된 상태인지 판정
 *
 * 기준:
 * - status === 'ended' AND end_date 이전 월은 false (이전 기록 보존)
 * - status === 'ended' AND end_date 당월부터 true (수강종료 표시)
 * - end_date가 없으면 모든 월이 종료 (구버전 호환)
 *
 * 예: 5월 18일에 종료 처리 → 1~4월은 원래 상태 유지, 5월부터 수강종료
 *
 * 환불/이월은 payments 테이블의 status_type으로 관리되며, 별개 축임.
 */
export function isEndedAtMonth(
  enrollment: {
    status: string;
    end_date?: string | null;
  },
  year: number,
  month: number
): boolean {
  if (enrollment.status !== 'ended') return false;

  // 종료일 없으면 모든 월 종료 (구버전 호환)
  if (!enrollment.end_date) return true;

  // 종료일 이전 월은 원래 상태 유지 (그 달은 아직 다녔던 것)
  const endYear = parseInt(enrollment.end_date.substring(0, 4), 10);
  const endMonth = parseInt(enrollment.end_date.substring(5, 7), 10);

  if (year < endYear) return false;
  if (year === endYear && month < endMonth) return false;
  return true;
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
