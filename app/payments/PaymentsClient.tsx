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
  isBeforeStartMonth,
  type PaymentMethod,
  type EndReason,
} from '@/lib/payments';
import { STATUS_LABELS, type EnrollmentStatus } from '@/lib/enrollment';
import * as XLSX from 'xlsx';

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
  use_levels?: boolean;
};

type CourseLevel = {
  id: number;
  course_id: number;
  level_name: string;
  fee_jung_gu: number;
  fee_other: number;
  sort_order: number;
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
  end_reason: string | null;
  end_date: string | null;
  end_from_year: number | null;
  end_from_month: number | null;
  start_year: number | null;
  start_month: number | null;
  enrolled_at: string | null;
  refund_date: string | null;
  course_level_id?: number | null;
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
  status_type: string | null;
  refund_amount: number | null;
  refund_date: string | null;
  refund_method: string | null;
  carryover_amount: number | null;
  carryover_date: string | null;
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
  const [courseLevels, setCourseLevels] = useState<CourseLevel[]>([]);

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
  const [isEditMode, setIsEditMode] = useState(false);
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

  // 수강 종료 모달
  const [endScheduleModalOpen, setEndScheduleModalOpen] = useState(false);
  const [endingEnrollment, setEndingEnrollment] = useState<Enrollment | null>(null);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [endReason, setEndReason] = useState<EndReason>('self_request');
  const [endMemo, setEndMemo] = useState('');

  // 재등록 모달
  const [reEnrollModalOpen, setReEnrollModalOpen] = useState(false);
  const [reEnrollEnrollment, setReEnrollEnrollment] = useState<Enrollment | null>(null);
  const [reEnrollDate, setReEnrollDate] = useState(new Date().toISOString().split('T')[0]);

  // 환불 모달 (여러 달 일괄)
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split('T')[0]);
  const [refundMethod, setRefundMethod] = useState<'card_cancel' | 'transfer'>('card_cancel');
  const [refundAmounts, setRefundAmounts] = useState<Record<string, number>>({});

  // 이월 모달 (여러 달 일괄)
  const [carryoverModalOpen, setCarryoverModalOpen] = useState(false);
  const [carryoverDate, setCarryoverDate] = useState(new Date().toISOString().split('T')[0]);
  const [carryoverAmounts, setCarryoverAmounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  async function loadData() {
    setLoading(true);
    const [coursesRes, enrollmentsRes, paymentsRes, levelsRes] = await Promise.all([
      supabase.from('courses').select('*').eq('is_active', true).order('category').order('name'),
      supabase
        .from('enrollments')
        .select('*, members(id, name, phone, region_type, is_jung_gu, is_discount_50, is_discount_100)')
        .in('status', ['active', 'paused', 'ended']),
      supabase.from('payments').select('*').eq('payment_year', selectedYear),
      supabase.from('course_levels').select('*').order('course_id').order('sort_order'),
    ]);

    setCourses(coursesRes.data || []);
    setEnrollments((enrollmentsRes.data as Enrollment[]) || []);
    setPayments(paymentsRes.data || []);
    setCourseLevels(levelsRes.data || []);
    setLoading(false);
  }

  // 최초수강월 변경 (신청전/미납 판정 기준)
  async function updateStartMonth(enrollmentId: number, year: number, month: number) {
    const { error } = await supabase
      .from('enrollments')
      .update({ start_year: year, start_month: month })
      .eq('id', enrollmentId);
    if (error) {
      alert('최초수강월 변경 실패: ' + error.message);
    } else {
      loadData();
    }
  }

  function getPayment(enrollmentId: number, month: number): Payment | null {
    return payments.find(p =>
      p.enrollment_id === enrollmentId &&
      p.payment_year === selectedYear &&
      p.payment_month === month
    ) || null;
  }

  // 등급 강좌 대응: enrollment + course에서 실제 적용할 수강료 반환
  function getCourseFees(course: Course, enrollment: Enrollment | null | undefined): { fee_jung_gu: number; fee_other: number } {
    if (course.use_levels && enrollment?.course_level_id) {
      const level = courseLevels.find(lv => lv.id === enrollment.course_level_id);
      if (level) {
        return { fee_jung_gu: level.fee_jung_gu, fee_other: level.fee_other };
      }
    }
    return { fee_jung_gu: course.fee_jung_gu, fee_other: course.fee_other };
  }

  // memberId 기반: 해당 회원의 이 강좌 enrollment를 찾아 수강료 반환
  function getEnrollmentFees(course: Course, memberId: number): { fee_jung_gu: number; fee_other: number } {
    const enrollment = enrollments.find(e => e.course_id === course.id && e.member_id === memberId);
    return getCourseFees(course, enrollment);
  }

  function getEnrollmentsByCourse(courseId: number): Enrollment[] {
    // 종료된 회원도 종료일 이전 월에는 보여줘야 함.
    // isEndedAtMonth(e, year, month)가 false면 그 월에는 아직 수강중이었음.
    return enrollments
      .filter(e => {
        if (e.course_id !== courseId) return false;
        // 선택된 월에 종료된 상태면 제외 (종료일 이후 월에서만 사라짐)
        if (isEndedAtMonth(e, selectedYear, selectedMonth)) return false;
        return true;
      })
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
      const calc = (() => { const f = getEnrollmentFees(course, selectedMember.id); return calculateFee(
        f.fee_jung_gu, f.fee_other,
        selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100,
        course.is_free
      ); })();
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

      const calc = (() => { const f = getEnrollmentFees(course, selectedMember.id); return calculateFee(
        f.fee_jung_gu, f.fee_other,
        selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100,
        course.is_free
      ); })();

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
    setIsEditMode(false);
    setBulkPayModalOpen(true);
  }

  // 수정 모달: 이미 결제된 셀들의 정보를 불러와서 각각 수정
  function openBulkEditModal() {
    if (!selectedMember) return;
    const items = getSelectedPaidItems();
    if (items.length === 0) {
      alert('수정할 항목이 없습니다.\n결제완료된 셀(등록/환불/이월)을 선택하세요.');
      return;
    }
    // 현재 결제 금액으로 초기화
    const initialAmounts: Record<string, number> = {};
    items.forEach(it => {
      initialAmounts[`${it.courseId}-${it.month}`] = it.payment.amount;
    });
    setCellAmounts(initialAmounts);
    // 첫 항목의 결제방법/날짜를 기본값으로
    const first = items[0].payment;
    setBulkPayMethod((first.payment_method as any) || 'cash');
    setBulkPayDate(first.paid_at || new Date().toISOString().split('T')[0]);
    setBulkReceiptNum(first.receipt_number || '');
    setIsEditMode(true);
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

      const calc = (() => { const f = getEnrollmentFees(course, selectedMember.id); return calculateFee(
        f.fee_jung_gu, f.fee_other,
        selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100,
        course.is_free
      ); })();

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

    const calc = (() => { const f = getCourseFees(course, enrollment); return calculateFee(
      f.fee_jung_gu, f.fee_other,
      member.is_jung_gu, member.is_discount_50, member.is_discount_100,
      course.is_free
    ); })();

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

    const calc = (() => { const f = getCourseFees(course, enrollment); return calculateFee(
      f.fee_jung_gu, f.fee_other,
      member.is_jung_gu, member.is_discount_50, member.is_discount_100,
      course.is_free
    ); })();

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

  // 선택한 셀들의 결제기록 일괄 삭제 (결제취소)
  async function handleBulkDeletePayment() {
    if (!selectedMember) return;
    const items = getSelectedPaidItems();
    if (items.length === 0) {
      alert('결제 취소할 항목이 없습니다.\n결제완료(등록/환불/이월)된 셀을 선택하세요.');
      return;
    }
    if (!confirm(`선택한 ${items.length}건의 결제 기록을 삭제하시겠습니까?\n\n결제 기록이 완전히 삭제되어 미납 또는 미등록 상태로 돌아갑니다.\n(환불과는 다른 기능 - 잘못 입력한 결제를 정정할 때 사용)`)) return;

    let hasError = false;
    for (const it of items) {
      const { error } = await supabase.from('payments').delete().eq('id', it.payment.id);
      if (error) { hasError = true; console.error('결제취소 실패:', error); }
    }
    if (hasError) alert('일부 결제취소에 실패했습니다.');
    else alert(`${items.length}건의 결제가 취소되었습니다.`);
    setSelectedCells(new Set());
    loadData();
  }

  // 수납/환불/이월 모달
  function openEndScheduleModal(enrollment: Enrollment) {
    setEndingEnrollment(enrollment);
    setEndDate(new Date().toISOString().split('T')[0]);
    setEndReason('self_request');
    setEndMemo('');
    setEndScheduleModalOpen(true);
  }

  async function handleEndSchedule() {
    if (!endingEnrollment) return;
    if (!endDate) {
      alert('종료일을 입력하세요');
      return;
    }
    const memberName = endingEnrollment.members?.name || '회원';
    const courseName = courses.find(c => c.id === endingEnrollment.course_id)?.name || '강좌';

    // 수강 상태를 'ended'로 변경. 이전 결제/출석 기록은 보존됨.
    const { error } = await supabase.from('enrollments').update({
      status: 'ended',
      end_date: endDate,
      end_reason: endReason,
      refund_memo: endMemo.trim() || null,
      ended_at: new Date().toISOString(),
    }).eq('id', endingEnrollment.id);

    if (error) {
      alert('종료 처리 실패: ' + error.message);
    } else {
      const reasonLabel = endReason === 'self_request' ? '본인 요청' : '직원 조치';
      alert(`${memberName}님 / ${courseName}\n${endDate}자로 수강 종료되었습니다.\n사유: ${reasonLabel}\n\n이전 결제·출석 기록은 그대로 유지됩니다.`);
      setEndScheduleModalOpen(false);
      setEndingEnrollment(null);
      loadData();
    }
  }

  // 수납/환불/이월 취소
  async function cancelEndSchedule(enrollment: Enrollment) {
    if (!confirm('수납/환불/이월 처리를 취소하시겠습니까?')) return;
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

  // 재등록 모달 열기 (수강종료된 강좌를 다시 등록)
  function openReEnrollModal(enrollment: Enrollment) {
    setReEnrollEnrollment(enrollment);
    setReEnrollDate(new Date().toISOString().split('T')[0]);
    setReEnrollModalOpen(true);
  }

  // 재등록 처리: 종료 정보를 해제하고 다시 수강 시작
  async function handleReEnroll() {
    if (!reEnrollEnrollment) return;
    if (!reEnrollDate) {
      alert('재등록일을 입력하세요');
      return;
    }
    const memberName = reEnrollEnrollment.members?.name || '회원';
    const courseName = courses.find(c => c.id === reEnrollEnrollment.course_id)?.name || '강좌';

    // 종료 관련 정보 모두 해제 + 다시 수강중으로
    // (이전 출석/결제 기록은 그대로 유지됨)
    // 신청일(enrolled_at)은 원래 값 유지 - 처음 이 강좌를 신청한 날이 중요
    // 이전 결제·출석 기록은 보존됨
    const { error } = await supabase.from('enrollments').update({
      status: 'active',
      end_date: null,
      end_reason: null,
      ended_at: null,
      refund_memo: null,
      end_from_year: null,
      end_from_month: null,
      refund_date: null,
    }).eq('id', reEnrollEnrollment.id);

    if (error) {
      alert('재등록 실패: ' + error.message);
    } else {
      alert(`${memberName}님 / ${courseName}\n${reEnrollDate}자로 수강 재개되었습니다.\n이전 결제·출석 기록은 그대로 유지됩니다.`);
      setReEnrollModalOpen(false);
      setReEnrollEnrollment(null);
      loadData();
    }
  }

  // 선택된 셀 중 "결제완료된" 것만 (환불/이월 대상)
  function getSelectedPaidItems(): Array<{ key: string; courseId: number; courseName: string; month: number; payment: Payment }> {
    if (!selectedMember) return [];
    const result: Array<{ key: string; courseId: number; courseName: string; month: number; payment: Payment }> = [];
    selectedCells.forEach(key => {
      const [cidStr, mStr] = key.split('-');
      const courseId = parseInt(cidStr, 10);
      const month = parseInt(mStr, 10);
      const course = courses.find(co => co.id === courseId);
      if (!course) return;
      const enr = enrollments.find(e => e.member_id === selectedMember.id && e.course_id === courseId);
      if (!enr) return;
      const p = getPayment(enr.id, month);
      if (p && (p.is_paid || p.status_type === 'refunded' || p.status_type === 'carryover')) {
        result.push({ key, courseId, courseName: course.name, month, payment: p });
      }
    });
    return result;
  }

  // 환불 모달 열기
  function openRefundModal() {
    const items = getSelectedPaidItems();
    if (items.length === 0) {
      alert('환불은 결제완료(등록)된 월만 가능합니다. 등록된 셀을 선택하세요.');
      return;
    }
    const init: Record<string, number> = {};
    items.forEach(it => { init[it.key] = it.payment.amount; });
    setRefundAmounts(init);
    setRefundDate(new Date().toISOString().split('T')[0]);
    setRefundMethod('card_cancel');
    setRefundModalOpen(true);
  }

  // 환불 저장
  async function handleRefundSave() {
    const items = getSelectedPaidItems();
    if (items.length === 0) return;
    let hasError = false;

    for (const it of items) {
      const amt = refundAmounts[it.key] ?? it.payment.amount;
      const { error } = await supabase.from('payments').update({
        status_type: 'refunded',
        refund_amount: amt,
        refund_date: refundDate,
        refund_method: refundMethod,
        updated_at: new Date().toISOString(),
      }).eq('id', it.payment.id);
      if (error) { hasError = true; console.error('환불 처리 실패:', error); }
    }

    if (hasError) alert('일부 환불 처리에 실패했습니다.');
    else alert(`${items.length}건 환불 처리되었습니다.`);

    setRefundModalOpen(false);
    setSelectedCells(new Set());
    loadData();
  }

  // 이월 모달 열기
  function openCarryoverModal() {
    const items = getSelectedPaidItems();
    if (items.length === 0) {
      alert('이월은 결제완료(등록)된 월만 가능합니다. 등록된 셀을 선택하세요.');
      return;
    }
    const init: Record<string, number> = {};
    items.forEach(it => { init[it.key] = it.payment.amount; });
    setCarryoverAmounts(init);
    setCarryoverDate(new Date().toISOString().split('T')[0]);
    setCarryoverModalOpen(true);
  }

  // 이월 저장
  async function handleCarryoverSave() {
    const items = getSelectedPaidItems();
    if (items.length === 0) return;
    let hasError = false;

    for (const it of items) {
      const amt = carryoverAmounts[it.key] ?? it.payment.amount;
      const { error } = await supabase.from('payments').update({
        status_type: 'carryover',
        carryover_amount: amt,
        carryover_date: carryoverDate,
        updated_at: new Date().toISOString(),
      }).eq('id', it.payment.id);
      if (error) { hasError = true; console.error('이월 처리 실패:', error); }
    }

    // 이월된 회원을 대기명단으로 편입 (이월 신청순으로 대기순번 부여)
    const carriedEnrollmentIds = new Set<number>();
    for (const it of items) {
      const enr = enrollments.find(e => e.member_id === selectedMember?.id && e.course_id === it.courseId);
      if (enr && enr.status !== 'waiting') carriedEnrollmentIds.add(enr.id);
    }
    const waitingCountByCourse = new Map<number, number>();
    for (const enr of enrollments) {
      if (enr.status === 'waiting') {
        waitingCountByCourse.set(enr.course_id, (waitingCountByCourse.get(enr.course_id) || 0) + 1);
      }
    }
    let movedToWaiting = 0;
    for (const enrId of carriedEnrollmentIds) {
      const enr = enrollments.find(e => e.id === enrId);
      if (!enr) continue;
      const nextOrder = (waitingCountByCourse.get(enr.course_id) || 0) + 1;
      waitingCountByCourse.set(enr.course_id, nextOrder);
      const { error } = await supabase.from('enrollments').update({
        status: 'waiting',
        waiting_order: nextOrder,
        carryover_date: carryoverDate,
      }).eq('id', enrId);
      if (error) { hasError = true; console.error('대기 편입 실패:', error); }
      else movedToWaiting++;
    }

    if (hasError) alert('일부 이월 처리에 실패했습니다.');
    else alert(`${items.length}건 이월 처리되었습니다.${movedToWaiting > 0 ? `\n${movedToWaiting}명이 대기명단으로 이동했습니다.` : ''}`);

    setCarryoverModalOpen(false);
    setSelectedCells(new Set());
    loadData();
  }

  // 환불/이월 취소 (결제 모달에서 호출 - 그 달을 다시 등록 상태로)
  async function clearRefundCarryover(paymentId: number) {
    const { error } = await supabase.from('payments').update({
      status_type: null,
      refund_amount: null,
      refund_date: null,
      refund_method: null,
      carryover_amount: null,
      carryover_date: null,
      updated_at: new Date().toISOString(),
    }).eq('id', paymentId);
    if (error) alert('취소 실패: ' + error.message);
    else loadData();
  }

  // 이 회원-강좌에서 환불/이월된 가장 빠른 달 (그 다음 달부터 미등록 처리용)
  function getRefundCarryoverStartMonth(enrollmentId: number): number | null {
    const ps = payments.filter(p =>
      p.enrollment_id === enrollmentId &&
      p.payment_year === selectedYear &&
      (p.status_type === 'refunded' || p.status_type === 'carryover')
    );
    if (ps.length === 0) return null;
    return Math.min(...ps.map(p => p.payment_month));
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

  // 강좌별 보기 엑셀 다운로드
  function downloadByCourseExcel() {
    const targetCourses = selectedCourseId === 'all'
      ? courses
      : courses.filter(c => c.id === selectedCourseId);

    const rows: { 강좌명: string; 이름: string; 연락처: string; 상태: string; 결제일: string }[] = [];

    targetCourses.forEach(course => {
      const operationMonths = parseOperationMonths(course.operation_months);
      const isOperating = operationMonths.includes(selectedMonth);
      if (!isOperating) return; // 운영X 강좌는 제외

      const courseEnrollments = getEnrollmentsByCourse(course.id);

      const filtered = showUnpaidOnly
        ? courseEnrollments.filter(e => {
            if (!e.members) return false;
            if (isEndedAtMonth(e, selectedYear, selectedMonth)) return false;
            if (isBeforeStartMonth(e, selectedYear, selectedMonth)) return false;
            if (selectedMonth === 1) return false;
            const calc = (() => { const f = getCourseFees(course, e); return calculateFee(f.fee_jung_gu, f.fee_other, e.members!.is_jung_gu, e.members!.is_discount_50, e.members!.is_discount_100, course.is_free); })();
            if (calc.amount === 0) return false;
            const p = getPayment(e.id, selectedMonth);
            return !p || !p.is_paid;
          })
        : courseEnrollments;

      filtered.forEach(e => {
        const member = e.members;
        if (!member) return;
        const p = getPayment(e.id, selectedMonth);
        const calc = (() => { const f = getCourseFees(course, e); return calculateFee(f.fee_jung_gu, f.fee_other, member.is_jung_gu, member.is_discount_50, member.is_discount_100, course.is_free); })();
        const isAutoComplete = calc.amount === 0;
        const pastOrCurrent = isPastOrCurrent(selectedMonth);
        const isOTMonth = selectedMonth === 1;

        let statusLabel = '';
        if (p?.is_paid) statusLabel = '등록';
        else if (isBeforeStartMonth(e, selectedYear, selectedMonth)) statusLabel = '신청전';
        else if (isAutoComplete && pastOrCurrent) statusLabel = '자동등록';
        else if (pastOrCurrent && !isOTMonth) statusLabel = '미납';
        else statusLabel = isOTMonth ? '미등록(OT)' : '미등록';

        rows.push({
          강좌명: course.name,
          이름: member.name,
          연락처: member.phone || '',
          상태: statusLabel,
          결제일: p?.paid_at || '',
        });
      });
    });

    if (rows.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }

    // 엑셀 생성
    const ws = XLSX.utils.json_to_sheet(rows);
    // 컬럼 너비 설정
    ws['!cols'] = [
      { wch: 20 }, // 강좌명
      { wch: 10 }, // 이름
      { wch: 15 }, // 연락처
      { wch: 12 }, // 상태
      { wch: 12 }, // 결제일
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${selectedMonth}월`);

    // 파일명 생성
    const courseName = selectedCourseId === 'all'
      ? '전체'
      : (courses.find(c => c.id === selectedCourseId)?.name || '강좌').replace(/[\\/:*?"<>|]/g, '');
    const suffix = showUnpaidOnly ? '_미납자' : '';
    const filename = `수납현황_${selectedYear}년${selectedMonth}월_${courseName}${suffix}.xlsx`;

    XLSX.writeFile(wb, filename);
  }

  // ============================================
  // 미납자 점검 (새 컨셉)
  // 기준: "기준 월 출석부에 있는 사람" 중 "조회 월 납부 현황"
  // ============================================

  // 조회 월 컨트롤 (기본: 검색일이 속한 달의 다음 달)
  const defaultCheckYear = today.getMonth() === 11 ? todayYear + 1 : todayYear;
  const defaultCheckMonth = today.getMonth() === 11 ? 1 : todayMonth + 1;
  const [checkYear, setCheckYear] = useState(defaultCheckYear);
  const [checkMonth, setCheckMonth] = useState(defaultCheckMonth);
  // 강좌 다중 선택 (빈 Set = 전체)
  const [unpaidCourseFilter, setUnpaidCourseFilter] = useState<Set<number>>(new Set());

  // 기준 월: 검색일이 속한 달 (자동)
  const baseYear = todayYear;
  const baseMonth = todayMonth;

  type UnpaidStatus = 'paid' | 'unpaid' | 'ended' | 'refund' | 'carryover';
  type UnpaidRow = {
    course: Course;
    enrollment: Enrollment;
    member: Member;
    status: UnpaidStatus;
  };

  // 기준 월 출석부에 있는 사람 = 그 월에 결제 완료한 사람 (출석부 노출 조건과 동일)
  function isInBaseAttendance(enrollment: Enrollment, course: Course): boolean {
    if (course.is_free) {
      // 무료 강좌는 결제 무관, active 상태만 체크
      if (enrollment.status === 'ended' && isEndedAtMonth(enrollment, baseYear, baseMonth)) return false;
      return true;
    }
    // 기준 월에 종료된 경우 제외
    if (isEndedAtMonth(enrollment, baseYear, baseMonth)) return false;
    // 환불일이 기준 월 1일 이전이면 제외 (그전에 그만둠)
    if (enrollment.refund_date) {
      const monthStart = `${baseYear}-${String(baseMonth).padStart(2, '0')}-01`;
      if (enrollment.refund_date < monthStart) return false;
    }
    // 기준 월 결제 완료 여부
    const p = getPayment(enrollment.id, baseMonth);
    // 기준 월 = baseYear이지만 selectedYear가 다를 수 있으니 직접 찾기
    const basePay = payments.find(pp =>
      pp.enrollment_id === enrollment.id &&
      pp.payment_year === baseYear &&
      pp.payment_month === baseMonth &&
      pp.is_paid
    );
    if (!basePay) return false;
    return true;
  }

  // 조회 월 납부 상태 판정
  function getCheckMonthStatus(enrollment: Enrollment, course: Course): UnpaidStatus {
    // 1) 조회 월에 종료된 경우
    if (isEndedAtMonth(enrollment, checkYear, checkMonth)) return 'ended';

    // 2) 조회 월의 결제 기록 조회
    const p = payments.find(pp =>
      pp.enrollment_id === enrollment.id &&
      pp.payment_year === checkYear &&
      pp.payment_month === checkMonth
    );

    if (p) {
      // 환불 처리됨
      if (p.refund_amount && p.refund_amount > 0) return 'refund';
      // 이월 처리됨
      if (p.carryover_amount && p.carryover_amount > 0) return 'carryover';
      // 정상 납부
      if (p.is_paid) return 'paid';
    }
    // 미납
    return 'unpaid';
  }

  // 조회 월 운영월 체크 + 1월 OT 체크 헬퍼
  function isCheckMonthValid(course: Course): boolean {
    if (checkMonth === 1) return false; // 1월 OT
    const opMonths = parseOperationMonths(course.operation_months);
    return opMonths.includes(checkMonth);
  }

  // 미납자 점검 데이터 계산
  const unpaidRows: UnpaidRow[] = (() => {
    const result: UnpaidRow[] = [];
    const filterActive = unpaidCourseFilter.size > 0;
    courses.forEach(course => {
      if (filterActive && !unpaidCourseFilter.has(course.id)) return;
      if (course.is_free) return; // 무료 강좌는 미납 개념 없음
      if (!isCheckMonthValid(course)) return; // 조회 월이 운영월 아니거나 1월

      const courseEnrollments = enrollments.filter(e => e.course_id === course.id);
      courseEnrollments.forEach(e => {
        if (!e.members) return;
        if (!isInBaseAttendance(e, course)) return; // 기준 월 출석부에 없으면 제외
        const status = getCheckMonthStatus(e, course);
        result.push({ course, enrollment: e, member: e.members, status });
      });
    });
    return result;
  })();

  // 강좌별 그룹핑
  const unpaidByCourse = (() => {
    const map = new Map<number, { course: Course; rows: UnpaidRow[] }>();
    unpaidRows.forEach(r => {
      if (!map.has(r.course.id)) map.set(r.course.id, { course: r.course, rows: [] });
      map.get(r.course.id)!.rows.push(r);
    });
    // 이름순 정렬
    map.forEach(g => g.rows.sort((a, b) => (a.member.name || '').localeCompare(b.member.name || '')));
    return Array.from(map.values()).sort((a, b) => a.course.name.localeCompare(b.course.name));
  })();

  const totalCount = unpaidRows.length;
  const paidCount = unpaidRows.filter(r => r.status === 'paid').length;
  const unpaidOnlyCount = unpaidRows.filter(r => r.status === 'unpaid').length;
  const endedCount = unpaidRows.filter(r => r.status === 'ended').length;
  const refundCount = unpaidRows.filter(r => r.status === 'refund' || r.status === 'carryover').length;

  // 강좌 필터 토글
  function toggleUnpaidCourseFilter(courseId: number) {
    const next = new Set(unpaidCourseFilter);
    if (next.has(courseId)) next.delete(courseId);
    else next.add(courseId);
    setUnpaidCourseFilter(next);
  }

  // 미납자 점검 엑셀 다운로드 (3시트: 전체/납부완료/미납)
  function downloadUnpaidExcel() {
    if (unpaidRows.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }
    const wb = XLSX.utils.book_new();
    const statusLabel = (s: UnpaidStatus) =>
      s === 'paid' ? '납부완료'
      : s === 'unpaid' ? '미납'
      : s === 'ended' ? '수강종료'
      : s === 'refund' ? '환불'
      : s === 'carryover' ? '환불(이월)'
      : '';

    // 시트1: 전체
    const allRows: (string | number)[][] = [['연번', '강좌', '이름', '연락처', '상태']];
    unpaidRows.forEach((r, idx) => {
      allRows.push([idx + 1, r.course.name, r.member.name, r.member.phone || '', statusLabel(r.status)]);
    });
    const wsAll = XLSX.utils.aoa_to_sheet(allRows);
    wsAll['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsAll, `전체 (${unpaidRows.length})`);

    // 시트2: 납부완료
    const paidList = unpaidRows.filter(r => r.status === 'paid');
    const paidSheetRows: (string | number)[][] = [['연번', '강좌', '이름', '연락처']];
    paidList.forEach((r, idx) => {
      paidSheetRows.push([idx + 1, r.course.name, r.member.name, r.member.phone || '']);
    });
    const wsPaid = XLSX.utils.aoa_to_sheet(paidSheetRows);
    wsPaid['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsPaid, `납부완료 (${paidList.length})`);

    // 시트3: 미납 (수강종료, 환불 제외 - 안내 대상)
    const unpaidList = unpaidRows.filter(r => r.status === 'unpaid');
    const unpaidSheetRows: (string | number)[][] = [['연번', '강좌', '이름', '연락처']];
    unpaidList.forEach((r, idx) => {
      unpaidSheetRows.push([idx + 1, r.course.name, r.member.name, r.member.phone || '']);
    });
    const wsUnpaid = XLSX.utils.aoa_to_sheet(unpaidSheetRows);
    wsUnpaid['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsUnpaid, `미납 (${unpaidList.length})`);

    XLSX.writeFile(wb, `납부현황_${checkYear}년${checkMonth}월_${baseYear}년${baseMonth}월출석부기준.xlsx`);
  }

  const { items: selectionItems, total: selectionTotal } = calculateSelectionTotal();

  return (
    <div style={{ maxWidth: 1400, margin: '40px auto', padding: 20 }}>
      <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20 }}>💰 수납 관리</h1>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #eee' }}>
        <TabButton active={activeTab === 'by-member'} onClick={() => setActiveTab('by-member')} label="👤 수납관리" />
        <TabButton active={activeTab === 'by-course'} onClick={() => setActiveTab('by-course')} label="🎯 강좌별 보기" />
        <TabButton active={activeTab === 'unpaid'} onClick={() => setActiveTab('unpaid')} label={`⚠️ 미납자 점검${unpaidOnlyCount > 0 ? ` (${unpaidOnlyCount})` : ''}`} />
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
                          원하는 월 셀을 <strong>클릭하여 선택</strong>(여러 개·여러 강좌 가능)한 뒤
                          아래 <strong>[결제] [환불] [이월]</strong> 버튼을 누르세요.
                          1개만 선택하면 <strong>[상세/수정]</strong>으로 결제 정보 확인·수정·취소가 가능합니다.
                        </div>
                        {memberEnrollments.map(enrollment => {
                          const course = courses.find(c => c.id === enrollment.course_id);
                          if (!course) return null;

                          const operationMonths = parseOperationMonths(course.operation_months);
                          const calc = (() => { const f = getEnrollmentFees(course, selectedMember.id); return calculateFee(
                            f.fee_jung_gu, f.fee_other,
                            selectedMember.is_jung_gu, selectedMember.is_discount_50, selectedMember.is_discount_100,
                            course.is_free
                          ); })();
                          const canAnnual = isAnnualAvailable(course.operation_months) && calc.amount > 0;
                          const isAnnualChecked = selectedAnnualCourses.has(course.id);
                          const annualAmount = calculateAnnualFee(calc.amount);

                          // 수강 종료 여부
                          const isCourseEnded = enrollment.status === 'ended';

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
                                  {isCourseEnded ? (
                                    <span style={{ ...badgeStyle('#A32D2D'), fontSize: 11 }}>
                                      🛑 수강종료 {(enrollment as any).end_date || ''}
                                    </span>
                                  ) : (
                                    <span style={{ ...badgeStyle('#1D9E75'), fontSize: 11 }}>
                                      ✓ 수강중
                                    </span>
                                  )}
                                  <span style={{ fontSize: 11, color: '#888', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                    최초수강월
                                    <select
                                      value={enrollment.start_month ?? ''}
                                      onChange={(ev) => {
                                        const m = parseInt(ev.target.value, 10);
                                        if (m) updateStartMonth(enrollment.id, selectedYear, m);
                                      }}
                                      style={{ fontSize: 11, padding: '1px 2px', border: '1px solid #ddd', borderRadius: 4 }}
                                    >
                                      <option value="">-</option>
                                      {months.map(m => <option key={m} value={m}>{m}월</option>)}
                                    </select>
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  {isCourseEnded ? (
                                    <button onClick={() => openReEnrollModal(enrollment)} style={{
                                      ...smallBtnStyle,
                                      background: '#1D9E75', color: 'white', borderColor: '#1D9E75',
                                    }}>↻ 수강 재개</button>
                                  ) : (
                                    <button onClick={() => openEndScheduleModal(enrollment)} style={smallBtnStyle}>
                                      📅 수강 종료
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

                                  // 환불/이월 시작 월 (그 다음 달부터 미등록)
                                  const rcStartMonth = getRefundCarryoverStartMonth(enrollment.id);
                                  const isAfterRefundCarryover = rcStartMonth !== null && month > rcStartMonth;
                                  const thisMonthStatus = payment?.status_type || null;

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
                                  } else if (thisMonthStatus === 'refunded') {
                                    // 환불된 달: 결제기록 유지 + 환불 표시 (셀 색 주황)
                                    label = '환불';
                                    bgColor = '#E8820E';
                                    textColor = 'white';
                                    canSelect = true; // 클릭 시 결제 모달(환불 취소 가능)
                                  } else if (thisMonthStatus === 'carryover') {
                                    // 이월된 달 (셀 색 보라)
                                    label = '이월';
                                    bgColor = '#7B3FBF';
                                    textColor = 'white';
                                    canSelect = true;
                                  } else if (isAfterRefundCarryover && !isPaid) {
                                    // 환불/이월한 달의 다음 달부터 = 미등록 (수강종료 아님)
                                    label = isOTMonth ? '미등록 (OT)' : '미등록';
                                    bgColor = '#fafafa';
                                    textColor = '#888';
                                  } else if (isEnded) {
                                    label = '수강종료';
                                    bgColor = '#3F3F3F';
                                    textColor = 'white';
                                    canSelect = true; // 클릭 시 재등록 모달
                                  } else if (isPaid) {
                                    label = isOTMonth ? '등록 (OT)' : '등록';
                                    bgColor = '#1D9E75';
                                    textColor = 'white';
                                    canSelect = true; // 수정도 가능
                                  } else if (isBeforeStartMonth(enrollment, selectedYear, month)) {
                                    // 신청전: 최초수강월 이전 = 회색, 라벨 없음, 결제 불가
                                    label = '';
                                    bgColor = '#ededed';
                                    textColor = '#ccc';
                                    canSelect = false;
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

                                  // 종료된 회원이라도 종료일 이전 월은 원래 상태(등록/미납/환불 등) 그대로 표시
                                  // (isEnded는 종료일 이후 월에만 true이므로 위 분기들과 충돌 없음)

                                  const selectedStyle = isSelected ? {
                                    boxShadow: '0 0 0 3px #185FA5',
                                  } : {};

                                  return (
                                    <div
                                      key={month}
                                      onClick={() => {
                                        if (!canSelect || isAnnualHere) return;
                                        if (isEnded) {
                                          // 수강종료 셀: 재등록 모달
                                          openReEnrollModal(enrollment);
                                        } else {
                                          // 그 외 모든 셀(미납/미등록/등록/환불/이월): 선택 토글
                                          // 결제/환불/이월/수정은 선택 후 아래 버튼으로
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
                                      {thisMonthStatus === 'refunded' || thisMonthStatus === 'carryover' ? (
                                        <>
                                          {/* 위: 원래 결제 정보 (등록) */}
                                          {payment && payment.amount > 0 && (
                                            <>
                                              <div style={{ fontSize: 10, marginTop: 2, opacity: 0.85 }}>등록</div>
                                              <div style={{ fontSize: 9, opacity: 0.85 }}>
                                                {payment.amount.toLocaleString()}원
                                              </div>
                                            </>
                                          )}
                                          {/* 구분선 */}
                                          <div style={{ height: 1, background: 'rgba(255,255,255,0.4)', margin: '3px 4px' }} />
                                          {/* 아래: 환불/이월 정보 */}
                                          <div style={{ fontSize: 10, fontWeight: 600 }}>
                                            {thisMonthStatus === 'refunded' ? '환불' : '이월'}
                                          </div>
                                          <div style={{ fontSize: 9, opacity: 0.95 }}>
                                            {((thisMonthStatus === 'refunded' ? payment?.refund_amount : payment?.carryover_amount) ?? 0).toLocaleString()}원
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <div style={{ fontSize: 10, marginTop: 2 }}>
                                            {isAnnualHere ? '연납' : label}
                                          </div>
                                          {payment?.is_paid && payment.amount > 0 && (
                                            <div style={{ fontSize: 9, marginTop: 2, opacity: 0.9 }}>
                                              {payment.amount.toLocaleString()}
                                            </div>
                                          )}
                                        </>
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
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button onClick={() => { setSelectedCells(new Set()); setSelectedAnnualCourses(new Set()); }} style={secondaryBtnStyle}>선택 해제</button>
                                <button onClick={openBulkPayModal} style={{
                                  padding: '12px 18px',
                                  background: '#1D9E75', color: 'white',
                                  border: 'none', borderRadius: 6, cursor: 'pointer',
                                  fontSize: 14, fontWeight: 500,
                                }}>💰 결제</button>
                                <button onClick={openRefundModal} style={{
                                  padding: '12px 18px',
                                  background: '#E8820E', color: 'white',
                                  border: 'none', borderRadius: 6, cursor: 'pointer',
                                  fontSize: 14, fontWeight: 500,
                                }}>↩️ 환불</button>
                                <button onClick={openCarryoverModal} style={{
                                  padding: '12px 18px',
                                  background: '#7B3FBF', color: 'white',
                                  border: 'none', borderRadius: 6, cursor: 'pointer',
                                  fontSize: 14, fontWeight: 500,
                                }}>📦 이월</button>
                                <button onClick={handleBulkDeletePayment} style={{
                                  padding: '12px 18px',
                                  background: '#A32D2D', color: 'white',
                                  border: 'none', borderRadius: 6, cursor: 'pointer',
                                  fontSize: 14, fontWeight: 500,
                                }}>🗑️ 결제취소</button>
                                <button onClick={openBulkEditModal} style={{
                                  padding: '12px 18px',
                                  background: 'white', color: '#185FA5',
                                  border: '1px solid #185FA5', borderRadius: 6, cursor: 'pointer',
                                  fontSize: 14, fontWeight: 500,
                                }}>✏️ 수정</button>
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
                <button
                  onClick={downloadByCourseExcel}
                  style={{
                    padding: '6px 14px', fontSize: 13, borderRadius: 6,
                    background: '#1D9E75', color: 'white', border: 'none',
                    cursor: 'pointer', fontWeight: 500,
                  }}
                  title="현재 화면 조건(강좌/미납자 필터) 그대로 엑셀로 다운로드합니다"
                >
                  📥 엑셀 다운로드
                </button>
              </div>

              {(selectedCourseId === 'all' ? courses : courses.filter(c => c.id === selectedCourseId)).map(course => {
                const courseEnrollments = getEnrollmentsByCourse(course.id);
                const operationMonths = parseOperationMonths(course.operation_months);
                const isOperating = operationMonths.includes(selectedMonth);

                const unpaidCount = courseEnrollments.filter(e => {
                  if (!isOperating || !e.members) return false;
                  if (isEndedAtMonth(e, selectedYear, selectedMonth)) return false;
                  if (isBeforeStartMonth(e, selectedYear, selectedMonth)) return false; // 신청전 제외
                  if (selectedMonth === 1) return false; // 1월 OT 제외
                  const calc = (() => { const f = getCourseFees(course, e); return calculateFee(f.fee_jung_gu, f.fee_other, e.members!.is_jung_gu, e.members!.is_discount_50, e.members!.is_discount_100, course.is_free); })();
                  if (calc.amount === 0) return false;
                  const p = getPayment(e.id, selectedMonth);
                  return !p || !p.is_paid;
                }).length;

                const displayEnrollments = showUnpaidOnly
                  ? courseEnrollments.filter(e => {
                      if (!isOperating || !e.members) return false;
                      if (isEndedAtMonth(e, selectedYear, selectedMonth)) return false;
                      if (isBeforeStartMonth(e, selectedYear, selectedMonth)) return false;
                      if (selectedMonth === 1) return false;
                      const calc = (() => { const f = getCourseFees(course, e); return calculateFee(f.fee_jung_gu, f.fee_other, e.members!.is_jung_gu, e.members!.is_discount_50, e.members!.is_discount_100, course.is_free); })();
                      if (calc.amount === 0) return false;
                      const p = getPayment(e.id, selectedMonth);
                      return !p || !p.is_paid;
                    })
                  : courseEnrollments.filter(e => !isBeforeStartMonth(e, selectedYear, selectedMonth));

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
                            <th style={thStyle}>연락처</th>
                            <th style={thStyle}>{selectedMonth}월 상태</th>
                            <th style={thStyle}>결제일</th>
                            <th style={thStyle}>관리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayEnrollments.map(e => {
                            const member = e.members;
                            if (!member) return null;
                            const p = getPayment(e.id, selectedMonth);

                            // 종료된 회원이라도 여기 도달했다면 종료일 이전 월이므로
                            // 정상적으로 결제 정보를 표시함
                            // (getEnrollmentsByCourse에서 종료일 이후 월은 이미 제외됨)

                            const calc = (() => { const f = getCourseFees(course, e); return calculateFee(f.fee_jung_gu, f.fee_other, member.is_jung_gu, member.is_discount_50, member.is_discount_100, course.is_free); })();
                            const isAutoComplete = calc.amount === 0;
                            const pastOrCurrent = isPastOrCurrent(selectedMonth);
                            const isOTMonth = selectedMonth === 1;

                            let statusLabel = '';
                            let statusColor = '#888';
                            if (p?.is_paid) {
                              statusLabel = '✓ 등록';
                              statusColor = '#1D9E75';
                            } else if (isBeforeStartMonth(e, selectedYear, selectedMonth)) {
                              statusLabel = '신청전';
                              statusColor = '#bbb';
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
                                <td style={tdStyle}>{member.phone || '-'}</td>
                                <td style={tdStyle}><span style={badgeStyle(statusColor)}>{statusLabel}</span></td>
                                <td style={tdStyle}>{p?.paid_at || '-'}</td>
                                <td style={tdStyle}>
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    <button onClick={() => openPaymentModal(e, course, selectedMonth)} style={smallBtnStyle}>
                                      {p?.is_paid ? '수정' : '결제처리'}
                                    </button>
                                    {e.status === 'ended' ? (
                                      <span style={{ fontSize: 11, color: '#888', padding: '4px 6px' }}>
                                        🛑 종료{(e as any).end_date ? ` (${(e as any).end_date})` : ''}
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => openEndScheduleModal(e)}
                                        style={{ ...smallBtnStyle, color: '#A32D2D' }}
                                        title="이 회원의 수강을 종료합니다"
                                      >
                                        🛑 종료
                                      </button>
                                    )}
                                  </div>
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
                <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>⚠️ 미납자 점검</h3>
                <p style={{ fontSize: 12, color: '#888', margin: 0, lineHeight: 1.5 }}>
                  <strong>{baseYear}년 {baseMonth}월 출석부</strong>에 있는 회원 중 <strong>{checkYear}년 {checkMonth}월 수강료</strong> 납부 현황입니다.<br />
                  매월 15~24일에 다음 달 수강료 납부 점검 시 활용하세요. 종료/환불 회원도 한눈에 표시됩니다.
                </p>
              </div>

              {/* 조회 월 선택 */}
              <div style={{
                background: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 12,
                display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
              }}>
                <strong style={{ fontSize: 13, color: '#555' }}>조회 월:</strong>
                <select value={checkYear} onChange={(e) => setCheckYear(parseInt(e.target.value, 10))} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                  {[baseYear - 1, baseYear, baseYear + 1].map(y => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select value={checkMonth} onChange={(e) => setCheckMonth(parseInt(e.target.value, 10))} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
                <span style={{ fontSize: 12, color: '#888' }}>
                  ※ 기준: {baseYear}년 {baseMonth}월 출석부 (검색일 기준)
                </span>
              </div>

              {/* 강좌 다중 선택 */}
              <div style={{
                background: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13, color: '#555' }}>강좌 선택:</strong>
                  <button
                    onClick={() => setUnpaidCourseFilter(new Set())}
                    style={{
                      padding: '4px 10px', fontSize: 12, borderRadius: 6,
                      background: unpaidCourseFilter.size === 0 ? '#185FA5' : 'white',
                      color: unpaidCourseFilter.size === 0 ? 'white' : '#555',
                      border: '1px solid ' + (unpaidCourseFilter.size === 0 ? '#185FA5' : '#ddd'),
                      cursor: 'pointer', fontWeight: 500,
                    }}
                  >전체</button>
                  <span style={{ fontSize: 12, color: '#888' }}>또는 개별 선택:</span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {courses.filter(c => !c.is_free).map(c => (
                    <label
                      key={c.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                        background: unpaidCourseFilter.has(c.id) ? '#7B3FBF' : 'white',
                        color: unpaidCourseFilter.has(c.id) ? 'white' : '#333',
                        border: '1px solid ' + (unpaidCourseFilter.has(c.id) ? '#7B3FBF' : '#ddd'),
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={unpaidCourseFilter.has(c.id)}
                        onChange={() => toggleUnpaidCourseFilter(c.id)}
                        style={{ display: 'none' }}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* 요약 + 다운로드 */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12,
              }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ padding: '6px 12px', background: '#555', color: 'white', borderRadius: 6, fontSize: 13 }}>
                    전체 {totalCount}명
                  </span>
                  <span style={{ padding: '6px 12px', background: '#1D9E75', color: 'white', borderRadius: 6, fontSize: 13 }}>
                    ✅ 납부 {paidCount}명
                  </span>
                  <span style={{ padding: '6px 12px', background: '#A32D2D', color: 'white', borderRadius: 6, fontSize: 13 }}>
                    ❌ 미납 {unpaidOnlyCount}명
                  </span>
                  {endedCount > 0 && (
                    <span style={{ padding: '6px 12px', background: '#888', color: 'white', borderRadius: 6, fontSize: 13 }}>
                      🛑 종료 {endedCount}명
                    </span>
                  )}
                  {refundCount > 0 && (
                    <span style={{ padding: '6px 12px', background: '#BA7517', color: 'white', borderRadius: 6, fontSize: 13 }}>
                      💰 환불 {refundCount}명
                    </span>
                  )}
                </div>
                <button
                  onClick={downloadUnpaidExcel}
                  disabled={totalCount === 0}
                  style={{
                    padding: '8px 16px', background: totalCount === 0 ? '#ccc' : '#185FA5', color: 'white',
                    border: 'none', borderRadius: 6,
                    cursor: totalCount === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 500,
                  }}
                  title="전체/납부완료/미납 3개 시트로 다운로드"
                >
                  📥 엑셀 다운로드 (3시트)
                </button>
              </div>

              {/* 결과 */}
              {checkMonth === 1 && (
                <div style={{
                  padding: 16, background: '#FFF8E1', border: '1px solid #FFE082',
                  borderRadius: 8, fontSize: 13, color: '#5D4037',
                }}>
                  ℹ️ 1월은 OT 기간으로 수강료를 받지 않습니다. 다른 월을 선택해주세요.
                </div>
              )}

              {checkMonth !== 1 && totalCount === 0 && (
                <p style={{ color: '#888', fontSize: 13, padding: 30, textAlign: 'center' }}>
                  해당 조건에 맞는 회원이 없습니다.
                </p>
              )}

              {checkMonth !== 1 && totalCount > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {unpaidByCourse.map(({ course, rows }) => {
                    const cPaid = rows.filter(r => r.status === 'paid').length;
                    const cUnpaid = rows.filter(r => r.status === 'unpaid').length;
                    const cEnded = rows.filter(r => r.status === 'ended').length;
                    const cRefund = rows.filter(r => r.status === 'refund' || r.status === 'carryover').length;
                    return (
                      <div key={course.id} style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ background: '#fafafa', padding: '10px 14px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <div>
                            <Link href={`/courses/${course.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                              <strong style={{ fontSize: 14 }}>{course.name}</strong>
                            </Link>
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
                              {baseYear}.{baseMonth} 출석부 {rows.length}명
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, fontSize: 11 }}>
                            <span style={{ padding: '2px 8px', background: '#E8F5E9', color: '#1D9E75', borderRadius: 4 }}>납부 {cPaid}</span>
                            {cUnpaid > 0 && <span style={{ padding: '2px 8px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 4 }}>미납 {cUnpaid}</span>}
                            {cEnded > 0 && <span style={{ padding: '2px 8px', background: '#eee', color: '#666', borderRadius: 4 }}>종료 {cEnded}</span>}
                            {cRefund > 0 && <span style={{ padding: '2px 8px', background: '#FFF3E0', color: '#BA7517', borderRadius: 4 }}>환불 {cRefund}</span>}
                          </div>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #eee', background: '#fcfcfc' }}>
                              <th style={thStyle}>회원</th>
                              <th style={thStyle}>연락처</th>
                              <th style={thStyle}>상태</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(r => {
                              const statusInfo = (() => {
                                switch (r.status) {
                                  case 'paid': return { label: '✅ 납부완료', color: '#1D9E75', bg: '#E8F5E9' };
                                  case 'unpaid': return { label: '❌ 미납', color: '#A32D2D', bg: '#FCEBEB' };
                                  case 'ended': return { label: '🛑 수강종료', color: '#666', bg: '#eee' };
                                  case 'refund': return { label: '💰 환불', color: '#BA7517', bg: '#FFF3E0' };
                                  case 'carryover': return { label: '💰 환불(이월)', color: '#BA7517', bg: '#FFF3E0' };
                                }
                              })();
                              return (
                                <tr key={r.enrollment.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={tdStyle}>
                                    <Link href={`/members/${r.enrollment.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                                      <strong>{r.member.name}</strong>
                                    </Link>
                                  </td>
                                  <td style={tdStyle}>{r.member.phone || '-'}</td>
                                  <td style={tdStyle}>
                                    <span style={{
                                      padding: '2px 10px', background: statusInfo.bg, color: statusInfo.color,
                                      borderRadius: 4, fontSize: 12, fontWeight: 500,
                                    }}>{statusInfo.label}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{
                marginTop: 16, padding: 12,
                background: '#FFF8E1', border: '1px solid #FFE082',
                borderRadius: 6, fontSize: 12, color: '#5D4037',
              }}>
                <strong>💡 사용 안내</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
                  <li><strong>기준</strong>: 검색일이 속한 달의 출석부 (= 그 달 수강료를 낸 사람)</li>
                  <li><strong>조회 월</strong>: 납부 여부를 확인하고 싶은 달 (보통 다음 달)</li>
                  <li><strong>엑셀</strong>: 전체/납부완료/미납 3개 시트로 다운로드</li>
                  <li><strong>안내 문자</strong>: "미납" 상태인 회원에게만 보내세요 (종료/환불 제외)</li>
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
              <strong>{editingPayment.enrollment.members?.name}</strong>
              {editingPayment.course.use_levels && editingPayment.enrollment.course_level_id && (() => {
                const lv = courseLevels.find(l => l.id === editingPayment.enrollment.course_level_id);
                return lv ? (
                  <span style={{ marginLeft: 6, fontSize: 11, padding: '2px 8px', background: '#7B3FBF', color: 'white', borderRadius: 3 }}>
                    {lv.level_name}
                  </span>
                ) : null;
              })()}
              {' · '}{editingPayment.course.name} · {selectedYear}년 {editingPayment.month}월
            </p>

            {(() => {
              const member = editingPayment.enrollment.members!;
              const calc = (() => { const f = getCourseFees(editingPayment.course, editingPayment.enrollment); return calculateFee(
                f.fee_jung_gu, f.fee_other,
                member.is_jung_gu, member.is_discount_50, member.is_discount_100,
                editingPayment.course.is_free
              ); })();
              return (
                <div style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', padding: 12, borderRadius: 6, fontSize: 12, color: '#042C53', marginBottom: 12 }}>
                  💡 자동 계산: {calc.description}
                </div>
              );
            })()}

            <div style={{
              background: '#FFF8E1', border: '1px solid #FFE082',
              padding: 10, borderRadius: 6, fontSize: 11, color: '#5D4037', marginBottom: 16,
            }}>
              📌 <strong>중간 등록 안내</strong>: 해당 월 15일 이전 등록은 전액, 16일 이후 등록은 반액으로 직접 입력하세요.
              이월·무료수강권 등도 금액을 수기로 변경하면 됩니다.
            </div>

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

            {editingPayment.existing && (editingPayment.existing.status_type === 'refunded' || editingPayment.existing.status_type === 'carryover') && (
              <div style={{
                marginTop: 12, padding: 12,
                background: '#FFF4E5', border: '1px solid #F0C088',
                borderRadius: 6, fontSize: 12, color: '#7A4A0E',
              }}>
                {editingPayment.existing.status_type === 'refunded' ? (
                  <div>
                    <strong>↩️ 환불 처리됨</strong><br />
                    환불일: {editingPayment.existing.refund_date || '-'} ·
                    금액: {(editingPayment.existing.refund_amount ?? 0).toLocaleString()}원 ·
                    방식: {editingPayment.existing.refund_method === 'card_cancel' ? '카드취소' : editingPayment.existing.refund_method === 'transfer' ? '계좌이체' : '-'}
                  </div>
                ) : (
                  <div>
                    <strong>📦 이월 처리됨</strong><br />
                    이월일: {editingPayment.existing.carryover_date || '-'} ·
                    금액: {(editingPayment.existing.carryover_amount ?? 0).toLocaleString()}원
                  </div>
                )}
                <button
                  onClick={() => {
                    if (confirm('이 환불/이월 처리를 취소하시겠습니까?\n(결제완료 상태로 되돌아갑니다)')) {
                      clearRefundCarryover(editingPayment.existing!.id);
                      setPaymentModalOpen(false);
                    }
                  }}
                  style={{
                    marginTop: 8, padding: '6px 12px',
                    background: 'white', color: '#7A4A0E',
                    border: '1px solid #F0C088', borderRadius: 4,
                    cursor: 'pointer', fontSize: 12,
                  }}
                >환불/이월 취소 (등록 상태로 되돌리기)</button>
              </div>
            )}

            {editingPayment.existing && !(editingPayment.existing.status_type === 'refunded' || editingPayment.existing.status_type === 'carryover') && (
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
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>{isEditMode ? '✏️ 결제 정보 수정' : '💰 결제 처리'}</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
              <strong>{selectedMember.name}</strong>님 · {isEditMode ? '결제완료된 ' : '선택한 '}
              {(isEditMode ? getSelectedPaidItems().length : selectionItems.length)}건
              {isEditMode && <span style={{ color: '#E8820E', marginLeft: 8 }}>(미납 셀은 제외하고 결제된 것만 수정합니다)</span>}
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{isEditMode ? '수정할 항목 (금액 변경)' : '결제 항목 (금액 수기 수정 가능)'}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                {(isEditMode
                  ? getSelectedPaidItems().map(it => ({ courseId: it.courseId, courseName: it.courseName, month: it.month, amount: it.payment.amount, isAnnual: false }))
                  : selectionItems
                ).map((item, idx) => {
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
                background: isEditMode ? '#185FA5' : '#1D9E75', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 14, fontWeight: 500,
              }}>{isEditMode ? '✏️ 수정 저장' : '✓ 결제 처리'}</button>
              <button onClick={() => { setBulkPayModalOpen(false); setIsEditMode(false); }} style={secondaryBtnStyle}>취소</button>
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
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>🛑 수강 종료</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
              <strong>{endingEnrollment.members?.name}</strong> · {courses.find(c => c.id === endingEnrollment.course_id)?.name}
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>종료일</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
              <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                이 날짜까지는 출석 가능, 다음날부터 차단됩니다. 이전 결제·출석 기록은 그대로 유지됩니다.
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>종료 사유</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['self_request', 'staff_action'] as EndReason[]).map(r => (
                  <label key={r} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: 10, border: '1px solid ' + (endReason === r ? '#185FA5' : '#ddd'),
                    background: endReason === r ? '#E6F1FB' : 'white',
                    borderRadius: 6, cursor: 'pointer',
                  }}>
                    <input type="radio" checked={endReason === r} onChange={() => setEndReason(r)} />
                    <div>
                      <strong style={{ fontSize: 13 }}>
                        {r === 'self_request' ? '본인 요청' : '직원 조치'}
                      </strong>
                      <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>
                        {r === 'self_request' ? '회원이 직접 수강 중단을 요청한 경우' : '정원 초과 정리, 단기강좌 종료, 장기 미납 등'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>메모 (선택)</label>
              <input value={endMemo} onChange={(e) => setEndMemo(e.target.value)} style={inputStyle} placeholder="예: 이사, 건강 문제, 대기자 정리 등" />
            </div>

            <div style={{
              background: '#FFF8E1', border: '1px solid #FFE082',
              padding: 10, borderRadius: 6, fontSize: 11, color: '#5D4037', marginBottom: 16,
            }}>
              💡 <strong>안내</strong>: 수강료 환불·이월은 별도 절차입니다. 셀을 선택해 [↩️ 환불]·[📦 이월] 버튼으로 처리하세요.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleEndSchedule} style={{
                flex: 1, padding: '12px',
                background: '#A32D2D', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 14, fontWeight: 500,
              }}>🛑 수강 종료 처리</button>
              <button onClick={() => { setEndScheduleModalOpen(false); setEndingEnrollment(null); }} style={secondaryBtnStyle}>취소</button>
            </div>
          </div>
        </div>
      )}
      {/* ============================================ */}
      {/* 재등록 모달                                      */}
      {/* ============================================ */}
      {/* ============================================ */}
      {/* 환불 모달 (여러 달 일괄)                          */}
      {/* ============================================ */}
      {refundModalOpen && selectedMember && (() => {
        const items = getSelectedPaidItems();
        const total = items.reduce((s, it) => s + (refundAmounts[it.key] ?? it.payment.amount), 0);
        return (
          <div style={modalOverlayStyle}>
            <div style={{ ...modalContentStyle, maxWidth: 600 }}>
              <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>↩️ 환불 처리</h2>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
                <strong>{selectedMember.name}</strong>님 · 선택한 {items.length}건
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>환불 항목 (금액 직접 입력)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                  {items.map(it => (
                    <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: '#fafafa', borderRadius: 4 }}>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: 13 }}>{it.courseName}</strong>
                        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>{it.month}월 (결제 {it.payment.amount.toLocaleString()}원)</span>
                      </div>
                      <input
                        type="text"
                        value={(refundAmounts[it.key] ?? it.payment.amount).toLocaleString()}
                        onChange={(e) => {
                          const n = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                          setRefundAmounts(prev => ({ ...prev, [it.key]: n }));
                        }}
                        style={{ ...inputStyle, width: 110, textAlign: 'right' }}
                      />
                      <span style={{ fontSize: 12, color: '#888' }}>원</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 10, background: '#FFF4E5', border: '1px solid #F0C088', borderRadius: 6, marginBottom: 16, fontSize: 14, textAlign: 'right' }}>
                <strong>총 환불 금액: <span style={{ color: '#E8820E', fontSize: 18 }}>{total.toLocaleString()}원</span></strong>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>환불일</label>
                  <input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>환불 방식</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setRefundMethod('card_cancel')} style={{
                      flex: 1, padding: '8px', fontSize: 13,
                      background: refundMethod === 'card_cancel' ? '#185FA5' : 'white',
                      color: refundMethod === 'card_cancel' ? 'white' : '#666',
                      border: '1px solid ' + (refundMethod === 'card_cancel' ? '#185FA5' : '#ddd'),
                      borderRadius: 6, cursor: 'pointer',
                    }}>카드취소</button>
                    <button onClick={() => setRefundMethod('transfer')} style={{
                      flex: 1, padding: '8px', fontSize: 13,
                      background: refundMethod === 'transfer' ? '#185FA5' : 'white',
                      color: refundMethod === 'transfer' ? 'white' : '#666',
                      border: '1px solid ' + (refundMethod === 'transfer' ? '#185FA5' : '#ddd'),
                      borderRadius: 6, cursor: 'pointer',
                    }}>계좌이체</button>
                  </div>
                </div>
              </div>

              <div style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', padding: 10, borderRadius: 6, fontSize: 11, color: '#042C53', marginBottom: 16 }}>
                💡 환불 처리하면 그 달은 "환불"로 표시되고(결제기록은 유지), <strong>그 다음 달부터 자동으로 미등록</strong> 상태가 됩니다.
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleRefundSave} style={{
                  flex: 1, padding: '12px', background: '#E8820E', color: 'white',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}>↩️ {items.length}건 환불 처리</button>
                <button onClick={() => setRefundModalOpen(false)} style={secondaryBtnStyle}>취소</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ============================================ */}
      {/* 이월 모달 (여러 달 일괄)                          */}
      {/* ============================================ */}
      {carryoverModalOpen && selectedMember && (() => {
        const items = getSelectedPaidItems();
        const total = items.reduce((s, it) => s + (carryoverAmounts[it.key] ?? it.payment.amount), 0);
        return (
          <div style={modalOverlayStyle}>
            <div style={{ ...modalContentStyle, maxWidth: 600 }}>
              <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>📦 이월 처리</h2>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
                <strong>{selectedMember.name}</strong>님 · 선택한 {items.length}건
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>이월 항목 (금액 직접 입력)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                  {items.map(it => (
                    <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: '#fafafa', borderRadius: 4 }}>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: 13 }}>{it.courseName}</strong>
                        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>{it.month}월 (결제 {it.payment.amount.toLocaleString()}원)</span>
                      </div>
                      <input
                        type="text"
                        value={(carryoverAmounts[it.key] ?? it.payment.amount).toLocaleString()}
                        onChange={(e) => {
                          const n = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                          setCarryoverAmounts(prev => ({ ...prev, [it.key]: n }));
                        }}
                        style={{ ...inputStyle, width: 110, textAlign: 'right' }}
                      />
                      <span style={{ fontSize: 12, color: '#888' }}>원</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 10, background: '#F3EBFB', border: '1px solid #C9A8E6', borderRadius: 6, marginBottom: 16, fontSize: 14, textAlign: 'right' }}>
                <strong>총 이월 금액: <span style={{ color: '#7B3FBF', fontSize: 18 }}>{total.toLocaleString()}원</span></strong>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>이월일</label>
                <input type="date" value={carryoverDate} onChange={(e) => setCarryoverDate(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', padding: 10, borderRadius: 6, fontSize: 11, color: '#042C53', marginBottom: 16 }}>
                💡 이월 처리하면 그 달은 "이월"로 표시되고, <strong>그 다음 달부터 자동으로 미등록</strong> 됩니다.
                실제 이월금 합산은 다음 달 결제 시 금액을 수정하고 메모(비고)에 적어주세요.
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCarryoverSave} style={{
                  flex: 1, padding: '12px', background: '#7B3FBF', color: 'white',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}>📦 {items.length}건 이월 처리</button>
                <button onClick={() => setCarryoverModalOpen(false)} style={secondaryBtnStyle}>취소</button>
              </div>
            </div>
          </div>
        );
      })()}

      {reEnrollModalOpen && reEnrollEnrollment && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>↻ 수강 재개</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
              <strong>{reEnrollEnrollment.members?.name}</strong> · {courses.find(c => c.id === reEnrollEnrollment.course_id)?.name}
            </p>

            <div style={{
              background: '#E6F1FB', border: '1px solid #B5D4F4',
              padding: 12, borderRadius: 6, fontSize: 12, color: '#042C53', marginBottom: 16,
            }}>
              이 회원은 수강 종료된 상태입니다. 재개하면 다시 수강중 상태가 되며,
              <strong> 이전 출석·결제 기록은 그대로 유지</strong>됩니다.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>재개일 (다시 다니기 시작하는 날)</label>
              <input type="date" value={reEnrollDate} onChange={(e) => setReEnrollDate(e.target.value)} style={inputStyle} />
              <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                이 날짜부터 다시 출석체크와 수납이 가능해집니다. 수강료는 해당 월 셀을 클릭하여 별도로 결제 처리하세요.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleReEnroll} style={{
                flex: 1, padding: '12px',
                background: '#1D9E75', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 14, fontWeight: 500,
              }}>↻ 수강 재개</button>
              <button onClick={() => { setReEnrollModalOpen(false); setReEnrollEnrollment(null); }} style={secondaryBtnStyle}>취소</button>
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
