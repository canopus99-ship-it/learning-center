'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatTime12, hourLabel12 } from '@/lib/time';

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

type FixedSchedule = {
  id: number;
  course_id: number;
  enrollment_id: number;
  member_id: number;
  day_of_week: number; // 0=월~4=금
  start_time: string;
  duration_minutes: number;
  effective_from: string; // YYYY-MM-DD (등록한 주 월요일)
  effective_until: string | null; // YYYY-MM-DD (영구 변경으로 대체된 경우, 마지막으로 유효했던 주의 일요일)
  memo: string | null;
};

type OverrideSchedule = {
  id: number;
  course_id: number;
  enrollment_id: number;
  member_id: number;
  fixed_schedule_id: number | null;
  week_start: string; // YYYY-MM-DD (그 주 월요일)
  schedule_date: string;
  start_time: string;
  duration_minutes: number;
  is_override: boolean;
  is_cancelled: boolean;
  memo: string | null;
};

const DAYS = ['월', '화', '수', '목', '금'];
const HOURS = [10, 11, 13, 14, 15, 16, 17, 18]; // 12=점심 별도 처리

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function trimTime(t: string): string {
  return t ? t.substring(0, 5) : '';
}

// YYYY-MM-DD → 0=월~6=일
function dateStrToDow(dateStr: string): number {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  return day === 0 ? 6 : day - 1;
}

function fmtWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  return `${monday.getMonth() + 1}/${monday.getDate()} ~ ${sunday.getMonth() + 1}/${sunday.getDate()}`;
}

function generateTimeOptions(): string[] {
  const opts: string[] = [];
  for (let h = 10; h <= 18; h++) {
    for (let m = 0; m < 60; m += 5) {
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return opts;
}

const TIME_OPTIONS = generateTimeOptions();

export default function LessonScheduleClient({
  course,
  enrollments,
}: {
  course: Course;
  enrollments: Enrollment[];
}) {
  const supabase = createClient();
  const today = new Date();

  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(today));
  const [fixedSchedules, setFixedSchedules] = useState<FixedSchedule[]>([]);
  const [overrides, setOverrides] = useState<OverrideSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  // 모달
  const [modal, setModal] = useState<null | 'add' | 'edit-fixed' | 'edit-override'>(null);
  const [modalDay, setModalDay] = useState(0);
  const [modalHour, setModalHour] = useState(10);
  const [selectedFixed, setSelectedFixed] = useState<FixedSchedule | null>(null);
  const [selectedOverride, setSelectedOverride] = useState<OverrideSchedule | null>(null);

  // 폼
  const [formEnrollmentId, setFormEnrollmentId] = useState('');
  const [formDay, setFormDay] = useState(0); // 0=월~4=금 (이번 주만 변경 / 영구 변경 공통)
  const [formTime, setFormTime] = useState('10:00');
  const [formDur, setFormDur] = useState<'10' | '15'>('15');
  const [saving, setSaving] = useState(false);

  const weekStartStr = ymd(weekStart);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: fixed }, { data: ovr }] = await Promise.all([
      supabase
        .from('lesson_fixed_schedules')
        .select('*')
        .eq('course_id', course.id)
        .lte('effective_from', weekStartStr)
        // 영구 변경으로 대체된 예전 스케줄은 그 유효기간(effective_until)이 지난 주에서는 제외.
        // effective_until이 없으면(=아직 대체 안 됨) 계속 유효한 것으로 봄.
        .or(`effective_until.is.null,effective_until.gte.${weekStartStr}`)
        .order('day_of_week')
        .order('start_time'),
      supabase
        .from('lesson_schedules')
        .select('*')
        .eq('course_id', course.id)
        .eq('week_start', weekStartStr),
    ]);
    setFixedSchedules(fixed || []);
    setOverrides(ovr || []);
    setLoading(false);
  }, [course.id, weekStartStr]);

  useEffect(() => { loadData(); }, [loadData]);

  const memberNameMap = useMemo(() => {
    const map = new Map<number, string>();
    enrollments.forEach(e => { if (e.members) map.set(e.member_id, e.members.name); });
    return map;
  }, [enrollments]);

  // 이번 주에 보여줄 슬롯: 고정 + override 병합
  const weekSlots = useMemo(() => {
    // day별로 정리
    const result: Record<number, Array<{
      type: 'fixed' | 'override' | 'cancelled';
      fixed: FixedSchedule | null;
      override: OverrideSchedule | null;
      displayTime: string;
      displayDur: number;
      memberId: number;
      enrollmentId: number;
      sortKey: string;
    }>> = { 0: [], 1: [], 2: [], 3: [], 4: [] };

    // 고정 스케줄 기준으로 넣기
    fixedSchedules.forEach(f => {
      const ovr = overrides.find(o => o.fixed_schedule_id === f.id);
      if (ovr) {
        if (ovr.is_cancelled) {
          // 이번 주 취소
          result[f.day_of_week].push({
            type: 'cancelled', fixed: f, override: ovr,
            displayTime: trimTime(f.start_time), displayDur: f.duration_minutes,
            memberId: f.member_id, enrollmentId: f.enrollment_id,
            sortKey: trimTime(f.start_time),
          });
        } else {
          // 이번 주 시간 변경 → override의 day에 표시
          const overrideDay = new Date(ovr.schedule_date).getDay();
          const dow = overrideDay === 0 ? 6 : overrideDay - 1; // 0=월
          if (dow >= 0 && dow <= 4) {
            result[dow].push({
              type: 'override', fixed: f, override: ovr,
              displayTime: trimTime(ovr.start_time), displayDur: ovr.duration_minutes,
              memberId: ovr.member_id, enrollmentId: ovr.enrollment_id,
              sortKey: trimTime(ovr.start_time),
            });
          }
        }
      } else {
        result[f.day_of_week].push({
          type: 'fixed', fixed: f, override: null,
          displayTime: trimTime(f.start_time), displayDur: f.duration_minutes,
          memberId: f.member_id, enrollmentId: f.enrollment_id,
          sortKey: trimTime(f.start_time),
        });
      }
    });

    // 각 day 시간순 정렬
    Object.keys(result).forEach(k => {
      result[Number(k)].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    });

    return result;
  }, [fixedSchedules, overrides]);

  function prevWeek() { setWeekStart(prev => addDays(prev, -7)); }
  function nextWeek() { setWeekStart(prev => addDays(prev, 7)); }
  function thisWeek() { setWeekStart(getMonday(today)); }

  function openAdd(day: number, hour: number) {
    setModalDay(day);
    setModalHour(hour);
    setFormEnrollmentId('');
    setFormTime(`${String(hour).padStart(2, '0')}:00`);
    setFormDur('15');
    setSelectedFixed(null);
    setSelectedOverride(null);
    setModal('add');
  }

  function openEditFixed(f: FixedSchedule) {
    setSelectedFixed(f);
    setSelectedOverride(null);
    setFormDay(f.day_of_week);
    setFormTime(trimTime(f.start_time));
    setFormDur(f.duration_minutes === 10 ? '10' : '15');
    setModal('edit-fixed');
  }

  function openEditOverride(f: FixedSchedule, o: OverrideSchedule) {
    setSelectedFixed(f);
    setSelectedOverride(o);
    setFormDay(dateStrToDow(o.schedule_date));
    setFormTime(trimTime(o.start_time));
    setFormDur(o.duration_minutes === 10 ? '10' : '15');
    setModal('edit-override');
  }

  // + 추가: 고정 스케줄 등록
  async function handleAdd() {
    if (!formEnrollmentId) { alert('수강생을 선택하세요.'); return; }
    const enrollment = enrollments.find(e => e.id === parseInt(formEnrollmentId, 10));
    if (!enrollment) return;
    setSaving(true);

    const scheduleDate = ymd(addDays(weekStart, modalDay));
    // effective_from = 이번 주 월요일
    const { error } = await supabase.from('lesson_fixed_schedules').insert({
      course_id: course.id,
      enrollment_id: enrollment.id,
      member_id: enrollment.member_id,
      day_of_week: modalDay,
      start_time: formTime,
      duration_minutes: parseInt(formDur, 10),
      effective_from: weekStartStr,
    });
    setSaving(false);
    if (error) { alert('등록 실패: ' + error.message); return; }
    setModal(null);
    loadData();
  }

  // 이번 주 시간 변경 저장 (요일도 함께 변경 가능 - formDay 기준)
  async function handleThisWeekChange() {
    if (!selectedFixed) return;
    setSaving(true);
    // 요일이 바뀌었을 수 있으므로, 원래 고정 요일이 아니라 사용자가 고른 formDay로 이번 주 날짜를 계산
    const targetDate = ymd(addDays(weekStart, formDay));

    // 기존 override 있으면 update, 없으면 insert
    if (selectedOverride) {
      const { error } = await supabase.from('lesson_schedules').update({
        start_time: formTime,
        duration_minutes: parseInt(formDur, 10),
        is_cancelled: false,
        schedule_date: targetDate,
      }).eq('id', selectedOverride.id);
      setSaving(false);
      if (error) { alert('수정 실패: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('lesson_schedules').insert({
        course_id: course.id,
        enrollment_id: selectedFixed.enrollment_id,
        member_id: selectedFixed.member_id,
        fixed_schedule_id: selectedFixed.id,
        week_start: weekStartStr,
        schedule_date: targetDate,
        start_time: formTime,
        duration_minutes: parseInt(formDur, 10),
        is_override: true,
        is_cancelled: false,
      });
      setSaving(false);
      if (error) { alert('등록 실패: ' + error.message); return; }
    }
    setModal(null);
    loadData();
  }

  // 이번 주 취소
  async function handleThisWeekCancel() {
    if (!selectedFixed) return;
    if (!confirm('이번 주 레슨을 취소하시겠습니까?')) return;
    setSaving(true);
    const targetDate = ymd(addDays(weekStart, selectedFixed.day_of_week));
    if (selectedOverride) {
      const { error } = await supabase.from('lesson_schedules').update({
        is_cancelled: true,
      }).eq('id', selectedOverride.id);
      setSaving(false);
      if (error) { alert('실패: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('lesson_schedules').insert({
        course_id: course.id,
        enrollment_id: selectedFixed.enrollment_id,
        member_id: selectedFixed.member_id,
        fixed_schedule_id: selectedFixed.id,
        week_start: weekStartStr,
        schedule_date: targetDate,
        start_time: selectedFixed.start_time,
        duration_minutes: selectedFixed.duration_minutes,
        is_override: false,
        is_cancelled: true,
      });
      setSaving(false);
      if (error) { alert('실패: ' + error.message); return; }
    }
    setModal(null);
    loadData();
  }

  // 이번 주 취소 복원
  async function handleRestoreThisWeek() {
    if (!selectedOverride) return;
    setSaving(true);
    const { error } = await supabase.from('lesson_schedules').delete().eq('id', selectedOverride.id);
    setSaving(false);
    if (error) { alert('실패: ' + error.message); return; }
    setModal(null);
    loadData();
  }

  // 고정 스케줄 영구 삭제
  // 연관 데이터 순서대로 삭제 (출석 기록 → 이번 주 변경분 → 고정 스케줄)
  // lesson_attendance가 fixed_schedule_id를 FK로 참조하므로, 출석 기록이 이미 있는 상태에서
  // lesson_fixed_schedules만 먼저 지우면 FK 위반으로 삭제가 실패한다.
  async function handleDeleteFixed() {
    if (!selectedFixed) return;
    if (!confirm(`${memberNameMap.get(selectedFixed.member_id)}님의 고정 스케줄을 완전히 삭제하시겠습니까?\n\n이 스케줄로 기록된 출석 내역도 함께 삭제됩니다.\n(이후 모든 주에서 사라집니다)`)) return;
    setSaving(true);
    const { error: attErr } = await supabase.from('lesson_attendance').delete().eq('fixed_schedule_id', selectedFixed.id);
    if (attErr) { setSaving(false); alert('출석 기록 삭제 실패: ' + attErr.message); return; }
    const { error: schedErr } = await supabase.from('lesson_schedules').delete().eq('fixed_schedule_id', selectedFixed.id);
    if (schedErr) { setSaving(false); alert('주간 변경 기록 삭제 실패: ' + schedErr.message); return; }
    const { error } = await supabase.from('lesson_fixed_schedules').delete().eq('id', selectedFixed.id);
    setSaving(false);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    setModal(null);
    loadData();
  }

  // 고정 시간 영구 변경 (요일도 함께 변경 가능)
  //
  // 예전에는 기존 행(row)을 그대로 update해서, 과거에 등록되어 있던 시간까지 전부 바뀌어버리는
  // 문제가 있었음. 이제는 기존 행은 "여기까지만 유효했다(effective_until)"로 마감하고,
  // 새 요일/시간은 새 행으로 따로 등록해서 앞으로의 스케줄에만 적용되도록 함.
  // (과거 출석 기록은 계속 예전 행의 id를 참조하므로 그대로 유지됨)
  //
  // 적용 시작 주는 "지금 보고 있는 주"와 "이번 주(오늘 기준)" 중 더 늦은 쪽으로 함:
  // 과거 주를 보다가 실수로 눌러도 과거 기록은 절대 건드리지 않고, 미리 몇 주 뒤를 보면서
  // 미래 시점으로 예약하는 것은 그대로 가능하게 하기 위함.
  async function handlePermanentChange() {
    if (!selectedFixed) return;
    const todayMonday = getMonday(today);
    const changeFromMonday = weekStart > todayMonday ? weekStart : todayMonday;
    const changeFromStr = ymd(changeFromMonday);

    if (!confirm(`고정 스케줄을 영구적으로 변경합니다.\n${changeFromMonday.getFullYear()}년 ${fmtWeekLabel(changeFromMonday)} 주부터 적용되며, 그 이전 기록은 그대로 유지됩니다.`)) return;
    setSaving(true);

    // 1) 기존 고정 스케줄은 새 스케줄 시작 전 주(일요일)까지만 유효한 것으로 마감
    const oldUntil = ymd(addDays(changeFromMonday, -1));
    const { error: closeErr } = await supabase
      .from('lesson_fixed_schedules')
      .update({ effective_until: oldUntil })
      .eq('id', selectedFixed.id);
    if (closeErr) { setSaving(false); alert('실패: ' + closeErr.message); return; }

    // 2) 새 요일/시간으로 새 고정 스케줄 행 등록
    const { error: insErr } = await supabase.from('lesson_fixed_schedules').insert({
      course_id: course.id,
      enrollment_id: selectedFixed.enrollment_id,
      member_id: selectedFixed.member_id,
      day_of_week: formDay,
      start_time: formTime,
      duration_minutes: parseInt(formDur, 10),
      effective_from: changeFromStr,
      memo: selectedFixed.memo,
    });
    if (insErr) { setSaving(false); alert('실패: ' + insErr.message); return; }

    // 3) 지금 보고 있는 주가 곧 변경 시작 주라면, 그 주에 걸려있던 "이번 주만 변경" 기록은
    //    새 고정 스케줄로 대체되는 것이므로 정리 (그보다 이전 주의 override는 과거 기록이라 건드리지 않음)
    if (selectedOverride && ymd(weekStart) === changeFromStr) {
      await supabase.from('lesson_schedules').delete().eq('id', selectedOverride.id);
    }

    setSaving(false);
    setModal(null);
    loadData();
  }

  const isThisWeek = ymd(weekStart) === ymd(getMonday(today));

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px' }}>
      <Link href={`/attendance/lesson/${course.id}`} style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>
        ← {course.name} 메뉴로
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 4px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>📅 {course.name} 주간 스케줄</h1>
      </div>

      {/* 주 네비게이션 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={prevWeek} style={navBtn}>◀</button>
        <strong style={{ fontSize: 15, minWidth: 140, textAlign: 'center' }}>
          {weekStart.getFullYear()}년 {fmtWeekLabel(weekStart)}
        </strong>
        <button onClick={nextWeek} style={navBtn}>▶</button>
        {!isThisWeek && (
          <button onClick={thisWeek} style={{ ...navBtn, marginLeft: 4, fontSize: 12 }}>이번 주</button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#888', display: 'flex', gap: 10 }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#B5D4F4', marginRight: 4 }}></span>성인 15분</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#9FE1CB', marginRight: 4 }}></span>아동 10분</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#FAC775', marginRight: 4 }}></span>이번주변경</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#e0e0e0', marginRight: 4 }}></span>이번주취소</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>불러오는 중...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 44 }} />
              {DAYS.map((_, i) => <col key={i} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}></th>
                {DAYS.map((day, di) => {
                  const d = addDays(weekStart, di);
                  const isToday = ymd(d) === ymd(today);
                  return (
                    <th key={day} style={{
                      ...thStyle,
                      color: isToday ? '#185FA5' : 'inherit',
                      borderBottom: isToday ? '2px solid #185FA5' : thStyle.borderBottom,
                    }}>
                      {day}<br />
                      <span style={{ fontSize: 11, fontWeight: 400, color: isToday ? '#185FA5' : '#888' }}>
                        {(d.getMonth() + 1)}/{d.getDate()}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {[10, 11, 'lunch', 12, 13, 14, 15, 16, 17, 18].map((h) => {
                if (h === 'lunch') {
                  return (
                    <tr key="lunch">
                      <td style={{ ...tdTimeStyle, fontSize: 10, color: '#aaa' }}>점심</td>
                      {DAYS.map((_, di) => (
                        <td key={di} style={{ ...tdCellStyle, background: '#fafafa', height: 28 }}></td>
                      ))}
                    </tr>
                  );
                }
                const hour = h as number;
                const slotsInHour = (day: number) =>
                  weekSlots[day].filter(s => {
                    const sh = parseInt(s.displayTime.substring(0, 2), 10);
                    return sh === hour;
                  });

                const hl = hourLabel12(hour);
                return (
                  <tr key={hour}>
                    <td style={{ ...tdTimeStyle, whiteSpace: 'normal', lineHeight: 1.3 }}>{hl.period}<br />{hl.text}</td>
                    {DAYS.map((_, di) => {
                      const slots = slotsInHour(di);
                      return (
                        <td key={di} style={tdCellStyle}>
                          {slots.map((s, si) => {
                            const name = memberNameMap.get(s.memberId) || '회원';
                            const isCancelled = s.type === 'cancelled';
                            const isOverride = s.type === 'override';
                            const bgColor = isCancelled ? '#e0e0e0' : isOverride ? '#FAC775' : s.displayDur === 10 ? '#9FE1CB' : '#B5D4F4';
                            const textColor = isCancelled ? '#888' : isOverride ? '#633806' : s.displayDur === 10 ? '#085041' : '#0C447C';
                            return (
                              <div
                                key={si}
                                onClick={() => {
                                  if (s.fixed) {
                                    if (s.override) openEditOverride(s.fixed, s.override);
                                    else openEditFixed(s.fixed);
                                  }
                                }}
                                style={{
                                  background: bgColor, color: textColor,
                                  borderRadius: 5, padding: '3px 6px', marginBottom: 3,
                                  cursor: 'pointer', fontSize: 12,
                                  textDecoration: isCancelled ? 'line-through' : 'none',
                                  opacity: isCancelled ? 0.7 : 1,
                                }}
                              >
                                <div style={{ fontWeight: 600, fontSize: 12 }}>{name}</div>
                                <div style={{ fontSize: 10, opacity: 0.85 }}>
                                  {formatTime12(s.displayTime)} · {s.displayDur}분
                                  {isOverride && <span style={{ marginLeft: 3, fontSize: 9, background: '#e8a800', color: 'white', borderRadius: 3, padding: '0 3px' }}>변경</span>}
                                  {isCancelled && <span style={{ marginLeft: 3, fontSize: 9 }}>취소</span>}
                                </div>
                              </div>
                            );
                          })}
                          <button
                            onClick={() => openAdd(di, hour)}
                            style={addBtnStyle}
                          >+</button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 모달 */}
      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 360 }}
          >
            {/* 신규 추가 */}
            {modal === 'add' && (
              <>
                <h3 style={modalTitle}>{DAYS[modalDay]}요일 {hourLabel12(modalHour).period} {hourLabel12(modalHour).text}대 · 고정 등록</h3>
                <p style={{ fontSize: 12, color: '#888', margin: '0 0 14px' }}>
                  이번 주({fmtWeekLabel(weekStart)})부터 매주 자동 표시됩니다.
                </p>
                <label style={labelStyle}>수강생</label>
                <select value={formEnrollmentId} onChange={e => setFormEnrollmentId(e.target.value)} style={inputStyle}>
                  <option value="">(선택)</option>
                  {enrollments
                    .filter(e => e.status === 'active')
                    .sort((a, b) => (a.members?.name || '').localeCompare(b.members?.name || '', 'ko'))
                    .map(e => (
                      <option key={e.id} value={e.id}>{e.members?.name || '회원'}</option>
                    ))}
                </select>
                <label style={labelStyle}>시작 시간</label>
                <select value={formTime} onChange={e => setFormTime(e.target.value)} style={inputStyle}>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{formatTime12(t)}</option>)}
                </select>
                <label style={labelStyle}>레슨 시간</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {(['15', '10'] as const).map(d => (
                    <button key={d} onClick={() => setFormDur(d)} style={{
                      flex: 1, padding: '8px 0', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                      background: formDur === d ? (d === '15' ? '#185FA5' : '#0F6E56') : 'white',
                      color: formDur === d ? 'white' : '#333',
                      border: `1px solid ${formDur === d ? 'transparent' : '#ddd'}`,
                      fontWeight: formDur === d ? 600 : 400,
                    }}>
                      {d === '15' ? '15분 (성인)' : '10분 (아동)'}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setModal(null)} style={cancelBtnStyle}>취소</button>
                  <button onClick={handleAdd} disabled={saving} style={saveBtnStyle}>
                    {saving ? '저장 중...' : '고정 등록'}
                  </button>
                </div>
              </>
            )}

            {/* 고정 스케줄 수정 */}
            {(modal === 'edit-fixed' || modal === 'edit-override') && selectedFixed && (
              <>
                <h3 style={modalTitle}>{memberNameMap.get(selectedFixed.member_id) || '회원'}</h3>
                <p style={{ fontSize: 12, color: '#666', margin: '0 0 4px' }}>
                  고정: {DAYS[selectedFixed.day_of_week]}요일 {formatTime12(selectedFixed.start_time)} · {selectedFixed.duration_minutes}분
                </p>
                {selectedOverride && !selectedOverride.is_cancelled && (
                  <p style={{ fontSize: 12, color: '#B8860B', margin: '0 0 14px', background: '#FFFBEA', borderRadius: 6, padding: '4px 8px' }}>
                    이번 주 변경됨: {formatTime12(selectedOverride.start_time)} · {selectedOverride.duration_minutes}분
                  </p>
                )}
                {selectedOverride?.is_cancelled && (
                  <p style={{ fontSize: 12, color: '#888', margin: '0 0 14px', background: '#f5f5f5', borderRadius: 6, padding: '4px 8px' }}>
                    이번 주 취소됨
                  </p>
                )}

                {/* 이번 주 변경 섹션 */}
                <div style={{ background: '#F8F9FF', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 8 }}>이번 주만 변경</div>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
                    아래 요일/시간은 "이번 주 저장"과 "영구 변경 적용" 두 버튼에 공통으로 적용됩니다.
                  </p>
                  <label style={{ ...labelStyle, fontSize: 11 }}>요일</label>
                  <select value={formDay} onChange={e => setFormDay(parseInt(e.target.value, 10))} style={{ ...inputStyle, marginBottom: 8 }}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}요일</option>)}
                  </select>
                  <label style={{ ...labelStyle, fontSize: 11 }}>시작 시간</label>
                  <select value={formTime} onChange={e => setFormTime(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }}>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{formatTime12(t)}</option>)}
                  </select>
                  <label style={{ ...labelStyle, fontSize: 11 }}>레슨 시간</label>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {(['15', '10'] as const).map(d => (
                      <button key={d} onClick={() => setFormDur(d)} style={{
                        flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                        background: formDur === d ? (d === '15' ? '#185FA5' : '#0F6E56') : 'white',
                        color: formDur === d ? 'white' : '#333',
                        border: `1px solid ${formDur === d ? 'transparent' : '#ddd'}`,
                      }}>
                        {d === '15' ? '15분' : '10분'}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleThisWeekChange} disabled={saving} style={{ ...saveBtnStyle, flex: 1, padding: '7px 0', fontSize: 12 }}>
                      이번 주 저장
                    </button>
                    {selectedOverride?.is_cancelled ? (
                      <button onClick={handleRestoreThisWeek} disabled={saving} style={{ ...cancelBtnStyle, flex: 1, padding: '7px 0', fontSize: 12, color: '#0F6E56', borderColor: '#0F6E56' }}>
                        취소 복원
                      </button>
                    ) : (
                      <button onClick={handleThisWeekCancel} disabled={saving} style={{ ...cancelBtnStyle, flex: 1, padding: '7px 0', fontSize: 12, color: '#A32D2D', borderColor: '#A32D2D' }}>
                        이번 주 취소
                      </button>
                    )}
                  </div>
                </div>

                {/* 영구 변경 섹션 */}
                <div style={{ background: '#FFF8F0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 6 }}>고정 시간 영구 변경</div>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
                    위에서 고른 요일/시간/분으로 앞으로의 스케줄이 바뀝니다. 이미 지난 주 기록은 바뀌지 않습니다.
                  </p>
                  <button onClick={handlePermanentChange} disabled={saving} style={{
                    width: '100%', padding: '7px 0', borderRadius: 6, cursor: 'pointer',
                    background: 'white', border: '1px solid #E8A800', color: '#B8860B', fontSize: 12,
                  }}>
                    영구 변경 적용
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button onClick={handleDeleteFixed} disabled={saving} style={{ fontSize: 12, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    고정 스케줄 삭제
                  </button>
                  <button onClick={() => setModal(null)} style={cancelBtnStyle}>닫기</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd',
  background: 'white', cursor: 'pointer', fontSize: 16, color: '#555',
};
const thStyle: React.CSSProperties = {
  padding: '8px 4px', textAlign: 'center', fontSize: 13, fontWeight: 500,
  background: '#fafafa', border: '0.5px solid #e8e8e8', borderBottom: '1px solid #ddd',
};
const tdTimeStyle: React.CSSProperties = {
  fontSize: 11, color: '#aaa', textAlign: 'right', padding: '4px 6px 0 0',
  verticalAlign: 'top', background: '#fafafa', border: '0.5px solid #e8e8e8',
  whiteSpace: 'nowrap',
};
const tdCellStyle: React.CSSProperties = {
  verticalAlign: 'top', padding: 4, border: '0.5px solid #e8e8e8',
  minHeight: 80, height: 80,
};
const addBtnStyle: React.CSSProperties = {
  display: 'block', width: '100%', fontSize: 11, color: '#bbb',
  border: '0.5px dashed #ddd', borderRadius: 4, cursor: 'pointer',
  background: 'none', padding: '2px 0', marginTop: 2,
};
const modalTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, margin: '0 0 12px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#555', marginBottom: 4, marginTop: 10, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const, marginBottom: 4 };
const saveBtnStyle: React.CSSProperties = { padding: '9px 20px', background: '#7B3FBF', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 };
const cancelBtnStyle: React.CSSProperties = { padding: '9px 16px', background: 'white', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#555' };
