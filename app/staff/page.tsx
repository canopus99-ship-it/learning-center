import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import StaffClient from './StaffClient';

export default async function StaffPage() {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect('/login?error=no_access');
  }
  if (staff.role !== 'admin') {
    redirect('/?error=admin_only');
  }

  const supabase = await createClient();
  const [staffRes, coursesRes] = await Promise.all([
    supabase.from('staff_members').select('*').order('role').order('name'),
    supabase.from('courses').select('id, name, category').eq('is_active', true).order('category').order('name'),
  ]);

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <StaffClient
        initialStaff={staffRes.data || []}
        courses={coursesRes.data || []}
      />
    </div>
  );
}
