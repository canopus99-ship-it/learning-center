'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Course = {
  id: number;
  name: string;
  category: string;
};

type CourseDate = {
  id: number;
  course_id: number;
  session_id: number | null;
  class_date: string;
  start_time: string | null;
  end_time: string | null;
  is_cancelled: boolean;
  is_makeup: boolean;
  memo: string | null;
};

const DAY_OF_WEEK_KR = ['일', '월', '화', '수', '목', '금', '토'];

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_OF_WEEK_KR[d.getDay()];
}

export default function DatesClient({
  course,
  initialDates,
}: {
  course: Course;
  initialDates: CourseDate[];
}) {
  const supabase = createClient();
  const [dates, setDates] = useState<CourseDate[]>(initialDates);
  const [showAddForm, setShowAddForm] = useState(false);

  // 새 날짜 추가 폼
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('10:00');
  const [newEndTime, setNewEndTime] = useState('11:30');
  const [newMemo, setNewMemo] = useState('');
  const [isMakeup, setIsMakeup] = useState(true);

  async function reloadDates() {
    const { data, error } = await supabase
      .from('course_dates')
      .select('*')
      .eq('course_id', course.id)
      .order('class_date')
      .order('start_time');

    if (!error && data) {
      setDates(data);
    }
  }

  async function handleToggleCancel(d: CourseDate) {
    const action = d.is_cancelled ? '복원' : '휴강';
    let memo = d.memo || '';
    if (!d.is_cancelled) {
      const userMemo = prompt('휴강 사유 (선택사항):', '');
      if (userMemo === null) return; // 취소
      memo = userMemo;
    }

    const { error } = await supabase
      .from('course_dates')
      .update({
        is_cancelled: !d.is_cancelled,
        memo: !d.is_cancelled ? memo : null,
      })
      .eq('id', d.id);

    if (error) {
      alert(`${action} 처리 실패: ` + error.message);
    } else {
      reloadDates();
    }
  }

  async function handleAdd() {
    if (!newDate) {
      alert('날짜를 입력하세요');
      return;
    }

    const newRow = {
      course_id: course.id,
      session_id: null,
      class_date: newDate,
      start_time: newStartTime,
      end_time: newEndTime,
      is_cancelled: false,
      is_makeup: isMakeup,
      memo: newMemo.trim() || null,
    };

    const { error } = await supabase.from('course_dates').insert([newRow]);

    if (error) {
      if (error.message.includes('duplicate')) {
        alert('같은 날짜·시간의 수업이 이미 존재합니다');
      } else {
        alert('추가 실패: ' + error.message);
      }
    } else {
      alert('수업 날짜가 추가되었습니다!');
      setNewDate('');
      setNewMemo('');
      setShowAddForm(false);
      reloadDates();
    }
  }

  async function handleDelete(d: CourseDate) {
    if (!confirm(`${d.class_date} 수업을 완전히 삭제하시겠습니까?`)) return;

    const { error } = await supabase.from('course_dates').delete().eq('id', d.id);

    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      reloadDates();
    }
  }

  // 통계
  const total = dates.length;
  const active = dates.filter(d => !d.is_cancelled).length;
  const cancelled = dates.filter(d => d.is_cancelled).length;
  const makeup = dates.filter(d => d.is_makeup && !d.is_cancelled).length;

  // 월별 그룹핑
  const datesByMonth: Record<string, CourseDate[]> = {};
  dates.forEach(d => {
    const month = d.class_date.substring(0, 7); // YYYY-MM
    if (!datesByMonth[month]) datesByMonth[month] = [];
    datesByMonth[month].push(d);
  });

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
      <Link href={`/courses/${course.id}`} style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>
        ← 강좌 상세로
      </Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>
        📅 {course.name} - 수업 날짜
      </h1>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 13 }}>
        자동 생성된 수업 날짜를 확인하고, 휴강·보강을 처리할 수 있습니다.
      </p>

      {/* 요약 통계 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="전체" value={total} color="#185FA5" />
        <StatCard label="진행" value={active} color="#1D9E75" />
        <StatCard label="휴강" value={cancelled} color="#A32D2D" />
        <StatCard label="보강 추가" value={makeup} color="#BA7517" />
      </div>

      {/* 날짜 추가 */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '10px 20px',
            background: showAddForm ? '#888' : '#185FA5',
            color: 'white', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontSize: 14,
          }}
        >
          {showAddForm ? '닫기' : '+ 수업 날짜 추가 (보강 등)'}
        </button>
      </div>

      {showAddForm && (
        <div style={{
          background: 'white', borderRadius: 12, padding: 20, marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h3 style={{ fontSize: 15, margin: '0 0 12px' }}>새 수업 날짜 추가</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>날짜 *</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>시작 시간</label>
              <input
                type="time"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>종료 시간</label>
              <input
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isMakeup}
                onChange={(e) => setIsMakeup(e.target.checked)}
              />
              보강 수업으로 표시
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>메모 (선택)</label>
            <input
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              style={inputStyle}
              placeholder="예: 4/14 휴강 보강"
            />
          </div>

          <button onClick={handleAdd} style={{
            padding: '10px 20px',
            background: '#185FA5', color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer',
            fontSize: 14, fontWeight: 500,
          }}>추가</button>
        </div>
      )}

      {/* 날짜 목록 (월별) */}
      {Object.keys(datesByMonth).length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 12, padding: 40,
          textAlign: 'center', color: '#888',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <p style={{ margin: 0 }}>수업 날짜가 없습니다.</p>
          <p style={{ fontSize: 12, marginTop: 8 }}>강좌 등록 시 자동 생성되거나, "수업 날짜 추가"로 등록할 수 있습니다.</p>
        </div>
      ) : (
        Object.keys(datesByMonth).sort().map(month => (
          <div key={month} style={{
            background: 'white', borderRadius: 12, padding: 20, marginBottom: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}>
            <h3 style={{ fontSize: 14, margin: '0 0 12px', color: '#185FA5' }}>
              {month.replace('-', '년 ')}월 ({datesByMonth[month].length}회)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {datesByMonth[month].map(d => (
                <div
                  key={d.id}
                  style={{
                    padding: '10px 12px',
                    background: d.is_cancelled ? '#FCEBEB' : (d.is_makeup ? '#FFF8E1' : '#fafafa'),
                    border: `1px solid ${d.is_cancelled ? '#F09595' : (d.is_makeup ? '#FFE082' : '#eee')}`,
                    borderRadius: 6,
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 500,
                      textDecoration: d.is_cancelled ? 'line-through' : 'none',
                      color: d.is_cancelled ? '#888' : 'inherit',
                    }}>
                      {d.class_date}
                    </span>
                    <span style={{ fontSize: 12, color: '#888' }}>
                      ({getDayLabel(d.class_date)})
                    </span>
                    <span style={{ fontSize: 12, color: '#666' }}>
                      {d.start_time} ~ {d.end_time}
                    </span>
                    {d.is_makeup && (
                      <span style={{
                        fontSize: 10, padding: '2px 6px',
                        background: '#BA7517', color: 'white',
                        borderRadius: 3,
                      }}>보강</span>
                    )}
                    {d.is_cancelled && (
                      <span style={{
                        fontSize: 10, padding: '2px 6px',
                        background: '#A32D2D', color: 'white',
                        borderRadius: 3,
                      }}>휴강</span>
                    )}
                    {d.memo && (
                      <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
                        — {d.memo}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggleCancel(d)}
                    style={{
                      padding: '4px 10px',
                      background: 'white',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    {d.is_cancelled ? '복원' : '휴강'}
                  </button>
                  <button
                    onClick={() => handleDelete(d)}
                    style={{
                      padding: '4px 10px',
                      background: 'white',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      color: '#A32D2D',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div style={{
        marginTop: 16, padding: 14,
        background: '#E6F1FB', border: '1px solid #B5D4F4',
        borderRadius: 8, fontSize: 12, color: '#042C53',
      }}>
        <strong>💡 안내</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
          <li><strong>휴강</strong>: 수업 자체는 남아있지만, 강사비 계산에서 제외됩니다</li>
          <li><strong>보강</strong>: 정기 일정 외에 추가된 수업, 강사비 계산에 포함됩니다</li>
          <li><strong>삭제</strong>: 완전히 제거 (출석부에서도 사라짐)</li>
          <li>강사가 출석체크한 날짜를 기준으로 강사비가 자동 계산됩니다 (다음 단계에서 구현)</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'white', borderRadius: 8, padding: '12px 14px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 500, margin: '4px 0 0', color }}>{value}</p>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#666', marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box',
};
