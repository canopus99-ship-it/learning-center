'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  PAYMENT_METHOD_LABELS,
  END_REASON_LABELS,
  END_REASON_COLORS,
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

const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5', '성숙한시민': '#7B3FBF', '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517', '기타': '#666',
};

export default function PaymentsClient({ staffName }: { staffName: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // 필터
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedCourseId, setSelectedCourseId] = useState<number | 'all'>('all');
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);

  // 결제 모달
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<{
    enrollment: Enrollment;
    course: Course;
    existing: Payment | null;
  } | null>(null);

  // 결제 입력값
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptNum, setReceiptNum] = useState('');
  const [payMemo, setPayMemo] = useState('');

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
      supabase
        .from('payments')
        .select('*')
        .eq('payment_year', selectedYear),
    ]);

    setCourses(coursesRes.data || []);
    setEnrollments((enrollmentsRes.data as Enrollment[]) || []);
    setPayments(paymentsRes.data || []);
    setLoading(false);
  }

  // 강좌별 그룹 + 회원별 결제 상태 표시
  const filteredCourses = selectedCourseId === 'all'
    ? courses
    : courses.filter(c => c.id === selectedCourseId);

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

  function openPaymentModal(enrollment: Enrollment, course: Course) {
    const existing = getPayment(enrollment.id, selectedMonth);

    // 회원 + 강좌 정보로 자동 계산
    const member = enrollment.members;
    if (!member) return;

    const calc = calculateFee(
      course.fee_jung_gu,
      course.fee_other,
      member.is_jung_gu,
      member.is_discount_50,
      member.is_discount_100,
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
      course.fee_jung_gu,
      course.fee_other,
      member.is_jung_gu,
      member.is_discount_50,
      member.is_discount_100,
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

    if (error) {
      alert('저장 실패: ' + error.message);
    } else {
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

  // 미납자 카운트
  function countUnpaid(courseId: number): number {
    const enrolls = getEnrollmentsByCourse(courseId);
    const operationMonths = parseOperationMonths(courses.find(c => c.id === courseId)?.operation_months || null);

    if (!operationMonths.includes(selectedMonth)) return 0;

    return enrolls.filter(e => {
      const p = getPayment(e.id, selectedMonth);
      // 환불 회원은 환불일 이후엔 미납 계산 안 함
      if (e.refund_date) {
        const monthEnd = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];
        if (e.refund_date < monthEnd) return false;
      }
      return !p || !p.is_paid;
    }).length;
  }

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <div style={{ maxWidth: 1200, margin: '40px auto', padding: 20 }}>
      <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20 }}>💰 수납 관리</h1>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setSelectedYear(selectedYear - 1)}
            style={smallBtnStyle}
          >◀</button>
          <strong style={{ fontSize: 18, minWidth: 70, textAlign: 'center' }}>{selectedYear}년</strong>
          <button
            onClick={() => setSelectedYear(selectedYear + 1)}
            style={smallBtnStyle}
          >▶</button>
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {months.map(m => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              style={{
                padding: '8px 14px',
                background: selectedMonth === m ? '#185FA5' : 'white',
                color: selectedMonth === m ? 'white' : '#666',
                border: '1px solid ' + (selectedMonth === m ? '#185FA5' : '#ddd'),
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: selectedMonth === m ? 500 : 'normal',
              }}
            >{m}월</button>
          ))}
        </div>
      </div>

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
          <input
            type="checkbox"
            checked={showUnpaidOnly}
            onChange={(e) => setShowUnpaidOnly(e.target.checked)}
          />
          미납자만 보기
        </label>
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>불러오는 중...</p>
      ) : filteredCourses.length === 0 ? (
        <p style={{ color: '#888' }}>운영 중인 강좌가 없습니다.</p>
      ) : (
        filteredCourses.map(course => {
          const courseEnrollments = getEnrollmentsByCourse(course.id);
          const operationMonths = parseOperationMonths(course.operation_months);
          const isOperating = operationMonths.includes(selectedMonth);
          const unpaidCount = countUnpaid(course.id);

          // 미납자만 보기 필터
          const displayEnrollments = showUnpaidOnly
            ? courseEnrollments.filter(e => {
                if (!isOperating) return false;
                const p = getPayment(e.id, selectedMonth);
                if (e.refund_date) {
                  const monthEnd = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];
                  if (e.refund_date < monthEnd) return false;
                }
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
                  {!isOperating && (
                    <span style={{ ...badgeStyle('#888'), background: '#eee' }}>
                      {selectedMonth}월 미운영
                    </span>
                  )}
                  {isOperating && unpaidCount > 0 && (
                    <span style={{ ...badgeStyle('#A32D2D'), background: '#FCEBEB' }}>
                      미납 {unpaidCount}명
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  정원 {course.capacity}명 · 현재 {courseEnrollments.length}명
                  {!course.is_free && (
                    <span style={{ marginLeft: 8 }}>
                      ({course.fee_jung_gu.toLocaleString()}/{course.fee_other.toLocaleString()})
                    </span>
                  )}
                </div>
              </div>

              {!isOperating ? (
                <p style={{ fontSize: 13, color: '#888', margin: 0, fontStyle: 'italic' }}>
                  {selectedMonth}월에는 운영하지 않는 강좌입니다.
                </p>
              ) : displayEnrollments.length === 0 ? (
                <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
                  {showUnpaidOnly ? '미납자가 없습니다.' : '수강생이 없습니다.'}
                </p>
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

                      // 환불 회원
                      const isRefunded = !!e.refund_date;
                      const monthEnd = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];
                      const refundedBeforeMonth = isRefunded && e.refund_date! < monthEnd;

                      if (refundedBeforeMonth) {
                        return (
                          <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: 0.5 }}>
                            <td style={tdStyle}>
                              <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                                {member.name}
                              </Link>
                            </td>
                            <td colSpan={7} style={{ ...tdStyle, color: '#A32D2D', fontSize: 12 }}>
                              ({e.refund_date} 환불 처리)
                            </td>
                          </tr>
                        );
                      }

                      const calc = calculateFee(
                        course.fee_jung_gu, course.fee_other,
                        member.is_jung_gu, member.is_discount_50, member.is_discount_100,
                        course.is_free
                      );

                      const isAutoComplete = calc.amount === 0;

                      return (
                        <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={tdStyle}>
                            <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                              <strong>{member.name}</strong>
                            </Link>
                            {e.status === 'paused' && (
                              <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 5px', background: '#7B3FBF', color: 'white', borderRadius: 3 }}>
                                일시중지
                              </span>
                            )}
                          </td>
                          <td style={tdStyle}>{member.region_type || '-'}</td>
                          <td style={tdStyle}>
                            {member.is_discount_100 ? (
                              <span style={badgeStyle('#A32D2D')}>100%</span>
                            ) : member.is_discount_50 ? (
                              <span style={badgeStyle('#BA7517')}>50%</span>
                            ) : '-'}
                          </td>
                          <td style={tdStyle}>
                            {p?.is_paid ? (
                              <span style={badgeStyle('#1D9E75')}>✓ 완료</span>
                            ) : isAutoComplete ? (
                              <span style={badgeStyle('#1D9E75')}>자동완료</span>
                            ) : (
                              <span style={badgeStyle('#A32D2D')}>미납</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {p ? p.amount.toLocaleString() : calc.amount.toLocaleString()}원
                          </td>
                          <td style={tdStyle}>
                            {p?.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] : '-'}
                          </td>
                          <td style={tdStyle}>{p?.paid_at || '-'}</td>
                          <td style={tdStyle}>
                            <button
                              onClick={() => openPaymentModal(e, course)}
                              style={smallBtnStyle}
                            >
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
        })
      )}

      {/* 결제 처리 모달 */}
      {paymentModalOpen && editingPayment && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: 20,
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 24,
            maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>결제 처리</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
              <strong>{editingPayment.enrollment.members?.name}</strong> · {editingPayment.course.name} · {selectedYear}년 {selectedMonth}월
            </p>

            {/* 자동 계산 안내 */}
            {(() => {
              const member = editingPayment.enrollment.members!;
              const calc = calculateFee(
                editingPayment.course.fee_jung_gu, editingPayment.course.fee_other,
                member.is_jung_gu, member.is_discount_50, member.is_discount_100,
                editingPayment.course.is_free
              );
              return (
                <div style={{
                  background: '#E6F1FB', border: '1px solid #B5D4F4',
                  padding: 12, borderRadius: 6, fontSize: 12, color: '#042C53', marginBottom: 16,
                }}>
                  💡 자동 계산: {calc.description}
                </div>
              );
            })()}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>결제 금액 (원)</label>
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9]/g, ''))}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>결제 방법</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['cash', 'card', 'transfer', 'zeropay'] as PaymentMethod[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setPayMethod(m)}
                    style={{
                      flex: 1, padding: '10px',
                      background: payMethod === m ? '#185FA5' : 'white',
                      color: payMethod === m ? 'white' : '#666',
                      border: '1px solid ' + (payMethod === m ? '#185FA5' : '#ddd'),
                      borderRadius: 6, cursor: 'pointer', fontSize: 13,
                    }}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
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
                <input value={receiptNum} onChange={(e) => setReceiptNum(e.target.value)} style={inputStyle} placeholder="20260514-001" />
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
              <button onClick={() => handleSavePayment(false)} style={{
                padding: '12px 16px',
                background: 'white', color: '#666',
                border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer',
                fontSize: 13,
              }}>미납 처리</button>
              {editingPayment.existing && (
                <button onClick={handleDeletePayment} style={{
                  padding: '12px 16px',
                  background: 'white', color: '#A32D2D',
                  border: '1px solid #A32D2D', borderRadius: 6, cursor: 'pointer',
                  fontSize: 13,
                }}>기록 삭제</button>
              )}
              <button onClick={() => setPaymentModalOpen(false)} style={{
                padding: '12px 16px',
                background: 'white', color: '#666',
                border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer',
                fontSize: 13,
              }}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box',
};
const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: 'white', border: '1px solid #ddd',
  borderRadius: 4, cursor: 'pointer', fontSize: 12,
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
