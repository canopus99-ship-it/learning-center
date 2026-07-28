import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import ReceiptClient from './ReceiptClient';

export default async function ReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  const { ids: idsParam } = await searchParams;
  const ids = (idsParam || '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n));

  return (
    <div>
      <div className="no-print">
        <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      </div>
      <ReceiptClient ids={ids} />
    </div>
  );
}
