'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Course = { id: number; category: string; name: string };
type Enrollment = {
  id: number; member_id: number; course_id: number; status: string;
  enrolled_at: string | null; end_date: string | null;
  start_year: number | null; start_month: number | null;
};
type Member = { id: number; name: string; is_discount_50: boolean; is_discount_100: boolean };
type CourseDate = { id: number; course_id: number; class_date: string; is_cancelled: boolean };
type AttendanceRow = { enrollment_id: number; course_date_id: number; is_present: boolean };

// 월의 시작일/말일 (YYYY-MM-DD)
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
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadData() {
    const start = monthBounds(fromYear, fromMonth).start;
    const end = monthBounds(toYear, toMonth).end;
    if (start > end) { alert('시작월이 종료월보다 뒤입니다.'); return; }
    setLoading(true);

    const [coursesRes, enrollRes, membersRes, datesRes] = await Promise.all([
      supabase.from('courses').select('id, category, name').order('category').order('name'),
      supabase.from('enrollments').select('id, member_id, course_id, status, enrolled_at, end_date, start_year, start_month'),
      supabase.from('members').select('id, name, is_discount_50, is_discount_100'),
      supabase.from('course_dates').select('id, course_id, class_date, is_cancelled').gte('class_date', start).lte('class_date', end),
    ]);

    // 출석(present) 조회: course_date_id 청크로 나눠서
    const dateIds = (datesRes.data || []).map(d => d.id);
    const presentRows: AttendanceRow[] = [];
    for (let i = 0; i < dateIds.length; i += 200) {
      const chunk = dateIds.slice(i, i + 200);
      if (chunk.length === 0) break;
      const { data } = await supabase
        .from('attendance')
        .select('enrollment_id, course_date_id, is_present')
        .in('course_date_id', chunk)
        .eq('is_present', true);
      if (data) presentRows.push(...data);
    }

    setCourses(coursesRes.data || []);
    setEnrollments((enrollRes.data || []) as Enrollment[]);
    setMembers((membersRes.data || []) as Member[]);
    setCourseDates(datesRes.data || []);
    setPresent(presentRows);
    setLoading(false);
    setLoaded(true);
  }

  const rows = useMemo(() => {
    if (!loaded) return [];
    const periodStart = monthBounds(fromYear, fromMonth).start;
    const periodEnd = monthBounds(toYear, toMonth).end;

    const courseMap = new Map(courses.map(c => [c.id, c]));
    const memberMap = new Map(members.map(m => [m.id, m]));

    // 강좌별 운영 회차(취소 제외) 목록
    const datesByCourse = new Map<number, CourseDate[]>();
    courseDates.forEach(d => {
      if (d.is_cancelled) return;
      const arr = datesByCourse.get(d.course_id) || [];
      arr.push(d);
      datesByCourse.set(d.course_id, arr);
    });

    // 수강신청별 출석한 course_date_id 집합
    const presentByEnroll = new Map<number, Set<number>>();
    present.forEach(p => {
      const s = presentByEnroll.get(p.enrollment_id) || new Set<number>();
      s.add(p.course_date_id);
      presentByEnroll.set(p.enrollment_id, s);
    });

    const result: Array<{
      memberId: number; memberName: string; courseName: string; category: string;
      discount: '무료' | '감면' | ''; attended: number; operating: number; rate: number;
    }> = [];

    enrollments.forEach(e => {
      if (e.status === 'waiting') return; // 대기자는 제외
      const member = memberMap.get(e.member_id);
      const course = courseMap.get(e.course_id);
      if (!member || !course) return;

      // 회원의 수강 활동 구간 (기간 ∩ 최초수강월~종료일)
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
      if (operating === 0) return; // 운영 회차 없으면 출석률 무의미

      const presentSet = presentByEnroll.get(e.id) || new Set<number>();
      const attended = operatingDates.filter(d => presentSet.has(d.id)).length;
      const rate = Math.round((attended / operating) * 100);

      const discount: '무료' | '감면' | '' =
        member.is_discount_100 ? '무료' : member.is_discount_50 ? '감면' : '';

      result.push({
        memberId: member.id, memberName: member.name, courseName: course.name,
        category: course.category, discount, attended, operating, rate,
      });
    });

    const filtered = discountOnly ? result.filter(r => r.discount !== '') : result;
    // 출석률 낮은 순으로 정렬 (확인이 필요한 사람부터)
    filtered.sort((a, b) => a.rate - b.rate || a.memberName.localeCompare(b.memberName));
    return filtered;
  }, [loaded, courses, enrollments, members, courseDates, present, fromYear, fromMonth, toYear, toMonth, discountOnly]);

  // 최초 1회 자동 조회
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
      </div>

      {/* 기간 + 필터 */}
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
            <th style={{ ...th, textAlign: 'center' }}>출석/운영</th>
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
