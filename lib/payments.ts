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

// 옛 DB 값('unregistered', 'refund', 'other')도 호환되도록 string 키 허용
export const END_REASON_LABELS: Record<string, string> = {
  self_request: '본인 요청',
  staff_action: '직원 조치',
  // 옛 값 호환
  unregistered: '미등록(자연 종료)',
  refund: '환불',
  other: '기타',
};

export const END_REASON_COLORS: Record<string, string> = {
  self_request: '#185FA5',
  staff_action: '#A32D2D',
  // 옛 값 호환
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
 * 특정 월에 수강 종료된 상태인지 판정
 *
 * 종료일의 의미: "안 오기 시작하는 날"
 *  - 종료일이 6월 1일 → 5월 31일까지 다님, 6월부터 안 옴
 *  - 종료일이 5월 20일 → 5월 19일까지 다님 (하루라도 들었으면 그 달은 살림)
 *
 * 판정 기준:
 *  - status !== 'ended' → 종료 아님
 *  - end_date 없음 → 모든 월 종료 (구버전 호환)
 *  - 종료일이 그 달 1일인 경우: 그 달부터 안 옴 (true)
 *  - 종료일이 그 달 2일 이후인 경우: 그 달은 하루라도 들었으니 살림 (false)
 *  - 종료일이 속한 달의 "다음 달부터" 무조건 true
 *
 * 예:
 *  - 6/1 종료: 5월=false (다 다님), 6월=true (안 옴)
 *  - 5/20 종료: 5월=false (5/19까지 다님), 6월=true
 *  - 5/1 종료: 5월=true (5/1부터 안 옴), 4월=false
 *
 * 환불/이월은 payments 테이블의 status_type으로 관리되며 별개 축.
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

  const endYear = parseInt(enrollment.end_date.substring(0, 4), 10);
  const endMonth = parseInt(enrollment.end_date.substring(5, 7), 10);
  const endDay = parseInt(enrollment.end_date.substring(8, 10), 10);

  // 종료일 이전 연도: 아직 다님
  if (year < endYear) return false;
  // 종료일 이후 연도: 종료
  if (year > endYear) return true;

  // 같은 연도일 때
  // 종료일 이전 달: 다 다님
  if (month < endMonth) return false;
  // 종료일 이후 달: 안 옴
  if (month > endMonth) return true;

  // 같은 달일 때: 1일 종료면 안 옴, 2일 이상이면 하루라도 들었으니 살림
  if (endDay === 1) return true;
  return false;
}

/**
 * 셀 상태 결정 (등록/미등록/미납/수강종료/운영X)
 */
export type CellStatus = 'paid' | 'unregistered' | 'unpaid' | 'ended' | 'not_operating' | 'before_enrollment';

/**
 * 특정 월이 회원의 "최초수강월" 이전(= 신청전)인지 판정
 *
 * 신청전 = 강좌는 운영하지만 이 회원이 아직 신청하지 않았던 달.
 *          미납도 미등록도 아니며, 회색으로 표시하고 모든 통계에서 제외한다.
 *
 * 판정 기준:
 *  - start_year/start_month가 있으면 그 값 기준
 *  - 없으면(구버전 데이터) enrolled_at의 연·월로 폴백
 *  - 둘 다 없으면 막지 않음(false) = 기존 동작 유지
 */
export function isBeforeStartMonth(
  enrollment: {
    start_year?: number | null;
    start_month?: number | null;
    enrolled_at?: string | null;
  },
  year: number,
  month: number
): boolean {
  let sy = enrollment.start_year ?? null;
  let sm = enrollment.start_month ?? null;
  if ((sy === null || sm === null) && enrollment.enrolled_at) {
    sy = parseInt(enrollment.enrolled_at.substring(0, 4), 10);
    sm = parseInt(enrollment.enrolled_at.substring(5, 7), 10);
  }
  if (sy === null || sm === null) return false;
  if (year < sy) return true;
  if (year > sy) return false;
  return month < sm;
}

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
