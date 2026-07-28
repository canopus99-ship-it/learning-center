'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/fetchAll';

type Course = { id: number; category: string; name: string };
type Enrollment = {
  id: number; member_id: number; course_id: number; status: string;
  enrolled_at: string | null; end_date: string | null;
  start_year: number | null; start_month: number | null;
};
type Member = { id: number; name: string; is_discount_50: boolean; is_discount_100: boolean };
type CourseDate = { id: number; course_id: number; class_date: string; is_cancelled: boolean };
type AttendanceRow = { enrollment_id: number; course_date_id: number; is_present: boolean };
type LessonFixed = { enrollment_id: number; course_id: number };
type LessonAtt = { course_id: number; enrollment_id: number; attend_date: string; is_attended: boolean };

type Row = {
  memberId: number; memberName: string; courseName: string; category: string;
  discount: '무료' | '감면' | ''; attended: number; operating: number; rate: number; isLesson: boolean;
};

function monthBounds(y: number, m: number): { start: string; end: string } {
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export default function AttendanceStatsClient() {
  const supabase = createClient();
  const today = new Date();

  const [fromYear, setFromYear] = useState(today.getFullYear());
  const [fromMonth, setFromMonth] = useState(1);
  const [toYear, setToYear] = useState(today.getFullYear());
  const [toMonth, setToMonth] = useState(today.getMonth() + 1);
  const [discountOnly, setDiscountOnly] = useState(true);

  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [courseDates, setCourseDates] = useState<CourseDate[]>([]);
  const [present, setPresent] = useState<AttendanceRow[]>([]);
  const [lessonFixed, setLessonFixed] = useState<LessonFixed[]>([]);
  const [lessonAtt, setLessonAtt] = useState<LessonAtt[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadData() {
    const start = monthBounds(fromYear, fromMonth).start;
    const end = monthBounds(toYear, toMonth).end;
    if (start > end) { alert('시작월이 종료월보다 뒤입니다.'); return; }
    setLoading(true);

    // 회원/강좌/출석 데이터가 1000행을 넘을 수 있어 전부 페이지 단위로 끝까지 가져옴
    const [coursesRes, enrollRes, membersRes, datesRes, lessonFixedRes, lessonAttRes] = await Promise.all([
      supabase.from('courses').select('id, category, name').order('category').order('name'),
      fetchAllRows<Enrollment>((from, to) =>
        supabase
          .from('enrollments')
          .select('id, member_id, course_id, status, enrolled_at, end_date, start_year, start_month')
          .range(from, to)
      ),
      fetchAllRows<Member>((from, to) =>
        supabase.from('members').select('id, name, is_discount_50, is_discount_100').range(from, to)
      ),
      fetchAllRows<CourseDate>((from, to) =>
        supabase
          .from('course_dates')
          .select('id, course_id, class_date, is_cancelled')
          .gte('class_date', start)
          .lte('class_date', end)
          .range(from, to)
      ),
      fetchAllRows<LessonFixed>((from, to) =>
        supabase.from('lesson_fixed_schedules').select('enrollment_id, course_id').range(from, to)
      ),
      fetchAllRows<LessonAtt>((from, to) =>
        supabase
          .from('lesson_attendance')
          .select('course_id, enrollment_id, attend_date, is_attended')
          .gte('attend_date', start)
          .lte('attend_date', end)
          .range(from, to)
      ),
    ]);

    const dateIds = (datesRes.data || []).map(d => d.id);
    const presentRows: AttendanceRow[] = [];
    for (let i = 0; i < dateIds.length; i += 200) {
      const chunk = dateIds.slice(i, i + 200);
      if (chunk.length === 0) break;
      // 청크 하나의 응답도 1000행을 넘을 수 있어 끝까지 가져옴
      const { data } = await fetchAllRows<AttendanceRow>((from, to) =>
        supabase
          .from('attendance')
          .select('enrollment_id, course_date_id, is_present')
          .in('course_date_id', chunk)
          .eq('is_present', true)
          .range(from, to)
      );
      presentRows.push(...data);
    }

    setCourses(coursesRes.data || []);
    setEnrollments((enrollRes.data || []) as Enrollment[]);
    setMembers((membersRes.data || []) as Member[]);
    setCourseDates(datesRes.data || []);
    setPresent(presentRows);
    setLessonFixed((lessonFixedRes.data || []) as LessonFixed[]);
    setLessonAtt((lessonAttRes.data || []) as LessonAtt[]);
    setLoading(false);
    setLoaded(true);
  }

  const rows = useMemo<Row[]>(() => {
    if (!loaded) return [];
    const periodStart = monthBounds(fromYear, fromMonth).start;
    const periodEnd = monthBounds(toYear, toMonth).end;

    const courseMap = new Map(courses.map(c => [c.id, c]));
    const memberMap = new Map(members.map(m => [m.id, m]));

    // 일반 강좌: 운영 회차(취소 제외)
    const datesByCourse = new Map<number, CourseDate[]>();
    courseDates.forEach(d => {
      if (d.is_cancelled) return;
      const arr = datesByCourse.get(d.course_id) || [];
      arr.push(d);
      datesByCourse.set(d.course_id, arr);
    });
    const presentByEnroll = new Map<number, Set<number>>();
    present.forEach(p => {
      const s = presentByEnroll.get(p.enrollment_id) || new Set<number>();
      s.add(p.course_date_id);
      presentByEnroll.set(p.enrollment_id, s);
    });

    // 레슨: 주간 횟수(고정 레슨 수), 강좌별 운영일수, 회원별 출석 횟수
    const freqByEnroll = new Map<number, number>();
    lessonFixed.forEach(f => freqByEnroll.set(f.enrollment_id, (freqByEnroll.get(f.enrollment_id) || 0) + 1));
    const lessonDaysByCourse = new Map<number, Set<string>>();
    const lessonAttendedByEnroll = new Map<number, number>();
    lessonAtt.forEach(a => {
      if (!a.is_attended) return;
      const s = lessonDaysByCourse.get(a.course_id) || new Set<string>();
      s.add(a.attend_date);
      lessonDaysByCourse.set(a.course_id, s);
      lessonAttendedByEnroll.set(a.enrollment_id, (lessonAttendedByEnroll.get(a.enrollment_id) || 0) + 1);
    });

    const result: Row[] = [];

    enrollments.forEach(e => {
      if (e.status === 'waiting') return;
      const member = memberMap.get(e.member_id);
      const course = courseMap.get(e.course_id);
      if (!member || !course) return;

      const discount: '무료' | '감면' | '' =
        member.is_discount_100 ? '무료' : member.is_discount_50 ? '감면' : '';

      // 레슨 학생: 고정 레슨이 있으면 레슨 방식 (예정 = 운영일수 × 주간횟수 ÷ 5)
      const freq = freqByEnroll.get(e.id);
      if (freq && freq > 0) {
        const D = lessonDaysByCourse.get(e.course_id)?.size ?? 0;
        const operating = Math.round((D * freq) / 5);
        if (operating === 0) return;
        const attended = lessonAttendedByEnroll.get(e.id) ?? 0;
        const rate = Math.round((attended / operating) * 100);
        result.push({
          memberId: member.id, memberName: member.name, courseName: course.name,
          category: course.category, discount, attended, operating, rate, isLesson: true,
        });
        return;
      }

      // 일반 강좌
      const memberStart =
        (e.start_year && e.start_month)
          ? `${e.start_year}-${String(e.start_month).padStart(2, '0')}-01`
          : (e.enrolled_at ? e.enrolled_at.substring(0, 10) : periodStart);
      const activeStart = memberStart > periodStart ? memberStart : periodStart;
      const activeEnd = (e.end_date && e.end_date < periodEnd) ? e.end_date : periodEnd;
      if (activeStart > activeEnd) return;

      const courseDatesList = datesByCourse.get(e.course_id) || [];
      const operatingDates = courseDatesList.filter(d => d.class_date >= activeStart && d.class_date <= activeEnd);
      const operating = operatingDates.length;
      if (operating === 0) return;

      const presentSet = presentByEnroll.get(e.id) || new Set<number>();
      const attended = operatingDates.filter(d => presentSet.has(d.id)).length;
      const rate = Math.round((attended / operating) * 100);

      result.push({
        memberId: member.id, memberName: member.name, courseName: course.name,
        category: course.category, discount, attended, operating, rate, isLesson: false,
      });
    });

    const filtered = discountOnly ? result.filter(r => r.discount !== '') : result;
    filtered.sort((a, b) => a.rate - b.rate || a.memberName.localeCompare(b.memberName));
    return filtered;
  }, [loaded, courses, enrollments, members, courseDates, present, lessonFixed, lessonAtt, fromYear, fromMonth, toYear, toMonth, discountOnly]);

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);

  const lowCount = rows.filter(r => r.rate < 50).length;
  const years = [today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear()];
  const monthsArr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const selectStyle: React.CSSProperties = { padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 };

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
      <Link href="/stats" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 통계로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>📋 출석률 조회</h1>

      <div style={{
        padding: 12, background: '#F1F5FB', border: '1px solid #D6E2F0',
        borderRadius: 8, fontSize: 12.5, color: '#3B5366', marginBottom: 20, lineHeight: 1.6,
      }}>
        감면 자격 확인용 화면입니다. <strong>출석률과 감면 여부</strong>만 표시되며, 구체적 감면 사유는 표시하지 않습니다.
        별도 명단으로 저장하지 않고 조회할 때마다 계산합니다. (운영세칙 제12조 2항: 감면자 분기 출석률 50% 이하 시 감면 종료 검토)
        <br />※ 레슨은 예정 회차 = 운영일수 × (주간횟수 ÷ 5)로 산출한 근사치입니다.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={fromYear} onChange={e => setFromYear(+e.target.value)} style={selectStyle}>
          {years.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={fromMonth} onChange={e => setFromMonth(+e.target.value)} style={selectStyle}>
          {monthsArr.map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <span style={{ color: '#888' }}>~</span>
        <select value={toYear} onChange={e => setToYear(+e.target.value)} style={selectStyle}>
          {years.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={toMonth} onChange={e => setToMonth(+e.target.value)} style={selectStyle}>
          {monthsArr.map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <button onClick={loadData} disabled={loading} style={{
          padding: '7px 16px', background: '#185FA5', color: 'white', border: 'none',
          borderRadius: 6, fontSize: 14, cursor: 'pointer', fontWeight: 600,
        }}>{loading ? '조회 중…' : '조회'}</button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#444', marginLeft: 4 }}>
          <input type="checkbox" checked={discountOnly} onChange={e => setDiscountOnly(e.target.checked)} />
          감면·무료만 보기
        </label>
      </div>

      {loaded && (
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>
          총 {rows.length}명 · <span style={{ color: '#A32D2D', fontWeight: 600 }}>출석률 50% 미만 {lowCount}명</span>
        </p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee', background: '#fafafa', textAlign: 'left' }}>
            <th style={th}>이름</th>
            <th style={th}>강좌</th>
            <th style={th}>감면</th>
            <th style={{ ...th, textAlign: 'center' }}>출석/예정</th>
            <th style={{ ...th, textAlign: 'right' }}>출석률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.memberId}-${r.courseName}-${i}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={td}>
                <Link href={`/members/${r.memberId}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{r.memberName}</Link>
              </td>
              <td style={td}>
                <span style={{ color: '#888', fontSize: 11 }}>{r.category} </span>{r.courseName}
                {r.isLesson && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#E8DEF8', color: '#5B3FA0' }}>레슨</span>}
              </td>
              <td style={td}>
                {r.discount && (
                  <span style={{
                    fontSize: 11, padding: '1px 6px', borderRadius: 4, color: 'white',
                    background: r.discount === '무료' ? '#6B7280' : '#2D7A6B',
                  }}>{r.discount}</span>
                )}
              </td>
              <td style={{ ...td, textAlign: 'center', color: '#666' }}>{r.attended} / {r.operating}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.rate < 50 ? '#A32D2D' : '#1D9E75' }}>
                {r.rate}%
              </td>
            </tr>
          ))}
          {loaded && rows.length === 0 && (
            <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#999', padding: 24 }}>조회 결과가 없습니다.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, color: '#555', fontSize: 12 };
const td: React.CSSProperties = { padding: '8px 10px' };