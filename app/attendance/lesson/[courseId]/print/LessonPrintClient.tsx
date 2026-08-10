'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

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
};
type AttendanceRecord = {
  fixed_schedule_id: number;
  attend_date: string;
  is_attended: boolean;
};

const DAYS = ['월', '화', '수', '목', '금'];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

// 12시간제 표시 (예: "14:30" → "오후 2시 30분"). 이 스케줄표는 레슨실에 붙여 강사·수강생이
// 보는 인쇄물이라 직원용 24시간제 화면과 달리 12시간제로 표시함.
function formatTime12(t: string): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isNaN(h)) return '';
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${period} ${h12}시` : `${period} ${h12}시 ${m}분`;
}

// 해당 월의 월요일 목록
function getMondaysOfMonth(year: number, month: number): Date[] {
  const result: Date[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month - 1) {
    result.push(new Date(d));
    d.setDate(d.getDate() + 7);
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

  const mondays = getMondaysOfMonth(selectedYear, selectedMonth);

  // 수강생별 레슨 횟수 계산 (주간 스케줄 기준)
  // 각 수강생이 해당 월에 레슨이 있는 주차 목록
  function getLessonWeeksForMember(memberId: number): Date[] {
    const memberSchedules = fixedSchedules.filter(f => f.member_id === memberId);
    const weeks: Date[] = [];
    mondays.forEach(mon => {
      const weekStart = ymd(mon);
      const hasLesson = memberSchedules.some(f => f.effective_from <= weekStart);
      if (hasLesson) weeks.push(mon);
    });
    return weeks;
  }

  // 출석 여부: fixedScheduleId + 해당 주 날짜 범위 내 attend_date 있으면 출석
  function getAttendanceMark(memberId: number, monday: Date): string {
    const memberSchedules = fixedSchedules.filter(f => f.member_id === memberId);
    const weekStart = ymd(monday);
    const weekEnd = ymd(addDays(monday, 6));
    for (const f of memberSchedules) {
      if (f.effective_from > weekStart) continue;
      const found = attendance.find(a =>
        a.fixed_schedule_id === f.id &&
        a.attend_date >= weekStart &&
        a.attend_date <= weekEnd &&
        a.is_attended
      );
      if (found) return '○';
    }
    return '';
  }

  // 주차 라벨
  function weekLabel(monday: Date, idx: number): string {
    return `${idx + 1}주\n${monday.getMonth() + 1}/${monday.getDate()}`;
  }

  // 출석부 데이터 준비
  const sortedEnrollments = [...enrollments]
    .sort((a, b) => (a.members?.name || '').localeCompare(b.members?.name || '', 'ko'));

  const studentsPerPage = 15;
  const weeksPerPage = 10;
  const studentPages = Math.max(1, Math.ceil(sortedEnrollments.length / studentsPerPage));
  const weekPages = Math.max(1, Math.ceil(mondays.length / weeksPerPage));
  const totalPages = studentPages * weekPages;

  // 주간 스케줄표 데이터: 요일×시간 정렬
  const scheduleByDay: Record<number, FixedSchedule[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  fixedSchedules.forEach(f => {
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
            ? `총 ${totalPages}페이지 · 수강생 ${sortedEnrollments.length}명 · ${mondays.length}주`
            : `A4 1페이지 · 요일별 레슨 시간표`}
        </div>
      </div>

      {/* ===== 출석부 인쇄 영역 ===== */}
      {printMode === 'attendance' && (
        <div className="print-only" style={{ display: 'none' }}>
          {loading ? null : (
            Array.from({ length: weekPages }).flatMap((_, wIdx) =>
              Array.from({ length: studentPages }).map((_, sIdx) => {
                const weekSlice = mondays.slice(wIdx * weeksPerPage, (wIdx + 1) * weeksPerPage);
                const studentSlice = sortedEnrollments.slice(sIdx * studentsPerPage, (sIdx + 1) * studentsPerPage);
                const pageNum = wIdx * studentPages + sIdx + 1;

                // 10칸 맞추기
                const weekCols = [...weekSlice];
                while (weekCols.length < 10) weekCols.push(null as any);
                // 15명 맞추기
                const studentRows = [...studentSlice];
                while (studentRows.length < 15) studentRows.push(null as any);

                return (
                  <div key={`${wIdx}-${sIdx}`} className="print-page" style={{
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
                          {weekCols.map((mon, idx) => (
                            <th key={idx} style={{ border: '1px solid black', padding: 4, background: '#e0e0e0', minWidth: 40, textAlign: 'center' }}>
                              {idx + wIdx * weeksPerPage + 1}주
                              <div style={{ fontSize: 9, marginTop: 2 }}>
                                {mon ? `${mon.getMonth() + 1}/${mon.getDate()}` : '/'}
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
                            {weekCols.map((mon, cIdx) => (
                              <td key={cIdx} style={{ border: '1px solid black', padding: 4, textAlign: 'center' }}>
                                {e && mon ? getAttendanceMark(e.member_id, mon) : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {/* 주계 */}
                        <tr>
                          <td colSpan={2} style={{ border: '1px solid black', padding: 4, textAlign: 'center', background: '#e0e0e0', fontWeight: 'bold' }}>주계</td>
                          {weekCols.map((mon, cIdx) => {
                            const count = mon
                              ? studentSlice.filter(e => getAttendanceMark(e.member_id, mon) === '○').length
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
