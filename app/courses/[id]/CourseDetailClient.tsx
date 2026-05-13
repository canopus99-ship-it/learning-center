'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DAY_LABELS, FREQUENCY_LABELS } from '@/lib/courseDates';

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
  id: number;
  course_id: number;
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

const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5',
  '성숙한시민': '#7B3FBF',
  '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517',
  '기타': '#666',
};

export default function CourseDetailClient({
  course: initialCourse,
  sessions,
  instructors,
}: {
  course: Course;
  sessions: Session[];
  instructors: Instructor[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [course, setCourse] = useState<Course>(initialCourse);

  const instructorMap = new Map(instructors.map(i => [i.id, i.name]));
  const operationMonthsArr = course.operation_months ? course.operation_months.split(',').filter(Boolean).map(Number) : [];

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
    const confirmText = `정말 "${course.name}" 강좌를 완전히 삭제하시겠습니까?\n\n관련된 모든 세션과 수업 날짜도 함께 삭제됩니다.\n되돌릴 수 없습니다.`;
    if (!confirm(confirmText)) return;

    const { error } = await supabase.from('courses').delete().eq('id', course.id);

    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      alert('강좌가 삭제되었습니다');
      router.push('/courses');
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
      <Link href="/courses" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 강좌 목록으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleToggleActive} style={secondaryBtnStyle}>
              {course.is_active ? '종료 처리' : '재개'}
            </button>
            <button onClick={handleDelete} style={dangerBtnStyle}>삭제</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14 }}>
          <InfoRow label="강좌구분" value={course.category} />
          <InfoRow label="강좌명" value={course.name} />
          <InfoRow
            label="강사"
            value={course.instructor_id ? instructorMap.get(course.instructor_id) || '-' : '미정'}
          />
          <InfoRow label="강의실" value={course.classroom} />
          <InfoRow label="정원" value={`${course.capacity}명`} />
          <InfoRow
            label="운영구분"
            value={course.operation_type === 'regular' ? '정기' : '비정기'}
          />
        </div>
      </div>

      {/* 세션 정보 */}
      <div style={{
        background: 'white', borderRadius: 12, padding: 24, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <h2 style={{ fontSize: 16, margin: '0 0 16px' }}>
          {course.operation_type === 'regular' ? '수업 일정' : '수업 날짜'}
        </h2>

        {course.operation_type === 'regular' && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>운영월</label>
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
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
        )}

        <label style={labelStyle}>
          {course.operation_type === 'regular' ? '세션' : '날짜 목록'} ({sessions.length}개)
        </label>
        {sessions.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>등록된 세션이 없습니다.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {sessions.map((s, idx) => (
              <div key={s.id} style={{
                padding: 10, background: '#fafafa',
                borderRadius: 6, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ color: '#888', fontSize: 11, width: 24 }}>#{idx + 1}</span>
                {course.operation_type === 'regular' ? (
                  <>
                    <span><strong>{s.frequency ? FREQUENCY_LABELS[s.frequency] : ''}</strong></span>
                    <span><strong>{s.day_of_week ? DAY_LABELS[s.day_of_week] : ''}요일</strong></span>
                    <span style={{ color: '#666' }}>{s.start_time} ~ {s.end_time}</span>
                  </>
                ) : (
                  <>
                    <span><strong>{s.specific_date}</strong></span>
                    <span style={{ color: '#666' }}>{s.start_time} ~ {s.end_time}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 수강료 */}
      <div style={{
        background: 'white', borderRadius: 12, padding: 24, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <h2 style={{ fontSize: 16, margin: '0 0 16px' }}>수강료</h2>
        {course.is_free ? (
          <span style={badgeStyle('#1D9E75')}>무료 강좌</span>
        ) : (
          <div style={{ fontSize: 14 }}>
            <span style={{ marginRight: 24 }}>
              중구민: <strong>{course.fee_jung_gu.toLocaleString()}원</strong>
            </span>
            <span>
              타구민: <strong>{course.fee_other.toLocaleString()}원</strong>
            </span>
          </div>
        )}
      </div>

      {course.memo && (
        <div style={{
          background: 'white', borderRadius: 12, padding: 24, marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>메모</h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
            {course.memo}
          </p>
        </div>
      )}

      {/* 출석부 보기 */}
      <Link
        href={`/courses/${course.id}/dates`}
        style={{
          display: 'block',
          padding: 20,
          background: '#E6F1FB',
          border: '1px solid #B5D4F4',
          borderRadius: 12,
          textDecoration: 'none',
          color: '#042C53',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>📅 수업 날짜 / 출석부 관리</h3>
            <p style={{ fontSize: 13, margin: 0, color: '#6E7E97' }}>
              자동 생성된 수업 날짜를 확인하고, 휴강·보강을 처리할 수 있습니다.
            </p>
          </div>
          <span style={{ fontSize: 18 }}>→</span>
        </div>
      </Link>
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
