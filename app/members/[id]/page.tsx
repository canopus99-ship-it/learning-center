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
  const { data: member, error } = await supabase
    .from('members')
    .select('*')
    .eq('id', memberId)
    .maybeSingle();

  if (error || !member) {
    notFound();
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <MemberDetailClient
        member={member}
        staffName={staff.name || staff.email}
        staffEmail={staff.email}
      />
    </div>
  );
}
