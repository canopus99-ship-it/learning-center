'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

type Course = {
  id: number;
  category: string;
  name: string;
  is_active: boolean;
};

type Enrollment = {
  id: number;
  member_id: number;
  course_id: number;
  status: string;
  enrolled_at: string;
  end_date: string | null;
};

type CourseDate = {
  id: number;
  course_id: number;
  class_date: string;
  is_cancelled: boolean;
};

type AttendanceRow = {
  enrollment_id: number;
  course_date_id: number;
  is_present: boolean;
};

// 출석한 회원 정보 (member_id를 알기 위해)
type EnrollmentMinimal = {
  id: number;
  member_id: number;
  course_id: number;
};

type MonthlyStat = {
  sessions: number;     // 강의 횟수
  newCount: number;     // 신규인원
  realCount: number;    // 실인원
  attendanceCount: number; // 연인원
};

// 월 범위 → 월 배열
function monthRange(fromY: number, fromM: number, toY: number, toM: number): { y: number; m: number }[] {
  const result: { y: number; m: number }[] = [];
  let y = fromY, m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    result.push({ y, m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

// 월의 시작일/말일 (YYYY-MM-DD)
function monthBounds(y: number, m: number): { start: string; end: string } {
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export default function CourseStatsClient() {
  const supabase = createClient();
  const today = new Date();

  const [fromYear, setFromYear] = useState(today.getFullYear());
  const [fromMonth, setFromMonth] = useState(1);
  const [toYear, setToYear] = useState(today.getFullYear());
  const [toMonth, setToMonth] = useState(today.getMonth() + 1);

  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [courseDates, setCourseDates] = useState<CourseDate[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromYear, fromMonth, toYear, toMonth]);

  async function loadAll() {
    setLoading(true);
    const months = monthRange(fromYear, fromMonth, toYear, toMonth);
    if (months.length === 0) {
      setLoading(false);
      return;
    }
    // 신규인원 계산을 위해 전월 데이터도 함께 로드
    const firstMonth = months[0];
    const prevY = firstMonth.m === 1 ? firstMonth.y - 1 : firstMonth.y;
    const prevM = firstMonth.m === 1 ? 12 : firstMonth.m - 1;
    const first = monthBounds(prevY, prevM);
    const last = monthBounds(months[months.length - 1].y, months[months.length - 1].m);

    const [cRes, eRes, dRes] = await Promise.all([
      supabase.from('courses').select('id, category, name, is_active').order('category').order('name'),
      // enrollment은 enrollment_id → member_id 매핑용 (출석 분석에 필요)
      supabase.from('enrollments').select('id, member_id, course_id, status, enrolled_at, end_date'),
      // 전월 포함하여 로드
      supabase.from('course_dates').select('id, course_id, class_date, is_cancelled').gte('class_date', first.start).lte('class_date', last.end),
    ]);

    const courseDateIds = (dRes.data || []).map(d => d.id);
    let attRes: { data: AttendanceRow[] | null } = { data: [] };
    if (courseDateIds.length > 0) {
      // in 절은 chunk로 나눠야 안전 (1000개 제한)
      const allAtt: AttendanceRow[] = [];
      for (let i = 0; i < courseDateIds.length; i += 500) {
        const chunk = courseDateIds.slice(i, i + 500);
        const r = await supabase
          .from('attendance')
          .select('enrollment_id, course_date_id, is_present')
          .in('course_date_id', chunk)
          .eq('is_present', true);
        if (r.data) allAtt.push(...r.data);
      }
      attRes.data = allAtt;
    }

    setCourses(cRes.data || []);
    setEnrollments((eRes.data || []) as Enrollment[]);
    setCourseDates((dRes.data || []) as CourseDate[]);
    setAttendance(attRes.data || []);
    setLoading(false);
  }

  const months = useMemo(
    () => monthRange(fromYear, fromMonth, toYear, toMonth),
    [fromYear, fromMonth, toYear, toMonth]
  );

  // 강좌별, 월별 통계 계산 (출석부 기반)
  // - 강의횟수: 그 달의 course_dates 중 휴강 제외
  // - 실인원: 그 달에 출석한 적이 있는 회원 수 (member_id 중복 제거)
  // - 신규인원: 그 달 실인원 중 "전월 실인원"에 없던 사람
  // - 연인원: 그 달의 출석체크 수 합계
  const courseStats = useMemo(() => {
    // enrollment_id → member_id 매핑
    const enrollToMember = new Map<number, number>();
    enrollments.forEach(e => enrollToMember.set(e.id, e.member_id));

    // course_date_id → (course_id, month_key) 매핑
    const dateToInfo = new Map<number, { courseId: number; key: string }>();
    courseDates.forEach(d => {
      const y = parseInt(d.class_date.substring(0, 4), 10);
      const m = parseInt(d.class_date.substring(5, 7), 10);
      dateToInfo.set(d.id, { courseId: d.course_id, key: `${y}-${m}` });
    });

    // 강좌+월별 출석 회원 집합 (member_id Set)
    // key: `${courseId}-${y}-${m}` → Set<member_id>
    const attendedMembers = new Map<string, Set<number>>();
    // 강좌+월별 출석 횟수 합계 (연인원)
    const attendanceCounts = new Map<string, number>();

    attendance.forEach(a => {
      if (!a.is_present) return;
      const info = dateToInfo.get(a.course_date_id);
      if (!info) return;
      const memberId = enrollToMember.get(a.enrollment_id);
      if (!memberId) return;
      const key = `${info.courseId}-${info.key}`;
      if (!attendedMembers.has(key)) attendedMembers.set(key, new Set());
      attendedMembers.get(key)!.add(memberId);
      attendanceCounts.set(key, (attendanceCounts.get(key) || 0) + 1);
    });

    // 전월 키 계산 헬퍼
    function prevMonthKey(y: number, m: number): string {
      if (m === 1) return `${y - 1}-12`;
      return `${y}-${m - 1}`;
    }

    const result = new Map<number, { course: Course; perMonth: Map<string, MonthlyStat>; total: MonthlyStat }>();

    courses.forEach(course => {
      const perMonth = new Map<string, MonthlyStat>();
      let totalSessions = 0;
      let totalNew = 0;
      let totalAtt = 0;
      const allMembersInRange = new Set<number>(); // 전체 기간 실인원 (중복 제거)

      months.forEach(({ y, m }) => {
        const monthKey = `${y}-${m}`;
        const { start, end } = monthBounds(y, m);

        // 강의 횟수
        const sessions = courseDates.filter(d =>
          d.course_id === course.id && !d.is_cancelled &&
          d.class_date >= start && d.class_date <= end
        ).length;

        // 그 달 출석 회원 (member_id Set)
        const thisMonthSet = attendedMembers.get(`${course.id}-${monthKey}`) || new Set<number>();
        const realCount = thisMonthSet.size;

        // 신규인원 = 그 달 출석회원 중 전월 출석회원에 없던 사람
        const prevKey = prevMonthKey(y, m);
        const prevMonthSet = attendedMembers.get(`${course.id}-${prevKey}`) || new Set<number>();
        let newCount = 0;
        thisMonthSet.forEach(mid => {
          if (!prevMonthSet.has(mid)) newCount++;
        });

        // 연인원
        const attendanceCount = attendanceCounts.get(`${course.id}-${monthKey}`) || 0;

        const stat: MonthlyStat = { sessions, newCount, realCount, attendanceCount };
        perMonth.set(monthKey, stat);
        totalSessions += sessions;
        totalNew += newCount;
        totalAtt += attendanceCount;

        // 합계 실인원용
        thisMonthSet.forEach(mid => allMembersInRange.add(mid));
      });

      result.set(course.id, {
        course,
        perMonth,
        total: { sessions: totalSessions, newCount: totalNew, realCount: allMembersInRange.size, attendanceCount: totalAtt },
      });
    });

    return result;
  }, [courses, enrollments, courseDates, attendance, months]);

  // 표시할 강좌: 기간 내에 강의 또는 신청 이력이 1개라도 있는 강좌
  const visibleCourses = useMemo(() => {
    return courses.filter(c => {
      const stat = courseStats.get(c.id);
      if (!stat) return false;
      return stat.total.sessions > 0 || stat.total.newCount > 0 || stat.total.realCount > 0;
    });
  }, [courses, courseStats]);

  // 엑셀 다운로드
  function downloadExcel() {
    if (visibleCourses.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }
    const header1: string[] = ['카테고리', '강좌명'];
    const header2: string[] = ['', ''];
    months.forEach(({ y, m }) => {
      header1.push(`${y}.${m}월`, '', '', '');
      header2.push('강의횟수', '신규인원', '실인원', '연인원');
    });
    header1.push('합계', '', '', '');
    header2.push('강의횟수', '신규인원', '실인원', '연인원');

    const rows: (string | number)[][] = [header1, header2];
    visibleCourses.forEach(course => {
      const stat = courseStats.get(course.id);
      if (!stat) return;
      const row: (string | number)[] = [course.category || '', course.name];
      months.forEach(({ y, m }) => {
        const s = stat.perMonth.get(`${y}-${m}`);
        row.push(s?.sessions ?? 0, s?.newCount ?? 0, s?.realCount ?? 0, s?.attendanceCount ?? 0);
      });
      row.push(stat.total.sessions, stat.total.newCount, stat.total.realCount, stat.total.attendanceCount);
      rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    // 컬럼 너비
    const cols = [{ wch: 12 }, { wch: 20 }];
    months.forEach(() => {
      cols.push({ wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 });
    });
    cols.push({ wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 });
    ws['!cols'] = cols;

    // 헤더 1행 (월명) 가로 병합
    const merges: any[] = [];
    let colIdx = 2;
    months.forEach(() => {
      merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + 3 } });
      colIdx += 4;
    });
    merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + 3 } });
    // 카테고리, 강좌명 세로 병합
    merges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } });
    merges.push({ s: { r: 0, c: 1 }, e: { r: 1, c: 1 } });
    ws['!merges'] = merges;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '강좌현황');

    const range = months.length === 1
      ? `${months[0].y}년${months[0].m}월`
      : `${months[0].y}년${months[0].m}월-${months[months.length - 1].y}년${months[months.length - 1].m}월`;
    XLSX.writeFile(wb, `강좌현황_${range}.xlsx`);
  }

  return (
    <div style={{ maxWidth: 1400, margin: '40px auto', padding: 20 }}>
      <Link href="/stats" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 통계 메뉴로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>📚 강좌 현황</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        선택한 기간의 강좌별 강의 횟수, 신규/실인원, 연인원(출석 총합)을 조회합니다.
      </p>

      {/* 기간 선택 */}
      <div style={{
        background: 'white', borderRadius: 12, padding: 16, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <strong style={{ fontSize: 13, color: '#555' }}>기간</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="number" value={fromYear} onChange={(e) => setFromYear(parseInt(e.target.value) || today.getFullYear())} style={{ width: 70, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
          <span style={{ fontSize: 13 }}>년</span>
          <select value={fromMonth} onChange={(e) => setFromMonth(parseInt(e.target.value))} style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </div>
        <span style={{ fontSize: 16, color: '#888' }}>~</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="number" value={toYear} onChange={(e) => setToYear(parseInt(e.target.value) || today.getFullYear())} style={{ width: 70, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
          <span style={{ fontSize: 13 }}>년</span>
          <select value={toMonth} onChange={(e) => setToMonth(parseInt(e.target.value))} style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={downloadExcel}
          disabled={loading || visibleCourses.length === 0}
          style={{
            padding: '8px 16px', fontSize: 13, borderRadius: 6,
            background: loading || visibleCourses.length === 0 ? '#ccc' : '#1D9E75',
            color: 'white', border: 'none',
            cursor: loading || visibleCourses.length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          📥 엑셀 다운로드
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>불러오는 중...</p>
      ) : visibleCourses.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 12, padding: 40, textAlign: 'center',
          color: '#888', fontSize: 14,
        }}>
          해당 기간에 활동한 강좌가 없습니다.
        </div>
      ) : (
        <div style={{
          background: 'white', borderRadius: 12, padding: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'auto',
        }}>
          <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
            총 {visibleCourses.length}개 강좌
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '2px solid #ddd' }}>
                <th rowSpan={2} style={thStyle}>카테고리</th>
                <th rowSpan={2} style={thStyle}>강좌명</th>
                {months.map(({ y, m }) => (
                  <th key={`${y}-${m}`} colSpan={4} style={{ ...thStyle, background: '#f0f7ff', borderLeft: '1px solid #ddd' }}>
                    {y === today.getFullYear() ? `${m}월` : `${y}.${m}월`}
                  </th>
                ))}
                <th colSpan={4} style={{ ...thStyle, background: '#FFF8E1', borderLeft: '2px solid #BA7517' }}>
                  합계
                </th>
              </tr>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #ddd' }}>
                {months.map(({ y, m }, idx) => (
                  <Sub4 key={`sub-${y}-${m}`} leftBorder={idx === 0 || true} />
                ))}
                <Sub4 leftBorder highlighted />
              </tr>
            </thead>
            <tbody>
              {visibleCourses.map(course => {
                const stat = courseStats.get(course.id);
                if (!stat) return null;
                return (
                  <tr key={course.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 11, padding: '2px 6px', borderRadius: 3,
                        background: '#eee', color: '#555',
                      }}>{course.category}</span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                      <Link href={`/courses/${course.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                        {course.name}
                      </Link>
                    </td>
                    {months.map(({ y, m }) => {
                      const s = stat.perMonth.get(`${y}-${m}`);
                      return (
                        <Cells4 key={`${course.id}-${y}-${m}`}
                          s={s?.sessions ?? 0}
                          n={s?.newCount ?? 0}
                          r={s?.realCount ?? 0}
                          a={s?.attendanceCount ?? 0}
                          leftBorder
                        />
                      );
                    })}
                    <Cells4
                      s={stat.total.sessions}
                      n={stat.total.newCount}
                      r={stat.total.realCount}
                      a={stat.total.attendanceCount}
                      leftBorder
                      highlighted
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 안내 */}
      <div style={{
        marginTop: 16, padding: 12,
        background: '#FFF8E1', border: '1px solid #FFE082',
        borderRadius: 8, fontSize: 12, color: '#5D4037', lineHeight: 1.6,
      }}>
        <strong>💡 용어 안내 (출석부 기반)</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li><strong>강의 횟수</strong>: 해당 월에 진행한 실제 수업 횟수 (휴강 제외)</li>
          <li><strong>실인원</strong>: 해당 월 출석부에 등록된 회원 수 (한 번이라도 출석한 사람, 중복 제거)</li>
          <li><strong>신규인원</strong>: 실인원 중 전월 출석부에 없던 사람</li>
          <li><strong>연인원</strong>: 해당 월 출석 횟수의 총합</li>
          <li><strong>합계의 실인원</strong>: 전체 기간 동안 한 번이라도 출석한 회원 수 (중복 제거)</li>
        </ul>
      </div>
    </div>
  );
}

// 4개 컬럼 헤더
function Sub4({ leftBorder, highlighted }: { leftBorder?: boolean; highlighted?: boolean }) {
  const base: React.CSSProperties = {
    padding: '6px 8px', textAlign: 'center', fontSize: 11, color: '#555',
    background: highlighted ? '#FFF8E1' : '#fafafa',
  };
  const first: React.CSSProperties = leftBorder
    ? { ...base, borderLeft: highlighted ? '2px solid #BA7517' : '1px solid #ddd' }
    : base;
  return (
    <>
      <th style={first}>강의횟수</th>
      <th style={base}>신규</th>
      <th style={base}>실인원</th>
      <th style={base}>연인원</th>
    </>
  );
}

// 4개 데이터 셀
function Cells4({ s, n, r, a, leftBorder, highlighted }: { s: number; n: number; r: number; a: number; leftBorder?: boolean; highlighted?: boolean }) {
  const base: React.CSSProperties = {
    padding: '6px 8px', textAlign: 'center',
    background: highlighted ? '#FFFDF5' : 'white',
  };
  const first: React.CSSProperties = leftBorder
    ? { ...base, borderLeft: highlighted ? '2px solid #BA7517' : '1px solid #ddd' }
    : base;
  const dimColor = highlighted ? '#5D4037' : '#888';
  return (
    <>
      <td style={{ ...first, color: s === 0 ? dimColor : '#222' }}>{s || '-'}</td>
      <td style={{ ...base, color: n === 0 ? dimColor : '#222' }}>{n || '-'}</td>
      <td style={{ ...base, color: r === 0 ? dimColor : '#222', fontWeight: highlighted ? 600 : 400 }}>{r || '-'}</td>
      <td style={{ ...base, color: a === 0 ? dimColor : '#222' }}>{a || '-'}</td>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#333',
};
const tdStyle: React.CSSProperties = {
  padding: '8px', whiteSpace: 'nowrap',
};
