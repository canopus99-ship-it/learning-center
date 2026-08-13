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

const DAYS = ['월', '화', '수', '목', '금'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  discount: '무료' | '감면' | '';
  scheduleLabel: string;
  scheduled: number;
  attended: number;
  rate: number;
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

  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [fixedSchedules, setFixedSchedules] = useState<FixedSchedule[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
        .lte('effective_from', monthEnd),
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

  const monthWeekdays = getWeekdaysOfMonth(selectedYear, selectedMonth);

  const rows: StudentRow[] = enrollments
    .filter(e => e.members)
    .map(e => {
      const member = e.members as Member;
      const memberFixed = fixedSchedules.filter(f => f.member_id === member.id);

      // 예정 회차: 이 회원의 고정 요일에 해당하는 그 달의 평일 수
      const scheduledDates = new Set<string>();
      monthWeekdays.forEach(d => {
        const scheduleDow = d.getDay() - 1; // 0=월~4=금
        const dateStr = ymd(d);
        const applicable = memberFixed.some(f => f.day_of_week === scheduleDow && f.effective_from <= dateStr);
        if (applicable) scheduledDates.add(dateStr);
      });

      // 출석 회차: 이 회원의 고정 스케줄로 기록된 출석(이번 주만 요일이 바뀐 경우도 실제 기록된 날짜로 잡힘)
      const fixedIds = memberFixed.map(f => f.id);
      const attendedDates = new Set<string>();
      attendance.forEach(a => {
        if (fixedIds.includes(a.fixed_schedule_id) && a.is_attended) attendedDates.add(a.attend_date);
      });

      const scheduled = scheduledDates.size;
      const attended = attendedDates.size;
      const rate = scheduled > 0 ? Math.round((attended / scheduled) * 100) : 0;

      const scheduleLabel = memberFixed.length === 0
        ? '-'
        : memberFixed
            .slice()
            .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
            .map(f => `${DAYS[f.day_of_week]} ${formatTime12(f.start_time)}`)
            .join(', ');

      const discount: '무료' | '감면' | '' =
        member.is_discount_100 ? '무료' : member.is_discount_50 ? '감면' : '';

      return {
        memberId: member.id,
        memberName: member.name,
        discount,
        scheduleLabel,
        scheduled,
        attended,
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
        선택한 달의 예정 레슨 대비 실제 출석 현황입니다. (강사님 확인용)
      </p>

      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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
        <button onClick={() => window.print()} style={{ ...navBtn, width: 'auto', padding: '0 12px', marginLeft: 'auto' }}>
          🖨️ 인쇄
        </button>
      </div>

      <p style={{ fontSize: 13, margin: '0 0 8px', color: '#444' }}>
        {selectedYear}년 {selectedMonth}월 기준 · 수강생 {rows.length}명
      </p>

      <div className="no-print" style={{
        display: 'flex', gap: 12, fontSize: 12, color: '#666', marginBottom: 10,
      }}>
        <span><span style={{ ...dotStyle, background: '#6B7280' }} />무료</span>
        <span><span style={{ ...dotStyle, background: '#2D7A6B' }} />감면</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>불러오는 중...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', background: '#fafafa', textAlign: 'left' }}>
              <th style={th}>이름</th>
              <th style={th}>요일·시간</th>
              <th style={{ ...th, textAlign: 'center' }}>예정/출석</th>
              <th style={{ ...th, textAlign: 'right' }}>출석률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.memberId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={td}>
                  {r.memberName}
                  {r.discount && (
                    <span style={{
                      marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 4, color: 'white',
                      background: r.discount === '무료' ? '#6B7280' : '#2D7A6B',
                    }}>{r.discount}</span>
                  )}
                </td>
                <td style={{ ...td, color: '#666' }}>{r.scheduleLabel}</td>
                <td style={{ ...td, textAlign: 'center', color: '#666' }}>{r.scheduled} / {r.attended}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.rate < 50 ? '#A32D2D' : '#1D9E75' }}>
                  {r.rate}%
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: '#999', padding: 24 }}>수강생이 없습니다.</td></tr>
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
