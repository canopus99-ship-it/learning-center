'use client';

import { useEffect, useMemo, useState } from 'react';
import { DAY_LABELS, FREQUENCY_LABELS } from '@/lib/courseDates';

type CourseLevel = {
  level_name: string;
  fee_jung_gu: number;
  fee_other: number;
  sort_order: number;
};

type CourseSession = {
  frequency: string | null;
  day_of_week: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
};

type PublicCourse = {
  id: number;
  category: string;
  name: string;
  classroom: string | null;
  capacity: number;
  operation_type: string;
  operation_months: string | null;
  fee_jung_gu: number;
  fee_other: number;
  is_free: boolean;
  is_lesson: boolean;
  use_levels: boolean;
  course_levels: CourseLevel[];
  course_sessions: CourseSession[];
};

const CATEGORY_ORDER = ['문화강좌', '성숙한시민', '능동적시민', '평등한시민', '기타'];
const CATEGORY_COLORS: Record<string, string> = {
  문화강좌: '#185FA5',
  성숙한시민: '#7B3FBF',
  능동적시민: '#1D9E75',
  평등한시민: '#BA7517',
  기타: '#666',
};
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 7];

function startHour(time: string): number | null {
  const m = time?.match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

function timeSlotOf(course: PublicCourse): string {
  const hours = course.course_sessions
    .map((s) => startHour(s.start_time))
    .filter((h): h is number => h !== null);
  if (hours.length === 0) return '';
  const h = Math.min(...hours);
  if (h < 12) return '오전';
  if (h < 18) return '오후';
  return '저녁';
}

function sessionLabel(s: CourseSession): string {
  if (s.day_of_week) {
    const day = DAY_LABELS[s.day_of_week] || '';
    const freq = s.frequency && s.frequency !== 'weekly' ? FREQUENCY_LABELS[s.frequency] + ' ' : '';
    return `${freq}${day} ${s.start_time}~${s.end_time}`;
  }
  if (s.specific_date) {
    return `${s.specific_date} ${s.start_time}~${s.end_time}`;
  }
  return `${s.start_time}~${s.end_time}`;
}

function scheduleSummary(course: PublicCourse): string {
  if (!course.course_sessions || course.course_sessions.length === 0) return '별도 협의';
  if (course.operation_type === 'irregular') {
    return `비정기 · ${course.course_sessions.length}회 (${course.course_sessions
      .map((s) => s.specific_date)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ')}${course.course_sessions.length > 3 ? ' 등' : ''})`;
  }
  return course.course_sessions.map(sessionLabel).join(' · ');
}

function feeNode(course: PublicCourse): { junggu: string; other: string } {
  if (course.is_free) return { junggu: '무료', other: '무료' };
  if (course.use_levels && course.course_levels?.length) {
    const sorted = [...course.course_levels].sort((a, b) => a.sort_order - b.sort_order);
    return {
      junggu: sorted.map((l) => `${l.level_name} ${l.fee_jung_gu.toLocaleString()}원`).join(' / '),
      other: sorted.map((l) => `${l.level_name} ${l.fee_other.toLocaleString()}원`).join(' / '),
    };
  }
  return {
    junggu: `${course.fee_jung_gu.toLocaleString()}원`,
    other: `${course.fee_other.toLocaleString()}원`,
  };
}

export default function CoursesSearchClient() {
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [dayFilter, setDayFilter] = useState<number | ''>('');
  const [timeFilter, setTimeFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/public/courses', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '강좌 정보를 불러오지 못했습니다.');
        setCourses(json.courses || []);
        setUpdatedAt(json.generatedAt || null);
      } catch (e: any) {
        setLoadError(e?.message || '강좌 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return courses.filter((c) => {
      if (query) {
        const hay = `${c.name} ${c.category} ${c.classroom || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (dayFilter && !c.course_sessions.some((s) => s.day_of_week === dayFilter)) return false;
      if (timeFilter && timeSlotOf(c) !== timeFilter) return false;
      if (catFilter && c.category !== catFilter) return false;
      return true;
    });
  }, [courses, q, dayFilter, timeFilter, catFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, PublicCourse[]>();
    filtered.forEach((c) => {
      const list = map.get(c.category) || [];
      list.push(c);
      map.set(c.category, list);
    });
    return map;
  }, [filtered]);

  return (
    <div style={{ minHeight: '100vh', background: '#fbf7ef' }}>
      <style>{`
        .cs-search-box { background:#fff; border-radius:999px; display:flex; align-items:center; padding:10px 16px; box-shadow:0 4px 14px rgba(0,0,0,0.12); }
        .cs-search-box input { border:none; outline:none; flex:1; font-size:15px; background:transparent; }
        .cs-filters { display:flex; gap:8px; margin-top:10px; overflow-x:auto; padding-bottom:2px; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
        .cs-filters::-webkit-scrollbar { display:none; }
        .cs-filters select { border:none; border-radius:999px; padding:9px 14px; font-size:13px; background:rgba(255,255,255,0.92); color:#2f6f4f; font-weight:600; flex-shrink:0; }
        .cs-card { background:#fff; border:1px solid #e3ddd0; border-radius:16px; padding:14px 16px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.03); }
        .cs-badge { font-size:11px; font-weight:700; padding:3px 8px; border-radius:999px; background:#f3ead9; color:#5b6357; white-space:nowrap; }
      `}</style>

      <header
        style={{
          background: 'linear-gradient(135deg,#2f6f4f,#3c8562)',
          color: '#fff',
          padding: '22px 16px 18px',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
        }}
      >
        <h1 style={{ margin: '0 0 2px', fontSize: 19, fontWeight: 700 }}>🌱 늘품학습센터 강좌 검색</h1>
        <p style={{ margin: 0, fontSize: 12.5, opacity: 0.85 }}>
          중림종합사회복지관 · 회원관리 시스템과 실시간 연동
        </p>
        <div style={{ maxWidth: 720, margin: '14px auto 0', padding: '0 16px' }}>
          <div className="cs-search-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ marginRight: 8, color: '#2f6f4f', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="강좌명, 강의실로 검색 (예: 요가, 당구, 피아노)"
            />
          </div>
          <div className="cs-filters">
            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value ? parseInt(e.target.value, 10) : '')}>
              <option value="">요일 전체</option>
              {DAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DAY_LABELS[d]}요일
                </option>
              ))}
            </select>
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
              <option value="">시간대 전체</option>
              <option value="오전">오전</option>
              <option value="오후">오후</option>
              <option value="저녁">저녁</option>
            </select>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">분류 전체</option>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '14px 16px 60px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#5b6357', padding: '50px 0' }}>강좌 정보를 불러오는 중...</p>
        ) : loadError ? (
          <p style={{ textAlign: 'center', color: '#a32d2d', padding: '50px 0' }}>{loadError}</p>
        ) : (
          <>
            <div
              style={{
                fontSize: 13,
                color: '#5b6357',
                margin: '10px 2px 12px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>총 {filtered.length}개 강좌 (운영중)</span>
              <button
                onClick={() => {
                  setQ('');
                  setDayFilter('');
                  setTimeFilter('');
                  setCatFilter('');
                }}
                style={{ border: 'none', background: 'none', color: '#2f6f4f', fontWeight: 600, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer' }}
              >
                필터 초기화
              </button>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#5b6357', fontSize: 14 }}>
                🔍 조건에 맞는 강좌가 없어요.
                <br />
                검색어나 필터를 조정해 보세요.
              </div>
            ) : (
              CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
                <div key={cat} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: CATEGORY_COLORS[cat],
                      background: (CATEGORY_COLORS[cat] || '#666') + '1a',
                      display: 'inline-block',
                      padding: '5px 12px',
                      borderRadius: 999,
                      marginBottom: 10,
                    }}
                  >
                    {cat} ({grouped.get(cat)!.length})
                  </div>
                  {grouped.get(cat)!.map((c) => {
                    const fee = feeNode(c);
                    return (
                      <div className="cs-card" key={c.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {c.is_free && <span className="cs-badge" style={{ background: '#e7f3ec', color: '#2f6f4f' }}>무료</span>}
                            {c.is_lesson && <span className="cs-badge" style={{ background: '#f1e8fb', color: '#7B3FBF' }}>레슨제</span>}
                          </div>
                        </div>
                        <div
                          style={{
                            marginTop: 10,
                            display: 'grid',
                            gridTemplateColumns: 'auto 1fr',
                            gap: '5px 10px',
                            fontSize: 13.5,
                          }}
                        >
                          <div style={{ color: '#5b6357' }}>일정</div>
                          <div>{scheduleSummary(c)}</div>
                          <div style={{ color: '#5b6357' }}>강의실</div>
                          <div>{c.classroom || '-'}</div>
                          <div style={{ color: '#5b6357' }}>정원</div>
                          <div>{c.capacity}명</div>
                        </div>
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e3ddd0', display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13.5 }}>
                          <div>
                            중구민 <b style={{ color: '#2f6f4f' }}>{fee.junggu}</b>
                          </div>
                          <div>
                            타구민 <b style={{ color: '#2f6f4f' }}>{fee.other}</b>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </>
        )}
      </main>

      <footer style={{ textAlign: 'center', fontSize: 11.5, color: '#5b6357', padding: '20px 16px 40px', lineHeight: 1.6 }}>
        중림종합사회복지관 늘품학습센터 · 실제 수강신청·정원·요일/시간은 변경될 수 있어요.
        <br />
        정확한 최신 정보와 신청 방법은 늘품학습센터 담당자에게 문의해 주세요.
        {updatedAt && (
          <>
            <br />
            데이터 갱신: {new Date(updatedAt).toLocaleString('ko-KR')}
          </>
        )}
      </footer>
    </div>
  );
}
