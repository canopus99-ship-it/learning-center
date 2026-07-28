/**
 * 수강료 영수증 번호 관련 유틸
 *
 * 번호 형식: R-YYYYMMDD-순번 (예: R-20260728-001)
 * - YYYYMMDD = 영수증을 발급(=최초 출력)한 날짜
 * - 순번 = 그날 발급된 영수증 중 몇 번째인지 (3자리, 001부터)
 *
 * 순번은 payments.receipt_number 컬럼에 저장된 기존 값들을 훑어서 계산한다.
 * (별도 카운터 테이블을 두지 않음)
 */

export function receiptDatePart(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function receiptNumberPrefix(d: Date = new Date()): string {
  return `R-${receiptDatePart(d)}-`;
}

/**
 * 오늘 이미 발급된 영수증 번호 목록(receipt_number 값들)을 넘기면
 * 다음 순번으로 새 영수증 번호를 만들어 반환한다.
 */
export function nextReceiptNumber(existingNumbersToday: (string | null)[], d: Date = new Date()): string {
  const prefix = receiptNumberPrefix(d);
  let maxSeq = 0;
  existingNumbersToday.forEach((n) => {
    if (!n || !n.startsWith(prefix)) return;
    const seq = parseInt(n.substring(prefix.length), 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  });
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export function formatKoreanDate(d: Date = new Date()): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function formatKoreanDateFromStr(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr + (dateStr.length <= 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return dateStr;
  return formatKoreanDate(d);
}
