import { createClient } from './supabase/server';

export type Staff = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  allowed_course_ids: string | null;
};

/**
 * 현재 로그인한 사용자의 직원 정보 조회
 * - 로그인 안 됨: null
 * - 로그인은 됐지만 직원 명단에 없음: null
 * - 비활성 직원: null
 * - 활성 직원: Staff 객체
 */
export async function getCurrentStaff(): Promise<Staff | null> {
  const supabase = await createClient();

  // Supabase Auth로 현재 사용자 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return null;

  // staff_members에서 이메일로 조회
  const { data, error } = await supabase
    .from('staff_members')
    .select('id, email, name, role, is_active, allowed_course_ids')
    .eq('email', user.email.toLowerCase())
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data as Staff;
}
