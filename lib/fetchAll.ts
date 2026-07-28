/**
 * Supabase(PostgREST)는 명시적으로 .range()를 지정하지 않으면
 * 한 번의 조회에서 기본 최대 1000행까지만 반환하고, 그 이상은 에러 없이 그냥 잘라서 돌려준다.
 *
 * 이 프로젝트에서 실제로 발생한 문제: payments 테이블이 2026년 한 해에만 1000행을 넘어서면서
 * "결제는 DB에 정상 저장됐는데 화면에는 일부가 안 보이는" 버그가 생겼다(조용한 데이터 누락).
 *
 * 데이터가 1000행을 넘을 수 있는 조회는 전부 이 헬퍼로 페이지를 나눠 끝까지 가져와야 한다.
 */

const PAGE_SIZE = 1000;

/**
 * @param buildQuery (from, to) => supabase 쿼리(.range(from, to)까지 포함해서 반환)
 *   예: (from, to) => supabase.from('payments').select('*').eq('payment_year', year).range(from, to)
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<{ data: T[]; error: any }> {
  let all: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) {
      return { data: all, error };
    }
    const rows = data || [];
    all = all.concat(rows);
    if (rows.length < PAGE_SIZE) break; // 마지막 페이지
    from += PAGE_SIZE;
  }

  return { data: all, error: null };
}
