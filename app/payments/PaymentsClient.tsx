'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  PAYMENT_METHOD_LABELS,
  calculateFee,
  parseOperationMonths,
  type PaymentMethod,
  type EndReason,
} from '@/lib/payments';
import { STATUS_LABELS, type EnrollmentStatus } from '@/lib/enrollment';

type Course = {
  id: number;
  category: string;
  name: string;
  capacity: number;
  operation_months: string | null;
  fee_jung_gu: number;
  fee_other: number;
  is_free: boolean;
  is_active: boolean;
};

type Member = {
  id: number;
  name: string;
  phone: string | null;
  region_type: string | null;
  is_jung_gu: boolean;
  is_discount_50: boolean;
  is_discount_100: boolean;
};

type Enrollment = {
  id: number;
  member_id: number;
  course_id: number;
  status: EnrollmentStatus;
  end_reason: EndReason | null;
  refund_date: string | null;
  members: Member | null;
};

type Payment = {
  id: number;
  enrollment_id: number;
  payment_year: number;
  payment_month: number;
  amount: number;
  is_paid: boolean;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  receipt_number: string | null;
  is_annual: boolean;
  is_free: boolean;
  memo: string | null;
};

type MemberSearchResult = {
  id: number;
  name: string;
  phone: string | null;
  region_type: string | null;
  is_jung_gu: boolean;
  is_discount_50: boolean;
  is_discount_100: boolean;
};

type TabType = 'by-course' | 'by-member' | 'unpaid';

const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5', '성숙한시민': '#7B3FBF', '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517', '기타': '#666',
};

export default function PaymentsClient({ staffName }: { staffName: string }) {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>('by-course');

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // 강좌별 보기 필터
  const [selectedCourseId, setSelectedCourseId] = useState<number | 'all'>('all');
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);

  // 회원별 보기 필터
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<MemberSearchResult[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);
  const [memberSearching, setMemberSearching] = useState(false);

  // 결제 모달
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<{
    enrollment: Enrollment;
    course: Course;
    existing: Payment | null;
  } | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptNum, setReceiptNum] = useState('');
  const [payMemo, setPayMemo] = useState('');

  // 일괄 결제 모달 (회원별)
  const [bulkPayModalOpen, setBulkPayModalOpen] = useState(false);
  const [bulkPayMethod, setBulkPayMethod] = useState<PaymentMethod>('cash');
  const [bulkPayDate, setBulkPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkReceiptNum, setBulkReceiptNum] = useState('');
  const [bulkEnrollments, setBulkEnrollments] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  async function loadData() {
    setLoading(true);
    const [coursesRes, enrollmentsRes, paymentsRes] = await Promise.all([
      supabase.from('courses').select('*').eq('is_active', true).order('category').order('name'),
      supabase
        .from('enrollments')
        .select('*, members(id, name, phone, region_type, is_jung_gu, is_discount_50, is_discount_100)')
        .in('status', ['active', 'paused']),
      supabase.from('payments').select('*').eq('payment_year', selectedYear),
    ]);

    setCourses(coursesRes.data || []);
    setEnrollments((enrollmentsRes.data as Enrollment[]) || []);
    setPayments(paymentsRes.data || []);
    setLoading(false);
  }

  function getPayment(enrollmentId: number, month: number): Payment | null {
    return payments.find(p =>
      p.enrollment_id === enrollmentId &&
      p.payment_year === selectedYear &&
      p.payment_month === month
    ) || null;
  }

  function getEnrollmentsByCourse(courseId: number): Enrollment[] {
    return enrollments
      .filter(e => e.course_id === courseId)
      .sort((a, b) => (a.members?.name || '').localeCompare(b.members?.name || ''));
  }

  function getEnrollmentsByMember(memberId: number): Enrollment[] {
    return enrollments
      .filter(e => e.member_id === memberId)
      .sort((a, b) => {
        const cA = courses.find(c => c.id === a.course_id)?.name || '';
        const cB = courses.find(c => c.id === b.course_id)?.name || '';
        return cA.localeCompare(cB);
      });
  }

  function isRefundedBeforeMonth(enrollment: Enrollment, year: number, month: number): boolean {
    if (!enrollment.refund_date) return false;
    const monthEnd = new Date(year, month, 0).toISOString().split('T')[0];
    return enrollment.refund_date < monthEnd;
  }

  // 회원 검색
  async function handleSearchMember() {
    if (!memberSearchQuery.trim()) { setMemberSearchResults([]); return; }
    setMemberSearching(true);
    const q = memberSearchQuery.trim();
    const { data } = await supabase
      .from('members')
      .select('id, name, phone, region_type, is_jung_gu, is_discount_50, is_discount_100')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20);
    setMemberSearchResults(data || []);
    setMemberSearching(false);
  }

  function selectMember(m: MemberSearchResult) {
    setSelectedMember(m);
    setMemberSearchResults([]);
    setMemberSearchQuery('');
  }

  // 개별 결제 모달 열기
  function openPaymentModal(enrollment: Enrollment, course: Course) {
    const existing = getPayment(enrollment.id, selectedMonth);
    const member = enrollment.members;
    if (!member) return;

    const calc = calculateFee(
      course.fee_jung_gu, course.fee_other,
      member.is_jung_gu, member.is_discount_50, member.is_discount_100,
      course.is_free
    );

    setEditingPayment({ enrollment, course, existing });
    setPayAmount(existing?.amount?.toString() || calc.amount.toString());
    setPayMethod(existing?.payment_method || 'cash');
    setPayDate(existing?.paid_at || new Date().toISOString().split('T')[0]);
    setReceiptNum(existing?.receipt_number || '');
    setPayMemo(existing?.memo || '');
    setPaymentModalOpen(true);
  }

  async function handleSavePayment(markPaid: boolean) {
    if (!editingPayment) return;
    const { enrollment, course, existing } = editingPayment;
    const member = enrollment.members;
    if (!member) return;

    const calc = calculateFee(
      course.fee_jung_gu, course.fee_other,
      member.is_jung_gu, member.is_discount_50, member.is_discount_100,
      course.is_free
    );

    const data = {
      enrollment_id: enrollment.id,
      payment_year: selectedYear,
      payment_month: selectedMonth,
      amount: parseInt(payAmount, 10) || 0,
      is_paid: markPaid,
      paid_at: markPaid ? payDate : null,
      payment_method: markPaid ? payMethod : null,
      receipt_number: receiptNum || null,
      is_free: course.is_free || calc.discountType === 'discount_100',
      discount_type: calc.discountType,
      memo: payMemo || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existing) {
      const res = await supabase.from('payments').update(data).eq('id', existing.id);
      error = res.error;
    } else {
      const res = await supabase.from('payments').insert([data]);
      error = res.error;
    }

    if (error) alert('저장 실패: ' + error.message);
    else {
      setPaymentModalOpen(false);
      setEditingPayment(null);
      loadData();
    }
  }

  async function handleDeletePayment() {
    if (!editingPayment?.existing) return;
    if (!confirm('이 결제 기록을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('payments').delete().eq('id', editingPayment.existing.id);
    if (error) alert('삭제 실패: ' + error.message);
    else {
      setPaymentModalOpen(false);
      setEditingPayment(null);
      loadData();
    }
  }

  // 회원별 - 일괄 결제 처리
  function openBulkPayModal() {
    if (!selectedMember) return;
    const memberEnrollments = getEnrollmentsByMember(selectedMember.id);
    const unpaidEnrollments = memberEnrollments.filter(e => {
      const c = courses.find(cc => cc.id === e.course_id);
      if (!c) return false;
      if (!parseOperationMonths(c.operation_months).includes(selectedMonth)) return false;
      if (isRefundedBeforeMonth(e, selectedYear, selectedMonth)) return false;
      const p = getPayment(e.id, selectedMonth);
      if (p?.is_paid) return false;
      // 자동완료(0원)는 제외
      const calc = calculateFee(c.fee_jung_gu, c.fee_other, selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100, c.is_free);
      if (calc.amount === 0) return false;
      return true;
    });

    if (unpaidEnrollments.length === 0) {
      alert('결제할 수 있는 미납 강좌가 없습니다.');
      return;
    }

    setBulkEnrollments(new Set(unpaidEnrollments.map(e => e.id)));
    setBulkPayMethod('cash');
    setBulkPayDate(new Date().toISOString().split('T')[0]);
    setBulkReceiptNum('');
    setBulkPayModalOpen(true);
  }

  function toggleBulkEnrollment(eId: number) {
    setBulkEnrollments(prev => {
      const next = new Set(prev);
      if (next.has(eId)) next.delete(eId);
      else next.add(eId);
      return next;
    });
  }

  async function handleBulkSave() {
    if (!selectedMember) return;
    if (bulkEnrollments.size === 0) {
      alert('결제할 강좌를 선택하세요');
      return;
    }

    const memberEnrollments = getEnrollmentsByMember(selectedMember.id);
    const toProcess = memberEnrollments.filter(e => bulkEnrollments.has(e.id));

    let totalAmount = 0;
    const operations: Promise<any>[] = [];

    for (const e of toProcess) {
      const course = courses.find(c => c.id === e.course_id);
      if (!course) continue;
      const calc = calculateFee(
        course.fee_jung_gu, course.fee_other,
        selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100,
        course.is_free
      );

      const existing = getPayment(e.id, selectedMonth);
      const data = {
        enrollment_id: e.id,
        payment_year: selectedYear,
        payment_month: selectedMonth,
        amount: calc.amount,
        is_paid: true,
        paid_at: bulkPayDate,
        payment_method: bulkPayMethod,
        receipt_number: bulkReceiptNum || null,
        is_free: course.is_free || calc.discountType === 'discount_100',
        discount_type: calc.discountType,
        updated_at: new Date().toISOString(),
      };

      totalAmount += calc.amount;

      if (existing) {
        operations.push(supabase.from('payments').update(data).eq('id', existing.id));
      } else {
        operations.push(supabase.from('payments').insert([data]));
      }
    }

    const results = await Promise.all(operations);
    const hasError = results.some(r => r.error);

    if (hasError) {
      alert('일부 결제 처리에 실패했습니다.');
    } else {
      alert(`${selectedMember.name}님의 ${toProcess.length}개 강좌 결제가 완료되었습니다.\n총 결제 금액: ${totalAmount.toLocaleString()}원`);
    }

    setBulkPayModalOpen(false);
    loadData();
  }

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // 미납자 목록 (전체 강좌)
  const allUnpaid = (() => {
    const result: { course: Course; enrollment: Enrollment; waitingCount: number }[] = [];
    courses.forEach(course => {
      if (!parseOperationMonths(course.operation_months).includes(selectedMonth)) return;
      if (course.is_free) return;

      const courseEnrollments = getEnrollmentsByCourse(course.id);
      const waitingCount = enrollments.filter(e => e.course_id === course.id && e.status === 'waiting').length;

      courseEnrollments.forEach(e => {
        if (!e.members) return;
        if (isRefundedBeforeMonth(e, selectedYear, selectedMonth)) return;

        const calc = calculateFee(
          course.fee_jung_gu, course.fee_other,
          e.members.is_jung_gu, e.members.is_discount_50, e.members.is_discount_100,
          course.is_free
        );
        if (calc.amount === 0) return;

        const p = getPayment(e.id, selectedMonth);
        if (!p || !p.is_paid) {
          result.push({ course, enrollment: e, waitingCount });
        }
      });
    });
    return result;
  })();

  return (
    <div style={{ maxWidth: 1200, margin: '40px auto', padding: 20 }}>
      <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20 }}>💰 수납 관리</h1>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #eee' }}>
        <TabButton active={activeTab === 'by-course'} onClick={() => setActiveTab('by-course')} label="🎯 강좌별 보기" />
        <TabButton active={activeTab === 'by-member'} onClick={() => setActiveTab('by-member')} label="👤 회원별 보기" />
        <TabButton active={activeTab === 'unpaid'} onClick={() => setActiveTab('unpaid')} label={`⚠️ 미납자 점검 ${allUnpaid.length > 0 ? `(${allUnpaid.length})` : ''}`} />
      </div>

      {/* 연/월 선택 (모든 탭 공통) */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setSelectedYear(selectedYear - 1)} style={smallBtnStyle}>◀</button>
          <strong style={{ fontSize: 18, minWidth: 70, textAlign: 'center' }}>{selectedYear}년</strong>
          <button onClick={() => setSelectedYear(selectedYear + 1)} style={smallBtnStyle}>▶</button>
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {months.map(m => (
            <button key={m} onClick={() => setSelectedMonth(m)} style={{
              padding: '8px 14px',
              background: selectedMonth === m ? '#185FA5' : 'white',
              color: selectedMonth === m ? 'white' : '#666',
              border: '1px solid ' + (selectedMonth === m ? '#185FA5' : '#ddd'),
              borderRadius: 6, cursor: 'pointer', fontSize: 13,
              fontWeight: selectedMonth === m ? 500 : 'normal',
            }}>{m}월</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>불러오는 중...</p>
      ) : (
        <>
          {/* ============================================ */}
          {/* 탭 1: 강좌별 보기 (기존)                       */}
          {/* ============================================ */}
          {activeTab === 'by-course' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={selectedCourseId === 'all' ? 'all' : String(selectedCourseId)}
                  onChange={(e) => setSelectedCourseId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                  style={{ ...inputStyle, width: 250 }}
                >
                  <option value="all">전체 강좌</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>[{c.category}] {c.name}</option>
                  ))}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showUnpaidOnly} onChange={(e) => setShowUnpaidOnly(e.target.checked)} />
                  미납자만 보기
                </label>
              </div>

              {(selectedCourseId === 'all' ? courses : courses.filter(c => c.id === selectedCourseId)).map(course => {
                const courseEnrollments = getEnrollmentsByCourse(course.id);
                const operationMonths = parseOperationMonths(course.operation_months);
                const isOperating = operationMonths.includes(selectedMonth);

                const unpaidCount = courseEnrollments.filter(e => {
                  if (!isOperating || !e.members) return false;
                  if (isRefundedBeforeMonth(e, selectedYear, selectedMonth)) return false;
                  const calc = calculateFee(course.fee_jung_gu, course.fee_other, e.members.is_jung_gu, e.members.is_discount_50, e.members.is_discount_100, course.is_free);
                  if (calc.amount === 0) return false;
                  const p = getPayment(e.id, selectedMonth);
                  return !p || !p.is_paid;
                }).length;

                const displayEnrollments = showUnpaidOnly
                  ? courseEnrollments.filter(e => {
                      if (!isOperating || !e.members) return false;
                      if (isRefundedBeforeMonth(e, selectedYear, selectedMonth)) return false;
                      const calc = calculateFee(course.fee_jung_gu, course.fee_other, e.members.is_jung_gu, e.members.is_discount_50, e.members.is_discount_100, course.is_free);
                      if (calc.amount === 0) return false;
                      const p = getPayment(e.id, selectedMonth);
                      return !p || !p.is_paid;
                    })
                  : courseEnrollments;

                if (showUnpaidOnly && displayEnrollments.length === 0) return null;

                return (
                  <div key={course.id} style={{
                    background: 'white', borderRadius: 12, padding: 20, marginBottom: 12,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    opacity: isOperating ? 1 : 0.5,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Link href={`/courses/${course.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                          <h3 style={{ fontSize: 15, margin: 0 }}>{course.name}</h3>
                        </Link>
                        <span style={badgeStyle(CATEGORY_COLORS[course.category] || '#666')}>{course.category}</span>
                        {course.is_free && <span style={badgeStyle('#1D9E75')}>무료</span>}
                        {!isOperating && (<span style={{ ...badgeStyle('#888'), background: '#eee' }}>{selectedMonth}월 미운영</span>)}
                        {isOperating && unpaidCount > 0 && (<span style={{ ...badgeStyle('#A32D2D'), background: '#FCEBEB' }}>미납 {unpaidCount}명</span>)}
                      </div>
                      <div style={{ fontSize: 12, color: '#888' }}>
                        정원 {course.capacity}명 · 현재 {courseEnrollments.length}명
                        {!course.is_free && (<span style={{ marginLeft: 8 }}>({course.fee_jung_gu.toLocaleString()}/{course.fee_other.toLocaleString()})</span>)}
                      </div>
                    </div>

                    {!isOperating ? (
                      <p style={{ fontSize: 13, color: '#888', margin: 0, fontStyle: 'italic' }}>{selectedMonth}월에는 운영하지 않는 강좌입니다.</p>
                    ) : displayEnrollments.length === 0 ? (
                      <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{showUnpaidOnly ? '미납자가 없습니다.' : '수강생이 없습니다.'}</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                            <th style={thStyle}>이름</th>
                            <th style={thStyle}>구분</th>
                            <th style={thStyle}>감면</th>
                            <th style={thStyle}>{selectedMonth}월 결제</th>
                            <th style={thStyle}>금액</th>
                            <th style={thStyle}>방법</th>
                            <th style={thStyle}>결제일</th>
                            <th style={thStyle}>관리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayEnrollments.map(e => {
                            const member = e.members;
                            if (!member) return null;
                            const p = getPayment(e.id, selectedMonth);

                            if (isRefundedBeforeMonth(e, selectedYear, selectedMonth)) {
                              return (
                                <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: 0.5 }}>
                                  <td style={tdStyle}>
                                    <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{member.name}</Link>
                                  </td>
                                  <td colSpan={7} style={{ ...tdStyle, color: '#A32D2D', fontSize: 12 }}>({e.refund_date} 환불 처리)</td>
                                </tr>
                              );
                            }

                            const calc = calculateFee(course.fee_jung_gu, course.fee_other, member.is_jung_gu, member.is_discount_50, member.is_discount_100, course.is_free);
                            const isAutoComplete = calc.amount === 0;

                            return (
                              <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                <td style={tdStyle}>
                                  <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}><strong>{member.name}</strong></Link>
                                  {e.status === 'paused' && (
                                    <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 5px', background: '#7B3FBF', color: 'white', borderRadius: 3 }}>일시중지</span>
                                  )}
                                </td>
                                <td style={tdStyle}>{member.region_type || '-'}</td>
                                <td style={tdStyle}>
                                  {member.is_discount_100 ? (<span style={badgeStyle('#A32D2D')}>100%</span>
                                  ) : member.is_discount_50 ? (<span style={badgeStyle('#BA7517')}>50%</span>
                                  ) : '-'}
                                </td>
                                <td style={tdStyle}>
                                  {p?.is_paid ? (<span style={badgeStyle('#1D9E75')}>✓ 완료</span>
                                  ) : isAutoComplete ? (<span style={badgeStyle('#1D9E75')}>자동완료</span>
                                  ) : (<span style={badgeStyle('#A32D2D')}>미납</span>)}
                                </td>
                                <td style={tdStyle}>{p ? p.amount.toLocaleString() : calc.amount.toLocaleString()}원</td>
                                <td style={tdStyle}>{p?.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] : '-'}</td>
                                <td style={tdStyle}>{p?.paid_at || '-'}</td>
                                <td style={tdStyle}>
                                  <button onClick={() => openPaymentModal(e, course)} style={smallBtnStyle}>
                                    {p?.is_paid ? '수정' : '결제처리'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* ============================================ */}
          {/* 탭 2: 회원별 보기                              */}
          {/* ============================================ */}
          {activeTab === 'by-member' && (
            <>
              {/* 회원 검색 */}
              <div style={{ background: 'white', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>회원 검색</h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchMember()}
                    placeholder="이름 또는 연락처로 검색"
                    style={{ flex: 1, ...inputStyle }}
                  />
                  <button onClick={handleSearchMember} style={primaryBtnStyle}>검색</button>
                </div>

                {memberSearching ? (
                  <p style={{ fontSize: 13, color: '#888' }}>검색 중...</p>
                ) : memberSearchResults.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                    {memberSearchResults.map(m => (
                      <div
                        key={m.id}
                        onClick={() => selectMember(m)}
                        style={{
                          padding: 10, background: '#f9f9f9', borderRadius: 6,
                          border: '1px solid #eee', cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: 14 }}>{m.name}</strong>
                          <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>
                            {m.phone || '-'} · {m.region_type || '-'}
                          </span>
                          {m.is_discount_100 && <span style={{ ...badgeStyle('#A32D2D'), marginLeft: 6 }}>100%감면</span>}
                          {m.is_discount_50 && <span style={{ ...badgeStyle('#BA7517'), marginLeft: 6 }}>50%감면</span>}
                        </div>
                        <span style={{ fontSize: 12, color: '#185FA5' }}>선택 →</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* 선택된 회원의 결제 화면 */}
              {selectedMember && (() => {
                const memberEnrollments = getEnrollmentsByMember(selectedMember.id);
                const monthlyEnrollments = memberEnrollments.filter(e => {
                  const c = courses.find(cc => cc.id === e.course_id);
                  if (!c) return false;
                  if (!parseOperationMonths(c.operation_months).includes(selectedMonth)) return false;
                  return true;
                });

                let totalDue = 0;
                let totalPaid = 0;
                monthlyEnrollments.forEach(e => {
                  const c = courses.find(cc => cc.id === e.course_id);
                  if (!c) return;
                  if (isRefundedBeforeMonth(e, selectedYear, selectedMonth)) return;
                  const calc = calculateFee(c.fee_jung_gu, c.fee_other, selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100, c.is_free);
                  totalDue += calc.amount;
                  const p = getPayment(e.id, selectedMonth);
                  if (p?.is_paid) totalPaid += p.amount;
                });
                const remaining = totalDue - totalPaid;

                return (
                  <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>
                          <Link href={`/members/${selectedMember.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{selectedMember.name}</Link>
                        </h2>
                        <div style={{ fontSize: 12, color: '#888' }}>
                          {selectedMember.phone} · {selectedMember.region_type}
                          {selectedMember.is_discount_100 && <span style={{ ...badgeStyle('#A32D2D'), marginLeft: 8 }}>100%감면</span>}
                          {selectedMember.is_discount_50 && <span style={{ ...badgeStyle('#BA7517'), marginLeft: 8 }}>50%감면</span>}
                        </div>
                      </div>
                      <button onClick={() => setSelectedMember(null)} style={smallBtnStyle}>다른 회원 검색</button>
                    </div>

                    {/* 요약 */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16,
                    }}>
                      <SummaryBox label={`${selectedMonth}월 결제 예정`} value={`${totalDue.toLocaleString()}원`} color="#185FA5" />
                      <SummaryBox label="결제 완료" value={`${totalPaid.toLocaleString()}원`} color="#1D9E75" />
                      <SummaryBox label="미납" value={`${remaining.toLocaleString()}원`} color={remaining > 0 ? "#A32D2D" : "#888"} />
                    </div>

                    {/* 일괄 결제 버튼 */}
                    {remaining > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <button onClick={openBulkPayModal} style={{
                          padding: '12px 24px',
                          background: '#1D9E75', color: 'white',
                          border: 'none', borderRadius: 8, cursor: 'pointer',
                          fontSize: 14, fontWeight: 500,
                        }}>💰 미납 강좌 일괄 결제 처리</button>
                      </div>
                    )}

                    {/* 강좌별 결제 상태 */}
                    {monthlyEnrollments.length === 0 ? (
                      <p style={{ color: '#888', fontSize: 13 }}>{selectedMonth}월에 운영되는 신청 강좌가 없습니다.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                            <th style={thStyle}>강좌</th>
                            <th style={thStyle}>구분</th>
                            <th style={thStyle}>{selectedMonth}월 결제</th>
                            <th style={thStyle}>금액</th>
                            <th style={thStyle}>방법</th>
                            <th style={thStyle}>결제일</th>
                            <th style={thStyle}>관리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyEnrollments.map(e => {
                            const course = courses.find(c => c.id === e.course_id);
                            if (!course) return null;
                            const p = getPayment(e.id, selectedMonth);

                            if (isRefundedBeforeMonth(e, selectedYear, selectedMonth)) {
                              return (
                                <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: 0.5 }}>
                                  <td style={tdStyle}>
                                    <Link href={`/courses/${course.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{course.name}</Link>
                                  </td>
                                  <td colSpan={6} style={{ ...tdStyle, color: '#A32D2D', fontSize: 12 }}>({e.refund_date} 환불 처리)</td>
                                </tr>
                              );
                            }

                            const calc = calculateFee(course.fee_jung_gu, course.fee_other, selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100, course.is_free);
                            const isAutoComplete = calc.amount === 0;

                            return (
                              <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                <td style={tdStyle}>
                                  <Link href={`/courses/${course.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}><strong>{course.name}</strong></Link>
                                  {e.status === 'paused' && (
                                    <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 5px', background: '#7B3FBF', color: 'white', borderRadius: 3 }}>일시중지</span>
                                  )}
                                </td>
                                <td style={tdStyle}>
                                  <span style={badgeStyle(CATEGORY_COLORS[course.category] || '#666')}>{course.category}</span>
                                </td>
                                <td style={tdStyle}>
                                  {p?.is_paid ? (<span style={badgeStyle('#1D9E75')}>✓ 완료</span>
                                  ) : isAutoComplete ? (<span style={badgeStyle('#1D9E75')}>자동완료</span>
                                  ) : (<span style={badgeStyle('#A32D2D')}>미납</span>)}
                                </td>
                                <td style={tdStyle}>{p ? p.amount.toLocaleString() : calc.amount.toLocaleString()}원</td>
                                <td style={tdStyle}>{p?.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] : '-'}</td>
                                <td style={tdStyle}>{p?.paid_at || '-'}</td>
                                <td style={tdStyle}>
                                  <button onClick={() => openPaymentModal(e, course)} style={smallBtnStyle}>
                                    {p?.is_paid ? '수정' : '결제처리'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })()}

              {!selectedMember && memberSearchResults.length === 0 && !memberSearching && (
                <div style={{ background: 'white', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <p style={{ margin: 0 }}>회원을 검색해서 결제 처리하세요.</p>
                  <p style={{ fontSize: 12, marginTop: 8 }}>한 회원이 여러 강좌를 신청한 경우 한 번에 결제할 수 있습니다.</p>
                </div>
              )}
            </>
          )}

          {/* ============================================ */}
          {/* 탭 3: 미납자 점검                              */}
          {/* ============================================ */}
          {activeTab === 'unpaid' && (
            <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>
                  ⚠️ {selectedYear}년 {selectedMonth}월 미납자 ({allUnpaid.length}명)
                </h3>
                <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                  매월 15~24일 점검 시 활용하세요. 대기자 유무를 확인하고 종료 처리 여부를 결정할 수 있습니다.
                </p>
              </div>

              {allUnpaid.length === 0 ? (
                <p style={{ color: '#888', fontSize: 13, padding: 20, textAlign: 'center' }}>
                  미납자가 없습니다. 👍
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                      <th style={thStyle}>회원</th>
                      <th style={thStyle}>연락처</th>
                      <th style={thStyle}>강좌</th>
                      <th style={thStyle}>구분</th>
                      <th style={thStyle}>미납 금액</th>
                      <th style={thStyle}>대기자</th>
                      <th style={thStyle}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUnpaid.map(({ course, enrollment, waitingCount }) => {
                      const member = enrollment.members;
                      if (!member) return null;
                      const calc = calculateFee(course.fee_jung_gu, course.fee_other, member.is_jung_gu, member.is_discount_50, member.is_discount_100, course.is_free);

                      return (
                        <tr key={enrollment.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={tdStyle}>
                            <Link href={`/members/${enrollment.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                              <strong>{member.name}</strong>
                            </Link>
                            {member.is_discount_100 && <span style={{ ...badgeStyle('#A32D2D'), marginLeft: 4 }}>100%</span>}
                            {member.is_discount_50 && <span style={{ ...badgeStyle('#BA7517'), marginLeft: 4 }}>50%</span>}
                          </td>
                          <td style={tdStyle}>{member.phone || '-'}</td>
                          <td style={tdStyle}>
                            <Link href={`/courses/${course.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{course.name}</Link>
                          </td>
                          <td style={tdStyle}>
                            <span style={badgeStyle(CATEGORY_COLORS[course.category] || '#666')}>{course.category}</span>
                          </td>
                          <td style={tdStyle}><strong style={{ color: '#A32D2D' }}>{calc.amount.toLocaleString()}원</strong></td>
                          <td style={tdStyle}>
                            {waitingCount > 0 ? (
                              <span style={{ ...badgeStyle('#BA7517') }}>대기 {waitingCount}명</span>
                            ) : (
                              <span style={{ color: '#888', fontSize: 12 }}>없음</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            <button onClick={() => openPaymentModal(enrollment, course)} style={smallBtnStyle}>결제처리</button>
                            <Link href={`/courses/${course.id}`} style={{ ...smallBtnStyle, display: 'inline-block', textDecoration: 'none', color: '#666' }}>
                              종료 처리
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <div style={{
                marginTop: 16, padding: 12,
                background: '#FFF8E1', border: '1px solid #FFE082',
                borderRadius: 6, fontSize: 12, color: '#5D4037',
              }}>
                <strong>💡 안내</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
                  <li><strong>결제처리</strong>: 회원이 결제했으면 처리</li>
                  <li><strong>종료 처리</strong>: 강좌 상세 페이지로 이동해서 수강 종료 (미등록 종료)</li>
                  <li><strong>대기자가 있는 경우</strong>: 미납자 종료 후 대기자에게 연락하여 자리 채우기 결정</li>
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {/* 개별 결제 모달 */}
      {paymentModalOpen && editingPayment && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>결제 처리</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
              <strong>{editingPayment.enrollment.members?.name}</strong> · {editingPayment.course.name} · {selectedYear}년 {selectedMonth}월
            </p>

            {(() => {
              const member = editingPayment.enrollment.members!;
              const calc = calculateFee(
                editingPayment.course.fee_jung_gu, editingPayment.course.fee_other,
                member.is_jung_gu, member.is_discount_50, member.is_discount_100,
                editingPayment.course.is_free
              );
              return (
                <div style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', padding: 12, borderRadius: 6, fontSize: 12, color: '#042C53', marginBottom: 16 }}>
                  💡 자동 계산: {calc.description}
                </div>
              );
            })()}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>결제 금액 (원)</label>
              <input value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>결제 방법</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['cash', 'card', 'transfer', 'zeropay'] as PaymentMethod[]).map(m => (
                  <button key={m} onClick={() => setPayMethod(m)} style={{
                    flex: 1, padding: '10px',
                    background: payMethod === m ? '#185FA5' : 'white',
                    color: payMethod === m ? 'white' : '#666',
                    border: '1px solid ' + (payMethod === m ? '#185FA5' : '#ddd'),
                    borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  }}>{PAYMENT_METHOD_LABELS[m]}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>결제일</label>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>영수증 번호 (선택)</label>
                <input value={receiptNum} onChange={(e) => setReceiptNum(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>메모 (선택)</label>
              <input value={payMemo} onChange={(e) => setPayMemo(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleSavePayment(true)} style={{
                flex: 1, padding: '12px',
                background: '#1D9E75', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 14, fontWeight: 500,
              }}>✓ 결제 완료</button>
              <button onClick={() => handleSavePayment(false)} style={secondaryBtnStyle}>미납 처리</button>
              {editingPayment.existing && (
                <button onClick={handleDeletePayment} style={dangerBtnStyle}>기록 삭제</button>
              )}
              <button onClick={() => setPaymentModalOpen(false)} style={secondaryBtnStyle}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 결제 모달 */}
      {bulkPayModalOpen && selectedMember && (() => {
        const memberEnrollments = getEnrollmentsByMember(selectedMember.id);
        const candidateEnrollments = memberEnrollments.filter(e => {
          const c = courses.find(cc => cc.id === e.course_id);
          if (!c) return false;
          if (!parseOperationMonths(c.operation_months).includes(selectedMonth)) return false;
          if (isRefundedBeforeMonth(e, selectedYear, selectedMonth)) return false;
          const p = getPayment(e.id, selectedMonth);
          if (p?.is_paid) return false;
          const calc = calculateFee(c.fee_jung_gu, c.fee_other, selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100, c.is_free);
          if (calc.amount === 0) return false;
          return true;
        });

        const totalAmount = candidateEnrollments
          .filter(e => bulkEnrollments.has(e.id))
          .reduce((sum, e) => {
            const c = courses.find(cc => cc.id === e.course_id);
            if (!c) return sum;
            const calc = calculateFee(c.fee_jung_gu, c.fee_other, selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100, c.is_free);
            return sum + calc.amount;
          }, 0);

        return (
          <div style={modalOverlayStyle}>
            <div style={{ ...modalContentStyle, maxWidth: 600 }}>
              <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>일괄 결제 처리</h2>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
                <strong>{selectedMember.name}</strong>님 · {selectedYear}년 {selectedMonth}월 미납 강좌
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>결제할 강좌 선택 ({bulkEnrollments.size}개 선택됨)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 250, overflowY: 'auto' }}>
                  {candidateEnrollments.map(e => {
                    const course = courses.find(c => c.id === e.course_id);
                    if (!course) return null;
                    const calc = calculateFee(course.fee_jung_gu, course.fee_other, selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100, course.is_free);
                    const checked = bulkEnrollments.has(e.id);
                    return (
                      <label key={e.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: 10, background: checked ? '#E6F1FB' : 'white',
                        border: '1px solid ' + (checked ? '#185FA5' : '#eee'),
                        borderRadius: 6, cursor: 'pointer',
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleBulkEnrollment(e.id)} />
                        <div style={{ flex: 1 }}>
                          <strong style={{ fontSize: 14 }}>{course.name}</strong>
                          <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>{course.category}</span>
                        </div>
                        <strong style={{ fontSize: 14, color: '#185FA5' }}>{calc.amount.toLocaleString()}원</strong>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{
                padding: 12, background: '#FFF8E1', border: '1px solid #FFE082',
                borderRadius: 6, marginBottom: 16, fontSize: 14,
              }}>
                <strong>총 결제 금액: <span style={{ color: '#185FA5', fontSize: 18 }}>{totalAmount.toLocaleString()}원</span></strong>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>결제 방법</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['cash', 'card', 'transfer', 'zeropay'] as PaymentMethod[]).map(m => (
                    <button key={m} onClick={() => setBulkPayMethod(m)} style={{
                      flex: 1, padding: '10px',
                      background: bulkPayMethod === m ? '#185FA5' : 'white',
                      color: bulkPayMethod === m ? 'white' : '#666',
                      border: '1px solid ' + (bulkPayMethod === m ? '#185FA5' : '#ddd'),
                      borderRadius: 6, cursor: 'pointer', fontSize: 13,
                    }}>{PAYMENT_METHOD_LABELS[m]}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>결제일</label>
                  <input type="date" value={bulkPayDate} onChange={(e) => setBulkPayDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>영수증 번호 (선택)</label>
                  <input value={bulkReceiptNum} onChange={(e) => setBulkReceiptNum(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleBulkSave} style={{
                  flex: 1, padding: '12px',
                  background: '#1D9E75', color: 'white',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontSize: 14, fontWeight: 500,
                }}>✓ {bulkEnrollments.size}개 강좌 결제 완료</button>
                <button onClick={() => setBulkPayModalOpen(false)} style={secondaryBtnStyle}>취소</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 20px',
      background: 'transparent',
      color: active ? '#185FA5' : '#888',
      border: 'none',
      borderBottom: active ? '2px solid #185FA5' : '2px solid transparent',
      marginBottom: -2,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: active ? 500 : 'normal',
    }}>{label}</button>
  );
}

function SummaryBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: '#fafafa', borderRadius: 8, padding: '12px 14px',
    }}>
      <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 500, margin: '4px 0 0', color }}>{value}</p>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box',
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', background: '#185FA5', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '12px 16px', background: 'white', color: '#666',
  border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const dangerBtnStyle: React.CSSProperties = {
  padding: '12px 16px', background: 'white', color: '#A32D2D',
  border: '1px solid #A32D2D', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: 'white', border: '1px solid #ddd',
  borderRadius: 4, cursor: 'pointer', fontSize: 12, marginRight: 4,
};
const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left',
  fontWeight: 500, color: '#666', fontSize: 12,
};
const tdStyle: React.CSSProperties = { padding: '10px 12px' };
const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px',
  background: color + '22', color: color,
  borderRadius: 4, fontSize: 11,
});
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 100, padding: 20,
};
const modalContentStyle: React.CSSProperties = {
  background: 'white', borderRadius: 12, padding: 24,
  maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto',
};
