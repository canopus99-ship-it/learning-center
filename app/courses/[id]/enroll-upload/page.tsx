import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import EnrollUploadClient from './EnrollUploadClient';

export default async function EnrollUploadPage({ params }: { params: { id: string } }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  const supabase = await createClient();
  const courseId = parseInt(params.id, 10);
  const { data: course } = await supabase
    .from('courses')
    .select('id, name, category, capacity, is_active')
    .eq('id', courseId)
    .single();

  if (!course) {
    redirect('/courses?error=not_found');
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <EnrollUploadClient course={course} />
    </div>
  );
}
