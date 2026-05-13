'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Course = {
  id: number;
  category: string;
  name: string;
  instructor_id: number | null;
  schedule_days: string | null;
  schedule_time: string | null;
  classroom: string | null;
  start_date: string | null;
  end_date: string | null;
  operation_months: string | null;
  fee_jung_gu: number;
  fee_other: number;
  is_free: boolean;
  capacity: number;
  frequency: string;
  is_active: boolean;
  memo: string | null;
};

type Instructor = {
  id: number;
  name: string;
  is_active: boolean;
};

const CATEGORIES = ['문화강좌', '성숙한시민', '능동적시민', '평등한시민', '기타'];
const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5',
  '성숙한시민': '#7B3FBF',
  '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517',
  '기타': '#666',
};
const FREQUENCIES = [
  { value: 'weekly', label: '매주' },
  { value: 'biweekly', label: '격주' },
  { value: 'monthly', label: '매월' },
  { value: 'irregular', label: '비정기' },
];
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const ALL_MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export default function CoursesClient() {
  const supabase = createClient();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');

  // 폼 입력값
  const [category, setCategory] = useState('문화강좌');
  const [name, setName] = useState('');
  const [instructorId, setInstructorId] = useState<string>('');
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [classroom, setClassroom] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [operationMonths, setOperationMonths] = useState<string[]>([...ALL_MONTHS]);
  const [feeJungGu, setFeeJungGu] = useState('');
  const [feeOther, setFeeOther] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [capacity, setCapacity] = useState('20');
  const [frequency, setFrequency] = useState('weekly');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);

    // 강좌와 강사를 동시에 로드
    const [coursesRes, instructorsRes] = await Promise.all([
      supabase.from('courses').select('*').order('category').order('name'),
      supabase.from('instructors').select('id, name, is_active').order('name'),
    ]);

    if (coursesRes.error) {
      alert('강좌 목록 불러오기 실패: ' + coursesRes.error.message);
    } else {
      setCourses(coursesRes.data || []);
    }

    if (instructorsRes.error) {
      console.error('강사 목록 불러오기 실패:', instructorsRes.error);
    } else {
      setInstructors(instructorsRes.data || []);
    }

    setLoading(false);
  }

  function toggleDay(day: string) {
    setScheduleDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  function toggleMonth(month: string) {
    setOperationMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month].sort((a, b) => parseInt(a) - parseInt(b))
    );
  }

  function resetForm() {
    setCategory('문화강좌'); setName(''); setInstructorId('');
    setScheduleDays([]); setScheduleTime(''); setClassroom('');
    setStartDate(''); setEndDate('');
    setOperationMonths([...ALL_MONTHS]);
    setFeeJungGu(''); setFeeOther(''); setIsFree(false);
    setCapacity('20'); setFrequency('weekly'); setMemo('');
  }

  async function handleSubmit() {
    if (!name.trim()) {
      alert('강좌명을 입력하세요');
      return;
    }

    const newCourse = {
      category,
      name: name.trim(),
      instructor_id: instructorId ? parseInt(instructorId, 10) : null,
      schedule_days: scheduleDays.join(','),
      schedule_time: scheduleTime || null,
      classroom: classroom || null,
      start_date: startDate || null,
      end_date: endDate || null,
      operation_months: operationMonths.join(','),
      fee_jung_gu: isFree ? 0 : (parseInt(feeJungGu, 10) || 0),
      fee_other: isFree ? 0 : (parseInt(feeOther, 10) || 0),
      is_free: isFree,
      capacity: parseInt(capacity, 10) || 20,
      frequency,
      memo: memo.trim() || null,
      is_active: true,
    };

    const { error } = await supabase.from('courses').insert([newCourse]);

    if (error) {
      alert('강좌 등록 실패: ' + error.message);
    } else {
      alert('강좌가 등록되었습니다!');
      resetForm();
      setShowForm(false);
      loadData();
    }
  }

  // 강사 ID → 이름 매핑
  const instructorMap = new Map(instructors.map(i => [i.id, i.name]));

  // 필터링
  const filteredCourses = courses.filter((c) => {
    if (filterActive === 'active' && !c.is_active) return false;
    if (filterActive === 'inactive' && c.is_active) return false;
    if (filterCategory !== 'all' && c.category !== filterCategory) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const instructorName = c.instructor_id ? instructorMap.get(c.instructor_id) || '' : '';
    return (
      c.name?.toLowerCase().includes(q) ||
      c.classroom?.toLowerCase().includes(q) ||
      instructorName.toLowerCase().includes(q)
    );
  });

  // 활동중인 강사만 (등록 시 선택용)
  const activeInstructors = instructors.filter(i => i.is_active);

  return (
    <div style={{ maxWidth: 1200, margin: '40px auto', padding: 20 }}>
      <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20 }}>강좌 관리</h1>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 20px',
          background: showForm ? '#888' : '#185FA5',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
        }}>
          {showForm ? '닫기' : '+ 신규 강좌 등록'}
        </button>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 강좌명, 강사명, 강의실로 검색"
          style={{
            flex: 1,
            minWidth: 200,
            padding: '10px 14px',
            border: '1px solid #ddd',
            borderRadius: 8,
            fontSize: 14,
          }}
        />
      </div>

      {/* 카테고리 필터 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#666', marginRight: 4 }}>강좌구분:</span>
        <button
          onClick={() => setFilterCategory('all')}
          style={chipStyle(filterCategory === 'all', '#666')}
        >전체</button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            style={chipStyle(filterCategory === cat, CATEGORY_COLORS[cat])}
          >{cat}</button>
        ))}
        <span style={{ fontSize: 12, color: '#666', marginLeft: 16, marginRight: 4 }}>상태:</span>
        {(['active', 'inactive', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilterActive(f)}
            style={chipStyle(filterActive === f, '#185FA5')}
          >
            {f === 'active' ? '운영중' : f === 'inactive' ? '종료' : '전체'}
          </button>
        ))}
      </div>

      {showForm && (
        <div style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>새 강좌 등록</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>강좌구분 *</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>강좌명 *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="예: 요가 초급반" />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>강사</label>
            <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} style={inputStyle}>
              <option value="">(미정)</option>
              {activeInstructors.map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
            {activeInstructors.length === 0 && (
              <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                활동중인 강사가 없습니다. <Link href="/instructors" style={{ color: '#185FA5' }}>강사 등록</Link> 후 다시 시도하세요.
              </p>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>요일</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  style={{
                    flex: 1,
                    padding: 10,
                    background: scheduleDays.includes(d) ? '#185FA5' : 'white',
                    color: scheduleDays.includes(d) ? 'white' : '#666',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >{d}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>시간</label>
              <input value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} style={inputStyle} placeholder="10:00~11:30" />
            </div>
            <div>
              <label style={labelStyle}>강의실</label>
              <input value={classroom} onChange={(e) => setClassroom(e.target.value)} style={inputStyle} placeholder="201호" />
            </div>
            <div>
              <label style={labelStyle}>수업 주기</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={inputStyle}>
                {FREQUENCIES.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>시작일</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>종료일</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>운영 월 (운영하는 월만 체크)</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {ALL_MONTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMonth(m)}
                  style={{
                    width: 48,
                    padding: 8,
                    background: operationMonths.includes(m) ? '#1D9E75' : 'white',
                    color: operationMonths.includes(m) ? 'white' : '#888',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >{m}월</button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
              예: 4월~9월 운영 시 → 4,5,6,7,8,9월만 활성화 (나머지 월은 수납 화면에서 회색 처리)
            </p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
              <strong>무료 강좌</strong>
            </label>

            {!isFree && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>중구민 수강료 (원)</label>
                  <input value={feeJungGu} onChange={(e) => setFeeJungGu(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} placeholder="50000" />
                </div>
                <div>
                  <label style={labelStyle}>타구민 수강료 (원)</label>
                  <input value={feeOther} onChange={(e) => setFeeOther(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} placeholder="70000" />
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>정원</label>
            <input value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))} style={{ ...inputStyle, width: 120 }} placeholder="20" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>메모</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} placeholder="강좌 특이사항 등" />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSubmit} style={{
              flex: 1, padding: '12px',
              background: '#185FA5', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 14, fontWeight: 500,
            }}>등록</button>
            <button onClick={resetForm} style={{
              padding: '12px 20px', background: 'white',
              border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 14,
            }}>초기화</button>
          </div>
        </div>
      )}

      <div style={{
        background: 'white', borderRadius: 12, padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 16 }}>
          {searchQuery || filterCategory !== 'all' || filterActive !== 'all'
            ? `검색 결과 (${filteredCourses.length}개)`
            : `전체 강좌 (${courses.length}개)`}
        </h2>

        {loading ? (
          <p style={{ color: '#888' }}>불러오는 중...</p>
        ) : filteredCourses.length === 0 ? (
          <p style={{ color: '#888' }}>
            {searchQuery || filterCategory !== 'all' ? '검색 결과가 없습니다.' : '등록된 강좌가 없습니다.'}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <th style={thStyle}>강좌명</th>
                <th style={thStyle}>구분</th>
                <th style={thStyle}>강사</th>
                <th style={thStyle}>일정</th>
                <th style={thStyle}>강의실</th>
                <th style={thStyle}>정원</th>
                <th style={thStyle}>수강료</th>
                <th style={thStyle}>상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/courses/${c.id}`)}
                  style={{
                    borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    opacity: c.is_active ? 1 : 0.5,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                >
                  <td style={tdStyle}><strong>{c.name}</strong></td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(CATEGORY_COLORS[c.category] || '#666')}>{c.category}</span>
                  </td>
                  <td style={tdStyle}>
                    {c.instructor_id ? instructorMap.get(c.instructor_id) || '-' : '-'}
                  </td>
                  <td style={tdStyle}>
                    {c.schedule_days && <span>{c.schedule_days}</span>}
                    {c.schedule_time && <span style={{ color: '#888', marginLeft: 4 }}>{c.schedule_time}</span>}
                  </td>
                  <td style={tdStyle}>{c.classroom || '-'}</td>
                  <td style={tdStyle}>{c.capacity}명</td>
                  <td style={tdStyle}>
                    {c.is_free ? (
                      <span style={badgeStyle('#1D9E75')}>무료</span>
                    ) : (
                      <span style={{ fontSize: 12 }}>
                        {c.fee_jung_gu.toLocaleString()} / {c.fee_other.toLocaleString()}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {c.is_active ? (
                      <span style={{ color: '#1D9E75', fontSize: 12 }}>● 운영중</span>
                    ) : (
                      <span style={{ color: '#888', fontSize: 12 }}>● 종료</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filteredCourses.length > 0 && (
          <p style={{ fontSize: 11, color: '#888', marginTop: 12, textAlign: 'center' }}>
            강좌를 클릭하면 상세 화면으로 이동합니다
          </p>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, color: '#666', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box',
};
const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left',
  fontWeight: 500, color: '#666', fontSize: 12,
};
const tdStyle: React.CSSProperties = { padding: '10px 12px' };
const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px',
  background: color + '22', color: color,
  borderRadius: 4, fontSize: 11,
});
const chipStyle = (active: boolean, color: string): React.CSSProperties => ({
  padding: '6px 12px',
  background: active ? color : 'white',
  color: active ? 'white' : '#666',
  border: '1px solid ' + (active ? color : '#ddd'),
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
});
