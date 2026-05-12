import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import StaffClient from './StaffClient';

export default async function StaffPage() {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect('/login?error=no_access');
  }

  // 관리자만 접근 가능
  if (staff.role !== 'admin') {
    redirect('/?error=no_permission');
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <StaffClient currentEmail={staff.email} />
    </div>
  );
}
