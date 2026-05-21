'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Course = {
  id: number;
  category: string;
  name: string;
  instructor_id: number | null;
  is_active: boolean;
  operation_months: string | null;
};

type Instructor = {
  id: number;
  name: string;
  phone: string | null;
  pay_type: string;
  pay_amount: number;
  class_hours: number;
  bonus_note: string | null;
  bank_account: string | null;
  is_active: boolean;
};

type CourseDate = {
  id: number;
  course_id: number;
  class_date: string;
  is_cancelled: boolean;
  is_makeup: boolean;
};

const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5',
  '평생교육': '#1D9E75',
  '체육': '#A35B18',
  '음악': '#7B3FBF',
  '미술': '#BA7517',
  '기타': '#666',
};

function parseOperationMonths(s: string | null): number[] {
  if (!s) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return s.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n));
}

export default function PayrollClient() {
  const supabase = createClient();
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);

  const [courses, setCourses] = useState<Course[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [courseDates, setCourseDates] = useState<CourseDate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedMonth]);

  async function loadAll() {
    setLoading(true);
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    // 다음 달 1일
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const [cRes, iRes, dRes] = await Promise.all([
      supabase.from('courses').select('*').eq('is_active', true).order('category').order('name'),
      supabase.from('instructors').select('*').order('name'),
      supabase.from('course_dates').select('*').gte('class_date', monthStart).lt('class_date', monthEnd),
    ]);

    setCourses(cRes.data || []);
    setInstructors(iRes.data || []);
    setCourseDates(dRes.data || []);
    setLoading(false);
  }

  // 강좌별 강사비 계산
  function calcCoursePay(course: Course): {
    instructor: Instructor | null;
    sessions: number;
    cancelledCount: number;
    totalHours: number;
    amount: number;
  } {
    const instructor = instructors.find(i => i.id === course.instructor_id) || null;
    const allDates = courseDates.filter(d => d.course_id === course.id);
    const activeDates = allDates.filter(d => !d.is_cancelled);
    const sessions = activeDates.length;
    const cancelledCount = allDates.length - activeDates.length;

    if (!instructor || sessions === 0) {
      return { instructor, sessions, cancelledCount, totalHours: 0, amount: 0 };
    }

    if (instructor.pay_type === 'hourly') {
      const totalHours = instructor.class_hours * sessions;
      const amount = Math.round(instructor.pay_amount * totalHours);
      return { instructor, sessions, cancelledCount, totalHours, amount };
    } else {
      // 일급
      const amount = instructor.pay_amount * sessions;
      return { instructor, sessions, cancelledCount, totalHours: 0, amount };
    }
  }

  // 그 달에 운영한 강좌 + 강사 배정된 강좌만
  const targetCourses = courses.filter(c => {
    if (!c.instructor_id) return false;
    const operationMonths = parseOperationMonths(c.operation_months);
    if (!operationMonths.includes(selectedMonth)) return false;
    // 그 달에 수업 날짜가 1개라도 있어야 강사비 계산 대상
    const hasDates = courseDates.some(d => d.course_id === c.id);
    return hasDates;
  });

  // 전체 합계
  const totalAmount = targetCourses.reduce((sum, c) => sum + calcCoursePay(c).amount, 0);

  return (
    <div style={{ maxWidth: 1100, margin: '40px auto', padding: 20 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>💵 강사비</h1>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 13 }}>
        출석부 등록된 수업 날짜를 기준으로 자동 계산됩니다. (휴강 제외)
      </p>

      {/* 년/월 선택 */}
      <div style={{
        background: 'white', borderRadius: 12, padding: 16, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setSelectedYear(selectedYear - 1)} style={smallBtnStyle}>◀</button>
          <strong style={{ fontSize: 16, minWidth: 80, textAlign: 'center' }}>{selectedYear}년</strong>
          <button onClick={() => setSelectedYear(selectedYear + 1)} style={smallBtnStyle}>▶</button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              style={{
                padding: '6px 12px',
                border: selectedMonth === m ? '2px solid #185FA5' : '1px solid #ddd',
                background: selectedMonth === m ? '#E6F1FB' : 'white',
                color: selectedMonth === m ? '#185FA5' : '#666',
                fontWeight: selectedMonth === m ? 600 : 400,
                borderRadius: 6, cursor: 'pointer', fontSize: 13,
              }}
            >
              {m}월
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>불러오는 중...</p>
      ) : targetCourses.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 12, padding: 40, textAlign: 'center',
          color: '#888', fontSize: 14,
        }}>
          {selectedYear}년 {selectedMonth}월에 운영한 강좌가 없습니다.
          <br />
          <span style={{ fontSize: 12, color: '#aaa' }}>
            (수업 날짜가 등록되고 강사가 배정된 강좌만 표시됩니다)
          </span>
        </div>
      ) : (
        <>
          {/* 합계 카드 */}
          <div style={{
            background: '#185FA5', color: 'white',
            borderRadius: 12, padding: 20, marginBottom: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{selectedYear}년 {selectedMonth}월 강사비 합계</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
                {totalAmount.toLocaleString()}원
              </div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.9, textAlign: 'right' }}>
              총 {targetCourses.length}개 강좌
            </div>
          </div>

          {/* 강좌별 카드 */}
          {targetCourses.map(course => {
            const { instructor, sessions, cancelledCount, totalHours, amount } = calcCoursePay(course);
            return (
              <div key={course.id} style={{
                background: 'white', borderRadius: 12, padding: 20, marginBottom: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: CATEGORY_COLORS[course.category] || '#666',
                        color: 'white',
                      }}>{course.category}</span>
                      <Link href={`/courses/${course.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                        <strong style={{ fontSize: 15 }}>{course.name}</strong>
                      </Link>
                    </div>
                    {instructor ? (
                      <div style={{ fontSize: 13, color: '#555', lineHeight: 1.8 }}>
                        <div>
                          <Link href={`/instructors/${instructor.id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                            <strong>{instructor.name}</strong>
                          </Link>
                          {' · '}
                          {instructor.pay_type === 'hourly' ? '시급' : '일급'}{' '}
                          <strong>{instructor.pay_amount.toLocaleString()}원</strong>
                          {instructor.pay_type === 'hourly' && (
                            <> × {instructor.class_hours}시간/회</>
                          )}
                        </div>
                        <div style={{ color: '#888', fontSize: 12 }}>
                          수업 {sessions}회
                          {cancelledCount > 0 && (
                            <span style={{ marginLeft: 6, color: '#A32D2D' }}>
                              (휴강 {cancelledCount}회 제외)
                            </span>
                          )}
                          {instructor.pay_type === 'hourly' && (
                            <span style={{ marginLeft: 6 }}>· 총 {totalHours}시간</span>
                          )}
                        </div>
                        {instructor.bonus_note && (
                          <div style={{ color: '#BA7517', fontSize: 12, marginTop: 2 }}>
                            ⚠ 추가급여: {instructor.bonus_note}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: '#A32D2D' }}>강사 미배정</div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', minWidth: 140 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>강사료</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#185FA5' }}>
                      {amount.toLocaleString()}원
                    </div>
                    {instructor && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                        실지급 {Math.round(amount * 0.967).toLocaleString()}원
                        <br />
                        <span style={{ fontSize: 10 }}>(원천징수 3.3% 공제)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* 안내 */}
          <div style={{
            marginTop: 16, padding: 12,
            background: '#FFF8E1', border: '1px solid #FFE082',
            borderRadius: 8, fontSize: 12, color: '#5D4037', lineHeight: 1.6,
          }}>
            <strong>💡 계산 안내</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>시급: 단가 × 1회당 시간 × 수업 횟수</li>
              <li>일급: 단가 × 수업 횟수</li>
              <li>휴강된 수업은 제외, 보강은 포함됩니다</li>
              <li>실지급액은 원천징수 3.3%(소득세 3% + 지방소득세 0.3%) 공제 후 금액입니다</li>
              <li>인센티브 등 추가급여는 수기로 가감해주세요</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px', border: '1px solid #ddd', background: 'white',
  borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
