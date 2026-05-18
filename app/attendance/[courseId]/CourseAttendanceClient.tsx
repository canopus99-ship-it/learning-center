'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { canCheckAttendance, calculateMonthlyAttendance } from '@/lib/attendance';

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

export default function CourseAttendanceClient({
  course,
  instructors,
  initialDates,
  initialEnrollments,
  initialAttendance,
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
  // ended는 ended_at 이후라도 출석부에 표시는 함 (이전 출석 기록 보기 위해)
  const allEnrollments = enrollments.filter(e =>
    e.status === 'active' || e.status === 'paused' || e.status === 'ended'
  );

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

  async function reloadAttendance() {
    const { data } = await supabase
      .from('attendance')
      .select('*, course_dates!inner(course_id)')
      .eq('course_dates.course_id', course.id);
    setAttendance(data || []);
  }

  // 출석 토글
  async function toggleAttendance(enrollment: Enrollment, courseDate: CourseDate) {
    const memberName = enrollment.members?.name || '회원';

    // 차단 조건 체크
    const check = canCheckAttendance(enrollment, courseDate.class_date, courseDate.is_cancelled);
    if (!check.canCheck) {
      alert(`${memberName}님은 출석체크할 수 없습니다.\n사유: ${check.reason}`);
      return;
    }

    const existing = getAttendance(courseDate.id, enrollment.id);

    if (existing) {
      // 이미 출석체크 되어있음 → 결석으로 토글 (삭제)
      const { error } = await supabase.from('attendance').delete().eq('id', existing.id);
      if (error) alert('변경 실패: ' + error.message);
      else reloadAttendance();
    } else {
      // 출석체크
      const { error } = await supabase.from('attendance').insert([{
        course_date_id: courseDate.id,
        enrollment_id: enrollment.id,
        is_present: true,
        checked_by: staffName,
      }]);
      if (error) alert('변경 실패: ' + error.message);
      else reloadAttendance();
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
  const operationMonths = course.operation_months
    ? course.operation_months.split(',').filter(Boolean).map(Number)
    : [];
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // PDF 출력
  function handlePrintPdf() {
    window.print();
  }

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
            const isOperating = operationMonths.includes(m);
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

        <button
          onClick={handlePrintPdf}
          style={{
            marginLeft: 'auto',
            padding: '8px 16px', background: '#1D9E75', color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer',
            fontSize: 13, fontWeight: 500,
          }}
        >
          📄 결재 출석부 출력
        </button>
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
                · 출석 {perDateCount[selectedDate.id] || 0}명 / 수강생 {allEnrollments.filter(e => e.status === 'active' || e.status === 'paused').length}명
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
            <p style={{ color: '#888', fontSize: 13, padding: 20, textAlign: 'center' }}>
              {searchQuery ? '검색 결과가 없습니다.' : '수강생이 없습니다.'}
            </p>
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
                const check = canCheckAttendance(e, selectedDate.class_date, selectedDate.is_cancelled);
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
                      {!check.canCheck ? '⛔' : (isPresent ? '✓' : '○')}
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
            💡 카드 클릭으로 출석 ✓ ↔ 결석 ○ 전환됩니다. 환불·종료된 회원은 출석체크 불가능합니다.
          </div>
        </div>
      )}

      {!selectedDate && monthDates.length > 0 && (
        <div className="no-print" style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 13, color: '#042C53', textAlign: 'center' }}>
          📋 위에서 출석체크할 수업 날짜를 선택하세요.
        </div>
      )}

      {/* 출력용 결재 출석부 (화면에서는 안 보이고 인쇄/PDF에서만 표시) */}
      <PrintableAttendance
        course={course}
        instructorName={instructorName}
        year={selectedYear}
        month={selectedMonth}
        dates={monthDates}
        enrollments={allEnrollments}
        attendance={attendance}
      />

      {/* 화면용 월 요약 */}
      <div className="no-print" style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>
          📊 {selectedYear}년 {selectedMonth}월 실적
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <SummaryBox label="수업 횟수" value={`${monthDates.filter(d => !d.is_cancelled).length}회`} color="#185FA5" />
          <SummaryBox label="휴강" value={`${monthDates.filter(d => d.is_cancelled).length}회`} color="#888" />
          <SummaryBox label="총 출석 인원" value={`${totalAttendance}명`} color="#1D9E75" />
          <SummaryBox label="평균 출석률" value={`${monthDates.filter(d => !d.is_cancelled).length > 0 && allEnrollments.filter(e => e.status === 'active').length > 0
            ? Math.round((totalAttendance / (monthDates.filter(d => !d.is_cancelled).length * allEnrollments.filter(e => e.status === 'active').length)) * 100)
            : 0}%`} color="#7B3FBF" />
        </div>
      </div>
    </div>
  );
}

// ============================================
// 인쇄용 결재 출석부 (본인이 주신 양식대로)
// ============================================
function PrintableAttendance({
  course,
  instructorName,
  year,
  month,
  dates,
  enrollments,
  attendance,
}: {
  course: Course;
  instructorName: string;
  year: number;
  month: number;
  dates: CourseDate[];
  enrollments: Enrollment[];
  attendance: Attendance[];
}) {
  // 인쇄용: 활성 수강생만 (이미 종료된 회원도 그 달에 출석 기록이 있으면 포함)
  const printableEnrollments = enrollments
    .filter(e => {
      if (e.status === 'active' || e.status === 'paused') return true;
      // ended 이지만 이 달에 출석 기록이 있는 경우 포함
      const dateIds = dates.map(d => d.id);
      return attendance.some(a =>
        a.enrollment_id === e.id && dateIds.includes(a.course_date_id)
      );
    })
    .sort((a, b) => (a.members?.name || '').localeCompare(b.members?.name || ''));

  // 양식: 10일치씩, 20명씩 한 페이지
  const datesPerPage = 10;
  const studentsPerPage = 15;

  // 페이지 분할
  const datePages = chunk(dates, datesPerPage);
  const totalPages = Math.max(1, Math.ceil(printableEnrollments.length / studentsPerPage));

  return (
    <div className="print-only" style={{ display: 'none' }}>
      {datePages.length === 0 ? (
        // 수업 날짜가 없어도 빈 양식 1장 출력
        <PrintPage
          course={course}
          instructorName={instructorName}
          year={year}
          month={month}
          dates={[]}
          enrollments={printableEnrollments.slice(0, studentsPerPage)}
          attendance={attendance}
          pageNum={1}
          totalPages={1}
        />
      ) : (
        datePages.flatMap((datePage, dpIdx) =>
          Array.from({ length: totalPages }).map((_, spIdx) => {
            const students = printableEnrollments.slice(spIdx * studentsPerPage, (spIdx + 1) * studentsPerPage);
            return (
              <PrintPage
                key={`${dpIdx}-${spIdx}`}
                course={course}
                instructorName={instructorName}
                year={year}
                month={month}
                dates={datePage}
                enrollments={students}
                attendance={attendance}
                pageNum={dpIdx * totalPages + spIdx + 1}
                totalPages={datePages.length * totalPages}
              />
            );
          })
        )
      )}
    </div>
  );
}

function PrintPage({
  course,
  instructorName,
  year,
  month,
  dates,
  enrollments,
  attendance,
  pageNum,
  totalPages,
}: {
  course: Course;
  instructorName: string;
  year: number;
  month: number;
  dates: CourseDate[];
  enrollments: Enrollment[];
  attendance: Attendance[];
  pageNum: number;
  totalPages: number;
}) {
  // 10칸으로 맞추기 (빈 칸 채우기)
  const dateColumns = [...dates];
  while (dateColumns.length < 10) {
    dateColumns.push(null as any);
  }

  // 15명으로 맞추기 (빈 행 채우기)
  const studentRows = [...enrollments];
  while (studentRows.length < 15) {
    studentRows.push(null as any);
  }

  function getAttendanceMark(enrollmentId: number, courseDateId: number): string {
    const a = attendance.find(at => at.enrollment_id === enrollmentId && at.course_date_id === courseDateId);
    return a ? '○' : '';
  }

  function getDailyTotal(courseDateId: number): number {
    return attendance.filter(a => a.course_date_id === courseDateId && a.is_present).length;
  }

  return (
    <div className="print-page" style={{
      pageBreakAfter: 'always',
      padding: '8px 24px',
      fontFamily: 'sans-serif',
      color: '#000',
      background: 'white',
    }}>
      {/* 상단 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ flex: 1 }}></div>
        <div style={{ flex: 2, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, margin: 0, fontWeight: 'bold' }}>
            {year}년 중림종합사회복지관
          </h1>
          <h1 style={{ fontSize: 18, margin: '4px 0 0', fontWeight: 'bold' }}>
            늘품학습센터 출석부
          </h1>
        </div>
        {/* 결재란 */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <tbody>
              <tr>
                <td rowSpan={2} style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', width: 20, writingMode: 'vertical-rl', verticalAlign: 'middle' }}>결재</td>
                <td style={{ border: '1px solid black', padding: '4px 12px', textAlign: 'center', width: 50 }}>담 당</td>
                <td style={{ border: '1px solid black', padding: '4px 12px', textAlign: 'center', width: 50 }}>과 장</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid black', padding: '4px 12px', height: 30 }}></td>
                <td style={{ border: '1px solid black', padding: '4px 12px', height: 30, fontSize: 10, textAlign: 'center' }}>전결</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 강좌명 / 강사명 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 12 }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid black', padding: '6px 10px', background: '#e0e0e0', width: 80, textAlign: 'center' }}>강좌명</td>
            <td style={{ border: '1px solid black', padding: '6px 10px', width: '40%' }}>{course.name}</td>
            <td style={{ border: '1px solid black', padding: '6px 10px', background: '#e0e0e0', width: 80, textAlign: 'center' }}>강사명</td>
            <td style={{ border: '1px solid black', padding: '6px 10px' }}>{instructorName}</td>
          </tr>
        </tbody>
      </table>

      {/* 출석부 본체 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid black', padding: 4, width: 40, background: '#e0e0e0' }}>연번</th>
            <th style={{ border: '1px solid black', padding: 4, width: 90, background: '#e0e0e0' }}>성명</th>
            {dateColumns.map((d, idx) => (
              <th key={idx} style={{ border: '1px solid black', padding: 4, background: '#e0e0e0', minWidth: 40 }}>
                {idx + 1}
                <div style={{ fontSize: 9, marginTop: 2 }}>
                  {d ? `${parseInt(d.class_date.substring(5, 7))}/${parseInt(d.class_date.substring(8, 10))}` : '/'}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {studentRows.map((e, idx) => (
            <tr key={idx}>
              <td style={{ border: '1px solid black', padding: 4, textAlign: 'center', height: 24 }}>{idx + 1}</td>
              <td style={{ border: '1px solid black', padding: 4 }}>{e?.members?.name || ''}</td>
              {dateColumns.map((d, didx) => (
                <td key={didx} style={{ border: '1px solid black', padding: 4, textAlign: 'center' }}>
                  {e && d ? getAttendanceMark(e.id, d.id) : ''}
                </td>
              ))}
            </tr>
          ))}
          {/* 일계 */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid black', padding: 4, textAlign: 'center', background: '#e0e0e0', fontWeight: 'bold' }}>일계</td>
            {dateColumns.map((d, didx) => (
              <td key={didx} style={{ border: '1px solid black', padding: 4, textAlign: 'center', background: '#f8f8f8' }}>
                {d ? getDailyTotal(d.id) : ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* 하단 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, fontSize: 11 }}>
        <span>계속( {pageNum} / {totalPages} )</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#333' }}>
          <span style={{ fontSize: 10 }}>중구 구립·대한불교조계종사회복지재단 운영</span>
          <strong style={{ fontSize: 13, color: '#d97506' }}>중림종합사회복지관</strong>
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          html, body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
      `}</style>
    </div>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
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
