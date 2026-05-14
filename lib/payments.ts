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
 *
 * @param feeJungGu 중구민가
 * @param feeOther 타구민가
 * @param isJungGu 중구민 여부
 * @param isDiscount50 50% 감면 대상
 * @param isDiscount100 100% 감면 대상
 * @param isFree 무료 강좌
 */
export function calculateFee(
  feeJungGu: number,
  feeOther: number,
  isJungGu: boolean,
  isDiscount50: boolean,
  isDiscount100: boolean,
  isFree: boolean
): { amount: number; discountType: DiscountType; description: string } {
  // 무료 강좌
  if (isFree) {
    return { amount: 0, discountType: null, description: '무료 강좌' };
  }

  // 기본가 결정 (거주구분에 따라)
  const baseFee = isJungGu ? feeJungGu : feeOther;
  const baseLabel = isJungGu ? '중구민가' : '타구민가';

  // 100% 감면
  if (isDiscount100) {
    return {
      amount: 0,
      discountType: 'discount_100',
      description: `${baseLabel} ${baseFee.toLocaleString()}원에서 100% 감면 → 0원`,
    };
  }

  // 50% 감면
  if (isDiscount50) {
    const amount = Math.round(baseFee / 2);
    return {
      amount,
      discountType: 'discount_50',
      description: `${baseLabel} ${baseFee.toLocaleString()}원에서 50% 감면 → ${amount.toLocaleString()}원`,
    };
  }

  // 감면 없음
  return {
    amount: baseFee,
    discountType: null,
    description: `${baseLabel} ${baseFee.toLocaleString()}원`,
  };
}

/**
 * 연납 금액 계산 (11개월 결제 → 12월 무료)
 */
export function calculateAnnualFee(monthlyFee: number): number {
  return monthlyFee * 11;
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
 * 운영월 문자열 파싱 (예: "3,4,5,6,7,8,9,10,11,12" → [3,4,5,...])
 */
export function parseOperationMonths(operationMonths: string | null): number[] {
  if (!operationMonths) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return operationMonths.split(',').filter(Boolean).map(Number);
}

/**
 * 결제 일자가 환불일 이후인지 확인 (출석부 차단용)
 */
export function isAfterRefund(date: string, refundDate: string | null): boolean {
  if (!refundDate) return false;
  return date > refundDate;
}
