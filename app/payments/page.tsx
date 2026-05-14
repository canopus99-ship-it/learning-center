import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import PaymentsClient from './PaymentsClient';

export default async function PaymentsPage() {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect('/login?error=no_access');
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <PaymentsClient staffName={staff.name || staff.email} />
    </div>
  );
}
