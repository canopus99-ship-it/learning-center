'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { canCheckAttendance, calculateMonthlyAttendance, filterEnrollmentsForMonthlyPrint } from '@/lib/attendance';
import { fetchAllRows } from '@/lib/fetchAll';
import { parseOperationMonths } from '@/lib/payments';

type Course = {
  id: number;
  category: string;
  name: string;
  instructor_id: number | null;
  classroom: string | null;
  operation_months: string | null;
};

type Instructor = { id: number; name: string };

type CourseDate = {
  id: number;
  course_id: number;
  class_date: string;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
  is_makeup: boolean;
  memo: string | null;
};

type Member = {
  id: number;
  name: string;
  phone: string | null;
  birth_date: string | null;
  region_type: string | null;
};

type Enrollment = {
  id: number;
  member_id: number;
  course_id: number;
  status: string;
  enrolled_at: string;
  ended_at: string | null;
  end_reason: string | null;
  end_date: string | null;
  end_from_year: number | null;
  end_from_month: number | null;
  refund_date: string | null;
  members: Member | null;
};

type Attendance = {
  id: number;
  course_date_id: number;
  enrollment_id: number;
  is_present: boolean;
  checked_at: string;
  checked_by: string | null;
};

const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5', '성숙한시민': '#7B3FBF', '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517', '기타': '#666',
};

type Payment = {
  id: number;
  enrollment_id: number;
  payment_year: number;
  payment_month: number;
  is_paid: boolean;
  refund_date: string | null;
};

export default function CourseAttendanceClient({
  course,
  instructors,
  initialDates,
  initialEnrollments,
  initialAttendance,
  initialPayments,
  initialDate,
  initialYear,
  initialMonth,
  staffRole,
  staffName,
}: {
  course: Course;
  instructors: Instructor[];
  initialDates: CourseDate[];
  initialEnrollments: Enrollment[];
  initialAttendance: Attendance[];
  initialPayments: Payment[];
  initialDate: string | null;
  initialYear: number;
  initialMonth: number;
  staffRole: string;
  staffName: string;
}) {
  const supabase = createClient();
  const [dates, setDates] = useState<CourseDate[]>(initialDates);
  const [enrollments] = useState<Enrollment[]>(initialEnrollments);
  const [attendance, setAttendance] = useState<Attendance[]>(initialAttendance);
  const [payments] = useState<Payment[]>(initialPayments);

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedDateId, setSelectedDateId] = useState<number | null>(() => {
    if (initialDate) {
      const d = initialDates.find(dd => dd.class_date === initialDate);
      return d?.id || null;
    }
    return null;
  });

  const [searchQuery, setSearchQuery] = useState('');

  const instructorMap = new Map(instructors.map(i => [i.id, i.name]));
  const instructorName = course.instructor_id ? instructorMap.get(course.instructor_id) || '-' : '-';

  // 선택된 월의 수업 날짜
  const monthPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const monthDates = dates.filter(d => d.class_date.startsWith(monthPrefix))
    .sort((a, b) => {
      const c = a.class_date.localeCompare(b.class_date);
      if (c !== 0) return c;
      return a.start_time.localeCompare(b.start_time);
    });

  // 선택된 수업 날짜
  const selectedDate = selectedDateId ? dates.find(d => d.id === selectedDateId) : null;

  // 검색 필터 적용된 수강생 명단
  // 표시 규칙:
  //   1. 선택된 월에 결제 완료(is_paid=true)된 회원만 표시
  //   2. 환불된 결제도 환불일에 따라 그 월까지는 표시
  //      - 환불일 1~15일: 그 월 표시 (16일 이후 수업은 출석 차단)
  //      - 환불일 16~말일: 그 월 표시 (다음달부터 제외)
  //   3. 종료된 회원(ended)은 종료일이 속한 월까지만 표시
  //      - 종료일 다음날부터 출석 차단
  //   4. paused(일시중지)는 결제 있으면 표시
  const allEnrollments = filterEnrollmentsForMonthlyPrint(enrollments, payments, selectedYear, selectedMonth);

  const filteredEnrollments = allEnrollments
    .filter(e => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const name = (e.members?.name || '').toLowerCase();
      const phone = (e.members?.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    })
    .sort((a, b) => (a.members?.name || '').localeCompare(b.members?.name || ''));

  function getAttendance(courseDateId: number, enrollmentId: number): Attendance | null {
    return attendance.find(a =>
      a.course_date_id === courseDateId && a.enrollment_id === enrollmentId
    ) || null;
  }

  // 특정 수업일이 속한 월의 결제 환불일 찾기
  function getRefundDateForClass(enrollmentId: number, classDate: string): string | null {
    const year = parseInt(classDate.substring(0, 4), 10);
    const month = parseInt(classDate.substring(5, 7), 10);
    const payment = payments.find(p =>
      p.enrollment_id === enrollmentId &&
      p.payment_year === year &&
      p.payment_month === month &&
      p.is_paid
    );
    return payment?.refund_date || null;
  }

  // 서버 기준으로 출석 목록을 다시 불러옴.
  // 인터넷이 불안정해서 조회가 실패했을 때는 화면의 기존 출석 표시를 그대로 두고(비우지 않고) false만 반환.
  // (예전에는 조회 실패 시 빈 목록으로 덮어써서, 저장은 됐는데 화면에서만 출석이 싹 사라져 보이는 문제가 있었음)
  async function reloadAttendance(): Promise<boolean> {
    // 강좌 하나의 누적 출석이 1000행을 넘을 수 있어 끝까지 페이지로 가져옴
    const { data, error } = await fetchAllRows<any>((from, to) =>
      supabase
        .from('attendance')
        .select('*, course_dates!inner(course_id)')
        .eq('course_dates.course_id', course.id)
        .range(from, to)
    );
    if (error) {
      console.error('출석 목록 새로고침 실패:', error);
      return false;
    }
    setAttendance(data || []);
    return true;
  }

  // 저장 중인 카드 (같은 시간에 한 번에 하나만 처리 - 느린 연결에서 연타해도 출석↔결석이 되돌려지지 않게)
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // 출석 토글
  async function toggleAttendance(enrollment: Enrollment, courseDate: CourseDate) {
    if (savingKey) return; // 이전 저장이 끝나기 전의 추가 클릭은 무시

    const memberName = enrollment.members?.name || '회원';

    // 차단 조건 체크 (환불일 포함)
    const refundDate = getRefundDateForClass(enrollment.id, courseDate.class_date);
    const check = canCheckAttendance(enrollment, courseDate.class_date, courseDate.is_cancelled, refundDate);
    if (!check.canCheck) {
      alert(`${memberName}님은 출석체크할 수 없습니다.\n사유: ${check.reason}`);
      return;
    }

    const existing = getAttendance(courseDate.id, enrollment.id);
    setSavingKey(`${courseDate.id}-${enrollment.id}`);

    try {
      if (existing) {
        // 이미 출석체크 되어있음 → 결석으로 토글 (삭제)
        const { error } = await supabase.from('attendance').delete().eq('id', existing.id);
        if (error) {
          alert(`${memberName}님 출석 취소가 저장되지 않았습니다.\n인터넷 연결을 확인하고 다시 눌러주세요.\n(${error.message})`);
          await reloadAttendance();
          return;
        }
        setAttendance(prev => prev.filter(a => a.id !== existing.id));
      } else {
        // 출석체크 (저장된 행을 돌려받아 화면에 바로 반영)
        const { data, error } = await supabase.from('attendance').insert([{
          course_date_id: courseDate.id,
          enrollment_id: enrollment.id,
          is_present: true,
          checked_by: staffName,
        }]).select().single();
        if (error) {
          alert(`${memberName}님 출석이 저장되지 않았습니다.\n인터넷 연결을 확인하고 다시 눌러주세요.\n(${error.message})`);
          await reloadAttendance();
          return;
        }
        if (data) setAttendance(prev => [...prev, data as Attendance]);
      }
      // 서버 기준으로 한 번 더 맞춰봄 (실패해도 방금 반영한 화면은 유지됨)
      reloadAttendance();
    } catch (e: any) {
      alert(`${memberName}님 출석 저장 중 오류가 발생했습니다.\n인터넷 연결을 확인하고 다시 눌러주세요.\n(${e?.message || e})`);
    } finally {
      setSavingKey(null);
    }
  }

  // 월별 통계
  const { perDateCount, totalAttendance } = calculateMonthlyAttendance(
    dates,
    attendance,
    selectedYear,
    selectedMonth
  );

  // 월 운영 여부
  // - 운영월이 비어 있는 강좌(일회성/비정기 강좌 등)는 parseOperationMonths가 "전체 월"로 처리 (다른 화면과 동일 기준)
  //   (예전에는 빈 값이면 12개월 전부 비활성화되어, 이런 강좌는 다른 달로 이동 자체가 불가능했음)
  // - 운영월에 없는 달이라도 수업 날짜가 실제로 등록돼 있으면 항상 선택 가능하게 함
  const operationMonths = parseOperationMonths(course.operation_months);
  const monthsWithDates = new Set(
    dates
      .filter(d => d.class_date.startsWith(`${selectedYear}-`))
      .map(d => parseInt(d.class_date.substring(5, 7), 10))
  );
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <div style={{ maxWidth: 1200, margin: '40px auto', padding: 20 }}>
      <div className="no-print">
        <Link href="/attendance" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>
          ← 강좌 목록으로
        </Link>
      </div>

      {/* 강좌 정보 헤더 */}
      <div style={{ marginTop: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          ✅ {course.name}
          <span style={badgeStyle(CATEGORY_COLORS[course.category] || '#666')}>{course.category}</span>
        </h1>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
          강사: <strong>{instructorName}</strong>
          {course.classroom && ` · 강의실: ${course.classroom}`}
        </p>
      </div>

      {/* 연/월 선택 */}
      <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setSelectedYear(selectedYear - 1)} style={smallBtnStyle}>◀</button>
          <strong style={{ fontSize: 18, minWidth: 70, textAlign: 'center' }}>{selectedYear}년</strong>
          <button onClick={() => setSelectedYear(selectedYear + 1)} style={smallBtnStyle}>▶</button>
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {months.map(m => {
            const isOperating = operationMonths.includes(m) || monthsWithDates.has(m);
            return (
              <button
                key={m}
                onClick={() => { setSelectedMonth(m); setSelectedDateId(null); }}
                disabled={!isOperating}
                style={{
                  padding: '8px 14px',
                  background: selectedMonth === m ? '#185FA5' : 'white',
                  color: selectedMonth === m ? 'white' : (isOperating ? '#666' : '#ccc'),
                  border: '1px solid ' + (selectedMonth === m ? '#185FA5' : '#ddd'),
                  borderRadius: 6,
                  cursor: isOperating ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: selectedMonth === m ? 500 : 'normal',
                  opacity: isOperating ? 1 : 0.5,
                }}
              >{m}월</button>
            );
          })}
        </div>

      </div>

      {/* 수업 날짜 선택 (출석체크용) */}
      {monthDates.length === 0 ? (
        <div className="no-print" style={{ background: 'white', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888', marginBottom: 16 }}>
          <p>{selectedMonth}월에는 수업이 없습니다.</p>
        </div>
      ) : (
        <div className="no-print" style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>
            {selectedMonth}월 수업 ({monthDates.length}회)
          </h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {monthDates.map(d => {
              const count = perDateCount[d.id] || 0;
              const isSelected = selectedDateId === d.id;
              const dateLabel = d.class_date.substring(5).replace('-', '/');
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDateId(d.id)}
                  style={{
                    padding: 10,
                    background: isSelected ? '#185FA5' : (d.is_cancelled ? '#f0f0f0' : 'white'),
                    color: isSelected ? 'white' : (d.is_cancelled ? '#aaa' : '#333'),
                    border: '1px solid ' + (isSelected ? '#185FA5' : '#ddd'),
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    minWidth: 80,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{dateLabel}</div>
                  <div style={{ fontSize: 10, marginTop: 2, opacity: 0.8 }}>
                    {d.is_cancelled ? '휴강' : d.is_makeup ? `보강 (${count}명)` : `${count}명`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 검색 + 출석체크 */}
      {selectedDate && (
        <div className="no-print" style={{ background: 'white', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>
                {selectedDate.class_date} 출석체크
                {selectedDate.is_cancelled && <span style={{ ...badgeStyle('#888'), marginLeft: 6 }}>휴강</span>}
                {selectedDate.is_makeup && <span style={{ ...badgeStyle('#1D9E75'), marginLeft: 6 }}>보강</span>}
              </h3>
              <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                🕐 {selectedDate.start_time.substring(0, 5)} ~ {selectedDate.end_time.substring(0, 5)}
                · 출석 {perDateCount[selectedDate.id] || 0}명 / 수강생 {allEnrollments.length}명
              </p>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 이름 또는 연락처 검색"
              style={{ ...inputStyle, width: 240 }}
            />
          </div>

          {selectedDate.is_cancelled ? (
            <p style={{ color: '#888', fontSize: 14, padding: 20, textAlign: 'center', background: '#fafafa', borderRadius: 6 }}>
              ⛔ 휴강된 수업입니다. 출석체크 불가.
            </p>
          ) : filteredEnrollments.length === 0 ? (
            <div style={{ color: '#888', fontSize: 13, padding: 20, textAlign: 'center' }}>
              {searchQuery ? (
                '검색 결과가 없습니다.'
              ) : (
                <>
                  수강생이 없습니다.
                  <div style={{ marginTop: 8, fontSize: 12, color: '#A32D2D' }}>
                    💡 결제 완료된 회원만 출석부에 표시됩니다.<br />
                    수강신청만 하고 결제하지 않은 회원은 <Link href="/payments" style={{ color: '#185FA5' }}>수납관리</Link>에서 결제 처리(무료/감면은 0원)해주세요.
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 8,
            }}>
              {filteredEnrollments.map((e, idx) => {
                const member = e.members;
                if (!member) return null;
                const att = getAttendance(selectedDate.id, e.id);
                const refundDate = getRefundDateForClass(e.id, selectedDate.class_date);
                const check = canCheckAttendance(e, selectedDate.class_date, selectedDate.is_cancelled, refundDate);
                const isPresent = !!att;

                return (
                  <div
                    key={e.id}
                    onClick={() => check.canCheck && toggleAttendance(e, selectedDate)}
                    style={{
                      padding: 12,
                      background: !check.canCheck ? '#fafafa' : (isPresent ? '#1D9E75' : 'white'),
                      color: !check.canCheck ? '#aaa' : (isPresent ? 'white' : '#333'),
                      border: '2px solid ' + (!check.canCheck ? '#ddd' : (isPresent ? '#1D9E75' : '#ddd')),
                      borderRadius: 8,
                      cursor: check.canCheck ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.15s',
                      opacity: savingKey === `${selectedDate.id}-${e.id}` ? 0.5 : 1,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: 22, fontWeight: 700 }}>
                        {idx + 1}. {member.name}
                      </strong>
                      <div style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>
                        {member.phone ? ('전화 끝 4자리: ' + member.phone.replace(/[^0-9]/g, '').slice(-4)) : '-'}
                      </div>
                      {!check.canCheck && (
                        <div style={{ fontSize: 11, marginTop: 2, color: '#A32D2D' }}>
                          ⛔ {check.reason}
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontSize: 34,
                      width: 44, height: 44,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {savingKey === `${selectedDate.id}-${e.id}` ? '…' : (!check.canCheck ? '⛔' : (isPresent ? '✓' : '○'))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{
            marginTop: 12, padding: 10,
            background: '#FFF8E1', border: '1px solid #FFE082',
            borderRadius: 6, fontSize: 11, color: '#5D4037',
          }}>
            💡 카드 클릭으로 출석 ✓ ↔ 결석 ○ 전환됩니다. 종료·환불(15일 이전)된 회원은 출석체크가 차단됩니다.
          </div>
        </div>
      )}

      {!selectedDate && monthDates.length > 0 && (
        <div className="no-print" style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 13, color: '#042C53', textAlign: 'center' }}>
          📋 위에서 출석체크할 수업 날짜를 선택하세요.
        </div>
      )}

      {/* 화면용 월 요약 */}
      <div className="no-print" style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>
          📊 {selectedYear}년 {selectedMonth}월 실적
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <SummaryBox label="수업 횟수" value={`${monthDates.filter(d => !d.is_cancelled).length}회`} color="#185FA5" />
          <SummaryBox label="휴강" value={`${monthDates.filter(d => d.is_cancelled).length}회`} color="#888" />
          <SummaryBox label="총 출석 인원" value={`${totalAttendance}명`} color="#1D9E75" />
          <SummaryBox label="평균 출석률" value={`${monthDates.filter(d => !d.is_cancelled).length > 0 && allEnrollments.length > 0
            ? Math.round((totalAttendance / (monthDates.filter(d => !d.is_cancelled).length * allEnrollments.length)) * 100)
            : 0}%`} color="#7B3FBF" />
        </div>
      </div>
    </div>
  );
}

function SummaryBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fafafa', borderRadius: 8, padding: 12 }}>
      <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 500, margin: '4px 0 0', color }}>{value}</p>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box',
};
const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: 'white', border: '1px solid #ddd',
  borderRadius: 4, cursor: 'pointer', fontSize: 12,
};
const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px',
  background: color + '22', color: color,
  borderRadius: 4, fontSize: 11,
});
