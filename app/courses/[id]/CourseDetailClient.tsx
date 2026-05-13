'use client';

import { useState } from 'react';
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
const FREQ_LABELS: Record<string, string> = {
  weekly: '매주', biweekly: '격주', monthly: '매월', irregular: '비정기',
};
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const ALL_MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export default function CourseDetailClient({
  course: initialCourse,
  instructors,
}: {
  course: Course;
  instructors: Instructor[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [course, setCourse] = useState<Course>(initialCourse);
  const [editing, setEditing] = useState(false);

  // 수정 폼 상태
  const [category, setCategory] = useState(course.category);
  const [name, setName] = useState(course.name);
  const [instructorId, setInstructorId] = useState<string>(
    course.instructor_id ? String(course.instructor_id) : ''
  );
  const [scheduleDays, setScheduleDays] = useState<string[]>(
    course.schedule_days ? course.schedule_days.split(',').filter(Boolean) : []
  );
  const [scheduleTime, setScheduleTime] = useState(course.schedule_time || '');
  const [classroom, setClassroom] = useState(course.classroom || '');
  const [startDate, setStartDate] = useState(course.start_date || '');
  const [endDate, setEndDate] = useState(course.end_date || '');
  const [operationMonths, setOperationMonths] = useState<string[]>(
    course.operation_months ? course.operation_months.split(',').filter(Boolean) : [...ALL_MONTHS]
  );
  const [feeJungGu, setFeeJungGu] = useState(String(course.fee_jung_gu));
  const [feeOther, setFeeOther] = useState(String(course.fee_other));
  const [isFree, setIsFree] = useState(course.is_free);
  const [capacity, setCapacity] = useState(String(course.capacity));
  const [frequency, setFrequency] = useState(course.frequency);
  const [memo, setMemo] = useState(course.memo || '');

  const instructorMap = new Map(instructors.map(i => [i.id, i.name]));
  const activeInstructors = instructors.filter(i =>
    i.is_active || i.id === course.instructor_id
  );

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

  async function handleSaveEdit() {
    if (!name.trim()) {
      alert('강좌명을 입력하세요');
      return;
    }

    const updated = {
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
    };

    const { error } = await supabase.from('courses').update(updated).eq('id', course.id);

    if (error) {
      alert('수정 실패: ' + error.message);
    } else {
      alert('강좌 정보가 수정되었습니다!');
      setCourse({ ...course, ...updated });
      setEditing(false);
    }
  }

  function handleCancelEdit() {
    setCategory(course.category);
    setName(course.name);
    setInstructorId(course.instructor_id ? String(course.instructor_id) : '');
    setScheduleDays(course.schedule_days ? course.schedule_days.split(',').filter(Boolean) : []);
    setScheduleTime(course.schedule_time || '');
    setClassroom(course.classroom || '');
    setStartDate(course.start_date || '');
    setEndDate(course.end_date || '');
    setOperationMonths(course.operation_months ? course.operation_months.split(',').filter(Boolean) : [...ALL_MONTHS]);
    setFeeJungGu(String(course.fee_jung_gu));
    setFeeOther(String(course.fee_other));
    setIsFree(course.is_free);
    setCapacity(String(course.capacity));
    setFrequency(course.frequency);
    setMemo(course.memo || '');
    setEditing(false);
  }

  async function handleToggleActive() {
    const action = course.is_active ? '종료' : '운영중';
    if (!confirm(`${course.name} 강좌를 "${action}" 상태로 변경하시겠습니까?`)) return;

    const { error } = await supabase
      .from('courses')
      .update({ is_active: !course.is_active })
      .eq('id', course.id);

    if (error) {
      alert('변경 실패: ' + error.message);
    } else {
      setCourse({ ...course, is_active: !course.is_active });
    }
  }

  async function handleDelete() {
    const confirmText = `정말 "${course.name}" 강좌를 완전히 삭제하시겠습니까?\n\n되돌릴 수 없습니다.\n(현재 학기는 종료하고 "종료" 상태로 두는 것을 추천합니다)`;
    if (!confirm(confirmText)) return;

    const { error } = await supabase.from('courses').delete().eq('id', course.id);

    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      alert('강좌가 삭제되었습니다');
      router.push('/courses');
    }
  }

  const operationMonthsArr = course.operation_months ? course.operation_months.split(',').filter(Boolean) : [];

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
      <Link href="/courses" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 강좌 목록으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        {course.name}
        <span style={{ ...badgeStyle(CATEGORY_COLORS[course.category] || '#666'), fontSize: 12 }}>
          {course.category}
        </span>
        {!course.is_active && (
          <span style={{
            fontSize: 11, padding: '3px 10px',
            background: '#eee', color: '#888',
            borderRadius: 4, fontWeight: 'normal',
          }}>종료</span>
        )}
      </h1>

      <div style={{
        background: 'white', borderRadius: 12, padding: 24, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>강좌 정보</h2>
          {!editing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditing(true)} style={primaryBtnStyle}>수정</button>
              <button onClick={handleToggleActive} style={secondaryBtnStyle}>
                {course.is_active ? '종료 처리' : '재개'}
              </button>
              <button onClick={handleDelete} style={dangerBtnStyle}>삭제</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSaveEdit} style={primaryBtnStyle}>저장</button>
              <button onClick={handleCancelEdit} style={secondaryBtnStyle}>취소</button>
            </div>
          )}
        </div>

        {!editing ? (
          // 보기 모드
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14 }}>
            <InfoRow label="강좌구분" value={course.category} />
            <InfoRow label="강좌명" value={course.name} />
            <InfoRow
              label="강사"
              value={course.instructor_id ? instructorMap.get(course.instructor_id) || '-' : '미정'}
            />
            <InfoRow
              label="일정"
              value={
                (course.schedule_days || '-') +
                (course.schedule_time ? ` · ${course.schedule_time}` : '')
              }
            />
            <InfoRow label="강의실" value={course.classroom} />
            <InfoRow label="수업 주기" value={FREQ_LABELS[course.frequency] || course.frequency} />
            <InfoRow
              label="기간"
              value={
                course.start_date && course.end_date
                  ? `${course.start_date} ~ ${course.end_date}`
                  : course.start_date || course.end_date || '-'
              }
            />
            <InfoRow label="정원" value={`${course.capacity}명`} />
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>운영 월</label>
              <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                {ALL_MONTHS.map((m) => (
                  <span
                    key={m}
                    style={{
                      padding: '4px 10px',
                      background: operationMonthsArr.includes(m) ? '#1D9E75' : '#eee',
                      color: operationMonthsArr.includes(m) ? 'white' : '#aaa',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >{m}월</span>
                ))}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>수강료</label>
              <div style={{ fontSize: 14, marginTop: 2 }}>
                {course.is_free ? (
                  <span style={badgeStyle('#1D9E75')}>무료 강좌</span>
                ) : (
                  <>
                    <span style={{ marginRight: 16 }}>
                      중구민: <strong>{course.fee_jung_gu.toLocaleString()}원</strong>
                    </span>
                    <span>
                      타구민: <strong>{course.fee_other.toLocaleString()}원</strong>
                    </span>
                  </>
                )}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <InfoRow label="메모" value={course.memo} />
            </div>
          </div>
        ) : (
          // 수정 모드
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>강좌구분 *</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>강좌명 *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>강사</label>
              <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} style={inputStyle}>
                <option value="">(미정)</option>
                {activeInstructors.map(i => (
                  <option key={i.id} value={i.id}>{i.name}{!i.is_active && ' (비활동)'}</option>
                ))}
              </select>
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
                      flex: 1, padding: 10,
                      background: scheduleDays.includes(d) ? '#185FA5' : 'white',
                      color: scheduleDays.includes(d) ? 'white' : '#666',
                      border: '1px solid #ddd', borderRadius: 6,
                      cursor: 'pointer', fontSize: 13,
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
                <input value={classroom} onChange={(e) => setClassroom(e.target.value)} style={inputStyle} />
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
              <label style={labelStyle}>운영 월</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
                <strong>무료 강좌</strong>
              </label>
              {!isFree && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>중구민 수강료</label>
                    <input value={feeJungGu} onChange={(e) => setFeeJungGu(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>타구민 수강료</label>
                    <input value={feeOther} onChange={(e) => setFeeOther(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>정원</label>
              <input value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))} style={{ ...inputStyle, width: 120 }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>메모</label>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
            </div>
          </div>
        )}
      </div>

      <div style={{
        background: '#E6F1FB', border: '1px solid #B5D4F4',
        borderRadius: 12, padding: 20,
      }}>
        <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#042C53' }}>📋 다음 기능 안내</h3>
        <p style={{ fontSize: 13, color: '#042C53', margin: 0, lineHeight: 1.7 }}>
          수강신청, 수강중 명단, 대기 명단, 출석부 기능은 다음 단계에서 추가됩니다.
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ fontSize: 14, marginTop: 2 }}>{value || '-'}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#888', marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box',
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#185FA5', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'white', color: '#666',
  border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer',
  fontSize: 13,
};
const dangerBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'white', color: '#A32D2D',
  border: '1px solid #A32D2D', borderRadius: 6, cursor: 'pointer',
  fontSize: 13,
};
const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px',
  background: color + '22', color: color,
  borderRadius: 4, fontSize: 11,
});
