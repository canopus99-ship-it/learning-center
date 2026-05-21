import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import CourseStatsClient from './CourseStatsClient';

export default async function CourseStatsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <CourseStatsClient />
    </div>
  );
}
