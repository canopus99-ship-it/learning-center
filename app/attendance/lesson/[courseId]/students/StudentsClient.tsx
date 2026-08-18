'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatTime12 } from '@/lib/time';

type Course = { id: number; name: string; category: string };
type Member = { id: number; name: string; phone: string | null; is_discount_50: boolean; is_discount_100: boolean };
type Enrollment = { id: number; member_id: number; status: string; members: Member | null };
type FixedSchedule = {
  id: number;
  enrollment_id: number;
  member_id: number;
  day_of_week: number; // 0=월~4=금
  start_time: string;
  duration_minutes: number;
  effective_from: string;
};
type AttendanceRecord = { fixed_schedule_id: number; attend_date: string; is_attended: boolean };

const DAY_LABELS = ['월', '화', '수', '목', '금'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtWeekLabel(monday: Date): string {
  const friday = addDays(monday, 4);
  return `${monday.getMonth() + 1}/${monday.getDate()} ~ ${friday.getMonth() + 1}/${friday.getDate()}`;
}

// 두 날짜(YYYY-MM-DD) 중 더 이른/늦은 값 (문자열 비교로 충분)
function minStr(a: string, b: string): string { return a < b ? a : b; }
function maxStr(a: string, b: string): string { return a > b ? a : b; }

// 해당 월의 평일(월~금) 날짜 목록
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

type StudentRow = {
  memberId: number;
  memberName: string;
  colorTag: 'free' | 'discount' | null; // 무료/감면 여부 - 화면에는 색으로만 표시 (개인정보 보호)
  scheduleLabel: string;
  weekMarks: string[]; // 이번 주 월~금 각각 출석이면 '○', 아니면 ''
  rate: number; // 이번 주가 속한 달 기준 출석률
};

export default function StudentsClient({
  course,
  enrollments,
}: {
  course: Course;
  enrollments: Enrollment[];
}) {
  const supabase = createClient();
  const today = new Date();

  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(today));
  const [fixedSchedules, setFixedSchedules] = useState<FixedSchedule[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const weekDates = [0, 1, 2, 3, 4].map(i => addDays(weekStart, i));

  // 출석률은 "이번 주가 속한 달" 기준으로 계산 (달이 걸쳐 있으면 월요일 기준 달)
  const rateYear = weekStart.getFullYear();
  const rateMonth = weekStart.getMonth() + 1;

  const loadData = useCallback(async () => {
    setLoading(true);

    const monthStart = `${rateYear}-${String(rateMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(rateYear, rateMonth, 0).getDate();
    const monthEnd = `${rateYear}-${String(rateMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 표시할 주(월~금)가 그 달의 범위를 벗어날 수도 있으니(달 경계에 걸친 주),
    // 조회 범위는 "그 달"과 "이번 주" 중 더 넓은 쪽으로 합쳐서 둘 다 놓치지 않게 함
    const rangeStart = minStr(monthStart, ymd(weekDates[0]));
    const rangeEnd = maxStr(monthEnd, ymd(weekDates[4]));

    const [{ data: fixed }, { data: att }] = await Promise.all([
      supabase
        .from('lesson_fixed_schedules')
        .select('*')
        .eq('course_id', course.id)
        .lte('effective_from', rangeEnd),
      supabase
        .from('lesson_attendance')
        .select('fixed_schedule_id, attend_date, is_attended')
        .eq('course_id', course.id)
        .gte('attend_date', rangeStart)
        .lte('attend_date', rangeEnd),
    ]);

    setFixedSchedules(fixed || []);
    setAttendance(att || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, ymd(weekStart)]);

  useEffect(() => { loadData(); }, [loadData]);

  function prevWeek() { setWeekStart(prev => addDays(prev, -7)); }
  function nextWeek() { setWeekStart(prev => addDays(prev, 7)); }
  function thisWeek() { setWeekStart(getMonday(today)); }
  const isThisWeek = ymd(weekStart) === ymd(getMonday(today));

  const monthWeekdays = getWeekdaysOfMonth(rateYear, rateMonth);

  const rows: StudentRow[] = enrollments
    .filter(e => e.members)
    .map(e => {
      const member = e.members as Member;
      const memberFixed = fixedSchedules.filter(f => f.member_id === member.id);
      const fixedIds = memberFixed.map(f => f.id);

      // 이번 주 월~금 출석 마크
      const weekMarks = weekDates.map(d => {
        const dateStr = ymd(d);
        const found = attendance.some(a => fixedIds.includes(a.fixed_schedule_id) && a.attend_date === dateStr && a.is_attended);
        return found ? '○' : '';
      });

      // 이번 주가 속한 달 기준 출석률
      const scheduledDates = new Set<string>();
      monthWeekdays.forEach(d => {
        const scheduleDow = d.getDay() - 1; // 0=월~4=금
        const dateStr = ymd(d);
        const applicable = memberFixed.some(f => f.day_of_week === scheduleDow && f.effective_from <= dateStr);
        if (applicable) scheduledDates.add(dateStr);
      });
      const attendedDates = new Set<string>();
      attendance.forEach(a => {
        if (fixedIds.includes(a.fixed_schedule_id) && a.is_attended) {
          const inMonth = a.attend_date >= `${rateYear}-${String(rateMonth).padStart(2, '0')}-01`
            && a.attend_date <= `${rateYear}-${String(rateMonth).padStart(2, '0')}-${String(new Date(rateYear, rateMonth, 0).getDate()).padStart(2, '0')}`;
          if (inMonth) attendedDates.add(a.attend_date);
        }
      });
      const rate = scheduledDates.size > 0 ? Math.round((attendedDates.size / scheduledDates.size) * 100) : 0;

      const scheduleLabel = memberFixed.length === 0
        ? '-'
        : memberFixed
            .slice()
            .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
            .map(f => `${DAY_LABELS[f.day_of_week]} ${formatTime12(f.start_time)}`)
            .join(', ');

      const colorTag: 'free' | 'discount' | null =
        member.is_discount_100 ? 'free' : member.is_discount_50 ? 'discount' : null;

      return {
        memberId: member.id,
        memberName: member.name,
        colorTag,
        scheduleLabel,
        weekMarks,
        rate,
      };
    })
    .sort((a, b) => a.memberName.localeCompare(b.memberName, 'ko'));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print">
        <Link href={`/attendance/lesson/${course.id}`} style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>
          ← {course.name} 메뉴로
        </Link>
      </div>

      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '12px 0 4px' }}>👤 {course.name} · 수강생별 출석현황</h1>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        한 주(월~금) 단위로 출석 날짜를 확인합니다. (강사님 확인용 · 학부모 문의 응대용)
      </p>

      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={prevWeek} style={navBtn}>◀</button>
        <strong style={{ minWidth: 150, textAlign: 'center' }}>
          {weekStart.getFullYear()}년 {fmtWeekLabel(weekStart)}
        </strong>
        <button onClick={nextWeek} style={navBtn}>▶</button>
        {!isThisWeek && (
          <button onClick={thisWeek} style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: 12 }}>이번 주</button>
        )}
        <button onClick={() => window.print()} style={{ ...navBtn, width: 'auto', padding: '0 12px', marginLeft: 'auto' }}>
          🖨️ 인쇄
        </button>
      </div>

      <p style={{ fontSize: 13, margin: '0 0 8px', color: '#444' }}>
        수강생 {rows.length}명 · 출석률은 {rateYear}년 {rateMonth}월 기준
      </p>

      <div className="no-print" style={{
        display: 'flex', gap: 12, fontSize: 11, color: '#999', marginBottom: 10,
      }}>
        <span><span style={{ ...dotStyle, background: '#6B7280' }} />무료</span>
        <span><span style={{ ...dotStyle, background: '#2D7A6B' }} />감면</span>
        <span style={{ color: '#bbb' }}>(색 표시 의미는 직원만 보는 안내이며, 이름 옆에는 색만 표시됩니다)</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>불러오는 중...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', background: '#fafafa', textAlign: 'left' }}>
              <th style={th}>이름</th>
              {weekDates.map((d, i) => (
                <th key={i} style={{ ...th, textAlign: 'center' }}>
                  {d.getMonth() + 1}/{d.getDate()} {DAY_LABELS[i]}
                </th>
              ))}
              <th style={{ ...th, textAlign: 'right' }}>출석률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.memberId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={td}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6,
                    background: r.colorTag === 'free' ? '#6B7280' : r.colorTag === 'discount' ? '#2D7A6B' : 'transparent',
                  }} />
                  {r.memberName}
                </td>
                {r.weekMarks.map((mark, i) => (
                  <td key={i} style={{ ...td, textAlign: 'center', color: '#185FA5', fontWeight: 600 }}>{mark}</td>
                ))}
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.rate < 50 ? '#A32D2D' : '#1D9E75' }}>
                  {r.rate}%
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#999', padding: 24 }}>수강생이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd',
  background: 'white', cursor: 'pointer', fontSize: 14, color: '#555',
};
const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, color: '#555', fontSize: 12 };
const td: React.CSSProperties = { padding: '8px 10px' };
const dotStyle: React.CSSProperties = {
  display: 'inline-block', width: 9, height: 9, borderRadius: 5, marginRight: 5, verticalAlign: 'middle',
};
