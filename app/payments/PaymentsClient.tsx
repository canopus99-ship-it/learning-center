'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  PAYMENT_METHOD_LABELS,
  calculateFee,
  calculateAnnualFee,
  isAnnualAvailable,
  parseOperationMonths,
  isEndedAtMonth,
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
  end_date: string | null;
  end_from_year: number | null;
  end_from_month: number | null;
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

// 셀 키 = "courseId-month"
type CellKey = string;
function cellKey(courseId: number, month: number): CellKey {
  return `${courseId}-${month}`;
}

export default function PaymentsClient({ staffName }: { staffName: string }) {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>('by-member');

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // 강좌별 보기 필터
  const [selectedCourseId, setSelectedCourseId] = useState<number | 'all'>('all');
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);

  // 회원별 보기
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<MemberSearchResult[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);
  const [memberSearching, setMemberSearching] = useState(false);

  // 다중 선택 (회원별 보기에서 강좌×월 조합)
  const [selectedCells, setSelectedCells] = useState<Set<CellKey>>(new Set());
  const [selectedAnnualCourses, setSelectedAnnualCourses] = useState<Set<number>>(new Set());

  // 일괄 결제 모달
  const [bulkPayModalOpen, setBulkPayModalOpen] = useState(false);
  const [bulkPayMethod, setBulkPayMethod] = useState<PaymentMethod>('cash');
  const [bulkPayDate, setBulkPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkReceiptNum, setBulkReceiptNum] = useState('');
  // 셀별로 수정 가능한 금액
  const [cellAmounts, setCellAmounts] = useState<Record<string, number>>({});

  // 개별 결제 모달 (강좌별 보기에서 사용)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<{
    enrollment: Enrollment;
    course: Course;
    existing: Payment | null;
    month: number;
  } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptNum, setReceiptNum] = useState('');
  const [payMemo, setPayMemo] = useState('');

  // 종료/환불/이월 모달
  const [endScheduleModalOpen, setEndScheduleModalOpen] = useState(false);
  const [endingEnrollment, setEndingEnrollment] = useState<Enrollment | null>(null);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [endReason, setEndReason] = useState<EndReason>('unregistered');
  const [endMemo, setEndMemo] = useState('');

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
        .in('status', ['active', 'paused', 'ended']),
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
      .filter(e => e.course_id === courseId && e.status !== 'ended')
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
    setSelectedCells(new Set());
    setSelectedAnnualCourses(new Set());
  }

  // 셀 토글 (회원별 보기에서 강좌-월 클릭)
  function toggleCell(courseId: number, month: number) {
    const key = cellKey(courseId, month);
    setSelectedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 연납 토글
  function toggleAnnual(courseId: number) {
    setSelectedAnnualCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
        // 연납 해제 시 그 강좌의 모든 셀 선택 해제
        const newCells = new Set(selectedCells);
        for (let m = 1; m <= 12; m++) {
          newCells.delete(cellKey(courseId, m));
        }
        setSelectedCells(newCells);
      } else {
        next.add(courseId);
        // 연납 선택 시 그 강좌의 2~12월 자동 선택 (1월은 OT라 제외)
        const newCells = new Set(selectedCells);
        for (let m = 2; m <= 12; m++) {
          newCells.add(cellKey(courseId, m));
        }
        setSelectedCells(newCells);
      }
      return next;
    });
  }

  // 선택된 셀의 금액 계산
  function calculateSelectionTotal(): { items: Array<{ courseId: number; courseName: string; month: number; amount: number; isAnnual: boolean }>, total: number } {
    if (!selectedMember) return { items: [], total: 0 };

    const items: Array<{ courseId: number; courseName: string; month: number; amount: number; isAnnual: boolean }> = [];
    const processedCells = new Set<CellKey>();

    // 1. 먼저 연납 처리
    selectedAnnualCourses.forEach(courseId => {
      const course = courses.find(c => c.id === courseId);
      if (!course) return;
      const calc = calculateFee(
        course.fee_jung_gu, course.fee_other,
        selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100,
        course.is_free
      );
      const annualAmount = calculateAnnualFee(calc.amount);

      // 연납에 포함된 월들을 processedCells에 추가
      for (let m = 2; m <= 12; m++) {
        processedCells.add(cellKey(courseId, m));
      }

      items.push({
        courseId,
        courseName: course.name,
        month: 0, // 0은 연납을 의미
        amount: annualAmount,
        isAnnual: true,
      });
    });

    // 2. 나머지 셀들
    selectedCells.forEach(key => {
      if (processedCells.has(key)) return; // 연납에 포함된 셀은 제외

      const [courseIdStr, monthStr] = key.split('-');
      const courseId = parseInt(courseIdStr, 10);
      const month = parseInt(monthStr, 10);
      const course = courses.find(c => c.id === courseId);
      if (!course) return;

      const calc = calculateFee(
        course.fee_jung_gu, course.fee_other,
        selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100,
        course.is_free
      );

      items.push({
        courseId,
        courseName: course.name,
        month,
        amount: calc.amount,
        isAnnual: false,
      });
    });

    const total = items.reduce((sum, item) => sum + item.amount, 0);
    return { items, total };
  }

  // 일괄 결제 모달 열기
  function openBulkPayModal() {
    if (!selectedMember) return;
    const { items } = calculateSelectionTotal();
    if (items.length === 0) {
      alert('결제할 항목을 선택하세요');
      return;
    }

    // 셀별 금액 초기화 (자동 계산값으로)
    const initialAmounts: Record<string, number> = {};
    items.forEach(item => {
      const key = item.isAnnual ? `annual-${item.courseId}` : `${item.courseId}-${item.month}`;
      initialAmounts[key] = item.amount;
    });
    setCellAmounts(initialAmounts);

    setBulkPayMethod('cash');
    setBulkPayDate(new Date().toISOString().split('T')[0]);
    setBulkReceiptNum('');
    setBulkPayModalOpen(true);
  }

  // 일괄 결제 저장
  async function handleBulkSave() {
    if (!selectedMember) return;
    const { items } = calculateSelectionTotal();
    if (items.length === 0) return;

    let hasError = false;
    let successCount = 0;

    for (const item of items) {
      const course = courses.find(c => c.id === item.courseId);
      if (!course) continue;

      const enrollment = enrollments.find(e =>
        e.member_id === selectedMember.id && e.course_id === item.courseId
      );
      if (!enrollment) continue;

      const calc = calculateFee(
        course.fee_jung_gu, course.fee_other,
        selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100,
        course.is_free
      );

      if (item.isAnnual) {
        // 연납: 2~12월 각각 결제 기록 생성 (1월 OT 제외)
        const totalAmount = cellAmounts[`annual-${item.courseId}`] ?? item.amount;
        const perMonthAmount = Math.floor(totalAmount / 10);

        for (let m = 2; m <= 12; m++) {
          const existing = getPayment(enrollment.id, m);
          const data = {
            enrollment_id: enrollment.id,
            payment_year: selectedYear,
            payment_month: m,
            amount: perMonthAmount,
            is_paid: true,
            paid_at: bulkPayDate,
            payment_method: bulkPayMethod,
            receipt_number: bulkReceiptNum || null,
            is_annual: true,
            is_free: course.is_free || calc.discountType === 'discount_100',
            discount_type: calc.discountType,
            updated_at: new Date().toISOString(),
          };

          let result;
          if (existing) {
            result = await supabase.from('payments').update(data).eq('id', existing.id);
          } else {
            result = await supabase.from('payments').insert([data]);
          }

          if (result.error) {
            hasError = true;
            console.error('연납 처리 실패:', result.error);
          }
        }
        successCount++;
      } else {
        // 개별 월 결제
        const existing = getPayment(enrollment.id, item.month);
        const cellAmount = cellAmounts[`${item.courseId}-${item.month}`] ?? item.amount;

        const data = {
          enrollment_id: enrollment.id,
          payment_year: selectedYear,
          payment_month: item.month,
          amount: cellAmount,
          is_paid: true,
          paid_at: bulkPayDate,
          payment_method: bulkPayMethod,
          receipt_number: bulkReceiptNum || null,
          is_annual: false,
          is_free: course.is_free || calc.discountType === 'discount_100' || cellAmount === 0,
          discount_type: calc.discountType,
          updated_at: new Date().toISOString(),
        };

        let result;
        if (existing) {
          result = await supabase.from('payments').update(data).eq('id', existing.id);
        } else {
          result = await supabase.from('payments').insert([data]);
        }

        if (result.error) {
          hasError = true;
          console.error('결제 처리 실패:', result.error);
        } else {
          successCount++;
        }
      }
    }

    if (hasError) {
      alert('일부 결제 처리에 실패했습니다.');
    } else {
      alert(`${selectedMember.name}님의 결제가 완료되었습니다.`);
    }

    setBulkPayModalOpen(false);
    setSelectedCells(new Set());
    setSelectedAnnualCourses(new Set());
    loadData();
  }

  // 개별 결제 모달 (강좌별 보기에서)
  function openPaymentModal(enrollment: Enrollment, course: Course, month: number = selectedMonth) {
    const existing = getPayment(enrollment.id, month);
    const member = enrollment.members;
    if (!member) return;

    const calc = calculateFee(
      course.fee_jung_gu, course.fee_other,
      member.is_jung_gu, member.is_discount_50, member.is_discount_100,
      course.is_free
    );

    setEditingPayment({ enrollment, course, existing, month });
    setPayAmount(existing?.amount?.toString() || calc.amount.toString());
    setPayMethod(existing?.payment_method || 'cash');
    setPayDate(existing?.paid_at || new Date().toISOString().split('T')[0]);
    setReceiptNum(existing?.receipt_number || '');
    setPayMemo(existing?.memo || '');
    setPaymentModalOpen(true);
  }

  async function handleSavePayment(markPaid: boolean) {
    if (!editingPayment) return;
    const { enrollment, course, existing, month } = editingPayment;
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
      payment_month: month,
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

    let result;
    if (existing) {
      result = await supabase.from('payments').update(data).eq('id', existing.id);
    } else {
      result = await supabase.from('payments').insert([data]);
    }

    if (result.error) alert('저장 실패: ' + result.error.message);
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

  // 종료 예약 모달
  function openEndScheduleModal(enrollment: Enrollment) {
    setEndingEnrollment(enrollment);
    setEndDate(new Date().toISOString().split('T')[0]);
    setEndReason('unregistered');
    setEndMemo('');
    setEndScheduleModalOpen(true);
  }

  async function handleEndSchedule() {
    if (!endingEnrollment) return;
    if (!endDate) {
      alert('\ucc98\ub9ac\uc77c\uc744 \uc785\ub825\ud558\uc138\uc694');
      return;
    }
    const memberName = endingEnrollment.members?.name || '\ud68c\uc6d0';
    const courseName = courses.find(c => c.id === endingEnrollment.course_id)?.name || '\uac15\uc88c';

    const endYear = parseInt(endDate.substring(0, 4), 10);
    const endMonth = parseInt(endDate.substring(5, 7), 10);

    const updates: any = {
      end_date: endDate,
      end_from_year: endYear,
      end_from_month: endMonth,
      end_reason: endReason,
    };

    if (endReason === 'refund') {
      updates.refund_date = endDate;
      updates.refund_memo = endMemo.trim() || null;
    } else {
      updates.refund_date = null;
      updates.refund_memo = endMemo.trim() || null;
    }

    const { error } = await supabase.from('enrollments').update(updates).eq('id', endingEnrollment.id);

    if (error) {
      alert('\ucc98\ub9ac \uc2e4\ud328: ' + error.message);
    } else {
      const reasonLabel = endReason === 'refund' ? '\ud658\ubd88' : endReason === 'unregistered' ? '\ubbf8\ub4f1\ub85d(\uc885\ub8cc)' : '\uae30\ud0c0';
      alert(memberName + '\ub2d8 / ' + courseName + '\\n' + endDate + '\uc790\ub85c ' + reasonLabel + ' \ucc98\ub9ac\ub418\uc5c8\uc2b5\ub2c8\ub2e4.\\n\uc774 \ub0a0\uc9dc \uc774\ud6c4 \ucd9c\uc11d\uccb4\ud06c\uac00 \ucc28\ub2e8\ub429\ub2c8\ub2e4.');
      setEndScheduleModalOpen(false);
      setEndingEnrollment(null);
      loadData();
    }
  }


  // 종료 예약 취소
  async function cancelEndSchedule(enrollment: Enrollment) {
    if (!confirm('\uc218\ub0a9/\ud658\ubd88/\uc774\uc6d4 \ucc98\ub9ac\ub97c \ucde8\uc18c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?')) return;
    const { error } = await supabase.from('enrollments').update({
      end_date: null,
      end_from_year: null,
      end_from_month: null,
      end_reason: null,
      refund_date: null,
      refund_memo: null,
    }).eq('id', enrollment.id);

    if (error) alert('취소 실패: ' + error.message);
    else loadData();
  }

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;

  // 셀이 "과거 또는 현재월"인지 (미납 판정용)
  function isPastOrCurrent(month: number): boolean {
    if (selectedYear < todayYear) return true;
    if (selectedYear > todayYear) return false;
    return month <= todayMonth;
  }

  // 미납자 목록 (전체 강좌)
  const allUnpaid = (() => {
    const result: { course: Course; enrollment: Enrollment; waitingCount: number; unpaidMonths: number[] }[] = [];
    courses.forEach(course => {
      if (course.is_free) return;
      const operationMonths = parseOperationMonths(course.operation_months);
      const courseEnrollments = enrollments.filter(e => e.course_id === course.id && e.status !== 'ended');
      const waitingCount = enrollments.filter(e => e.course_id === course.id && e.status === 'waiting').length;

      courseEnrollments.forEach(e => {
        if (!e.members) return;
        const unpaidMonths: number[] = [];
        for (let m = 1; m <= todayMonth; m++) {
          if (m === 1) continue; // 1월 OT 제외
          if (!operationMonths.includes(m)) continue;
          if (isEndedAtMonth(e, selectedYear, m)) continue;
          const calc = calculateFee(course.fee_jung_gu, course.fee_other, e.members.is_jung_gu, e.members.is_discount_50, e.members.is_discount_100, course.is_free);
          if (calc.amount === 0) continue;
          const p = getPayment(e.id, m);
          if (!p || !p.is_paid) unpaidMonths.push(m);
        }
        if (unpaidMonths.length > 0) {
          result.push({ course, enrollment: e, waitingCount, unpaidMonths });
        }
      });
    });
    return result;
  })();

  const { items: selectionItems, total: selectionTotal } = calculateSelectionTotal();

  return (
    <div style={{ maxWidth: 1400, margin: '40px auto', padding: 20 }}>
      <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20 }}>💰 수납 관리</h1>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #eee' }}>
        <TabButton active={activeTab === 'by-member'} onClick={() => setActiveTab('by-member')} label="👤 회원별 보기" />
        <TabButton active={activeTab === 'by-course'} onClick={() => setActiveTab('by-course')} label="🎯 강좌별 보기" />
        <TabButton active={activeTab === 'unpaid'} onClick={() => setActiveTab('unpaid')} label={`⚠️ 미납자 점검${allUnpaid.length > 0 ? ` (${allUnpaid.length})` : ''}`} />
      </div>

      {/* 연도 선택 (모든 탭 공통) */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setSelectedYear(selectedYear - 1)} style={smallBtnStyle}>◀</button>
          <strong style={{ fontSize: 18, minWidth: 70, textAlign: 'center' }}>{selectedYear}년</strong>
          <button onClick={() => setSelectedYear(selectedYear + 1)} style={smallBtnStyle}>▶</button>
        </div>

        {activeTab !== 'by-member' && (
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
        )}
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>불러오는 중...</p>
      ) : (
        <>
          {/* ============================================ */}
          {/* 탭 1: 회원별 보기 (메인)                       */}
          {/* ============================================ */}
          {activeTab === 'by-member' && (
            <>
              {/* 회원 검색 */}
              {!selectedMember && (
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
                        <div key={m.id} onClick={() => selectMember(m)} style={{
                          padding: 10, background: '#f9f9f9', borderRadius: 6,
                          border: '1px solid #eee', cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
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
              )}

              {/* 선택된 회원의 연간 수납 현황 */}
              {selectedMember && (() => {
                const memberEnrollments = getEnrollmentsByMember(selectedMember.id);

                return (
                  <div>
                    {/* 회원 정보 헤더 */}
                    <div style={{ background: 'white', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
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
                        <button onClick={() => { setSelectedMember(null); setSelectedCells(new Set()); setSelectedAnnualCourses(new Set()); }} style={smallBtnStyle}>다른 회원 검색</button>
                      </div>
                    </div>

                    {/* 강좌별 12개월 그리드 */}
                    {memberEnrollments.length === 0 ? (
                      <div style={{ background: 'white', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888' }}>
                        <p>신청한 강좌가 없습니다.</p>
                      </div>
                    ) : (
                      <>
                        <div style={{
                          padding: 10, marginBottom: 12,
                          background: '#E6F1FB', border: '1px solid #B5D4F4',
                          borderRadius: 6, fontSize: 12, color: '#042C53',
                        }}>
                          💡 <strong>사용 방법</strong>:
                          미납/미등록 셀(빨강·흰색)은 <strong>클릭하여 선택</strong>한 뒤 일괄 결제하세요.
                          이미 등록된 셀(초록)을 <strong>클릭하면 결제 정보 수정/취소</strong> 모달이 열립니다.
                        </div>
                        {memberEnrollments.map(enrollment => {
                          const course = courses.find(c => c.id === enrollment.course_id);
                          if (!course) return null;

                          const operationMonths = parseOperationMonths(course.operation_months);
                          const calc = calculateFee(
                            course.fee_jung_gu, course.fee_other,
                            selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100,
                            course.is_free
                          );
                          const canAnnual = isAnnualAvailable(course.operation_months) && calc.amount > 0;
                          const isAnnualChecked = selectedAnnualCourses.has(course.id);
                          const annualAmount = calculateAnnualFee(calc.amount);

                          // 종료 예약 정보
                          const hasEndSchedule = !!((enrollment as any).end_date) || !!(enrollment.end_from_year && enrollment.end_from_month);

                          return (
                            <div key={enrollment.id} style={{
                              background: 'white', borderRadius: 12, padding: 16, marginBottom: 12,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <Link href={`/courses/${course.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                                    <strong style={{ fontSize: 15 }}>{course.name}</strong>
                                  </Link>
                                  <span style={badgeStyle(CATEGORY_COLORS[course.category] || '#666')}>{course.category}</span>
                                  {course.is_free && <span style={badgeStyle('#1D9E75')}>무료</span>}
                                  <span style={{ fontSize: 12, color: '#888' }}>
                                    월 <strong>{calc.amount.toLocaleString()}원</strong>
                                  </span>
                                  {hasEndSchedule && (
                                    <span style={{ ...badgeStyle('#7B3FBF'), fontSize: 11 }}>
                                      \ud83d\udcc5 {(enrollment as any).end_date || (enrollment.end_from_year + '.' + enrollment.end_from_month)} {enrollment.end_reason === 'refund' ? '\ud658\ubd88' : enrollment.end_reason === 'unregistered' ? '\uc885\ub8cc' : '\uc774\uc6d4/\uae30\ud0c0'}
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  {hasEndSchedule ? (
                                    <button onClick={() => cancelEndSchedule(enrollment)} style={smallBtnStyle}>
                                      \ucc98\ub9ac \ucde8\uc18c
                                    </button>
                                  ) : (
                                    <button onClick={() => openEndScheduleModal(enrollment)} style={smallBtnStyle}>
                                      \uc218\ub0a9 / \ud658\ubd88 / \uc774\uc6d4
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* 12개월 + 연납 그리드 */}
                              <div style={{ display: 'flex', gap: 2, overflowX: 'auto', paddingBottom: 4 }}>
                                {months.map(month => {
                                  const isOperating = operationMonths.includes(month);
                                  const isOTMonth = month === 1; // 1월은 OT
                                  const isEnded = isEndedAtMonth(enrollment, selectedYear, month);
                                  const payment = getPayment(enrollment.id, month);
                                  const isPaid = payment?.is_paid || false;
                                  const pastOrCurrent = isPastOrCurrent(month);
                                  const isSelected = selectedCells.has(cellKey(course.id, month));
                                  const isAnnualHere = isAnnualChecked && month >= 2;

                                  // 상태 결정
                                  let label = '';
                                  let bgColor = '#fafafa';
                                  let textColor = '#666';
                                  let canSelect = true;

                                  if (!isOperating) {
                                    label = '-';
                                    bgColor = '#f0f0f0';
                                    textColor = '#bbb';
                                    canSelect = false;
                                  } else if (isEnded) {
                                    label = '수강종료';
                                    bgColor = '#3F3F3F';
                                    textColor = 'white';
                                    canSelect = false;
                                  } else if (isPaid) {
                                    label = isOTMonth ? '등록 (OT)' : '등록';
                                    bgColor = '#1D9E75';
                                    textColor = 'white';
                                    canSelect = true; // 수정도 가능
                                  } else if (calc.amount === 0 && pastOrCurrent) {
                                    // 무료/100%감면이면 자동 등록
                                    label = '등록';
                                    bgColor = '#1D9E75';
                                    textColor = 'white';
                                  } else if (pastOrCurrent && !isOTMonth) {
                                    label = '미납';
                                    bgColor = '#A32D2D';
                                    textColor = 'white';
                                  } else {
                                    label = isOTMonth ? '미등록 (OT)' : '미등록';
                                    bgColor = '#fafafa';
                                    textColor = '#888';
                                  }

                                  const selectedStyle = isSelected ? {
                                    boxShadow: '0 0 0 3px #185FA5',
                                  } : {};

                                  return (
                                    <div
                                      key={month}
                                      onClick={() => {
                                        if (!canSelect || isAnnualHere) return;
                                        // 이미 결제 완료된 셀: 결제 모달로 열어서 수정/삭제 가능
                                        if (payment?.is_paid) {
                                          openPaymentModal(enrollment, course, month);
                                        } else {
                                          // 미납/미등록 셀: 선택 토글 (다중 선택 가능)
                                          toggleCell(course.id, month);
                                        }
                                      }}
                                      style={{
                                        flex: '1 0 80px',
                                        minWidth: 70,
                                        padding: 8,
                                        background: isAnnualHere ? '#185FA5' : bgColor,
                                        color: isAnnualHere ? 'white' : textColor,
                                        borderRadius: 6,
                                        textAlign: 'center',
                                        cursor: (canSelect && !isAnnualHere) ? 'pointer' : 'default',
                                        opacity: isAnnualHere ? 0.7 : 1,
                                        ...selectedStyle,
                                      }}
                                    >
                                      <div style={{ fontSize: 11, fontWeight: 500 }}>{month}월</div>
                                      <div style={{ fontSize: 10, marginTop: 2 }}>
                                        {isAnnualHere ? '연납' : label}
                                      </div>
                                      {payment?.is_paid && payment.amount > 0 && (
                                        <div style={{ fontSize: 9, marginTop: 2, opacity: 0.9 }}>
                                          {payment.amount.toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                {/* 연납 셀 */}
                                <div
                                  onClick={() => canAnnual && toggleAnnual(course.id)}
                                  style={{
                                    flex: '1 0 100px',
                                    minWidth: 90,
                                    padding: 8,
                                    background: !canAnnual ? '#f0f0f0' : (isAnnualChecked ? '#185FA5' : 'white'),
                                    color: !canAnnual ? '#bbb' : (isAnnualChecked ? 'white' : '#185FA5'),
                                    border: '2px solid ' + (!canAnnual ? '#ddd' : '#185FA5'),
                                    borderRadius: 6,
                                    textAlign: 'center',
                                    cursor: canAnnual ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  <div style={{ fontSize: 11, fontWeight: 500 }}>💳 연납</div>
                                  <div style={{ fontSize: 10, marginTop: 2 }}>
                                    {canAnnual ? `${annualAmount.toLocaleString()}` : '불가'}
                                  </div>
                                  {canAnnual && (
                                    <div style={{ fontSize: 9, marginTop: 2, opacity: 0.8 }}>
                                      ({calc.amount.toLocaleString()}×10개월)
                                    </div>
                                  )}
                                </div>
                              </div>

                              {!canAnnual && operationMonths.length < 12 && calc.amount > 0 && (
                                <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                                  ℹ️ 연납은 1~12월 전체 운영 강좌만 가능합니다.
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {/* 선택 요약 + 결제 버튼 */}
                        {(selectedCells.size > 0 || selectedAnnualCourses.size > 0) && (
                          <div style={{
                            position: 'sticky', bottom: 16, zIndex: 10,
                            background: 'white', borderRadius: 12, padding: 16,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                            border: '2px solid #185FA5',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                              <div>
                                <strong style={{ fontSize: 14 }}>선택한 항목: {selectionItems.length}건</strong>
                                <span style={{ marginLeft: 16, fontSize: 18, fontWeight: 500, color: '#185FA5' }}>
                                  총 {selectionTotal.toLocaleString()}원
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { setSelectedCells(new Set()); setSelectedAnnualCourses(new Set()); }} style={secondaryBtnStyle}>선택 해제</button>
                                <button onClick={openBulkPayModal} style={{
                                  padding: '12px 24px',
                                  background: '#1D9E75', color: 'white',
                                  border: 'none', borderRadius: 6, cursor: 'pointer',
                                  fontSize: 14, fontWeight: 500,
                                }}>💰 일괄 결제 처리</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {!selectedMember && memberSearchResults.length === 0 && !memberSearching && (
                <div style={{ background: 'white', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <p style={{ margin: 0 }}>회원을 검색해서 연간 수납 현황을 확인하세요.</p>
                  <p style={{ fontSize: 12, marginTop: 8 }}>1~12월 그리드에서 원하는 월을 클릭하여 결제 처리할 수 있습니다.</p>
                </div>
              )}
            </>
          )}

          {/* ============================================ */}
          {/* 탭 2: 강좌별 보기                              */}
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
                  if (isEndedAtMonth(e, selectedYear, selectedMonth)) return false;
                  if (selectedMonth === 1) return false; // 1월 OT 제외
                  const calc = calculateFee(course.fee_jung_gu, course.fee_other, e.members.is_jung_gu, e.members.is_discount_50, e.members.is_discount_100, course.is_free);
                  if (calc.amount === 0) return false;
                  const p = getPayment(e.id, selectedMonth);
                  return !p || !p.is_paid;
                }).length;

                const displayEnrollments = showUnpaidOnly
                  ? courseEnrollments.filter(e => {
                      if (!isOperating || !e.members) return false;
                      if (isEndedAtMonth(e, selectedYear, selectedMonth)) return false;
                      if (selectedMonth === 1) return false;
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
                      </div>
                    </div>

                    {!isOperating ? (
                      <p style={{ fontSize: 13, color: '#888', margin: 0, fontStyle: 'italic' }}>{selectedMonth}월에는 운영하지 않습니다.</p>
                    ) : displayEnrollments.length === 0 ? (
                      <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{showUnpaidOnly ? '미납자가 없습니다.' : '수강생이 없습니다.'}</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                            <th style={thStyle}>이름</th>
                            <th style={thStyle}>구분</th>
                            <th style={thStyle}>감면</th>
                            <th style={thStyle}>{selectedMonth}월 상태</th>
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
                            const isEnded = isEndedAtMonth(e, selectedYear, selectedMonth);

                            if (isEnded) {
                              return (
                                <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: 0.5 }}>
                                  <td style={tdStyle}>
                                    <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{member.name}</Link>
                                  </td>
                                  <td colSpan={7} style={{ ...tdStyle, color: '#3F3F3F', fontSize: 12 }}>
                                    수강종료
                                    {e.end_from_year && e.end_from_month && ` (${e.end_from_year}.${e.end_from_month}월부터)`}
                                    {e.refund_date && ` · 환불: ${e.refund_date}`}
                                  </td>
                                </tr>
                              );
                            }

                            const calc = calculateFee(course.fee_jung_gu, course.fee_other, member.is_jung_gu, member.is_discount_50, member.is_discount_100, course.is_free);
                            const isAutoComplete = calc.amount === 0;
                            const pastOrCurrent = isPastOrCurrent(selectedMonth);
                            const isOTMonth = selectedMonth === 1;

                            let statusLabel = '';
                            let statusColor = '#888';
                            if (p?.is_paid) {
                              statusLabel = '✓ 등록';
                              statusColor = '#1D9E75';
                            } else if (isAutoComplete && pastOrCurrent) {
                              statusLabel = '자동등록';
                              statusColor = '#1D9E75';
                            } else if (pastOrCurrent && !isOTMonth) {
                              statusLabel = '미납';
                              statusColor = '#A32D2D';
                            } else {
                              statusLabel = isOTMonth ? '미등록 (OT)' : '미등록';
                              statusColor = '#888';
                            }

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
                                <td style={tdStyle}><span style={badgeStyle(statusColor)}>{statusLabel}</span></td>
                                <td style={tdStyle}>{p ? p.amount.toLocaleString() : calc.amount.toLocaleString()}원</td>
                                <td style={tdStyle}>{p?.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] : '-'}</td>
                                <td style={tdStyle}>{p?.paid_at || '-'}</td>
                                <td style={tdStyle}>
                                  <button onClick={() => openPaymentModal(e, course, selectedMonth)} style={smallBtnStyle}>
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
          {/* 탭 3: 미납자 점검                              */}
          {/* ============================================ */}
          {activeTab === 'unpaid' && (
            <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>⚠️ 전체 미납자 ({allUnpaid.length}건)</h3>
                <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                  매월 15~24일 점검 시 활용하세요. 미납자 종료 처리 후 대기자에게 연락할 수 있습니다.
                </p>
              </div>

              {allUnpaid.length === 0 ? (
                <p style={{ color: '#888', fontSize: 13, padding: 20, textAlign: 'center' }}>미납자가 없습니다. 👍</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                      <th style={thStyle}>회원</th>
                      <th style={thStyle}>연락처</th>
                      <th style={thStyle}>강좌</th>
                      <th style={thStyle}>미납 월</th>
                      <th style={thStyle}>대기자</th>
                      <th style={thStyle}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUnpaid.map(({ course, enrollment, waitingCount, unpaidMonths }) => {
                      const member = enrollment.members;
                      if (!member) return null;

                      return (
                        <tr key={enrollment.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={tdStyle}>
                            <Link href={`/members/${enrollment.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                              <strong>{member.name}</strong>
                            </Link>
                          </td>
                          <td style={tdStyle}>{member.phone || '-'}</td>
                          <td style={tdStyle}>
                            <Link href={`/courses/${course.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{course.name}</Link>
                          </td>
                          <td style={tdStyle}>
                            <strong style={{ color: '#A32D2D' }}>
                              {unpaidMonths.map(m => `${m}월`).join(', ')}
                            </strong>
                          </td>
                          <td style={tdStyle}>
                            {waitingCount > 0 ? (
                              <span style={{ ...badgeStyle('#BA7517') }}>대기 {waitingCount}명</span>
                            ) : (<span style={{ color: '#888', fontSize: 12 }}>없음</span>)}
                          </td>
                          <td style={tdStyle}>
                            <button onClick={() => {
                              const result = memberSearchResults.length > 0 ? memberSearchResults[0] : null;
                              const fakeResult: MemberSearchResult = {
                                id: member.id, name: member.name, phone: member.phone,
                                region_type: member.region_type, is_jung_gu: member.is_jung_gu,
                                is_discount_50: member.is_discount_50, is_discount_100: member.is_discount_100,
                              };
                              selectMember(fakeResult);
                              setActiveTab('by-member');
                            }} style={smallBtnStyle}>회원별 보기</button>
                            <button onClick={() => openEndScheduleModal(enrollment)} style={smallBtnStyle}>\uc218\ub0a9/\ud658\ubd88/\uc774\uc6d4</button>
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
                  <li><strong>회원별 보기</strong>: 해당 회원의 연간 수납 현황을 보면서 결제 처리</li>
                  <li><strong>종료 예약</strong>: 특정 월부터 수강 종료로 처리 (그 월부터 미납자에서 제외)</li>
                  <li><strong>대기자가 있는 경우</strong>: 미납자 종료 후 대기자에게 연락하여 자리 채우기</li>
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================ */}
      {/* 개별 결제 모달 (강좌별 보기에서)               */}
      {/* ============================================ */}
      {paymentModalOpen && editingPayment && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>결제 처리</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
              <strong>{editingPayment.enrollment.members?.name}</strong> · {editingPayment.course.name} · {selectedYear}년 {editingPayment.month}월
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
              <label style={labelStyle}>결제 금액 (원) - 수기 수정 가능</label>
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
                <label style={labelStyle}>영수증 번호</label>
                <input value={receiptNum} onChange={(e) => setReceiptNum(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>메모</label>
              <input value={payMemo} onChange={(e) => setPayMemo(e.target.value)} style={inputStyle} placeholder="이월, 무료수강권 등" />
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
                <button onClick={handleDeletePayment} style={dangerBtnStyle}>🗑️ 결제 취소</button>
              )}
              <button onClick={() => setPaymentModalOpen(false)} style={secondaryBtnStyle}>취소</button>
            </div>

            {editingPayment.existing && (
              <div style={{
                marginTop: 12, padding: 10,
                background: '#FCEBEB', border: '1px solid #F09595',
                borderRadius: 6, fontSize: 11, color: '#742020',
              }}>
                💡 <strong>결제 취소</strong>는 잘못 처리한 결제를 정정할 때 사용합니다.
                결제 기록이 완전히 삭제되어 셀이 미납 또는 미등록 상태로 돌아갑니다.
                (환불과는 다른 기능입니다)
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* 일괄 결제 모달 (회원별 보기에서)               */}
      {/* ============================================ */}
      {bulkPayModalOpen && selectedMember && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle, maxWidth: 700 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>일괄 결제 처리</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
              <strong>{selectedMember.name}</strong>님 · 선택한 {selectionItems.length}건
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>결제 항목 (금액 수기 수정 가능)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                {selectionItems.map((item, idx) => {
                  const key = item.isAnnual ? `annual-${item.courseId}` : `${item.courseId}-${item.month}`;
                  const currentAmount = cellAmounts[key] ?? item.amount;
                  return (
                    <div key={`${key}-${idx}`} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: 8, background: '#fafafa', borderRadius: 4,
                    }}>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: 13 }}>{item.courseName}</strong>
                        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
                          {item.isAnnual ? '연납 (2~12월)' : `${item.month}월`}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={currentAmount.toLocaleString()}
                        onChange={(e) => {
                          const num = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                          setCellAmounts(prev => ({ ...prev, [key]: num }));
                        }}
                        style={{ ...inputStyle, width: 100, textAlign: 'right' }}
                      />
                      <span style={{ fontSize: 12, color: '#888' }}>원</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{
              padding: 12, background: '#FFF8E1', border: '1px solid #FFE082',
              borderRadius: 6, marginBottom: 16, fontSize: 14, textAlign: 'right',
            }}>
              <strong>총 결제 금액: <span style={{ color: '#185FA5', fontSize: 20 }}>
                {Object.values(cellAmounts).reduce((s, v) => s + (v || 0), 0).toLocaleString()}원
              </span></strong>
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
                <label style={labelStyle}>영수증 번호</label>
                <input value={bulkReceiptNum} onChange={(e) => setBulkReceiptNum(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleBulkSave} style={{
                flex: 1, padding: '12px',
                background: '#1D9E75', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 14, fontWeight: 500,
              }}>✓ 결제 처리</button>
              <button onClick={() => setBulkPayModalOpen(false)} style={secondaryBtnStyle}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* 종료 예약 모달                                  */}
      {/* ============================================ */}
      {endScheduleModalOpen && endingEnrollment && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>\uc218\ub0a9 / \ud658\ubd88 / \uc774\uc6d4 \ucc98\ub9ac</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
              <strong>{endingEnrollment.members?.name}</strong> \u00b7 {courses.find(c => c.id === endingEnrollment.course_id)?.name}
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>\ucc98\ub9ac\uc77c (\ud68c\uc6d0\uc774 \ud658\ubd88/\uc774\uc6d4 \uc758\uc0ac\ub97c \ubc1d\ud78c \ub0a0)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
              <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                \uc774 \ub0a0\uc9dc \uc774\ud6c4\ubd80\ud130 \ucd9c\uc11d\uccb4\ud06c\uac00 \ucc28\ub2e8\ub418\uba70, \ud574\ub2f9 \uc6d4 \uc218\ub0a9 \ud654\uba74\uc5d0\uc11c\ub3c4 \uc81c\uc678\ub429\ub2c8\ub2e4.
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>\ucc98\ub9ac \uad6c\ubd84</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['unregistered', 'refund', 'other'] as EndReason[]).map(r => (
                  <label key={r} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: 10, border: '1px solid ' + (endReason === r ? '#185FA5' : '#ddd'),
                    background: endReason === r ? '#E6F1FB' : 'white',
                    borderRadius: 6, cursor: 'pointer',
                  }}>
                    <input type="radio" checked={endReason === r} onChange={() => setEndReason(r)} />
                    <div>
                      <strong style={{ fontSize: 13 }}>
                        {r === 'unregistered' ? '\ubbf8\ub4f1\ub85d (\uc790\uc5f0 \uc885\ub8cc)' : r === 'refund' ? '\ud658\ubd88' : '\uc774\uc6d4 / \uae30\ud0c0'}
                      </strong>
                      <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>
                        {r === 'unregistered' ? '\ub2e4\uc74c \ub2ec\ubd80\ud130 \uc218\uac15\uc744 \uc548 \ud558\ub294 \uacbd\uc6b0' : r === 'refund' ? '\ud658\ubd88 \uc2e0\uccad\uc11c\ub97c \uc791\uc131\ud55c \uacbd\uc6b0' : '\uc774\uc6d4 \ub610\ub294 \uadf8 \ubc16\uc758 \uc0ac\uc720'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>\uba54\ubaa8 (\uc120\ud0dd)</label>
              <input value={endMemo} onChange={(e) => setEndMemo(e.target.value)} style={inputStyle} placeholder="\uc608: \uc785\uc6d0\uc73c\ub85c \ud658\ubd88 \uc2e0\uccad, 5\uc6d4\ubd84 6\uc6d4\ub85c \uc774\uc6d4 \ub4f1" />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleEndSchedule} style={{
                flex: 1, padding: '12px',
                background: '#185FA5', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 14, fontWeight: 500,
              }}>확인</button>
              <button onClick={() => { setEndScheduleModalOpen(false); setEndingEnrollment(null); }} style={secondaryBtnStyle}>취소</button>
            </div>
          </div>
        </div>
      )}
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
