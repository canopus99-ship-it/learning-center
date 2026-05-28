import { redirect, notFound } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import MemberDetailClient from './MemberDetailClient';

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect('/login?error=no_access');
  }

  const { id } = await params;
  const memberId = parseInt(id, 10);

  if (isNaN(memberId)) {
    notFound();
  }

  const supabase = await createClient();
  const [memberRes, enrollmentsRes, levelsRes] = await Promise.all([
    supabase.from('members').select('*').eq('id', memberId).maybeSingle(),
    supabase
      .from('enrollments')
      .select('*, courses(id, name, category, is_free, fee_jung_gu, fee_other, classroom, capacity, is_active, use_levels)')
      .eq('member_id', memberId),
    supabase.from('course_levels').select('*').order('course_id').order('sort_order'),
  ]);

  if (memberRes.error || !memberRes.data) {
    notFound();
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <MemberDetailClient
        member={memberRes.data}
        staffName={staff.name || staff.email}
        staffEmail={staff.email}
        initialEnrollments={enrollmentsRes.data || []}
        allLevels={levelsRes.data || []}
      />
    </div>
  );
}
