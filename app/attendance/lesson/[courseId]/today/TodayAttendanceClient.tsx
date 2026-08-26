'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Course = {
  id: number;
  name: string;
};

type Enrollment = {
  id: number;
  member_id: number;
  status: string;
  members: { id: number; name: string; phone: string | null } | null;
};

type FixedSchedule = {
  id: number;
  enrollment_id: number;
  member_id: number;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  effective_from: string;
  effective_until: string | null;
};

type OverrideSchedule = {
  id: number;
  fixed_schedule_id: number | null;
  week_start: string;
  schedule_date: string;
  start_time: string;
  duration_minutes: number;
  is_cancelled: boolean;
  enrollment_id: number;
  member_id: number;
};

type AttendanceRecord = {
  id: number;
  lesson_schedule_id: number | null;
  fixed_schedule_id: number | null;
  attend_date: string;
  is_attended: boolean;
};

// 오늘의 레슨 슬롯 (화면에 표시할 단위)
type TodaySlot = {
  key: string;
  fixedId: number;
  overrideId: number | null;
  memberId: number;
  enrollmentId: number;
  memberName: string;
  displayTime: string; // HH:MM
  durationMin: number;
  isCancelled: boolean;
};

const DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function trimTime(t: string): string {
  return t ? t.substring(0, 5) : '';
}

function hourLabel(time: string): number {
  return parseInt(time.substring(0, 2), 10);
}

export default function TodayAttendanceClient({
  course,
  enrollments,
}: {
  course: Course;
  enrollments: Enrollment[];
}) {
  const supabase = createClient();
  const today = new Date();
  const todayStr = ymd(today);
  const weekStartStr = ymd(getMonday(today));
  // 0=일 → 0=월 기준으로 변환
  const rawDow = today.getDay(); // 0=일~6=토
  const dow = rawDow === 0 ? 6 : rawDow - 1; // 0=월~6=일

  const [slots, setSlots] = useState<TodaySlot[]>([]);
  const [attended, setAttended] = useState<Set<string>>(new Set()); // key = fixedId or overrideId
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const memberNameMap = new Map<number, string>();
  enrollments.forEach(e => { if (e.members) memberNameMap.set(e.member_id, e.members.name); });

  const loadData = useCallback(async () => {
    setLoading(true);

    // 오늘 요일의 고정 스케줄
    const { data: fixed } = await supabase
      .from('lesson_fixed_schedules')
      .select('*')
      .eq('course_id', course.id)
      .eq('day_of_week', dow)
      .lte('effective_from', weekStartStr)
      // 영구 변경으로 대체된 예전 스케줄(오늘 기준 이미 지남)은 제외
      .or(`effective_until.is.null,effective_until.gte.${weekStartStr}`)
      .order('start_time');

    // 이번 주 override (오늘 날짜 기준)
    const { data: overrides } = await supabase
      .from('lesson_schedules')
      .select('*')
      .eq('course_id', course.id)
      .eq('week_start', weekStartStr);

    // 오늘 출석 기록
    const { data: attRecords } = await supabase
      .from('lesson_attendance')
      .select('*')
      .eq('course_id', course.id)
      .eq('attend_date', todayStr);

    const fixedList: FixedSchedule[] = fixed || [];
    const overrideList: OverrideSchedule[] = overrides || [];
    const attList: AttendanceRecord[] = attRecords || [];

    // 출석된 fixedId 세트
    const attendedKeys = new Set<string>(
      attList.map(a => a.fixed_schedule_id ? `f-${a.fixed_schedule_id}` : `o-${a.lesson_schedule_id}`)
    );
    setAttended(attendedKeys);

    // 슬롯 조립
    const result: TodaySlot[] = [];

    fixedList.forEach(f => {
      const ovr = overrideList.find(o => o.fixed_schedule_id === f.id);

      if (ovr) {
        if (ovr.is_cancelled) return; // 이번 주 취소된 것은 표시 안 함

        // 이번 주 변경된 경우: override의 날짜가 오늘인 것만
        if (ovr.schedule_date === todayStr) {
          result.push({
            key: `f-${f.id}`,
            fixedId: f.id,
            overrideId: ovr.id,
            memberId: f.member_id,
            enrollmentId: f.enrollment_id,
            memberName: memberNameMap.get(f.member_id) || '회원',
            displayTime: trimTime(ovr.start_time),
            durationMin: ovr.duration_minutes,
            isCancelled: false,
          });
        }
        // 원래 요일(오늘)인데 override로 다른 날로 이동된 경우는 표시 안 함
      } else {
        // 고정 스케줄 그대로
        result.push({
          key: `f-${f.id}`,
          fixedId: f.id,
          overrideId: null,
          memberId: f.member_id,
          enrollmentId: f.enrollment_id,
          memberName: memberNameMap.get(f.member_id) || '회원',
          displayTime: trimTime(f.start_time),
          durationMin: f.duration_minutes,
          isCancelled: false,
        });
      }
    });

    // 시간 순 정렬
    result.sort((a, b) => a.displayTime.localeCompare(b.displayTime));
    setSlots(result);
    setLoading(false);
  }, [course.id, dow, weekStartStr, todayStr]);

  useEffect(() => { loadData(); }, [loadData]);

  async function toggleAttendance(slot: TodaySlot) {
    if (toggling) return;
    setToggling(slot.key);

    const isNowAttended = attended.has(slot.key);

    if (isNowAttended) {
      // 출석 취소
      await supabase
        .from('lesson_attendance')
        .delete()
        .eq('course_id', course.id)
        .eq('attend_date', todayStr)
        .eq('fixed_schedule_id', slot.fixedId);

      setAttended(prev => {
        const next = new Set(prev);
        next.delete(slot.key);
        return next;
      });
    } else {
      // 출석 체크
      await supabase.from('lesson_attendance').upsert({
        course_id: course.id,
        enrollment_id: slot.enrollmentId,
        member_id: slot.memberId,
        fixed_schedule_id: slot.fixedId,
        lesson_schedule_id: slot.overrideId || null,
        attend_date: todayStr,
        is_attended: true,
      }, { onConflict: 'course_id,fixed_schedule_id,attend_date' });

      setAttended(prev => new Set([...prev, slot.key]));
    }

    setToggling(null);
  }

  // 시간대별 그룹핑
  const grouped: Record<number, TodaySlot[]> = {};
  slots.forEach(s => {
    const h = hourLabel(s.displayTime);
    if (!grouped[h]) grouped[h] = [];
    grouped[h].push(s);
  });
  const hours = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  const attendedCount = slots.filter(s => attended.has(s.key)).length;
  const totalCount = slots.length;

  const isWeekend = rawDow === 0 || rawDow === 6;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px' }}>
      <Link href={`/attendance/lesson/${course.id}`} style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>
        ← {course.name} 메뉴로
      </Link>

      {/* 헤더 */}
      <div style={{ marginTop: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
          오늘 출석부
        </h1>
        <div style={{ fontSize: 14, color: '#555' }}>
          {today.getMonth() + 1}월 {today.getDate()}일 ({DAY_KR[rawDow]})
          &nbsp;·&nbsp;
          <span style={{ color: attendedCount === totalCount && totalCount > 0 ? '#0F6E56' : '#555' }}>
            {attendedCount} / {totalCount}명 출석
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>불러오는 중...</div>
      ) : isWeekend ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌅</div>
          오늘은 주말이에요
        </div>
      ) : slots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          오늘 등록된 레슨이 없어요
        </div>
      ) : (
        <div>
          {hours.map(h => (
            <div key={h} style={{ marginBottom: 24 }}>
              {/* 시간대 헤더 */}
              <div style={{
                fontSize: 12, fontWeight: 600, color: '#888',
                borderBottom: '1px solid #eee', paddingBottom: 6, marginBottom: 10,
              }}>
                {h}시대
              </div>

              {/* 슬롯 목록 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {grouped[h].map(slot => {
                  const isAttended = attended.has(slot.key);
                  const isLoading = toggling === slot.key;

                  return (
                    <div
                      key={slot.key}
                      onClick={() => !isLoading && toggleAttendance(slot)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px',
                        borderRadius: 10,
                        border: `2px solid ${isAttended ? '#9FE1CB' : '#e8e8e8'}`,
                        background: isAttended ? '#F0FBF7' : 'white',
                        cursor: isLoading ? 'wait' : 'pointer',
                        transition: 'all 0.15s',
                        userSelect: 'none',
                      }}
                    >
                      {/* 체크 아이콘 */}
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isAttended ? '#0F6E56' : '#f0f0f0',
                        color: isAttended ? 'white' : '#bbb',
                        fontSize: 18, fontWeight: 700,
                        transition: 'all 0.15s',
                      }}>
                        {isAttended ? '✓' : '○'}
                      </div>

                      {/* 이름 + 시간 */}
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: 17, fontWeight: 600,
                          color: isAttended ? '#0F6E56' : '#222',
                        }}>
                          {slot.memberName}
                        </div>
                        <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                          {slot.displayTime} · {slot.durationMin}분
                        </div>
                      </div>

                      {/* 출석 상태 텍스트 */}
                      <div style={{
                        fontSize: 13, fontWeight: 500,
                        color: isAttended ? '#0F6E56' : '#ccc',
                      }}>
                        {isLoading ? '...' : isAttended ? '출석' : '미확인'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
