import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import MemberStatsClient from './MemberStatsClient';

export default async function MemberStatsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <MemberStatsClient />
    </div>
  );
}
