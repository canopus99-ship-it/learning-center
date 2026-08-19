import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * 공개(로그인 불필요) 강좌 검색용 API
 *
 * - /courses-search 페이지(그리고 이 도메인 밖의 정적 페이지)가 이 엔드포인트를 호출해서
 *   "현재 운영중인 강좌"의 기본 정보만 가져옵니다.
 * - 회원 개인정보, 메모(memo), 강사 개인 연락처 등 관리자용 정보는 절대 포함하지 않습니다.
 *   -> 아래 select() 목록에 필드를 추가할 때는 "이 정보가 외부에 공개돼도 괜찮은가"를 먼저 확인하세요.
 * - Supabase의 RLS 정책과 무관하게 항상 같은 결과를 주기 위해, 브라우저에 노출되는 anon key가 아니라
 *   서버에만 있는 service_role key를 사용합니다. 이 키는 절대 NEXT_PUBLIC_ 접두사를 붙이지 말고,
 *   Vercel 프로젝트 환경변수(SUPABASE_SERVICE_ROLE_KEY)에만 저장하세요. (README 참고)
 */

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정 > Environment Variables에서 추가해주세요.'
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function GET() {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('courses')
      .select(
        [
          'id',
          'category',
          'name',
          'classroom',
          'capacity',
          'operation_type',
          'operation_months',
          'fee_jung_gu',
          'fee_other',
          'is_free',
          'is_lesson',
          'use_levels',
          'course_levels ( level_name, fee_jung_gu, fee_other, sort_order )',
          'course_sessions ( frequency, day_of_week, specific_date, start_time, end_time )',
        ].join(', ')
      )
      .eq('is_active', true)
      .order('category')
      .order('name');

    if (error) {
      console.error('공개 강좌 조회 실패:', error);
      return NextResponse.json({ error: '강좌 정보를 불러오지 못했습니다.' }, { status: 500 });
    }

    return NextResponse.json(
      { courses: data ?? [], generatedAt: new Date().toISOString() },
      {
        headers: {
          // 잦은 트래픽에도 DB 부담이 없도록 60초간 캐시, 이후 5분간은 재검증 중에도 이전 응답 사용
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err: any) {
    console.error('공개 강좌 API 오류:', err);
    return NextResponse.json({ error: err?.message || '알 수 없는 오류' }, { status: 500 });
  }
}
