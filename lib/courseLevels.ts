import { createClient } from '@/lib/supabase/client';

type SupabaseBrowserClient = ReturnType<typeof createClient>;

/**
 * 등급 변경(승급/강등): enrollment의 현재 등급을 바꾸고, 변경 이력을 course_level_changes에 남긴다.
 *
 * 중요: 이미 결제 완료된 과거 payments 행은 저장 당시 등급(payments.course_level_id)을
 * 그대로 가지고 있으므로 건드리지 않는다. 즉 이 함수를 실행해도 이미 인쇄한 영수증/일별결제현황은
 * 예전 등급(예: 초급) 그대로 남고, 이후 새로 등록되는 결제부터 새 등급이 적용된다.
 */
export async function changeEnrollmentLevel(
  supabase: SupabaseBrowserClient,
  enrollmentId: number,
  fromLevelId: number | null,
  toLevelId: number
): Promise<{ error: string | null }> {
  const { error: updErr } = await supabase
    .from('enrollments')
    .update({ course_level_id: toLevelId })
    .eq('id', enrollmentId);

  if (updErr) {
    return { error: '등급 변경 실패: ' + updErr.message };
  }

  const { error: histErr } = await supabase
    .from('course_level_changes')
    .insert({ enrollment_id: enrollmentId, from_level_id: fromLevelId, to_level_id: toLevelId });

  if (histErr) {
    console.error('승급 이력 저장 실패:', histErr);
    // 등급 자체는 이미 바뀐 상태라 완전 실패로 보진 않지만, 이력이 안 남았음을 알려준다.
    return { error: '등급은 변경되었지만 승급 이력 저장에 실패했습니다: ' + histErr.message };
  }

  return { error: null };
}

export type CourseLevelChangeRow = {
  id: number;
  enrollment_id: number;
  from_level_id: number | null;
  to_level_id: number;
  changed_at: string;
};
