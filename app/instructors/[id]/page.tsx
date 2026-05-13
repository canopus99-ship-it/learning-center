import { redirect, notFound } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import InstructorDetailClient from './InstructorDetailClient';

export default async function InstructorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect('/login?error=no_access');
  }

  const { id } = await params;
  const instructorId = parseInt(id, 10);

  if (isNaN(instructorId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: instructor, error } = await supabase
    .from('instructors')
    .select('*')
    .eq('id', instructorId)
    .maybeSingle();

  if (error || !instructor) {
    notFound();
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <InstructorDetailClient instructor={instructor} />
    </div>
  );
}
