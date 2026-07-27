import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import TopBar from '@/components/TopBar';
import ReceiptPrintClient from './ReceiptPrintClient';
import type { ReceiptItem } from '@/lib/receipt';

export default async function ReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; member?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  const { ids, member } = await searchParams;
  const paymentIds = (ids || '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n));
  const memberId = parseInt(member || '', 10);

  if (paymentIds.length === 0 || isNaN(memberId)) {
    return (
      <div>
        <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
        <div style={{ maxWidth: 700, margin: '60px auto', padding: 20, textAlign: 'center', color: '#888' }}>
          영수증을 발행할 결제 항목이 없습니다.
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: memberRow } = await supabase
    .from('members')
    .select('id, name, phone')
    .eq('id', memberId)
    .maybeSingle();

  const { data: paymentsRaw } = await supabase
    .from('payments')
    .select('id, payment_year, payment_month, amount, paid_at, payment_method, status_type, enrollments(course_id, courses(name))')
    .in('id', paymentIds);

  const items: ReceiptItem[] = (paymentsRaw || [])
    .filter((p: any) => p && p.status_type !== 'refunded' && p.status_type !== 'carryover')
    .map((p: any) => {
      const enr = Array.isArray(p.enrollments) ? p.enrollments[0] : p.enrollments;
      const course = enr ? (Array.isArray(enr.courses) ? enr.courses[0] : enr.courses) : null;
      return {
        id: p.id,
        courseName: course?.name || '-',
        year: p.payment_year,
        month: p.payment_month,
        amount: p.amount || 0,
        paidAt: p.paid_at,
        method: p.payment_method,
      };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <ReceiptPrintClient
        member={memberRow ? { id: memberRow.id, name: memberRow.name, phone: memberRow.phone } : { id: memberId, name: '-', phone: null }}
        items={items}
      />
    </div>
  );
}
