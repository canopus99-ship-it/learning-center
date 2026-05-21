'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

type Course = {
  id: number;
  category: string;
  name: string;
  instructor_id: number | null;
  is_active: boolean;
  operation_months: string | null;
};

type Instructor = {
  id: number;
  name: string;
  phone: string | null;
  pay_type: string;
  pay_amount: number;
  class_hours: number;
  bonus_note: string | null;
  bank_account: string | null;
  is_active: boolean;
};

type CourseDate = {
  id: number;
  course_id: number;
  class_date: string;
  start_time: string | null;
  end_time: string | null;
  is_cancelled: boolean;
  is_makeup: boolean;
};

const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5',
  '평생교육': '#1D9E75',
  '체육': '#A35B18',
  '음악': '#7B3FBF',
  '미술': '#BA7517',
  '기타': '#666',
};

const DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

function parseOperationMonths(s: string | null): number[] {
  if (!s) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return s.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n));
}

function formatDateKR(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const yy = String(d.getFullYear()).slice(2);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DAY_KR[d.getDay()];
  return `${yy}.${m}.${day}.(${dow})`;
}

function trimTime(t: string | null): string {
  if (!t) return '';
  return t.substring(0, 5);
}

// 원천징수 계산 (10원 단위 절사)
function calcTax(amount: number) {
  const incomeTax = Math.floor(amount * 0.03 / 10) * 10;
  const localTax = Math.floor(incomeTax * 0.1 / 10) * 10;
  return { incomeTax, localTax, totalTax: incomeTax + localTax, netPay: amount - incomeTax - localTax };
}

export default function PayrollClient() {
  const supabase = createClient();
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);

  const [courses, setCourses] = useState<Course[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [courseDates, setCourseDates] = useState<CourseDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadAll();
    setSelectedCourseIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedMonth]);

  async function loadAll() {
    setLoading(true);
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const [cRes, iRes, dRes] = await Promise.all([
      supabase.from('courses').select('*').eq('is_active', true).order('category').order('name'),
      supabase.from('instructors').select('*').order('name'),
      supabase.from('course_dates').select('*').gte('class_date', monthStart).lt('class_date', monthEnd).order('class_date'),
    ]);

    setCourses(cRes.data || []);
    setInstructors(iRes.data || []);
    setCourseDates(dRes.data || []);
    setLoading(false);
  }

  function calcCoursePay(course: Course) {
    const instructor = instructors.find(i => i.id === course.instructor_id) || null;
    const allDates = courseDates.filter(d => d.course_id === course.id);
    const activeDates = allDates.filter(d => !d.is_cancelled);
    const sessions = activeDates.length;
    const cancelledCount = allDates.length - activeDates.length;

    if (!instructor || sessions === 0) {
      return { instructor, sessions, cancelledCount, totalHours: 0, amount: 0, activeDates };
    }

    if (instructor.pay_type === 'hourly') {
      const totalHours = instructor.class_hours * sessions;
      const amount = Math.round(instructor.pay_amount * totalHours);
      return { instructor, sessions, cancelledCount, totalHours, amount, activeDates };
    } else {
      const amount = instructor.pay_amount * sessions;
      return { instructor, sessions, cancelledCount, totalHours: 0, amount, activeDates };
    }
  }

  const targetCourses = courses.filter(c => {
    if (!c.instructor_id) return false;
    const operationMonths = parseOperationMonths(c.operation_months);
    if (!operationMonths.includes(selectedMonth)) return false;
    const hasDates = courseDates.some(d => d.course_id === c.id);
    return hasDates;
  });

  const totalAmount = targetCourses.reduce((sum, c) => sum + calcCoursePay(c).amount, 0);
  const selectedCourses = targetCourses.filter(c => selectedCourseIds.has(c.id));
  const selectedAmount = selectedCourses.reduce((sum, c) => sum + calcCoursePay(c).amount, 0);

  function toggleCourse(id: number) {
    const next = new Set(selectedCourseIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCourseIds(next);
  }

  function toggleAll() {
    if (selectedCourseIds.size === targetCourses.length) {
      setSelectedCourseIds(new Set());
    } else {
      setSelectedCourseIds(new Set(targetCourses.map(c => c.id)));
    }
  }

  function downloadExcel() {
    if (selectedCourses.length === 0) {
      alert('다운로드할 강좌를 1개 이상 선택해주세요.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // === 총괄 시트 ===
    const summaryRows: (string | number)[][] = [];
    summaryRows.push([`강사료 지급 내역(${selectedMonth}월)`]);
    summaryRows.push([]);
    summaryRows.push(['연번', '프로그램명', '강사명', '단가(시/일급)', '시간(시/일)', '인센티브', '강사료(원)', '계좌번호', '비고']);

    selectedCourses.forEach((course, idx) => {
      const { instructor, sessions, totalHours, amount } = calcCoursePay(course);
      if (!instructor) return;
      const unit = instructor.pay_type === 'hourly' ? totalHours : sessions;
      const note = instructor.pay_type === 'hourly'
        ? `1회 ${instructor.class_hours}시간`
        : '일급 기준';
      summaryRows.push([
        idx + 1,
        course.name,
        instructor.name,
        instructor.pay_amount,
        unit,
        0,
        amount,
        instructor.bank_account || '',
        note,
      ]);
    });

    const totalSum = selectedCourses.reduce((s, c) => s + calcCoursePay(c).amount, 0);
    summaryRows.push(['합계', '', '', '', '', '', totalSum, '-', '']);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [
      { wch: 6 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 28 },
    ];
    wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
    XLSX.utils.book_append_sheet(wb, wsSummary, '총괄');

    // === 강좌별 시트 ===
    const usedNames = new Set<string>();
    selectedCourses.forEach(course => {
      const { instructor, sessions, totalHours, amount, activeDates } = calcCoursePay(course);
      if (!instructor) return;

      const rows: (string | number)[][] = [];
      rows.push(['강사료 지급 조서']);
      rows.push(['(단위: 원)']);
      rows.push([]);
      rows.push(['강사명', '강의주제\n(사업명)', '강의일자\n(강의시간)', '강사료\n(A)', '원천징수 공제액', '', '', '실지급액\n(A-B)', '입금계좌', '확인']);
      rows.push(['', '', '', '', '계(B)', '소득세\n(A*3%)', '지방소득세\n(소득세의 10%)', '', '', '']);

      let dateText = '';
      if (activeDates.length > 0) {
        const first = activeDates[0];
        const last = activeDates[activeDates.length - 1];
        const dowFirst = DAY_KR[new Date(first.class_date + 'T00:00:00').getDay()];
        const startEnd = `${formatDateKR(first.class_date)}~${formatDateKR(last.class_date)}`;
        const timeText = (first.start_time && first.end_time)
          ? `${trimTime(first.start_time)}~${trimTime(first.end_time)}`
          : '';
        const summary = instructor.pay_type === 'hourly'
          ? `(주 1회 ${dowFirst},\n총 ${totalHours}시간)`
          : `(총 ${sessions}회)`;
        dateText = [startEnd, timeText, summary].filter(Boolean).join('\n');
      }

      const { incomeTax, localTax, totalTax, netPay } = calcTax(amount);

      rows.push([
        instructor.name,
        course.name,
        dateText,
        amount,
        totalTax,
        incomeTax,
        localTax,
        netPay,
        instructor.bank_account || '',
        '',
      ]);

      const noteText = instructor.pay_type === 'hourly'
        ? `※ ${instructor.name}: 1시간당 ${instructor.pay_amount.toLocaleString()}원`
        : `※ ${instructor.name}: 일급 ${instructor.pay_amount.toLocaleString()}원`;
      rows.push([noteText]);
      rows.push(['중림종합사회복지관']);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 10 }, { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 10 },
        { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 8 },
      ];
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
        { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
        { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
        { s: { r: 3, c: 2 }, e: { r: 4, c: 2 } },
        { s: { r: 3, c: 3 }, e: { r: 4, c: 3 } },
        { s: { r: 3, c: 4 }, e: { r: 3, c: 6 } },
        { s: { r: 3, c: 7 }, e: { r: 4, c: 7 } },
        { s: { r: 3, c: 8 }, e: { r: 4, c: 8 } },
        { s: { r: 3, c: 9 }, e: { r: 4, c: 9 } },
        { s: { r: 6, c: 0 }, e: { r: 6, c: 2 } },
        { s: { r: 7, c: 0 }, e: { r: 7, c: 9 } },
      ];

      // 시트명 (특수문자 제거, 31자 제한, 중복 방지)
      let baseName = course.name.replace(/[\\/?*[\]:]/g, '').substring(0, 31);
      let sheetName = baseName;
      let counter = 2;
      while (usedNames.has(sheetName)) {
        sheetName = `${baseName.substring(0, 28)}(${counter})`;
        counter++;
      }
      usedNames.add(sheetName);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const filename = `강사료_지급조서_${selectedYear}년${selectedMonth}월.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  const allSelected = targetCourses.length > 0 && selectedCourseIds.size === targetCourses.length;

  return (
    <div style={{ maxWidth: 1100, margin: '40px auto', padding: 20 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>💵 강사비</h1>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 13 }}>
        출석부 등록된 수업 날짜를 기준으로 자동 계산됩니다. (휴강 제외)
      </p>

      <div style={{
        background: 'white', borderRadius: 12, padding: 16, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setSelectedYear(selectedYear - 1)} style={smallBtnStyle}>◀</button>
          <strong style={{ fontSize: 16, minWidth: 80, textAlign: 'center' }}>{selectedYear}년</strong>
          <button onClick={() => setSelectedYear(selectedYear + 1)} style={smallBtnStyle}>▶</button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              style={{
                padding: '6px 12px',
                border: selectedMonth === m ? '2px solid #185FA5' : '1px solid #ddd',
                background: selectedMonth === m ? '#E6F1FB' : 'white',
                color: selectedMonth === m ? '#185FA5' : '#666',
                fontWeight: selectedMonth === m ? 600 : 400,
                borderRadius: 6, cursor: 'pointer', fontSize: 13,
              }}
            >
              {m}월
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>불러오는 중...</p>
      ) : targetCourses.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 12, padding: 40, textAlign: 'center',
          color: '#888', fontSize: 14,
        }}>
          {selectedYear}년 {selectedMonth}월에 운영한 강좌가 없습니다.
          <br />
          <span style={{ fontSize: 12, color: '#aaa' }}>
            (수업 날짜가 등록되고 강사가 배정된 강좌만 표시됩니다)
          </span>
        </div>
      ) : (
        <>
          <div style={{
            background: 'white', borderRadius: 12, padding: 12, marginBottom: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <strong>전체 {allSelected ? '해제' : '선택'}</strong>
            </label>
            <div style={{ fontSize: 13, color: '#666' }}>
              선택: <strong style={{ color: '#185FA5' }}>{selectedCourseIds.size}개</strong>
              {selectedCourseIds.size > 0 && (
                <> · 합계 <strong style={{ color: '#185FA5' }}>{selectedAmount.toLocaleString()}원</strong></>
              )}
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={downloadExcel}
              disabled={selectedCourseIds.size === 0}
              style={{
                padding: '8px 16px', fontSize: 13, borderRadius: 6,
                background: selectedCourseIds.size === 0 ? '#ccc' : '#1D9E75',
                color: 'white', border: 'none',
                cursor: selectedCourseIds.size === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
              title="선택한 강좌의 강사료 지급 조서를 엑셀로 다운로드합니다"
            >
              📥 엑셀 다운로드
            </button>
          </div>

          <div style={{
            background: '#185FA5', color: 'white',
            borderRadius: 12, padding: 20, marginBottom: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{selectedYear}년 {selectedMonth}월 전체 강사비</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
                {totalAmount.toLocaleString()}원
              </div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.9, textAlign: 'right' }}>
              총 {targetCourses.length}개 강좌
            </div>
          </div>

          {targetCourses.map(course => {
            const { instructor, sessions, cancelledCount, totalHours, amount } = calcCoursePay(course);
            const isChecked = selectedCourseIds.has(course.id);
            const { netPay } = calcTax(amount);
            return (
              <div
                key={course.id}
                onClick={() => toggleCourse(course.id)}
                style={{
                  background: isChecked ? '#F0F7FF' : 'white',
                  border: isChecked ? '2px solid #185FA5' : '2px solid transparent',
                  borderRadius: 12, padding: 20, marginBottom: 12,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 200, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCourse(course.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ marginTop: 4, transform: 'scale(1.2)', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 4,
                          background: CATEGORY_COLORS[course.category] || '#666',
                          color: 'white',
                        }}>{course.category}</span>
                        <Link
                          href={`/courses/${course.id}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: '#185FA5', textDecoration: 'none' }}
                        >
                          <strong style={{ fontSize: 15 }}>{course.name}</strong>
                        </Link>
                      </div>
                      {instructor ? (
                        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.8 }}>
                          <div>
                            <Link
                              href={`/instructors/${instructor.id}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: '#185FA5', textDecoration: 'none' }}
                            >
                              <strong>{instructor.name}</strong>
                            </Link>
                            {' · '}
                            {instructor.pay_type === 'hourly' ? '시급' : '일급'}{' '}
                            <strong>{instructor.pay_amount.toLocaleString()}원</strong>
                            {instructor.pay_type === 'hourly' && (
                              <> × {instructor.class_hours}시간/회</>
                            )}
                          </div>
                          <div style={{ color: '#888', fontSize: 12 }}>
                            수업 {sessions}회
                            {cancelledCount > 0 && (
                              <span style={{ marginLeft: 6, color: '#A32D2D' }}>
                                (휴강 {cancelledCount}회 제외)
                              </span>
                            )}
                            {instructor.pay_type === 'hourly' && (
                              <span style={{ marginLeft: 6 }}>· 총 {totalHours}시간</span>
                            )}
                            {!instructor.bank_account && (
                              <span style={{ marginLeft: 6, color: '#A32D2D' }}>
                                ⚠ 계좌 미입력
                              </span>
                            )}
                          </div>
                          {instructor.bonus_note && (
                            <div style={{ color: '#BA7517', fontSize: 12, marginTop: 2 }}>
                              ⚠ 추가급여: {instructor.bonus_note}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: '#A32D2D' }}>강사 미배정</div>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: 140 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>강사료</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#185FA5' }}>
                      {amount.toLocaleString()}원
                    </div>
                    {instructor && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                        실지급 {netPay.toLocaleString()}원
                        <br />
                        <span style={{ fontSize: 10 }}>(원천징수 3.3% 공제)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{
            marginTop: 16, padding: 12,
            background: '#FFF8E1', border: '1px solid #FFE082',
            borderRadius: 8, fontSize: 12, color: '#5D4037', lineHeight: 1.6,
          }}>
            <strong>💡 안내</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>강좌를 선택(체크)한 후 엑셀 다운로드를 누르면 강사료 지급 조서가 생성됩니다</li>
              <li>엑셀에는 <strong>총괄 시트 + 강좌별 시트</strong>가 자동 생성됩니다</li>
              <li>시급: 단가 × 1회당 시간 × 수업 횟수 / 일급: 단가 × 수업 횟수</li>
              <li>휴강된 수업은 제외, 보강은 포함됩니다</li>
              <li>원천징수 3.3% 자동 공제 (10원 단위 절사)</li>
              <li>인센티브, 반주강사 등 일부 정보는 엑셀에서 수기로 보정해주세요</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px', border: '1px solid #ddd', background: 'white',
  borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
