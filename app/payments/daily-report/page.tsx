import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import DailyReportClient from './DailyReportClient';

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  const { date } = await searchParams;

  return (
    <div>
      <div className="no-print">
        <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      </div>
      <DailyReportClient initialDate={date || null} />
    </div>
  );
}
