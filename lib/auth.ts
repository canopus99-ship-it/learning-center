import { createClient } from '@/lib/supabase/server';

export type StaffMember = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  notes: string | null;
};

/**
 * 현재 로그인한 사용자의 직원 정보를 가져옴
 * 직원 명단에 없거나 비활성 상태면 null 반환
 */
export async function getCurrentStaff(): Promise<StaffMember | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.email) return null;

  const { data, error } = await supabase
    .from('staff_members')
    .select('*')
    .eq('email', user.email)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data as StaffMember;
}
