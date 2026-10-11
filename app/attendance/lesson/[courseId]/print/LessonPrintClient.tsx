'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatTime12 } from '@/lib/time';
import type { ApprovalLine } from '@/lib/approvalLine';
import { buildEndedMap, buildMonthlyLessons, isEndedOn, lessonKey, monthBounds, mondaysOverlappingMonth, type MonthOverride } from '@/lib/lessonMonth';

type Course = { id: number; name: string };
type Enrollment = {
  id: number;
  member_id: number;
  status: string;
  end_date: string | null;
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
  fixed_schedule_id: number | null;
  member_id: number | null;
  attend_date: string;
  is_attended: boolean;
};

const DAYS = ['월', '화', '수', '목', '금'];

// 한 줄에 들어가는 레슨일 칸 수 (주 3회 × 4주 = 최대 12회).
// 혹시 12회를 넘는 회원이 있으면 같은 회원 칸이 한 줄 더 늘어남.
const CELLS_PER_LINE = 12;
// 한 페이지(A4 가로)에 들어가는 줄 수 (회원 1명 = 1줄, 12회 초과 회원은 2줄)
const LINES_PER_PAGE = 14;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDate(dateStr: string): string {
  return `${parseInt(dateStr.substring(5, 7), 10)}/${parseInt(dateStr.substring(8, 10), 10)}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type PrintRow = {
  memberId: number;
  name: string;
  cells: { date: string; attended: boolean }[];
  attendedCount: number;
  scheduledCount: number;
};

export default function LessonPrintClient({
  course,
  instructorName,
  enrollments,
  approvalLine,
}: {
  course: Course;
  instructorName: string;
  enrollments: Enrollment[];
  approvalLine: ApprovalLine;
}) {
  const supabase = createClient();
  const today = new Date();

  const [printMode, setPrintMode] = useState<'attendance' | 'schedule'>('attendance');
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [fixedSchedules, setFixedSchedules] = useState<FixedSchedule[]>([]);
  const [overrides, setOverrides] = useState<MonthOverride[]>([]);
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { start: monthStart, end: monthEnd } = monthBounds(selectedYear, selectedMonth);
    const weeks = mondaysOverlappingMonth(selectedYear, selectedMonth);

    const [{ data: fixed }, { data: ovr }, { data: closed }, { data: att }] = await Promise.all([
      supabase
        .from('lesson_fixed_schedules')
        .select('*')
        .eq('course_id', course.id)
        .lte('effective_from', monthEnd)
        .order('day_of_week').order('start_time'),
      supabase
        .from('lesson_schedules')
        .select('fixed_schedule_id, week_start, schedule_date, start_time, is_cancelled')
        .eq('course_id', course.id)
        .gte('week_start', weeks[0])
        .lte('week_start', weeks[weeks.length - 1]),
      supabase
        .from('lesson_closed_days')
        .select('closed_date')
        .eq('course_id', course.id)
        .gte('closed_date', monthStart)
        .lte('closed_date', monthEnd),
      supabase
        .from('lesson_attendance')
        .select('fixed_schedule_id, member_id, attend_date, is_attended')
        .eq('course_id', course.id)
        .gte('attend_date', monthStart)
        .lte('attend_date', monthEnd),
    ]);

    setFixedSchedules(fixed || []);
    setOverrides(ovr || []);
    // 휴무일 테이블이 아직 없을 때(SQL 실행 전)도 화면이 깨지지 않도록 data가 없으면 빈 목록
    setClosedDates(new Set((closed || []).map((c: { closed_date: string }) => c.closed_date)));
    setAttendance(att || []);
    setLoading(false);
  }, [course.id, selectedYear, selectedMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // ===== 출석부 데이터: 회원 1명 = 1줄, 그 회원의 실제 레슨일만 칸으로 =====
  const memberNameMap = new Map(enrollments.map(e => [e.member_id, e.members?.name || '']));
  const fixedToMember = new Map(fixedSchedules.map(f => [f.id, f.member_id]));

  // 수강 종료한 회원은 종료일부터 레슨일에서 빠짐
  const endedMap = buildEndedMap(enrollments);
  const lessons = buildMonthlyLessons(fixedSchedules, overrides, closedDates, selectedYear, selectedMonth, endedMap);

  // 회원별 출석 기록 (고정 스케줄 id + 날짜 단위 → 같은 날 2회 레슨도 각각 구분)
  const attendedByMember = new Map<number, Map<string, string>>(); // key → 날짜
  attendance.forEach(a => {
    if (!a.is_attended) return;
    const memberId = a.member_id ?? (a.fixed_schedule_id ? fixedToMember.get(a.fixed_schedule_id) : undefined);
    if (!memberId) return;
    if (!attendedByMember.has(memberId)) attendedByMember.set(memberId, new Map());
    attendedByMember.get(memberId)!.set(lessonKey(a.fixed_schedule_id, a.attend_date), a.attend_date);
  });

  // 명단: 그 달에 레슨 일정이나 출석 기록이 있었던 회원 (종료한 회원 포함)
  const memberIds = new Set<number>([...Array.from(lessons.keys()), ...Array.from(attendedByMember.keys())]);
  const printRows: PrintRow[] = Array.from(memberIds)
    .map(memberId => {
      const scheduled = lessons.get(memberId) || [];
      const attended = attendedByMember.get(memberId) || new Map<string, string>();
      const scheduledKeys = new Set(scheduled.map(o => lessonKey(o.fixedId, o.date)));
      const cells = scheduled.map(o => ({ date: o.date, attended: attended.has(lessonKey(o.fixedId, o.date)) }));
      // 예정에 없던 레슨에 출석한 기록(보강 등)도 실제 운영 기록이므로 칸으로 함께 표시
      attended.forEach((date, key) => {
        if (!scheduledKeys.has(key)) cells.push({ date, attended: true });
      });
      cells.sort((x, y) => x.date.localeCompare(y.date));
      return {
        memberId,
        name: memberNameMap.get(memberId) || '회원',
        cells,
        attendedCount: cells.filter(c => c.attended).length,
        scheduledCount: cells.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // 페이지 나누기 (12회 초과 회원은 2줄을 차지)
  const pages: PrintRow[][] = [];
  {
    let current: PrintRow[] = [];
    let lines = 0;
    printRows.forEach(r => {
      const need = Math.max(1, Math.ceil(r.cells.length / CELLS_PER_LINE));
      if (lines + need > LINES_PER_PAGE && current.length > 0) {
        pages.push(current);
        current = [];
        lines = 0;
      }
      current.push(r);
      lines += need;
    });
    pages.push(current);
  }
  const totalPages = pages.length;
  const totalAttended = printRows.reduce((s, r) => s + r.attendedCount, 0);
  const totalScheduled = printRows.reduce((s, r) => s + r.scheduledCount, 0);
  const realCount = printRows.filter(r => r.attendedCount > 0).length;

  // 주간 스케줄표 데이터: 요일×시간 정렬
  // (출석부 모드와 달리 이건 "지금 벽에 붙여두는 현재 스케줄표"이므로, 영구 변경으로
  // 이미 대체된 예전 스케줄(effective_until이 오늘 이전)은 제외하고 현재 유효한 것만 표시)
  const todayStr = ymd(today);
  const scheduleByDay: Record<number, FixedSchedule[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  fixedSchedules.forEach(f => {
    if (f.effective_until && f.effective_until < todayStr) return;
    if (isEndedOn(endedMap, f.enrollment_id, todayStr)) return; // 종료한 회원은 현재 스케줄표에서 제외
    if (f.day_of_week >= 0 && f.day_of_week <= 4) {
      scheduleByDay[f.day_of_week].push(f);
    }
  });
  Object.keys(scheduleByDay).forEach(k => {
    scheduleByDay[Number(k)].sort((a, b) => a.start_time.localeCompare(b.start_time));
  });

  const maxRows = Math.max(...Object.values(scheduleByDay).map(arr => arr.length), 1);

  const printStyle = `
    @media print {
      @page { size: A4 ${printMode === 'attendance' ? 'landscape' : 'portrait'}; margin: 8mm 10mm; }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setSelectedYear(y => y - 1)} style={navBtn}>◀</button>
          <strong style={{ minWidth: 56, textAlign: 'center' }}>{selectedYear}년</strong>
          <button onClick={() => setSelectedYear(y => y + 1)} style={navBtn}>▶</button>
          <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexWrap: 'wrap' }}>
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
            ? `A4 가로 ${totalPages}페이지 · 수강생 ${printRows.length}명 · 출석 ${totalAttended}회 / 예정 ${totalScheduled}회`
            : `A4 1페이지 · 요일별 레슨 시간표`}
          {printMode === 'attendance' && (
            <div style={{ marginTop: 4 }}>
              토·일요일, 공휴일, 주간 스케줄에서 &apos;휴무&apos;로 체크한 날, &apos;이번 주 취소&apos;한 레슨은 칸에서 빠집니다.
            </div>
          )}
        </div>

        {/* 화면 미리보기 (출석부) */}
        {printMode === 'attendance' && !loading && (
          <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 20, overflowX: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>미리보기</div>
            {printRows.length === 0 ? (
              <div style={{ fontSize: 13, color: '#888', padding: 20, textAlign: 'center' }}>이 달에는 레슨 일정이 없습니다.</div>
            ) : (
              <AttendanceTable rows={printRows} startSeq={1} />
            )}
          </div>
        )}
      </div>

      {/* ===== 출석부 인쇄 영역 ===== */}
      {printMode === 'attendance' && (
        <div className="print-only" style={{ display: 'none' }}>
          {loading ? null : pages.map((pageRows, pIdx) => {
            const startSeq = pages.slice(0, pIdx).reduce((s, p) => s + p.length, 0) + 1;
            const isLast = pIdx === pages.length - 1;
            return (
              <div key={pIdx} className="print-page" style={{
                padding: '4px 12px', fontFamily: 'sans-serif', color: '#000', background: 'white',
              }}>
                {/* 헤더: 제목 + 결재란 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1.5 }}></div>
                  <div style={{ flex: 2, textAlign: 'center' }}>
                    <h1 style={{ fontSize: 17, margin: 0, fontWeight: 'bold' }}>{selectedYear}년 중림종합사회복지관</h1>
                    <h1 style={{ fontSize: 18, margin: '4px 0 0', fontWeight: 'bold' }}>늘품학습센터 {selectedMonth}월 레슨 출석부</h1>
                  </div>
                  <div style={{ flex: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                      <tbody>
                        <tr>
                          <td rowSpan={2} style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', width: 20, writingMode: 'vertical-rl', verticalAlign: 'middle' }}>결재</td>
                          {approvalLine.titles.map((t, i) => (
                            <td key={i} style={{ border: '1px solid black', padding: '4px 10px', textAlign: 'center', width: 46 }}>
                              {t.length === 2 ? `${t[0]} ${t[1]}` : t}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          {approvalLine.titles.map((_, i) => (
                            <td key={i} style={{ border: '1px solid black', padding: '4px 10px', height: 28, fontSize: 10, textAlign: 'center' }}>
                              {approvalLine.finalIndex === i ? '전결' : ''}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 강좌/강사 */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, fontSize: 12 }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid black', padding: '5px 10px', background: '#e0e0e0', width: 80, textAlign: 'center' }}>강좌명</td>
                      <td style={{ border: '1px solid black', padding: '5px 10px', width: '40%' }}>{course.name}</td>
                      <td style={{ border: '1px solid black', padding: '5px 10px', background: '#e0e0e0', width: 80, textAlign: 'center' }}>강사명</td>
                      <td style={{ border: '1px solid black', padding: '5px 10px' }}>{instructorName}</td>
                    </tr>
                  </tbody>
                </table>

                <AttendanceTable rows={pageRows} startSeq={startSeq} />

                {/* 마지막 페이지에 월 합계 */}
                {isLast && (
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, marginTop: 8, marginLeft: 'auto' }}>
                    <tbody>
                      <tr>
                        <td style={sumLabel}>실인원</td>
                        <td style={sumValue}>{realCount}명</td>
                        <td style={sumLabel}>연인원(출석)</td>
                        <td style={sumValue}>{totalAttended}회</td>
                        <td style={sumLabel}>예정 레슨</td>
                        <td style={sumValue}>{totalScheduled}회</td>
                      </tr>
                    </tbody>
                  </table>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 11 }}>
                  <span>계속( {pIdx + 1} / {totalPages} )</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10 }}>중구 구립·대한불교조계종사회복지재단 운영</span>
                    <strong style={{ fontSize: 13, color: '#d97706' }}>중림종합사회복지관</strong>
                  </div>
                </div>
              </div>
            );
          })}
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

// 회원별 한 줄 출석표: 위 칸 = 레슨 날짜, 아래 칸 = 출석(○)
function AttendanceTable({ rows, startSeq }: { rows: PrintRow[]; startSeq: number }) {
  const border = '1px solid black';
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: 34 }} />
        <col style={{ width: 76 }} />
        {Array.from({ length: CELLS_PER_LINE }).map((_, i) => <col key={i} />)}
        <col style={{ width: 62 }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ border, padding: 3, background: '#e0e0e0' }}>연번</th>
          <th style={{ border, padding: 3, background: '#e0e0e0' }}>성명</th>
          {Array.from({ length: CELLS_PER_LINE }).map((_, i) => (
            <th key={i} style={{ border, padding: 3, background: '#e0e0e0', fontWeight: 600 }}>{i + 1}회</th>
          ))}
          <th style={{ border, padding: 3, background: '#e0e0e0' }}>출석/예정</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, rIdx) => {
          const lines = chunk(r.cells, CELLS_PER_LINE);
          const span = lines.length * 2;
          return lines.flatMap((lineCells, lIdx) => {
            const padded: ({ date: string; attended: boolean } | null)[] = [...lineCells];
            while (padded.length < CELLS_PER_LINE) padded.push(null);
            return [
              <tr key={`${r.memberId}-${lIdx}-d`}>
                {lIdx === 0 && (
                  <>
                    <td rowSpan={span} style={{ border, padding: 3, textAlign: 'center' }}>{startSeq + rIdx}</td>
                    <td rowSpan={span} style={{ border, padding: '3px 5px', fontWeight: 600 }}>{r.name}</td>
                  </>
                )}
                {padded.map((c, cIdx) => (
                  <td key={cIdx} style={{ border, borderBottom: '1px dotted #888', padding: '1px 2px', textAlign: 'center', fontSize: 10, color: '#333', background: '#f5f5f5', height: 14 }}>
                    {c ? shortDate(c.date) : ''}
                  </td>
                ))}
                {lIdx === 0 && (
                  <td rowSpan={span} style={{ border, padding: 3, textAlign: 'center', fontWeight: 600 }}>
                    {r.attendedCount} / {r.scheduledCount}
                  </td>
                )}
              </tr>,
              <tr key={`${r.memberId}-${lIdx}-m`}>
                {padded.map((c, cIdx) => (
                  <td key={cIdx} style={{ border, borderTop: 'none', padding: '1px 2px', textAlign: 'center', fontSize: 13, height: 18 }}>
                    {c && c.attended ? '○' : ''}
                  </td>
                ))}
              </tr>,
            ];
          });
        })}
      </tbody>
    </table>
  );
}

const sumLabel: React.CSSProperties = {
  border: '1px solid black', padding: '4px 10px', background: '#e0e0e0', textAlign: 'center',
};
const sumValue: React.CSSProperties = {
  border: '1px solid black', padding: '4px 14px', textAlign: 'center', fontWeight: 600,
};
