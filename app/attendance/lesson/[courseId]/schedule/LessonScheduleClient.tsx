'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Course = {
  id: number;
  name: string;
  category: string;
  is_lesson: boolean;
  instructor_id: number | null;
};

type Member = { id: number; name: string; phone: string | null };

type Enrollment = {
  id: number;
  member_id: number;
  status: string;
  members: Member | null;
};

type Payment = {
  enrollment_id: number;
  payment_year: number;
  payment_month: number;
  is_paid: boolean;
  refund_date: string | null;
};

type LessonSchedule = {
  id: number;
  course_id: number;
  enrollment_id: number;
  member_id: number;
  schedule_date: string;
  start_time: string;
  duration_minutes: number;
  is_attended: boolean | null;
  memo: string | null;
};

const DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

// 시간 슬롯 생성 (10분 단위)
function generateTimeSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += 10) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

// HH:MM:SS → HH:MM
function trimTime(t: string): string {
  return t ? t.substring(0, 5) : '';
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function LessonScheduleClient({
  course,
  enrollments,
  payments,
}: {
  course: Course;
  enrollments: Enrollment[];
  payments: Payment[];
}) {
  const supabase = createClient();
  const today = new Date();

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1); // 1-12
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // 'YYYY-MM-DD'
  const [schedules, setSchedules] = useState<LessonSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  // 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<LessonSchedule | null>(null);
  const [formEnrollmentId, setFormEnrollmentId] = useState('');
  const [formStartTime, setFormStartTime] = useState('10:00');
  const [formDuration, setFormDuration] = useState('15');
  const [formMemo, setFormMemo] = useState('');
  // 반복
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState<Set<number>>(new Set()); // 0=일 ~ 6=토
  const [repeatEndDate, setRepeatEndDate] = useState('');
  const [repeatInterval, setRepeatInterval] = useState<'weekly' | 'biweekly'>('weekly');
  const [saving, setSaving] = useState(false);

  // 운영 시간 (10~19시 고정, 추후 강좌별 설정 가능)
  const timeSlots = useMemo(() => generateTimeSlots(10, 19), []);

  useEffect(() => {
    loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth]);

  async function loadSchedules() {
    setLoading(true);
    const monthStart = `${viewYear}-${String(viewMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(viewYear, viewMonth, 0).getDate();
    const monthEnd = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data } = await supabase
      .from('lesson_schedules')
      .select('*')
      .eq('course_id', course.id)
      .gte('schedule_date', monthStart)
      .lte('schedule_date', monthEnd)
      .order('schedule_date')
      .order('start_time');
    setSchedules(data || []);
    setLoading(false);
  }

  // 결제 완료된 수강생만 (선택된 날짜가 속한 월 기준)
  function getPaidEnrollments(dateStr: string): Enrollment[] {
    const y = parseInt(dateStr.substring(0, 4), 10);
    const m = parseInt(dateStr.substring(5, 7), 10);
    const monthStartStr = `${y}-${String(m).padStart(2, '0')}-01`;

    return enrollments.filter(e => {
      const thisMonthPayment = payments.find(p =>
        p.enrollment_id === e.id &&
        p.payment_year === y &&
        p.payment_month === m &&
        p.is_paid
      );
      if (!thisMonthPayment) return false;
      // 환불됐고 환불일이 이번 달 이전이면 제외
      if (thisMonthPayment.refund_date && thisMonthPayment.refund_date < monthStartStr) return false;
      return true;
    });
  }

  // 회원 이름 매핑
  const memberNameMap = useMemo(() => {
    const map = new Map<number, string>();
    enrollments.forEach(e => {
      if (e.members) map.set(e.member_id, e.members.name);
    });
    return map;
  }, [enrollments]);

  // 날짜별 스케줄 수
  const schedulesByDate = useMemo(() => {
    const map = new Map<string, LessonSchedule[]>();
    schedules.forEach(s => {
      const key = s.schedule_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return map;
  }, [schedules]);

  // 캘린더 그리드 생성
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const startDayOfWeek = firstDay.getDay(); // 0=일
    const lastDate = new Date(viewYear, viewMonth, 0).getDate();
    const days: (string | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) days.push(null);
    for (let d = 1; d <= lastDate; d++) {
      days.push(`${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return days;
  }, [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12); }
    else setViewMonth(viewMonth - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1); }
    else setViewMonth(viewMonth + 1);
    setSelectedDate(null);
  }

  // 빈 슬롯 클릭 → 새 레슨 추가
  function openAddModal(dateStr: string, startTime?: string) {
    setEditingSchedule(null);
    setFormEnrollmentId('');
    setFormStartTime(startTime || '10:00');
    setFormDuration('15');
    setFormMemo('');
    setRepeatEnabled(false);
    setRepeatWeeks(new Set([new Date(dateStr + 'T00:00:00').getDay()]));
    setRepeatEndDate('');
    setRepeatInterval('weekly');
    setSelectedDate(dateStr);
    setModalOpen(true);
  }

  // 기존 레슨 클릭 → 수정
  function openEditModal(s: LessonSchedule) {
    setEditingSchedule(s);
    setFormEnrollmentId(String(s.enrollment_id));
    setFormStartTime(trimTime(s.start_time));
    setFormDuration(String(s.duration_minutes));
    setFormMemo(s.memo || '');
    setRepeatEnabled(false);
    setSelectedDate(s.schedule_date);
    setModalOpen(true);
  }

  function toggleRepeatWeek(day: number) {
    const next = new Set(repeatWeeks);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setRepeatWeeks(next);
  }

  async function handleSave() {
    if (!formEnrollmentId) {
      alert('수강생을 선택하세요.');
      return;
    }
    if (!selectedDate) return;

    const enrollment = enrollments.find(e => e.id === parseInt(formEnrollmentId, 10));
    if (!enrollment) return;

    setSaving(true);

    // 수정 모드
    if (editingSchedule) {
      const { error } = await supabase.from('lesson_schedules').update({
        enrollment_id: enrollment.id,
        member_id: enrollment.member_id,
        start_time: formStartTime,
        duration_minutes: parseInt(formDuration, 10) || 15,
        memo: formMemo.trim() || null,
      }).eq('id', editingSchedule.id);
      setSaving(false);
      if (error) { alert('수정 실패: ' + error.message); return; }
      setModalOpen(false);
      loadSchedules();
      return;
    }

    // 신규: 반복 여부에 따라 날짜 목록 생성
    const dates: string[] = [];
    if (repeatEnabled && repeatWeeks.size > 0 && repeatEndDate) {
      const start = new Date(selectedDate + 'T00:00:00');
      const end = new Date(repeatEndDate + 'T00:00:00');
      if (end < start) {
        setSaving(false);
        alert('반복 종료일이 시작일보다 빠릅니다.');
        return;
      }
      // 주차 계산 (격주용)
      let weekCount = 0;
      const cur = new Date(start);
      // 시작 주의 일요일로 맞춤
      cur.setDate(cur.getDate() - cur.getDay());
      while (cur <= end) {
        const weekDates: string[] = [];
        for (let dow = 0; dow < 7; dow++) {
          const day = new Date(cur);
          day.setDate(cur.getDate() + dow);
          if (day < start || day > end) continue;
          if (repeatWeeks.has(dow)) {
            weekDates.push(ymd(day));
          }
        }
        // 격주면 짝수 주만
        if (repeatInterval === 'weekly' || weekCount % 2 === 0) {
          dates.push(...weekDates);
        }
        weekCount++;
        cur.setDate(cur.getDate() + 7);
      }
    } else {
      dates.push(selectedDate);
    }

    if (dates.length === 0) {
      setSaving(false);
      alert('등록할 날짜가 없습니다. 반복 요일과 종료일을 확인하세요.');
      return;
    }

    // 결제 확인: 각 날짜가 속한 월에 결제 완료된 경우만 등록
    const validInserts: any[] = [];
    const skippedDates: string[] = [];
    dates.forEach(d => {
      const paid = getPaidEnrollments(d).some(e => e.id === enrollment.id);
      if (paid) {
        validInserts.push({
          course_id: course.id,
          enrollment_id: enrollment.id,
          member_id: enrollment.member_id,
          schedule_date: d,
          start_time: formStartTime,
          duration_minutes: parseInt(formDuration, 10) || 15,
          memo: formMemo.trim() || null,
        });
      } else {
        skippedDates.push(d);
      }
    });

    if (validInserts.length === 0) {
      setSaving(false);
      alert('선택한 수강생이 해당 월에 결제 완료되지 않았습니다.\n수납관리에서 결제 처리 후 등록해주세요.');
      return;
    }

    const { error } = await supabase.from('lesson_schedules').insert(validInserts);
    setSaving(false);
    if (error) { alert('등록 실패: ' + error.message); return; }

    let msg = `${validInserts.length}건의 레슨이 등록되었습니다.`;
    if (skippedDates.length > 0) {
      msg += `\n\n※ ${skippedDates.length}건은 결제 미완료로 제외되었습니다:\n${skippedDates.slice(0, 5).join(', ')}${skippedDates.length > 5 ? ' ...' : ''}`;
    }
    alert(msg);
    setModalOpen(false);
    loadSchedules();
  }

  async function handleDelete() {
    if (!editingSchedule) return;
    if (!confirm('이 레슨을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('lesson_schedules').delete().eq('id', editingSchedule.id);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    setModalOpen(false);
    loadSchedules();
  }

  const paidEnrollmentsForSelected = selectedDate ? getPaidEnrollments(selectedDate) : [];
  const selectedDateSchedules = selectedDate ? (schedulesByDate.get(selectedDate) || []) : [];

  return (
    <div style={{ maxWidth: 1100, margin: '40px auto', padding: 20 }}>
      <Link href={`/attendance/lesson/${course.id}`} style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← {course.name} 메뉴로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        📅 {course.name} 스케줄 등록
      </h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        날짜를 클릭하여 수강생 레슨 시간을 등록하세요. 결제 완료된 수강생만 등록할 수 있습니다.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: selectedDate ? '1fr 1fr' : '1fr', gap: 16 }}>
        {/* 캘린더 */}
        <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button onClick={prevMonth} style={navBtnStyle}>‹</button>
            <strong style={{ fontSize: 16 }}>{viewYear}년 {viewMonth}월</strong>
            <button onClick={nextMonth} style={navBtnStyle}>›</button>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>불러오는 중...</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {DAY_KR.map((d, i) => (
                <div key={d} style={{
                  textAlign: 'center', fontSize: 12, fontWeight: 600, padding: '6px 0',
                  color: i === 0 ? '#A32D2D' : i === 6 ? '#185FA5' : '#555',
                }}>{d}</div>
              ))}
              {calendarDays.map((dateStr, idx) => {
                if (!dateStr) return <div key={`empty-${idx}`} />;
                const day = parseInt(dateStr.substring(8, 10), 10);
                const dow = new Date(dateStr + 'T00:00:00').getDay();
                const count = schedulesByDate.get(dateStr)?.length || 0;
                const isToday = dateStr === ymd(today);
                const isSelected = dateStr === selectedDate;
                return (
                  <div
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    style={{
                      minHeight: 56, padding: 4, borderRadius: 8, cursor: 'pointer',
                      border: isSelected ? '2px solid #7B3FBF' : '1px solid #f0f0f0',
                      background: isSelected ? '#F8F4FF' : isToday ? '#FFF8E1' : 'white',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}
                  >
                    <span style={{
                      fontSize: 13,
                      color: dow === 0 ? '#A32D2D' : dow === 6 ? '#185FA5' : '#333',
                      fontWeight: isToday ? 700 : 400,
                    }}>{day}</span>
                    {count > 0 && (
                      <span style={{
                        marginTop: 2, fontSize: 10, padding: '1px 6px',
                        background: '#7B3FBF', color: 'white', borderRadius: 8,
                      }}>{count}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 11, color: '#888', textAlign: 'center' }}>
            숫자는 그날 등록된 레슨 수입니다. 날짜를 클릭하세요.
          </div>
        </div>

        {/* 일별 뷰 */}
        {selectedDate && (
          <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>
                {parseInt(selectedDate.substring(5, 7), 10)}월 {parseInt(selectedDate.substring(8, 10), 10)}일
                ({DAY_KR[new Date(selectedDate + 'T00:00:00').getDay()]})
              </strong>
              <button onClick={() => openAddModal(selectedDate)} style={{
                padding: '6px 12px', background: '#7B3FBF', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
              }}>
                + 레슨 추가
              </button>
            </div>

            {paidEnrollmentsForSelected.length === 0 && (
              <div style={{
                padding: 12, background: '#FFF5F5', border: '1px solid #FECACA',
                borderRadius: 8, fontSize: 12, color: '#A32D2D', marginBottom: 12,
              }}>
                ⚠ 이 달에 결제 완료된 수강생이 없습니다. <Link href="/payments" style={{ color: '#185FA5' }}>수납관리</Link>에서 결제 처리 후 등록 가능합니다.
              </div>
            )}

            {/* 등록된 레슨 목록 */}
            {selectedDateSchedules.length === 0 ? (
              <p style={{ color: '#888', fontSize: 13, padding: 20, textAlign: 'center' }}>
                등록된 레슨이 없습니다. "+ 레슨 추가"를 눌러 등록하세요.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedDateSchedules.map(s => (
                  <div
                    key={s.id}
                    onClick={() => openEditModal(s)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', background: '#F8F4FF',
                      border: '1px solid #D6BFFF', borderRadius: 8, cursor: 'pointer',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 14, color: '#7B3FBF' }}>{trimTime(s.start_time)}</strong>
                      <span style={{ marginLeft: 8, fontSize: 13 }}>{memberNameMap.get(s.member_id) || '회원'}</span>
                      <span style={{ marginLeft: 6, fontSize: 11, color: '#888' }}>{s.duration_minutes}분</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#888' }}>수정 ›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 레슨 추가/수정 모달 */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 style={{ fontSize: 16, margin: '0 0 16px' }}>
              {editingSchedule ? '레슨 수정' : '레슨 추가'}
              {selectedDate && (
                <span style={{ fontSize: 13, color: '#888', fontWeight: 'normal', marginLeft: 8 }}>
                  {parseInt(selectedDate.substring(5, 7), 10)}/{parseInt(selectedDate.substring(8, 10), 10)}
                </span>
              )}
            </h3>

            {/* 수강생 */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>수강생 *</label>
              <select value={formEnrollmentId} onChange={(e) => setFormEnrollmentId(e.target.value)} style={inputStyle}>
                <option value="">(선택)</option>
                {paidEnrollmentsForSelected.map(e => (
                  <option key={e.id} value={e.id}>{e.members?.name || '회원'}</option>
                ))}
              </select>
              {paidEnrollmentsForSelected.length === 0 && (
                <p style={{ fontSize: 11, color: '#A32D2D', margin: '4px 0 0' }}>
                  결제 완료된 수강생이 없습니다.
                </p>
              )}
            </div>

            {/* 시작 시간 */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>시작 시간</label>
              <select value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} style={inputStyle}>
                {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* 레슨 길이 */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>레슨 길이 (분)</label>
              <input
                type="number"
                value={formDuration}
                onChange={(e) => setFormDuration(e.target.value)}
                style={inputStyle}
                min="5" step="5"
              />
            </div>

            {/* 메모 */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>메모 (선택)</label>
              <input value={formMemo} onChange={(e) => setFormMemo(e.target.value)} style={inputStyle} placeholder="예: 진도, 특이사항" />
            </div>

            {/* 반복 (신규 등록 시에만) */}
            {!editingSchedule && (
              <div style={{ marginBottom: 16, padding: 12, background: '#F8F4FF', borderRadius: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginBottom: repeatEnabled ? 12 : 0 }}>
                  <input type="checkbox" checked={repeatEnabled} onChange={(e) => setRepeatEnabled(e.target.checked)} />
                  <span><strong>반복 등록</strong> (매주 정해진 요일에 자동 등록)</span>
                </label>

                {repeatEnabled && (
                  <div>
                    {/* 주기 */}
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ ...labelStyle, fontSize: 12 }}>주기</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <label style={{ fontSize: 13, cursor: 'pointer' }}>
                          <input type="radio" checked={repeatInterval === 'weekly'} onChange={() => setRepeatInterval('weekly')} /> 매주
                        </label>
                        <label style={{ fontSize: 13, cursor: 'pointer' }}>
                          <input type="radio" checked={repeatInterval === 'biweekly'} onChange={() => setRepeatInterval('biweekly')} /> 격주
                        </label>
                      </div>
                    </div>

                    {/* 요일 */}
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ ...labelStyle, fontSize: 12 }}>요일 (여러 개 선택 가능)</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {DAY_KR.map((d, i) => (
                          <button
                            key={d}
                            onClick={() => toggleRepeatWeek(i)}
                            style={{
                              width: 34, height: 34, borderRadius: '50%', cursor: 'pointer',
                              border: repeatWeeks.has(i) ? 'none' : '1px solid #ddd',
                              background: repeatWeeks.has(i) ? '#7B3FBF' : 'white',
                              color: repeatWeeks.has(i) ? 'white' : (i === 0 ? '#A32D2D' : i === 6 ? '#185FA5' : '#555'),
                              fontSize: 13,
                            }}
                          >{d}</button>
                        ))}
                      </div>
                    </div>

                    {/* 종료일 */}
                    <div>
                      <label style={{ ...labelStyle, fontSize: 12 }}>반복 종료일</label>
                      <input type="date" value={repeatEndDate} onChange={(e) => setRepeatEndDate(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 버튼 */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <div>
                {editingSchedule && (
                  <button onClick={handleDelete} style={{
                    padding: '10px 16px', background: 'white', color: '#A32D2D',
                    border: '1px solid #A32D2D', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  }}>
                    삭제
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalOpen(false)} style={{
                  padding: '10px 16px', background: 'white', border: '1px solid #ddd',
                  borderRadius: 8, cursor: 'pointer', fontSize: 13,
                }}>
                  취소
                </button>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '10px 20px', background: saving ? '#ccc' : '#7B3FBF', color: 'white',
                  border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500,
                }}>
                  {saving ? '저장 중...' : (editingSchedule ? '수정' : '등록')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 8, border: '1px solid #ddd',
  background: 'white', cursor: 'pointer', fontSize: 18, color: '#555',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 500,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box',
};
