'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { generateRegularDates, DAY_LABELS, FREQUENCY_LABELS, type SessionConfig } from '@/lib/courseDates';

type Course = {
  id: number;
  category: string;
  name: string;
  instructor_id: number | null;
  classroom: string | null;
  capacity: number;
  operation_type: string;
  operation_months: string | null;
  fee_jung_gu: number;
  fee_other: number;
  is_free: boolean;
  is_active: boolean;
  memo: string | null;
};

type Session = {
  id?: number;
  course_id?: number;
  frequency: string | null;
  day_of_week: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
};

type Instructor = {
  id: number;
  name: string;
  is_active: boolean;
};

type CourseWithSessions = Course & {
  sessions?: Session[];
};

const CATEGORIES = ['문화강좌', '성숙한시민', '능동적시민', '평등한시민', '기타'];
const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5',
  '성숙한시민': '#7B3FBF',
  '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517',
  '기타': '#666',
};
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const FREQUENCIES = [
  { value: 'weekly', label: '매주' },
  { value: 'biweekly', label: '격주' },
  { value: 'monthly', label: '매월' },
];
const DAYS = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 7, label: '일' },
];

export default function CoursesClient() {
  const supabase = createClient();
  const router = useRouter();
  const [courses, setCourses] = useState<CourseWithSessions[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');

  // 폼 입력값 - 기본 정보
  const [category, setCategory] = useState('문화강좌');
  const [name, setName] = useState('');
  const [instructorId, setInstructorId] = useState<string>('');
  const [classroom, setClassroom] = useState('');
  const [capacity, setCapacity] = useState('20');

  // 운영구분
  const [operationType, setOperationType] = useState<'regular' | 'irregular'>('regular');

  // 정기 강좌
  const [operationMonths, setOperationMonths] = useState<number[]>([...ALL_MONTHS]);
  const [regularSessions, setRegularSessions] = useState<Session[]>([
    { frequency: 'weekly', day_of_week: 1, specific_date: null, start_time: '10:00', end_time: '11:30' },
  ]);

  // 비정기 강좌
  const [irregularSessions, setIrregularSessions] = useState<Session[]>([
    { frequency: null, day_of_week: null, specific_date: '', start_time: '10:00', end_time: '11:30' },
  ]);

  // 수강료
  const [isFree, setIsFree] = useState(false);
  const [feeJungGu, setFeeJungGu] = useState('');
  const [feeOther, setFeeOther] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);

    const [coursesRes, instructorsRes, sessionsRes] = await Promise.all([
      supabase.from('courses').select('*').order('category').order('name'),
      supabase.from('instructors').select('id, name, is_active').order('name'),
      supabase.from('course_sessions').select('*'),
    ]);

    if (coursesRes.error) {
      alert('강좌 목록 불러오기 실패: ' + coursesRes.error.message);
    } else {
      // 강좌별로 세션 매핑
      const sessionsByCourse = new Map<number, Session[]>();
      (sessionsRes.data || []).forEach((s: any) => {
        const list = sessionsByCourse.get(s.course_id) || [];
        list.push(s);
        sessionsByCourse.set(s.course_id, list);
      });

      const coursesWithSessions = (coursesRes.data || []).map((c: any) => ({
        ...c,
        sessions: sessionsByCourse.get(c.id) || [],
      }));

      setCourses(coursesWithSessions);
    }

    if (instructorsRes.error) {
      console.error('강사 목록 불러오기 실패:', instructorsRes.error);
    } else {
      setInstructors(instructorsRes.data || []);
    }

    setLoading(false);
  }

  function toggleMonth(month: number) {
    setOperationMonths(prev =>
      prev.includes(month)
        ? prev.filter(m => m !== month)
        : [...prev, month].sort((a, b) => a - b)
    );
  }

  function addRegularSession() {
    setRegularSessions([
      ...regularSessions,
      { frequency: 'weekly', day_of_week: 1, specific_date: null, start_time: '10:00', end_time: '11:30' },
    ]);
  }

  function removeRegularSession(idx: number) {
    if (regularSessions.length <= 1) {
      alert('최소 1개의 세션이 필요합니다');
      return;
    }
    setRegularSessions(regularSessions.filter((_, i) => i !== idx));
  }

  function updateRegularSession(idx: number, key: keyof Session, value: any) {
    setRegularSessions(regularSessions.map((s, i) =>
      i === idx ? { ...s, [key]: value } : s
    ));
  }

  function addIrregularSession() {
    setIrregularSessions([
      ...irregularSessions,
      { frequency: null, day_of_week: null, specific_date: '', start_time: '10:00', end_time: '11:30' },
    ]);
  }

  function removeIrregularSession(idx: number) {
    if (irregularSessions.length <= 1) {
      alert('최소 1개의 세션이 필요합니다');
      return;
    }
    setIrregularSessions(irregularSessions.filter((_, i) => i !== idx));
  }

  function updateIrregularSession(idx: number, key: keyof Session, value: any) {
    setIrregularSessions(irregularSessions.map((s, i) =>
      i === idx ? { ...s, [key]: value } : s
    ));
  }

  function resetForm() {
    setCategory('문화강좌'); setName(''); setInstructorId('');
    setClassroom(''); setCapacity('20');
    setOperationType('regular');
    setOperationMonths([...ALL_MONTHS]);
    setRegularSessions([{ frequency: 'weekly', day_of_week: 1, specific_date: null, start_time: '10:00', end_time: '11:30' }]);
    setIrregularSessions([{ frequency: null, day_of_week: null, specific_date: '', start_time: '10:00', end_time: '11:30' }]);
    setIsFree(false); setFeeJungGu(''); setFeeOther(''); setMemo('');
  }

  async function handleSubmit() {
    if (!name.trim()) {
      alert('강좌명을 입력하세요');
      return;
    }

    if (operationType === 'regular' && operationMonths.length === 0) {
      alert('운영월을 최소 1개 이상 선택하세요');
      return;
    }

    if (operationType === 'irregular') {
      const hasEmptyDate = irregularSessions.some(s => !s.specific_date);
      if (hasEmptyDate) {
        alert('모든 세션의 날짜를 입력하세요');
        return;
      }
    }

    // 1. 강좌 생성
    const newCourse = {
      category,
      name: name.trim(),
      instructor_id: instructorId ? parseInt(instructorId, 10) : null,
      classroom: classroom || null,
      capacity: parseInt(capacity, 10) || 20,
      operation_type: operationType,
      operation_months: operationType === 'regular' ? operationMonths.join(',') : null,
      fee_jung_gu: isFree ? 0 : (parseInt(feeJungGu, 10) || 0),
      fee_other: isFree ? 0 : (parseInt(feeOther, 10) || 0),
      is_free: isFree,
      memo: memo.trim() || null,
      is_active: true,
    };

    const { data: insertedCourse, error: courseError } = await supabase
      .from('courses')
      .insert([newCourse])
      .select()
      .single();

    if (courseError) {
      alert('강좌 등록 실패: ' + courseError.message);
      return;
    }

    const courseId = insertedCourse.id;

    // 2. 세션 생성
    const sessionsToInsert = operationType === 'regular'
      ? regularSessions.map(s => ({
          course_id: courseId,
          frequency: s.frequency,
          day_of_week: s.day_of_week,
          specific_date: null,
          start_time: s.start_time,
          end_time: s.end_time,
        }))
      : irregularSessions.map(s => ({
          course_id: courseId,
          frequency: null,
          day_of_week: null,
          specific_date: s.specific_date,
          start_time: s.start_time,
          end_time: s.end_time,
        }));

    const { data: insertedSessions, error: sessionsError } = await supabase
      .from('course_sessions')
      .insert(sessionsToInsert)
      .select();

    if (sessionsError) {
      alert('세션 생성 실패: ' + sessionsError.message);
      return;
    }

    // 3. 실제 수업 날짜 자동 생성
    const datesToInsert: any[] = [];

    if (operationType === 'regular') {
      const currentYear = new Date().getFullYear();
      const sessionConfigs: SessionConfig[] = regularSessions.map(s => ({
        frequency: (s.frequency || 'weekly') as 'weekly' | 'biweekly' | 'monthly',
        day_of_week: s.day_of_week || 1,
        start_time: s.start_time,
        end_time: s.end_time,
      }));

      const generated = generateRegularDates(currentYear, operationMonths, sessionConfigs);

      generated.forEach((d) => {
        const sessionId = insertedSessions?.[d.session_index]?.id;
        datesToInsert.push({
          course_id: courseId,
          session_id: sessionId || null,
          class_date: d.class_date,
          start_time: d.start_time,
          end_time: d.end_time,
          is_cancelled: false,
          is_makeup: false,
        });
      });
    } else {
      // 비정기: 각 세션의 날짜 그대로
      irregularSessions.forEach((s, idx) => {
        const sessionId = insertedSessions?.[idx]?.id;
        datesToInsert.push({
          course_id: courseId,
          session_id: sessionId || null,
          class_date: s.specific_date,
          start_time: s.start_time,
          end_time: s.end_time,
          is_cancelled: false,
          is_makeup: false,
        });
      });
    }

    if (datesToInsert.length > 0) {
      const { error: datesError } = await supabase.from('course_dates').insert(datesToInsert);
      if (datesError) {
        console.error('수업 날짜 생성 실패:', datesError);
        alert(`강좌는 등록되었지만 수업 날짜 자동 생성에 실패했습니다: ${datesError.message}\n강좌 상세에서 직접 추가하실 수 있습니다.`);
      }
    }

    alert(`강좌가 등록되었습니다!\n총 ${datesToInsert.length}개의 수업 날짜가 자동 생성되었습니다.`);
    resetForm();
    setShowForm(false);
    loadData();
  }

  // 강사 매핑
  const instructorMap = new Map(instructors.map(i => [i.id, i.name]));
  const activeInstructors = instructors.filter(i => i.is_active);

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

  // 세션 요약 텍스트 만들기 (목록 표시용)
  function sessionsSummary(c: CourseWithSessions): string {
    if (!c.sessions || c.sessions.length === 0) return '-';
    if (c.operation_type === 'irregular') {
      return `비정기 ${c.sessions.length}회`;
    }
    return c.sessions.map(s => {
      const dayLabel = s.day_of_week ? DAY_LABELS[s.day_of_week] : '?';
      const freqLabel = s.frequency ? FREQUENCY_LABELS[s.frequency] : '';
      return `${freqLabel} ${dayLabel} ${s.start_time}`;
    }).join(', ');
  }

  return (
    <div style={{ maxWidth: 1200, margin: '40px auto', padding: 20 }}>
      <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20 }}>강좌 관리</h1>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 20px',
          background: showForm ? '#888' : '#185FA5',
          color: 'white', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontSize: 14,
        }}>
          {showForm ? '닫기' : '+ 신규 강좌 등록'}
        </button>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 강좌명, 강사명, 강의실로 검색"
          style={{
            flex: 1, minWidth: 200,
            padding: '10px 14px',
            border: '1px solid #ddd', borderRadius: 8,
            fontSize: 14,
          }}
        />
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#666', marginRight: 4 }}>강좌구분:</span>
        <button onClick={() => setFilterCategory('all')} style={chipStyle(filterCategory === 'all', '#666')}>전체</button>
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setFilterCategory(cat)} style={chipStyle(filterCategory === cat, CATEGORY_COLORS[cat])}>{cat}</button>
        ))}
        <span style={{ fontSize: 12, color: '#666', marginLeft: 16, marginRight: 4 }}>상태:</span>
        {(['active', 'inactive', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilterActive(f)} style={chipStyle(filterActive === f, '#185FA5')}>
            {f === 'active' ? '운영중' : f === 'inactive' ? '종료' : '전체'}
          </button>
        ))}
      </div>

      {showForm && (
        <div style={{
          background: 'white', borderRadius: 12, padding: 24,
          marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>새 강좌 등록</h2>

          {/* 기본 정보 */}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>강의실</label>
              <input value={classroom} onChange={(e) => setClassroom(e.target.value)} style={inputStyle} placeholder="201호" />
            </div>
            <div>
              <label style={labelStyle}>정원</label>
              <input value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} placeholder="20" />
            </div>
          </div>

          {/* 운영구분 */}
          <div style={{
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            background: '#fafafa',
          }}>
            <label style={{ ...labelStyle, marginBottom: 10 }}>운영구분 *</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => setOperationType('regular')}
                style={{
                  flex: 1, padding: 12,
                  background: operationType === 'regular' ? '#185FA5' : 'white',
                  color: operationType === 'regular' ? 'white' : '#666',
                  border: '1px solid ' + (operationType === 'regular' ? '#185FA5' : '#ddd'),
                  borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}
              >📅 정기</button>
              <button
                type="button"
                onClick={() => setOperationType('irregular')}
                style={{
                  flex: 1, padding: 12,
                  background: operationType === 'irregular' ? '#185FA5' : 'white',
                  color: operationType === 'irregular' ? 'white' : '#666',
                  border: '1px solid ' + (operationType === 'irregular' ? '#185FA5' : '#ddd'),
                  borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}
              >🎯 비정기</button>
            </div>

            {operationType === 'regular' && (
              <div>
                {/* 운영월 */}
                <label style={labelStyle}>운영월 (운영하는 월만 체크)</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
                  {ALL_MONTHS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMonth(m)}
                      style={{
                        width: 48, padding: 8,
                        background: operationMonths.includes(m) ? '#1D9E75' : 'white',
                        color: operationMonths.includes(m) ? 'white' : '#888',
                        border: '1px solid #ddd', borderRadius: 6,
                        cursor: 'pointer', fontSize: 12,
                      }}
                    >{m}월</button>
                  ))}
                </div>

                {/* 세션들 */}
                <label style={labelStyle}>수업 세션</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {regularSessions.map((session, idx) => (
                    <div key={idx} style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                      padding: 10, background: 'white', borderRadius: 6, border: '1px solid #eee',
                    }}>
                      <span style={{ fontSize: 12, color: '#888', width: 30 }}>#{idx + 1}</span>
                      <select
                        value={session.frequency || 'weekly'}
                        onChange={(e) => updateRegularSession(idx, 'frequency', e.target.value)}
                        style={{ ...inputStyle, width: 100 }}
                      >
                        {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <select
                        value={session.day_of_week || 1}
                        onChange={(e) => updateRegularSession(idx, 'day_of_week', parseInt(e.target.value))}
                        style={{ ...inputStyle, width: 80 }}
                      >
                        {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}요일</option>)}
                      </select>
                      <input
                        type="time"
                        value={session.start_time}
                        onChange={(e) => updateRegularSession(idx, 'start_time', e.target.value)}
                        style={{ ...inputStyle, width: 110 }}
                      />
                      <span style={{ fontSize: 12, color: '#888' }}>~</span>
                      <input
                        type="time"
                        value={session.end_time}
                        onChange={(e) => updateRegularSession(idx, 'end_time', e.target.value)}
                        style={{ ...inputStyle, width: 110 }}
                      />
                      <button
                        type="button"
                        onClick={() => removeRegularSession(idx)}
                        style={{
                          padding: '6px 10px', background: 'white',
                          border: '1px solid #ddd', borderRadius: 4,
                          color: '#A32D2D', cursor: 'pointer', fontSize: 12,
                        }}
                      >✕</button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addRegularSession}
                  style={{
                    padding: '8px 14px', background: 'white',
                    border: '1px dashed #185FA5', color: '#185FA5',
                    borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  }}
                >+ 세션 추가</button>
                <p style={{ fontSize: 11, color: '#888', margin: '8px 0 0' }}>
                  예: 화요일 10시, 목요일 14시 강좌 → 세션 2개 등록
                </p>
              </div>
            )}

            {operationType === 'irregular' && (
              <div>
                <label style={labelStyle}>수업 날짜</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {irregularSessions.map((session, idx) => (
                    <div key={idx} style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                      padding: 10, background: 'white', borderRadius: 6, border: '1px solid #eee',
                    }}>
                      <span style={{ fontSize: 12, color: '#888', width: 30 }}>#{idx + 1}</span>
                      <input
                        type="date"
                        value={session.specific_date || ''}
                        onChange={(e) => updateIrregularSession(idx, 'specific_date', e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <input
                        type="time"
                        value={session.start_time}
                        onChange={(e) => updateIrregularSession(idx, 'start_time', e.target.value)}
                        style={{ ...inputStyle, width: 110 }}
                      />
                      <span style={{ fontSize: 12, color: '#888' }}>~</span>
                      <input
                        type="time"
                        value={session.end_time}
                        onChange={(e) => updateIrregularSession(idx, 'end_time', e.target.value)}
                        style={{ ...inputStyle, width: 110 }}
                      />
                      <button
                        type="button"
                        onClick={() => removeIrregularSession(idx)}
                        style={{
                          padding: '6px 10px', background: 'white',
                          border: '1px solid #ddd', borderRadius: 4,
                          color: '#A32D2D', cursor: 'pointer', fontSize: 12,
                        }}
                      >✕</button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addIrregularSession}
                  style={{
                    padding: '8px 14px', background: 'white',
                    border: '1px dashed #185FA5', color: '#185FA5',
                    borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  }}
                >+ 날짜 추가</button>
              </div>
            )}
          </div>

          {/* 수강료 */}
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

      {/* 강좌 목록 */}
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
                  <td style={{ ...tdStyle, fontSize: 12 }}>{sessionsSummary(c)}</td>
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
