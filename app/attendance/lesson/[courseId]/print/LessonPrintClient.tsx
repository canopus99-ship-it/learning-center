'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatTime12 } from '@/lib/time';

type Course = { id: number; name: string };
type Enrollment = {
  id: number;
  member_id: number;
  status: string;
  members: { id: number; name: string } | null;
};
type FixedSchedule = {
  id: number;
  enrollment_id: number;
  member_id: number;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  effective_from: string;
  effective_until: string | null;
};
type AttendanceRecord = {
  fixed_schedule_id: number;
  attend_date: string;
  is_attended: boolean;
};

const DAYS = ['월', '화', '수', '목', '금'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 해당 월의 평일(월~금) 날짜 전체 목록 (다른 강좌 출석부와 동일하게 실제 날짜 기준으로 컬럼을 만듦)
function getWeekdaysOfMonth(year: number, month: number): Date[] {
  const result: Date[] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month - 1, day);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) result.push(d);
  }
  return result;
}

export default function LessonPrintClient({
  course,
  instructorName,
  enrollments,
}: {
  course: Course;
  instructorName: string;
  enrollments: Enrollment[];
}) {
  const supabase = createClient();
  const today = new Date();

  const [printMode, setPrintMode] = useState<'attendance' | 'schedule'>('attendance');
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [fixedSchedules, setFixedSchedules] = useState<FixedSchedule[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const monthEnd = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [{ data: fixed }, { data: att }] = await Promise.all([
      supabase
        .from('lesson_fixed_schedules')
        .select('*')
        .eq('course_id', course.id)
        .lte('effective_from', monthEnd)
        .order('day_of_week').order('start_time'),
      supabase
        .from('lesson_attendance')
        .select('fixed_schedule_id, attend_date, is_attended')
        .eq('course_id', course.id)
        .gte('attend_date', monthStart)
        .lte('attend_date', monthEnd),
    ]);

    setFixedSchedules(fixed || []);
    setAttendance(att || []);
    setLoading(false);
  }, [course.id, selectedYear, selectedMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // 다른 강좌 출석부와 동일하게, 컬럼은 "주" 단위가 아니라 그 달의 평일(월~금) 실제 날짜 단위.
  // 레슨은 매일 열리고 수강생마다 다니는 요일(주 2~3회 등)이 다르기 때문에, 주 단위로 뭉치면
  // 어느 요일에 왔는지 정보가 사라짐 — 날짜별 컬럼으로 바꿔서 그 정보를 그대로 보여줌.
  const monthWeekdays = getWeekdaysOfMonth(selectedYear, selectedMonth);

  // 출석 여부: 이 회원의 (이 강좌) 고정 스케줄 중 하나라도 해당 날짜에 출석 기록이 있으면 출석.
  // (이번 주만 요일이 바뀐 경우도 실제 출석 체크는 그 바뀐 날짜로 기록되므로 day_of_week를
  // 다시 따질 필요 없이 attend_date 일치 여부만 보면 됨)
  function getAttendanceMark(memberId: number, dateStr: string): string {
    const memberFixedIds = fixedSchedules.filter(f => f.member_id === memberId).map(f => f.id);
    if (memberFixedIds.length === 0) return '';
    const found = attendance.some(a =>
      memberFixedIds.includes(a.fixed_schedule_id) &&
      a.attend_date === dateStr &&
      a.is_attended
    );
    return found ? '○' : '';
  }

  // 출석부 데이터 준비
  const sortedEnrollments = [...enrollments]
    .sort((a, b) => (a.members?.name || '').localeCompare(b.members?.name || '', 'ko'));

  const studentsPerPage = 15;
  const datesPerPage = 10;
  const studentPages = Math.max(1, Math.ceil(sortedEnrollments.length / studentsPerPage));
  const datePages = Math.max(1, Math.ceil(monthWeekdays.length / datesPerPage));
  const totalPages = studentPages * datePages;

  // 주간 스케줄표 데이터: 요일×시간 정렬
  // (출석부 모드와 달리 이건 "지금 벽에 붙여두는 현재 스케줄표"이므로, 영구 변경으로
  // 이미 대체된 예전 스케줄(effective_until이 오늘 이전)은 제외하고 현재 유효한 것만 표시)
  const todayStr = ymd(today);
  const scheduleByDay: Record<number, FixedSchedule[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  fixedSchedules.forEach(f => {
    if (f.effective_until && f.effective_until < todayStr) return;
    if (f.day_of_week >= 0 && f.day_of_week <= 4) {
      scheduleByDay[f.day_of_week].push(f);
    }
  });
  Object.keys(scheduleByDay).forEach(k => {
    scheduleByDay[Number(k)].sort((a, b) => a.start_time.localeCompare(b.start_time));
  });

  const memberNameMap = new Map(enrollments.map(e => [e.member_id, e.members?.name || '']));
  const maxRows = Math.max(...Object.values(scheduleByDay).map(arr => arr.length), 1);

  const printStyle = `
    @media print {
      @page { size: A4 portrait; margin: 8mm 10mm; }
      html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
      .print-only { display: block !important; }
      .print-page { page-break-after: always; }
      .print-page:last-child { page-break-after: avoid; }
    }
  `;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
      <style>{printStyle}</style>

      {/* 컨트롤 영역 */}
      <div className="no-print">
        <Link href={`/attendance/lesson/${course.id}`} style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>
          ← {course.name} 메뉴로
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '12px 0 4px' }}>📄 출력</h1>

        {/* 출력 종류 선택 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, marginTop: 12 }}>
          {(['attendance', 'schedule'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setPrintMode(mode)}
              style={{
                padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                background: printMode === mode ? '#7B3FBF' : 'white',
                color: printMode === mode ? 'white' : '#333',
                border: `1px solid ${printMode === mode ? '#7B3FBF' : '#ddd'}`,
                fontWeight: printMode === mode ? 600 : 400,
              }}
            >
              {mode === 'attendance' ? '📊 출석부 (복지관 제출용)' : '📋 주간 스케줄표 (레슨실 부착용)'}
            </button>
          ))}
        </div>

        {/* 연/월 선택 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setSelectedYear(y => y - 1)} style={navBtn}>◀</button>
          <strong style={{ minWidth: 56, textAlign: 'center' }}>{selectedYear}년</strong>
          <button onClick={() => setSelectedYear(y => y + 1)} style={navBtn}>▶</button>
          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <button key={m} onClick={() => setSelectedMonth(m)} style={{
                padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 13,
                background: selectedMonth === m ? '#185FA5' : 'white',
                color: selectedMonth === m ? 'white' : '#555',
                border: `1px solid ${selectedMonth === m ? '#185FA5' : '#ddd'}`,
              }}>{m}월</button>
            ))}
          </div>
        </div>

        <button
          onClick={() => window.print()}
          disabled={loading}
          style={{
            padding: '10px 28px', background: loading ? '#ccc' : '#1D9E75',
            color: 'white', border: 'none', borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600,
            marginBottom: 20,
          }}
        >
          {loading ? '불러오는 중...' : '🖨️ 인쇄 / PDF 저장'}
        </button>

        <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
          {printMode === 'attendance'
            ? `총 ${totalPages}페이지 · 수강생 ${sortedEnrollments.length}명 · ${monthWeekdays.length}일`
            : `A4 1페이지 · 요일별 레슨 시간표`}
        </div>
      </div>

      {/* ===== 출석부 인쇄 영역 ===== */}
      {printMode === 'attendance' && (
        <div className="print-only" style={{ display: 'none' }}>
          {loading ? null : (
            Array.from({ length: datePages }).flatMap((_, dpIdx) =>
              Array.from({ length: studentPages }).map((_, sIdx) => {
                const dateSlice = monthWeekdays.slice(dpIdx * datesPerPage, (dpIdx + 1) * datesPerPage);
                const studentSlice = sortedEnrollments.slice(sIdx * studentsPerPage, (sIdx + 1) * studentsPerPage);
                const pageNum = dpIdx * studentPages + sIdx + 1;

                // 10칸 맞추기
                const dateCols = [...dateSlice];
                while (dateCols.length < 10) dateCols.push(null as any);
                // 15명 맞추기
                const studentRows = [...studentSlice];
                while (studentRows.length < 15) studentRows.push(null as any);

                return (
                  <div key={`${dpIdx}-${sIdx}`} className="print-page" style={{
                    pageBreakAfter: 'always', padding: '8px 24px',
                    fontFamily: 'sans-serif', color: '#000', background: 'white',
                  }}>
                    {/* 헤더 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div style={{ flex: 1 }}></div>
                      <div style={{ flex: 2, textAlign: 'center' }}>
                        <h1 style={{ fontSize: 18, margin: 0, fontWeight: 'bold' }}>{selectedYear}년 중림종합사회복지관</h1>
                        <h1 style={{ fontSize: 18, margin: '4px 0 0', fontWeight: 'bold' }}>늘품학습센터 출석부</h1>
                      </div>
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

                    {/* 강좌/강사 */}
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

                    {/* 출석 표 */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          <th style={{ border: '1px solid black', padding: 4, width: 40, background: '#e0e0e0' }}>연번</th>
                          <th style={{ border: '1px solid black', padding: 4, width: 90, background: '#e0e0e0' }}>성명</th>
                          {dateCols.map((d, idx) => (
                            <th key={idx} style={{ border: '1px solid black', padding: 4, background: '#e0e0e0', minWidth: 40, textAlign: 'center' }}>
                              {idx + dpIdx * datesPerPage + 1}
                              <div style={{ fontSize: 9, marginTop: 2 }}>
                                {d ? `${d.getMonth() + 1}/${d.getDate()}` : '/'}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {studentRows.map((e, rIdx) => (
                          <tr key={rIdx}>
                            <td style={{ border: '1px solid black', padding: 4, textAlign: 'center', height: 24 }}>{rIdx + sIdx * studentsPerPage + 1}</td>
                            <td style={{ border: '1px solid black', padding: 4 }}>{e?.members?.name || ''}</td>
                            {dateCols.map((d, cIdx) => (
                              <td key={cIdx} style={{ border: '1px solid black', padding: 4, textAlign: 'center' }}>
                                {e && d ? getAttendanceMark(e.member_id, ymd(d)) : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {/* 일계 */}
                        <tr>
                          <td colSpan={2} style={{ border: '1px solid black', padding: 4, textAlign: 'center', background: '#e0e0e0', fontWeight: 'bold' }}>일계</td>
                          {dateCols.map((d, cIdx) => {
                            const count = d
                              ? studentSlice.filter(e => getAttendanceMark(e.member_id, ymd(d)) === '○').length
                              : '';
                            return (
                              <td key={cIdx} style={{ border: '1px solid black', padding: 4, textAlign: 'center', background: '#f8f8f8' }}>
                                {count}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, fontSize: 11 }}>
                      <span>계속( {pageNum} / {totalPages} )</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10 }}>중구 구립·대한불교조계종사회복지재단 운영</span>
                        <strong style={{ fontSize: 13, color: '#d97706' }}>중림종합사회복지관</strong>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>
      )}

      {/* ===== 주간 스케줄표 인쇄 영역 ===== */}
      {printMode === 'schedule' && (
        <div className="print-only" style={{ display: 'none' }}>
          <div className="print-page" style={{
            padding: '12px 20px', fontFamily: 'sans-serif', color: '#000', background: 'white',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 'bold' }}>{course.name} 레슨 스케줄표</h2>
              <p style={{ fontSize: 12, margin: '4px 0 0', color: '#444' }}>강사: {instructorName} · {selectedYear}년 {selectedMonth}월 기준</p>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {DAYS.map(day => (
                    <th key={day} style={{ border: '1px solid black', padding: '6px 4px', background: '#e0e0e0', textAlign: 'center', width: '20%' }}>
                      {day}요일
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxRows }).map((_, rowIdx) => (
                  <tr key={rowIdx}>
                    {DAYS.map((_, dayIdx) => {
                      const f = scheduleByDay[dayIdx][rowIdx];
                      return (
                        <td key={dayIdx} style={{ border: '1px solid black', padding: '5px 6px', verticalAlign: 'top', height: 36 }}>
                          {f ? (
                            <>
                              <div style={{ fontWeight: 600, fontSize: 12 }}>{memberNameMap.get(f.member_id) || ''}</div>
                              <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
                                {formatTime12(f.start_time)} · {f.duration_minutes}분
                              </div>
                            </>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 12, fontSize: 10, color: '#888', textAlign: 'right' }}>
              출력일: {today.getFullYear()}.{today.getMonth() + 1}.{today.getDate()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 5, border: '1px solid #ddd',
  background: 'white', cursor: 'pointer', fontSize: 14, color: '#555',
};
