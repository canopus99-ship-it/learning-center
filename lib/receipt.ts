/**
 * 수강료 영수증 (내부 수입결의 증빙용) 관련 순수 헬퍼
 * 실제 발급(조회/저장)은 각 화면에서 supabase 클라이언트로 직접 처리한다 (다른 lib 파일과 동일한 패턴).
 */

export type ReceiptItem = {
  id: number; // payments.id
  courseName: string;
  year: number;
  month: number;
  amount: number;
  paidAt: string | null;
  method: string | null;
};

/**
 * 영수증 번호 포맷: R-YYYYMMDD-순번(3자리)
 */
export function formatReceiptNo(date: Date, seq: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `R-${y}${m}${d}-${String(seq).padStart(3, '0')}`;
}

/**
 * 오늘 날짜(YYYY-MM-DD) 문자열
 */
export function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * payment id 배열이 순서와 무관하게 동일한지 비교
 */
export function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}
