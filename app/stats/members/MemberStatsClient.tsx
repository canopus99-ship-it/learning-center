'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/fetchAll';
import * as XLSX from 'xlsx';

type Member = {
  id: number;
  name: string;
  birth_date: string | null;
  gender: string;
  region_type: string;
  is_jung_gu: boolean;
  is_discount_50: boolean;
  is_discount_100: boolean;
  received_date: string | null;
};

type Enrollment = {
  id: number;
  member_id: number;
  course_id: number;
};

type CourseDate = {
  id: number;
  class_date: string;
};

type AttendanceRow = {
  enrollment_id: number;
  course_date_id: number;
  is_present: boolean;
};

type MonthlyTrend = {
  totalMembers: number;     // 그 달 말 기준 누적 회원
  newMembers: number;       // 그 달에 가입
  activeMembers: number;    // 그 달에 출석한 회원 수
};

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

function monthBounds(y: number, m: number): { start: string; end: string } {
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

// 생년월일 → 나이 (만 나이, 기준일 기준)
function calcAge(birth: string | null, refDate: Date): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b.getTime())) return null;
  let age = refDate.getFullYear() - b.getFullYear();
  const mDiff = refDate.getMonth() - b.getMonth();
  if (mDiff < 0 || (mDiff === 0 && refDate.getDate() < b.getDate())) age--;
  return age;
}

// 나이 → 연령대
function ageGroup(age: number | null): string {
  if (age === null) return '미입력';
  if (age < 60) return '60대 미만';
  if (age < 70) return '60대';
  if (age < 80) return '70대';
  return '80대 이상';
}

export default function MemberStatsClient() {
  const supabase = createClient();
  const today = new Date();

  const [fromYear, setFromYear] = useState(today.getFullYear());
  const [fromMonth, setFromMonth] = useState(1);
  const [toYear, setToYear] = useState(today.getFullYear());
  const [toMonth, setToMonth] = useState(today.getMonth() + 1);

  const [members, setMembers] = useState<Member[]>([]);
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
    const first = monthBounds(months[0].y, months[0].m);
    const last = monthBounds(months[months.length - 1].y, months[months.length - 1].m);

    // 회원/출석 데이터가 1000행을 넘을 수 있어 전부 페이지 단위로 끝까지 가져옴
    const [mRes, eRes, dRes] = await Promise.all([
      fetchAllRows<Member>((from, to) =>
        supabase
          .from('members')
          .select('id, name, birth_date, gender, region_type, is_jung_gu, is_discount_50, is_discount_100, received_date')
          .range(from, to)
      ),
      fetchAllRows<Enrollment>((from, to) =>
        supabase.from('enrollments').select('id, member_id, course_id').range(from, to)
      ),
      fetchAllRows<CourseDate>((from, to) =>
        supabase.from('course_dates').select('id, class_date').gte('class_date', first.start).lte('class_date', last.end).range(from, to)
      ),
    ]);

    const courseDateIds = (dRes.data || []).map(d => d.id);
    const allAtt: AttendanceRow[] = [];
    if (courseDateIds.length > 0) {
      for (let i = 0; i < courseDateIds.length; i += 500) {
        const chunk = courseDateIds.slice(i, i + 500);
        const r = await fetchAllRows<AttendanceRow>((from, to) =>
          supabase
            .from('attendance')
            .select('enrollment_id, course_date_id, is_present')
            .in('course_date_id', chunk)
            .eq('is_present', true)
            .range(from, to)
        );
        allAtt.push(...r.data);
      }
    }

    setMembers((mRes.data || []) as Member[]);
    setEnrollments((eRes.data || []) as Enrollment[]);
    setCourseDates((dRes.data || []) as CourseDate[]);
    setAttendance(allAtt);
    setLoading(false);
  }

  const months = useMemo(
    () => monthRange(fromYear, fromMonth, toYear, toMonth),
    [fromYear, fromMonth, toYear, toMonth]
  );

  // 월별 추이 계산
  const monthlyTrends = useMemo(() => {
    const enrollToMember = new Map<number, number>();
    enrollments.forEach(e => enrollToMember.set(e.id, e.member_id));

    const dateToMonth = new Map<number, string>();
    courseDates.forEach(d => {
      const y = parseInt(d.class_date.substring(0, 4), 10);
      const m = parseInt(d.class_date.substring(5, 7), 10);
      dateToMonth.set(d.id, `${y}-${m}`);
    });

    // 월별 활동 회원 집합 (member_id Set)
    const activeByMonth = new Map<string, Set<number>>();
    attendance.forEach(a => {
      if (!a.is_present) return;
      const monthKey = dateToMonth.get(a.course_date_id);
      if (!monthKey) return;
      const memberId = enrollToMember.get(a.enrollment_id);
      if (!memberId) return;
      if (!activeByMonth.has(monthKey)) activeByMonth.set(monthKey, new Set());
      activeByMonth.get(monthKey)!.add(memberId);
    });

    const trends = new Map<string, MonthlyTrend>();
    months.forEach(({ y, m }) => {
      const key = `${y}-${m}`;
      const { start, end } = monthBounds(y, m);

      // 그 달 말 기준 누적 회원 (received_date <= 월말)
      const totalMembers = members.filter(mb => {
        if (!mb.received_date) return false;
        return mb.received_date <= end;
      }).length;

      // 그 달 가입
      const newMembers = members.filter(mb => {
        if (!mb.received_date) return false;
        return mb.received_date >= start && mb.received_date <= end;
      }).length;

      const activeMembers = activeByMonth.get(key)?.size || 0;

      trends.set(key, { totalMembers, newMembers, activeMembers });
    });

    return trends;
  }, [members, enrollments, courseDates, attendance, months]);

  // 현재 시점 분포 (조회 기간 마지막 월 말 기준)
  const distributions = useMemo(() => {
    if (months.length === 0) return null;
    const lastMonth = months[months.length - 1];
    const { end } = monthBounds(lastMonth.y, lastMonth.m);
    const refDate = new Date(end);

    // 마지막 월 말까지 가입한 회원만
    const validMembers = members.filter(m => m.received_date && m.received_date <= end);

    // 성별
    const gender = { '남': 0, '여': 0, '미입력': 0 };
    // 연령대
    const age: Record<string, number> = { '60대 미만': 0, '60대': 0, '70대': 0, '80대 이상': 0, '미입력': 0 };
    // 거주
    const region = { '중구민': 0, '타구민': 0, '미입력': 0 };
    // 감면
    const discount = { '일반': 0, '감면 50%': 0, '감면 100%': 0 };

    validMembers.forEach(m => {
      // 성별
      if (m.gender === '남') gender['남']++;
      else if (m.gender === '여') gender['여']++;
      else gender['미입력']++;

      // 연령대
      const a = calcAge(m.birth_date, refDate);
      const g = ageGroup(a);
      age[g] = (age[g] || 0) + 1;

      // 거주
      if (m.is_jung_gu || m.region_type === '중구민') region['중구민']++;
      else if (m.region_type === '타구민') region['타구민']++;
      else region['미입력']++;

      // 감면
      if (m.is_discount_100) discount['감면 100%']++;
      else if (m.is_discount_50) discount['감면 50%']++;
      else discount['일반']++;
    });

    return {
      total: validMembers.length,
      gender, age, region, discount,
    };
  }, [members, months]);

  // 엑셀 다운로드
  function downloadExcel() {
    if (months.length === 0) return;

    const wb = XLSX.utils.book_new();

    // 시트 1: 월별 추이
    const trendRows: (string | number)[][] = [];
    trendRows.push(['월', '전체 회원', '신규 가입', '활동 회원']);
    months.forEach(({ y, m }) => {
      const t = monthlyTrends.get(`${y}-${m}`);
      trendRows.push([`${y}.${m}월`, t?.totalMembers ?? 0, t?.newMembers ?? 0, t?.activeMembers ?? 0]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(trendRows);
    ws1['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, '월별 추이');

    // 시트 2: 현재 분포
    if (distributions) {
      const distRows: (string | number)[][] = [];
      const lastMonth = months[months.length - 1];
      distRows.push([`${lastMonth.y}년 ${lastMonth.m}월 말 기준 분포`]);
      distRows.push([`전체 회원 수: ${distributions.total}명`]);
      distRows.push([]);

      distRows.push(['【 성별 】']);
      distRows.push(['구분', '인원', '비율']);
      Object.entries(distributions.gender).forEach(([k, v]) => {
        const pct = distributions.total > 0 ? ((v / distributions.total) * 100).toFixed(1) + '%' : '0%';
        distRows.push([k, v, pct]);
      });
      distRows.push([]);

      distRows.push(['【 연령대 】']);
      distRows.push(['구분', '인원', '비율']);
      Object.entries(distributions.age).forEach(([k, v]) => {
        const pct = distributions.total > 0 ? ((v / distributions.total) * 100).toFixed(1) + '%' : '0%';
        distRows.push([k, v, pct]);
      });
      distRows.push([]);

      distRows.push(['【 거주 】']);
      distRows.push(['구분', '인원', '비율']);
      Object.entries(distributions.region).forEach(([k, v]) => {
        const pct = distributions.total > 0 ? ((v / distributions.total) * 100).toFixed(1) + '%' : '0%';
        distRows.push([k, v, pct]);
      });
      distRows.push([]);

      distRows.push(['【 감면 】']);
      distRows.push(['구분', '인원', '비율']);
      Object.entries(distributions.discount).forEach(([k, v]) => {
        const pct = distributions.total > 0 ? ((v / distributions.total) * 100).toFixed(1) + '%' : '0%';
        distRows.push([k, v, pct]);
      });

      const ws2 = XLSX.utils.aoa_to_sheet(distRows);
      ws2['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws2, '현재 분포');
    }

    const range = months.length === 1
      ? `${months[0].y}년${months[0].m}월`
      : `${months[0].y}년${months[0].m}월-${months[months.length - 1].y}년${months[months.length - 1].m}월`;
    XLSX.writeFile(wb, `회원통계_${range}.xlsx`);
  }

  const lastMonthLabel = months.length > 0
    ? `${months[months.length - 1].y}년 ${months[months.length - 1].m}월 말 기준`
    : '';

  return (
    <div style={{ maxWidth: 1100, margin: '40px auto', padding: 20 }}>
      <Link href="/stats" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 통계 메뉴로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>👥 회원 통계</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        선택한 기간의 월별 회원 추이와 현재 분포를 조회합니다.
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
          disabled={loading || months.length === 0}
          style={{
            padding: '8px 16px', fontSize: 13, borderRadius: 6,
            background: loading || months.length === 0 ? '#ccc' : '#1D9E75',
            color: 'white', border: 'none',
            cursor: loading || months.length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          📥 엑셀 다운로드
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>불러오는 중...</p>
      ) : (
        <>
          {/* 월별 추이 */}
          <div style={{
            background: 'white', borderRadius: 12, padding: 20, marginBottom: 16,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}>
            <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>📈 월별 추이</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#fafafa', borderBottom: '2px solid #ddd' }}>
                    <th style={th}>월</th>
                    <th style={th}>전체 회원</th>
                    <th style={th}>신규 가입</th>
                    <th style={th}>활동 회원</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map(({ y, m }) => {
                    const t = monthlyTrends.get(`${y}-${m}`);
                    return (
                      <tr key={`${y}-${m}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ ...td, fontWeight: 500 }}>{y === today.getFullYear() ? `${m}월` : `${y}.${m}월`}</td>
                        <td style={td}>{(t?.totalMembers ?? 0).toLocaleString()}명</td>
                        <td style={td}>
                          {(t?.newMembers ?? 0) > 0 && <span style={{ color: '#1D9E75', fontWeight: 500 }}>+{t!.newMembers}</span>}
                          {(t?.newMembers ?? 0) === 0 && '-'}
                        </td>
                        <td style={td}>{(t?.activeMembers ?? 0).toLocaleString()}명</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 현재 분포 */}
          {distributions && distributions.total > 0 && (
            <div style={{
              background: 'white', borderRadius: 12, padding: 20, marginBottom: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>📊 현재 분포</h2>
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
                {lastMonthLabel} 전체 {distributions.total.toLocaleString()}명
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
              }}>
                <DistributionCard title="성별" data={distributions.gender} total={distributions.total} color="#185FA5" />
                <DistributionCard title="연령대" data={distributions.age} total={distributions.total} color="#7B3FBF" />
                <DistributionCard title="거주" data={distributions.region} total={distributions.total} color="#1D9E75" />
                <DistributionCard title="감면" data={distributions.discount} total={distributions.total} color="#BA7517" />
              </div>
            </div>
          )}

          {distributions && distributions.total === 0 && (
            <div style={{
              background: 'white', borderRadius: 12, padding: 40, textAlign: 'center',
              color: '#888', fontSize: 14,
            }}>
              선택한 기간에 등록된 회원이 없습니다.
            </div>
          )}
        </>
      )}

      {/* 안내 */}
      <div style={{
        marginTop: 16, padding: 12,
        background: '#FFF8E1', border: '1px solid #FFE082',
        borderRadius: 8, fontSize: 12, color: '#5D4037', lineHeight: 1.6,
      }}>
        <strong>💡 용어 안내</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li><strong>전체 회원</strong>: 해당 월 말 기준 누적 등록 회원 수</li>
          <li><strong>신규 가입</strong>: 해당 월에 등록한 회원 수 (회원 접수일 기준)</li>
          <li><strong>활동 회원</strong>: 해당 월에 한 번이라도 출석한 회원 수 (중복 제거)</li>
          <li><strong>현재 분포</strong>: 조회 기간의 마지막 월 말 기준 회원 분포</li>
          <li><strong>연령대</strong>: 마지막 월 말 기준 만 나이</li>
        </ul>
      </div>
    </div>
  );
}

// 분포 카드
function DistributionCard({ title, data, total, color }: {
  title: string;
  data: Record<string, number>;
  total: number;
  color: string;
}) {
  const entries = Object.entries(data);
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
      <h3 style={{ fontSize: 13, margin: '0 0 10px', color: '#555', fontWeight: 600 }}>{title}</h3>
      {entries.map(([k, v]) => {
        const pct = total > 0 ? (v / total) * 100 : 0;
        return (
          <div key={k} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3, fontSize: 12 }}>
              <span style={{ color: '#555' }}>{k}</span>
              <span>
                <strong style={{ color: '#222' }}>{v}명</strong>
                <span style={{ color: '#888', marginLeft: 4, fontSize: 11 }}>({pct.toFixed(1)}%)</span>
              </span>
            </div>
            <div style={{ background: '#f0f0f0', borderRadius: 3, height: 6, overflow: 'hidden' }}>
              <div style={{
                background: color, height: '100%',
                width: `${pct}%`,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: 12,
};
const td: React.CSSProperties = {
  padding: '8px 12px',
};
