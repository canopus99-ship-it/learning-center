'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DAY_LABELS, FREQUENCY_LABELS, generateRegularDates, type SessionConfig } from '@/lib/courseDates';
import { STATUS_LABELS, STATUS_COLORS, type EnrollmentStatus } from '@/lib/enrollment';
import { END_REASON_LABELS, END_REASON_COLORS } from '@/lib/payments';

type Course = {
  id: number; category: string; name: string;
  instructor_id: number | null; sub_instructor_id: number | null; classroom: string | null; capacity: number;
  is_lesson?: boolean;
  use_levels?: boolean;
  operation_type: string; operation_months: string | null;
  fee_jung_gu: number; fee_other: number;
  is_free: boolean; is_active: boolean; memo: string | null;
};

type CourseLevel = {
  id: number;
  course_id: number;
  level_name: string;
  fee_jung_gu: number;
  fee_other: number;
  sort_order: number;
};

type Session = {
  id: number; frequency: string | null; day_of_week: number | null;
  specific_date: string | null; start_time: string; end_time: string;
};

type Instructor = { id: number; name: string; is_active: boolean };

type MemberInEnrollment = {
  id: number; name: string;
  phone: string | null; birth_date: string | null; region_type: string | null;
};

type Enrollment = {
  id: number; member_id: number; course_id: number;
  status: EnrollmentStatus;
  waiting_order: number | null;
  enrolled_at: string; ended_at: string | null;
  end_reason: string | null;
  refund_date: string | null;
  refund_memo: string | null;
  memo: string | null;
  course_level_id?: number | null;
  members: MemberInEnrollment | null;
};

type MemberSearchResult = {
  id: number; name: string;
  phone: string | null; birth_date: string | null; region_type: string | null;
};

const CATEGORIES = ['문화강좌', '성숙한시민', '능동적시민', '평등한시민', '기타'];
const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5', '성숙한시민': '#7B3FBF', '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517', '기타': '#666',
};
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const FREQUENCIES = [
  { value: 'weekly', label: '매주' },
  { value: 'biweekly', label: '격주' },
  { value: 'monthly', label: '매월' },
];
const DAYS = [
  { value: 1, label: '월' }, { value: 2, label: '화' }, { value: 3, label: '수' },
  { value: 4, label: '목' }, { value: 5, label: '금' }, { value: 6, label: '토' },
  { value: 7, label: '일' },
];

export default function CourseDetailClient({
  course: initialCourse,
  sessions: initialSessions,
  instructors,
  initialEnrollments,
  initialLevels,
}: {
  course: Course;
  sessions: Session[];
  instructors: Instructor[];
  initialEnrollments: Enrollment[];
  initialLevels: CourseLevel[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [course, setCourse] = useState<Course>(initialCourse);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [enrollments, setEnrollments] = useState<Enrollment[]>(initialEnrollments);
  const [levels] = useState<CourseLevel[]>(initialLevels);

  // 수정 모드
  const [basicEditing, setBasicEditing] = useState(false);
  const [scheduleEditing, setScheduleEditing] = useState(false);

  // 가벼운 수정 폼
  const [editCategory, setEditCategory] = useState(course.category);
  const [editName, setEditName] = useState(course.name);
  const [editInstructorId, setEditInstructorId] = useState<string>(course.instructor_id ? String(course.instructor_id) : '');
  const [editSubInstructorId, setEditSubInstructorId] = useState<string>(course.sub_instructor_id ? String(course.sub_instructor_id) : '');
  const [editIsLesson, setEditIsLesson] = useState<boolean>(!!course.is_lesson);
  const [editClassroom, setEditClassroom] = useState(course.classroom || '');
  const [editCapacity, setEditCapacity] = useState(String(course.capacity));
  const [editIsFree, setEditIsFree] = useState(course.is_free);
  const [editFeeJungGu, setEditFeeJungGu] = useState(String(course.fee_jung_gu));
  const [editFeeOther, setEditFeeOther] = useState(String(course.fee_other));
  const [editUseLevels, setEditUseLevels] = useState(!!course.use_levels);
  const [editLevels, setEditLevels] = useState<{ id?: number; level_name: string; fee_jung_gu: string; fee_other: string }[]>(
    initialLevels.length > 0
      ? initialLevels.map(lv => ({ id: lv.id, level_name: lv.level_name, fee_jung_gu: String(lv.fee_jung_gu), fee_other: String(lv.fee_other) }))
      : [
          { level_name: '초급', fee_jung_gu: '', fee_other: '' },
          { level_name: '중급', fee_jung_gu: '', fee_other: '' },
          { level_name: '고급', fee_jung_gu: '', fee_other: '' },
        ]
  );
  const [editMemo, setEditMemo] = useState(course.memo || '');

  // 무거운 수정 폼
  const [editOperationType, setEditOperationType] = useState<'regular' | 'irregular'>(course.operation_type as 'regular' | 'irregular');
  const [editOperationMonths, setEditOperationMonths] = useState<number[]>(
    course.operation_months ? course.operation_months.split(',').filter(Boolean).map(Number) : [...ALL_MONTHS]
  );
  const [editRegularSessions, setEditRegularSessions] = useState<any[]>(
    course.operation_type === 'regular' && sessions.length > 0
      ? sessions.map(s => ({
          frequency: s.frequency || 'weekly', day_of_week: s.day_of_week || 1,
          start_time: s.start_time, end_time: s.end_time,
        }))
      : [{ frequency: 'weekly', day_of_week: 1, start_time: '10:00', end_time: '11:30' }]
  );
  const [editIrregularSessions, setEditIrregularSessions] = useState<any[]>(
    course.operation_type === 'irregular' && sessions.length > 0
      ? sessions.map(s => ({
          specific_date: s.specific_date, start_time: s.start_time, end_time: s.end_time,
        }))
      : [{ specific_date: '', start_time: '10:00', end_time: '11:30' }]
  );

  // 수강신청 추가
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState<string>(''); // 등급 강좌용
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // (수강 종료 관련 state 제거됨 - 수강 종료는 수납관리 또는 회원관리에서 처리)

  const instructorMap = new Map(instructors.map(i => [i.id, i.name]));
  const activeInstructors = instructors.filter(i => i.is_active || i.id === course.instructor_id || i.id === course.sub_instructor_id);
  const operationMonthsArr = course.operation_months ? course.operation_months.split(',').filter(Boolean).map(Number) : [];

  const activeCount = enrollments.filter(e => e.status === 'active' || e.status === 'paused').length;
  const waitingList = enrollments.filter(e => e.status === 'waiting').sort((a, b) => (a.waiting_order || 0) - (b.waiting_order || 0));
  const activeList = enrollments.filter(e => e.status === 'active' || e.status === 'paused').sort((a, b) => (a.members?.name || '').localeCompare(b.members?.name || ''));
  const endedList = enrollments.filter(e => e.status === 'ended').sort((a, b) => (b.ended_at || '').localeCompare(a.ended_at || ''));

  const isFull = activeCount >= course.capacity;
  const enrolledMemberIds = new Set(enrollments.map(e => e.member_id));

  async function reloadEnrollments() {
    const { data } = await supabase
      .from('enrollments')
      .select('*, members(id, name, phone, birth_date, region_type)')
      .eq('course_id', course.id);
    setEnrollments((data as Enrollment[]) || []);
  }

  async function reloadSessions() {
    const { data } = await supabase
      .from('course_sessions').select('*').eq('course_id', course.id);
    setSessions((data as Session[]) || []);
  }

  // 등급 관리 헬퍼
  function addEditLevel() {
    setEditLevels([...editLevels, { level_name: '', fee_jung_gu: '', fee_other: '' }]);
  }
  function removeEditLevel(idx: number) {
    if (editLevels.length <= 1) { alert('등급은 최소 1개 이상이어야 합니다.'); return; }
    setEditLevels(editLevels.filter((_, i) => i !== idx));
  }
  function updateEditLevel(idx: number, field: 'level_name' | 'fee_jung_gu' | 'fee_other', value: string) {
    setEditLevels(editLevels.map((lv, i) => {
      if (i !== idx) return lv;
      if (field === 'level_name') return { ...lv, level_name: value };
      return { ...lv, [field]: value.replace(/[^0-9]/g, '') };
    }));
  }

  // 가벼운 수정
  async function handleSaveBasic() {
    if (!editName.trim()) { alert('강좌명을 입력하세요'); return; }

    // 등급 강좌면 등급 유효성 체크
    if (!editIsFree && editUseLevels) {
      const validLevels = editLevels.filter(lv => lv.level_name.trim());
      if (validLevels.length === 0) {
        alert('등급별 수강료를 사용하려면 등급을 최소 1개 이상 등록해야 합니다.');
        return;
      }
    }

    const updated = {
      category: editCategory, name: editName.trim(),
      instructor_id: editInstructorId ? parseInt(editInstructorId, 10) : null,
      sub_instructor_id: editSubInstructorId ? parseInt(editSubInstructorId, 10) : null,
      is_lesson: editIsLesson,
      classroom: editClassroom || null,
      capacity: parseInt(editCapacity, 10) || 20,
      fee_jung_gu: editIsFree ? 0 : (parseInt(editFeeJungGu, 10) || 0),
      fee_other: editIsFree ? 0 : (parseInt(editFeeOther, 10) || 0),
      is_free: editIsFree,
      use_levels: !editIsFree && editUseLevels,
      memo: editMemo.trim() || null,
    };
    const { error } = await supabase.from('courses').update(updated).eq('id', course.id);
    if (error) { alert('수정 실패: ' + error.message); return; }

    // 등급 강좌면 course_levels 갱신: 기존 다 지우고 새로 insert
    // (단순한 방식 - 등급 ID가 enrollments에 연결돼있어도 같은 이름이면 사실상 동일 효과)
    if (!editIsFree && editUseLevels) {
      const validLevels = editLevels.filter(lv => lv.level_name.trim());
      // 기존 등급 중 enrollments에서 사용중인지 확인 후 처리하는 게 안전하지만,
      // 단순화: upsert 방식으로 id 있는 건 update, 없는 건 insert, 사라진 건 삭제
      const existingIds = initialLevels.map(lv => lv.id);
      const keepIds = validLevels.filter(lv => lv.id).map(lv => lv.id as number);
      const toDelete = existingIds.filter(id => !keepIds.includes(id));

      // 삭제
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase.from('course_levels').delete().in('id', toDelete);
        if (delErr) {
          alert('일부 등급 삭제 실패 (사용중인 등급일 수 있음): ' + delErr.message);
        }
      }
      // 업데이트 (기존 id 있는 것)
      for (const lv of validLevels) {
        if (lv.id) {
          await supabase.from('course_levels').update({
            level_name: lv.level_name.trim(),
            fee_jung_gu: parseInt(lv.fee_jung_gu, 10) || 0,
            fee_other: parseInt(lv.fee_other, 10) || 0,
          }).eq('id', lv.id);
        }
      }
      // 신규 insert (id 없는 것)
      const newLevels = validLevels.filter(lv => !lv.id).map((lv, idx) => ({
        course_id: course.id,
        level_name: lv.level_name.trim(),
        fee_jung_gu: parseInt(lv.fee_jung_gu, 10) || 0,
        fee_other: parseInt(lv.fee_other, 10) || 0,
        sort_order: existingIds.length + idx,
      }));
      if (newLevels.length > 0) {
        const { error: insErr } = await supabase.from('course_levels').insert(newLevels);
        if (insErr) {
          alert('일부 등급 추가 실패: ' + insErr.message);
        }
      }
    } else if (!editUseLevels && initialLevels.length > 0) {
      // 등급 사용 해제: 기존 등급 모두 삭제 시도
      await supabase.from('course_levels').delete().eq('course_id', course.id);
    }

    alert('강좌 정보가 수정되었습니다!');
    setCourse({ ...course, ...updated });
    setBasicEditing(false);
    // 페이지 새로고침으로 levels 다시 로드
    router.refresh();
  }

  function handleCancelBasic() {
    setEditCategory(course.category); setEditName(course.name);
    setEditInstructorId(course.instructor_id ? String(course.instructor_id) : '');
    setEditSubInstructorId(course.sub_instructor_id ? String(course.sub_instructor_id) : '');
    setEditIsLesson(!!course.is_lesson);
    setEditClassroom(course.classroom || ''); setEditCapacity(String(course.capacity));
    setEditIsFree(course.is_free); setEditFeeJungGu(String(course.fee_jung_gu));
    setEditFeeOther(String(course.fee_other)); setEditMemo(course.memo || '');
    setEditUseLevels(!!course.use_levels);
    setEditLevels(
      initialLevels.length > 0
        ? initialLevels.map(lv => ({ id: lv.id, level_name: lv.level_name, fee_jung_gu: String(lv.fee_jung_gu), fee_other: String(lv.fee_other) }))
        : [
            { level_name: '초급', fee_jung_gu: '', fee_other: '' },
            { level_name: '중급', fee_jung_gu: '', fee_other: '' },
            { level_name: '고급', fee_jung_gu: '', fee_other: '' },
          ]
    );
    setBasicEditing(false);
  }

  // 일정 수정
  function addRegularSession() {
    setEditRegularSessions([...editRegularSessions, { frequency: 'weekly', day_of_week: 1, start_time: '10:00', end_time: '11:30' }]);
  }
  function removeRegularSession(idx: number) {
    if (editRegularSessions.length <= 1) { alert('최소 1개의 세션이 필요합니다'); return; }
    setEditRegularSessions(editRegularSessions.filter((_, i) => i !== idx));
  }
  function updateRegularSession(idx: number, key: string, value: any) {
    setEditRegularSessions(editRegularSessions.map((s, i) => i === idx ? { ...s, [key]: value } : s));
  }
  function addIrregularSession() {
    setEditIrregularSessions([...editIrregularSessions, { specific_date: '', start_time: '10:00', end_time: '11:30' }]);
  }
  function removeIrregularSession(idx: number) {
    if (editIrregularSessions.length <= 1) { alert('최소 1개의 세션이 필요합니다'); return; }
    setEditIrregularSessions(editIrregularSessions.filter((_, i) => i !== idx));
  }
  function updateIrregularSession(idx: number, key: string, value: any) {
    setEditIrregularSessions(editIrregularSessions.map((s, i) => i === idx ? { ...s, [key]: value } : s));
  }
  function toggleEditMonth(month: number) {
    setEditOperationMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month].sort((a, b) => a - b)
    );
  }

  async function handleSaveSchedule() {
    if (editOperationType === 'regular' && editOperationMonths.length === 0) {
      alert('운영월을 최소 1개 이상 선택하세요'); return;
    }
    if (editOperationType === 'irregular') {
      const hasEmpty = editIrregularSessions.some(s => !s.specific_date);
      if (hasEmpty) { alert('모든 세션의 날짜를 입력하세요'); return; }
    }

    const regenerateDates = confirm(
      '수업 일정이 변경되었습니다.\n\n' +
      '⚠️ "확인"을 누르면:\n' +
      '  - 기존 자동 생성된 수업 날짜가 모두 삭제됩니다\n' +
      '  - 새 일정 기준으로 출석부가 다시 생성됩니다\n' +
      '  - 보강으로 추가한 날짜는 그대로 유지됩니다\n\n' +
      '"취소"를 누르면 일정 정보만 저장하고 기존 출석부는 유지됩니다.'
    );

    const { error: courseError } = await supabase.from('courses').update({
      operation_type: editOperationType,
      operation_months: editOperationType === 'regular' ? editOperationMonths.join(',') : null,
    }).eq('id', course.id);

    if (courseError) { alert('강좌 수정 실패: ' + courseError.message); return; }

    await supabase.from('course_sessions').delete().eq('course_id', course.id);

    const sessionsToInsert = editOperationType === 'regular'
      ? editRegularSessions.map(s => ({
          course_id: course.id, frequency: s.frequency, day_of_week: s.day_of_week,
          specific_date: null, start_time: s.start_time, end_time: s.end_time,
        }))
      : editIrregularSessions.map(s => ({
          course_id: course.id, frequency: null, day_of_week: null,
          specific_date: s.specific_date, start_time: s.start_time, end_time: s.end_time,
        }));

    const { data: insertedSessions, error: sessionsError } = await supabase
      .from('course_sessions').insert(sessionsToInsert).select();

    if (sessionsError) { alert('세션 저장 실패: ' + sessionsError.message); return; }

    if (regenerateDates) {
      await supabase.from('course_dates').delete().eq('course_id', course.id).eq('is_makeup', false);

      const datesToInsert: any[] = [];
      if (editOperationType === 'regular') {
        const currentYear = new Date().getFullYear();
        const sessionConfigs: SessionConfig[] = editRegularSessions.map(s => ({
          frequency: (s.frequency || 'weekly') as 'weekly' | 'biweekly' | 'monthly',
          day_of_week: s.day_of_week || 1,
          start_time: s.start_time, end_time: s.end_time,
        }));
        const generated = generateRegularDates(currentYear, editOperationMonths, sessionConfigs);
        generated.forEach((d) => {
          const sessionId = insertedSessions?.[d.session_index]?.id;
          datesToInsert.push({
            course_id: course.id, session_id: sessionId || null,
            class_date: d.class_date, start_time: d.start_time, end_time: d.end_time,
            is_cancelled: false, is_makeup: false,
          });
        });
      } else {
        editIrregularSessions.forEach((s, idx) => {
          const sessionId = insertedSessions?.[idx]?.id;
          datesToInsert.push({
            course_id: course.id, session_id: sessionId || null,
            class_date: s.specific_date, start_time: s.start_time, end_time: s.end_time,
            is_cancelled: false, is_makeup: false,
          });
        });
      }

      if (datesToInsert.length > 0) {
        await supabase.from('course_dates').insert(datesToInsert);
      }
      alert(`일정이 수정되고 출석부가 다시 생성되었습니다. (총 ${datesToInsert.length}개)`);
    } else {
      alert('일정 정보만 저장되었습니다.');
    }

    setCourse({
      ...course, operation_type: editOperationType,
      operation_months: editOperationType === 'regular' ? editOperationMonths.join(',') : null,
    });
    reloadSessions();
    setScheduleEditing(false);
  }

  function handleCancelSchedule() {
    setEditOperationType(course.operation_type as 'regular' | 'irregular');
    setEditOperationMonths(course.operation_months ? course.operation_months.split(',').filter(Boolean).map(Number) : [...ALL_MONTHS]);
    setEditRegularSessions(
      course.operation_type === 'regular' && sessions.length > 0
        ? sessions.map(s => ({
            frequency: s.frequency || 'weekly', day_of_week: s.day_of_week || 1,
            start_time: s.start_time, end_time: s.end_time,
          }))
        : [{ frequency: 'weekly', day_of_week: 1, start_time: '10:00', end_time: '11:30' }]
    );
    setEditIrregularSessions(
      course.operation_type === 'irregular' && sessions.length > 0
        ? sessions.map(s => ({
            specific_date: s.specific_date, start_time: s.start_time, end_time: s.end_time,
          }))
        : [{ specific_date: '', start_time: '10:00', end_time: '11:30' }]
    );
    setScheduleEditing(false);
  }

  // 수강신청
  async function handleSearchMember() {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const q = searchQuery.trim();
    const { data } = await supabase
      .from('members')
      .select('id, name, phone, birth_date, region_type')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20);
    setSearchResults(data || []);
    setSearching(false);
  }

  async function handleEnroll(memberId: number, memberName: string) {
    // 등급 강좌면 등급 선택 필수
    if (course.use_levels && !selectedLevelId) {
      alert('등급을 먼저 선택해주세요.');
      return;
    }
    const courseLevelId = selectedLevelId ? parseInt(selectedLevelId, 10) : null;

    if (enrolledMemberIds.has(memberId)) {
      const existing = enrollments.find(e => e.member_id === memberId);
      if (existing?.status === 'ended') {
        if (!confirm(`${memberName}님은 이전에 이 강좌를 수강하셨습니다. 다시 신청하시겠습니까?`)) return;
        const status = isFull ? 'waiting' : 'active';
        const waitingOrder = status === 'waiting' ? (waitingList.length + 1) : null;
        await supabase.from('enrollments').update({
          status, waiting_order: waitingOrder,
          enrolled_at: new Date().toISOString(), ended_at: null,
          end_reason: null, refund_date: null, refund_memo: null,
          ...(course.use_levels ? { course_level_id: courseLevelId } : {}),
        }).eq('id', existing.id);
        alert(`${memberName}님이 ${status === 'waiting' ? '대기 명단에 추가' : '수강신청'}되었습니다!`);
        reloadEnrollments();
        return;
      } else {
        alert(`${memberName}님은 이미 이 강좌에 등록되어 있습니다 (${STATUS_LABELS[existing!.status]})`);
        return;
      }
    }

    const status = isFull ? 'waiting' : 'active';
    const waitingOrder = status === 'waiting' ? (waitingList.length + 1) : null;
    const newEnrollment: any = {
      member_id: memberId, course_id: course.id, status, waiting_order: waitingOrder,
    };
    if (course.use_levels) {
      newEnrollment.course_level_id = courseLevelId;
    }
    const { error } = await supabase.from('enrollments').insert([newEnrollment]);
    if (error) alert('수강신청 실패: ' + error.message);
    else {
      alert(`${memberName}님이 ${status === 'waiting' ? `대기 ${waitingOrder}순위에 추가` : '수강신청'}되었습니다!`);
      reloadEnrollments();
    }
  }

  async function handleChangeStatus(e: Enrollment, newStatus: EnrollmentStatus) {
    const memberName = e.members?.name || '회원';

    // 수강 종료/재개는 수납관리 또는 회원 상세에서 처리하도록 안내
    if (newStatus === 'ended') {
      alert(`수강 종료는 수납관리 또는 회원 상세 페이지에서 처리해주세요.\n(처리 후 이 화면에 자동 반영됩니다.)`);
      return;
    }

    if (!confirm(`${memberName}님을 "${STATUS_LABELS[newStatus]}" 상태로 변경하시겠습니까?`)) return;

    const updates: any = { status: newStatus };
    if (newStatus === 'active') {
      updates.waiting_order = null;
      // 대기 → 수강중 전환 등 정상 케이스
    } else if (newStatus === 'waiting') {
      updates.waiting_order = waitingList.length + 1;
    }

    const { error } = await supabase.from('enrollments').update(updates).eq('id', e.id);
    if (error) alert('변경 실패: ' + error.message);
    else reloadEnrollments();
  }

  async function handleMoveWaitingOrder(e: Enrollment, direction: 'up' | 'down') {
    const currentOrder = e.waiting_order || 0;
    const targetOrder = direction === 'up' ? currentOrder - 1 : currentOrder + 1;
    if (targetOrder < 1 || targetOrder > waitingList.length) return;
    const target = waitingList.find(w => w.waiting_order === targetOrder);
    if (!target) return;
    await supabase.from('enrollments').update({ waiting_order: targetOrder }).eq('id', e.id);
    await supabase.from('enrollments').update({ waiting_order: currentOrder }).eq('id', target.id);
    reloadEnrollments();
  }

  async function handleDeleteEnrollment(e: Enrollment) {
    const memberName = e.members?.name || '회원';
    if (!confirm(`${memberName}님의 수강 정보를 완전히 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from('enrollments').delete().eq('id', e.id);
    if (error) alert('삭제 실패: ' + error.message);
    else reloadEnrollments();
  }

  async function handleToggleActive() {
    const action = course.is_active ? '종료' : '운영중';
    if (!confirm(`${course.name} 강좌를 "${action}" 상태로 변경하시겠습니까?`)) return;
    const { error } = await supabase.from('courses').update({ is_active: !course.is_active }).eq('id', course.id);
    if (error) alert('변경 실패: ' + error.message);
    else setCourse({ ...course, is_active: !course.is_active });
  }

  async function handleDeleteCourse() {
    if (!confirm(`정말 "${course.name}" 강좌를 완전히 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from('courses').delete().eq('id', course.id);
    if (error) alert('삭제 실패: ' + error.message);
    else { alert('강좌가 삭제되었습니다'); router.push('/courses'); }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', padding: 20 }}>
      <Link href="/courses" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 강좌 목록으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {course.name}
        <span style={{ ...badgeStyle(CATEGORY_COLORS[course.category] || '#666'), fontSize: 12 }}>{course.category}</span>
        {course.is_lesson && (
          <span style={{ fontSize: 11, padding: '3px 10px', background: '#7B3FBF', color: 'white', borderRadius: 4, fontWeight: 'normal' }}>📅 레슨</span>
        )}
        {!course.is_active && (
          <span style={{ fontSize: 11, padding: '3px 10px', background: '#eee', color: '#888', borderRadius: 4, fontWeight: 'normal' }}>종료</span>
        )}
      </h1>

      {/* 강좌 정보 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>강좌 정보</h2>
          {!basicEditing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setBasicEditing(true)} style={primaryBtnStyle}>수정</button>
              <button onClick={handleToggleActive} style={secondaryBtnStyle}>{course.is_active ? '종료 처리' : '재개'}</button>
              <button onClick={handleDeleteCourse} style={dangerBtnStyle}>강좌 삭제</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSaveBasic} style={primaryBtnStyle}>저장</button>
              <button onClick={handleCancelBasic} style={secondaryBtnStyle}>취소</button>
            </div>
          )}
        </div>

        {!basicEditing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: 14 }}>
            <InfoRow label="강좌구분" value={course.category} />
            <InfoRow label="주강사" value={course.instructor_id ? instructorMap.get(course.instructor_id) || '-' : '미정'} />
            <InfoRow label="보조강사" value={course.sub_instructor_id ? instructorMap.get(course.sub_instructor_id) || '-' : '없음'} />
            <InfoRow label="강의실" value={course.classroom} />
            <InfoRow label="정원" value={`${course.capacity}명 (현재 ${activeCount}명)`} />
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>수강료</label>
              <div style={{ fontSize: 14, marginTop: 2 }}>
                {course.is_free ? (
                  <span style={badgeStyle('#1D9E75')}>무료</span>
                ) : course.use_levels ? (
                  levels.length > 0 ? (
                    <table style={{ borderCollapse: 'collapse', fontSize: 13, marginTop: 4 }}>
                      <thead>
                        <tr style={{ background: '#F8F4FF' }}>
                          <th style={{ padding: '4px 12px', textAlign: 'left', border: '1px solid #E0D0F5' }}>등급</th>
                          <th style={{ padding: '4px 12px', textAlign: 'right', border: '1px solid #E0D0F5' }}>중구민</th>
                          <th style={{ padding: '4px 12px', textAlign: 'right', border: '1px solid #E0D0F5' }}>타구민</th>
                        </tr>
                      </thead>
                      <tbody>
                        {levels.map(lv => (
                          <tr key={lv.id}>
                            <td style={{ padding: '4px 12px', border: '1px solid #eee', fontWeight: 500 }}>{lv.level_name}</td>
                            <td style={{ padding: '4px 12px', border: '1px solid #eee', textAlign: 'right' }}>{lv.fee_jung_gu.toLocaleString()}원</td>
                            <td style={{ padding: '4px 12px', border: '1px solid #eee', textAlign: 'right' }}>{lv.fee_other.toLocaleString()}원</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <span style={{ color: '#A32D2D', fontSize: 13 }}>📊 등급별 강좌이나 등급이 등록되지 않았습니다. 수정에서 등급을 추가하세요.</span>
                  )
                ) : (
                  <span>중구민 <strong>{course.fee_jung_gu.toLocaleString()}원</strong> / 타구민 <strong>{course.fee_other.toLocaleString()}원</strong></span>
                )}
              </div>
            </div>
            {course.memo && <div style={{ gridColumn: '1 / -1' }}><InfoRow label="메모" value={course.memo} /></div>}
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>강좌구분 *</label>
                <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>강좌명 *</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={editIsLesson} onChange={(e) => setEditIsLesson(e.target.checked)} />
                <span>📅 <strong>레슨 강좌</strong> (개인별 스케줄 관리 - 피아노교실 등)</span>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>주강사</label>
                <select value={editInstructorId} onChange={(e) => setEditInstructorId(e.target.value)} style={inputStyle} aria-label="주강사">
                  <option value="">(미정)</option>
                  {activeInstructors.map(i => (
                    <option key={i.id} value={i.id}>{i.name}{!i.is_active && ' (비활동)'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>보조강사 (선택)</label>
                <select value={editSubInstructorId} onChange={(e) => setEditSubInstructorId(e.target.value)} style={inputStyle} aria-label="보조강사">
                  <option value="">(없음)</option>
                  {activeInstructors.filter(i => String(i.id) !== editInstructorId).map(i => (
                    <option key={i.id} value={i.id}>{i.name}{!i.is_active && ' (비활동)'}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>강의실</label>
                <input value={editClassroom} onChange={(e) => setEditClassroom(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>정원</label>
                <input value={editCapacity} onChange={(e) => setEditCapacity(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" checked={editIsFree} onChange={(e) => setEditIsFree(e.target.checked)} />
                <strong>무료 강좌</strong>
              </label>
              {!editIsFree && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 12 }}>
                    <input type="checkbox" checked={editUseLevels} onChange={(e) => setEditUseLevels(e.target.checked)} />
                    <span>📊 <strong>등급별 수강료 사용</strong> (초급/중급/고급 등 등급마다 수강료가 다른 경우)</span>
                  </label>

                  {!editUseLevels ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={labelStyle}>중구민 수강료</label>
                        <input value={editFeeJungGu} onChange={(e) => setEditFeeJungGu(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>타구민 수강료</label>
                        <input value={editFeeOther} onChange={(e) => setEditFeeOther(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#F8F4FF', borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 36px', gap: 8, marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#555' }}>
                        <span>등급명</span>
                        <span>중구민 (원)</span>
                        <span>타구민 (원)</span>
                        <span></span>
                      </div>
                      {editLevels.map((lv, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 36px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                          <input
                            value={lv.level_name}
                            onChange={(e) => updateEditLevel(idx, 'level_name', e.target.value)}
                            style={inputStyle}
                            placeholder="초급"
                          />
                          <input
                            value={lv.fee_jung_gu}
                            onChange={(e) => updateEditLevel(idx, 'fee_jung_gu', e.target.value)}
                            style={inputStyle}
                            placeholder="30000"
                          />
                          <input
                            value={lv.fee_other}
                            onChange={(e) => updateEditLevel(idx, 'fee_other', e.target.value)}
                            style={inputStyle}
                            placeholder="40000"
                          />
                          <button
                            type="button"
                            onClick={() => removeEditLevel(idx)}
                            style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', color: '#A32D2D' }}
                            title="등급 삭제"
                          >×</button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addEditLevel}
                        style={{ marginTop: 4, padding: '6px 12px', background: 'white', border: '1px dashed #7B3FBF', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#7B3FBF' }}
                      >
                        + 등급 추가
                      </button>
                      <p style={{ fontSize: 11, color: '#7B3FBF', margin: '8px 0 0' }}>
                        ⚠ 이미 수강신청에 사용된 등급은 삭제하면 오류가 날 수 있습니다.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label style={labelStyle}>메모</label>
              <textarea value={editMemo} onChange={(e) => setEditMemo(e.target.value)} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
            </div>
          </div>
        )}
      </div>

      {/* 수업 일정 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>
            {course.operation_type === 'regular' ? '수업 일정 (정기)' : '수업 날짜 (비정기)'}
          </h2>
          {!scheduleEditing ? (
            <button onClick={() => setScheduleEditing(true)} style={primaryBtnStyle}>일정 수정</button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSaveSchedule} style={primaryBtnStyle}>저장</button>
              <button onClick={handleCancelSchedule} style={secondaryBtnStyle}>취소</button>
            </div>
          )}
        </div>

        {!scheduleEditing ? (
          <>
            {course.operation_type === 'regular' && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>운영월</label>
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  {ALL_MONTHS.map((m) => (
                    <span key={m} style={{
                      padding: '4px 10px',
                      background: operationMonthsArr.includes(m) ? '#1D9E75' : '#eee',
                      color: operationMonthsArr.includes(m) ? 'white' : '#aaa',
                      borderRadius: 4, fontSize: 12,
                    }}>{m}월</span>
                  ))}
                </div>
              </div>
            )}

            <label style={labelStyle}>{course.operation_type === 'regular' ? '세션' : '날짜'} ({sessions.length}개)</label>
            {sessions.length === 0 ? (
              <p style={{ color: '#888', fontSize: 13 }}>등록된 세션이 없습니다.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {sessions.map((s, idx) => (
                  <div key={s.id} style={{
                    padding: 10, background: '#fafafa', borderRadius: 6,
                    fontSize: 13, display: 'flex', alignItems: 'center', gap: 12,
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
          </>
        ) : (
          <div>
            <div style={{ padding: 12, background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6, marginBottom: 16, fontSize: 12, color: '#5D4037' }}>
              ⚠️ 일정 변경 시 저장할 때 출석부 재생성 여부를 물어봅니다.
            </div>
            <label style={labelStyle}>운영구분 *</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button type="button" onClick={() => setEditOperationType('regular')} style={{
                flex: 1, padding: 12,
                background: editOperationType === 'regular' ? '#185FA5' : 'white',
                color: editOperationType === 'regular' ? 'white' : '#666',
                border: '1px solid ' + (editOperationType === 'regular' ? '#185FA5' : '#ddd'),
                borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500,
              }}>📅 정기</button>
              <button type="button" onClick={() => setEditOperationType('irregular')} style={{
                flex: 1, padding: 12,
                background: editOperationType === 'irregular' ? '#185FA5' : 'white',
                color: editOperationType === 'irregular' ? 'white' : '#666',
                border: '1px solid ' + (editOperationType === 'irregular' ? '#185FA5' : '#ddd'),
                borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500,
              }}>🎯 비정기</button>
            </div>

            {editOperationType === 'regular' && (
              <div>
                <label style={labelStyle}>운영월</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
                  {ALL_MONTHS.map((m) => (
                    <button key={m} type="button" onClick={() => toggleEditMonth(m)} style={{
                      width: 48, padding: 8,
                      background: editOperationMonths.includes(m) ? '#1D9E75' : 'white',
                      color: editOperationMonths.includes(m) ? 'white' : '#888',
                      border: '1px solid #ddd', borderRadius: 6,
                      cursor: 'pointer', fontSize: 12,
                    }}>{m}월</button>
                  ))}
                </div>

                <label style={labelStyle}>수업 세션</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {editRegularSessions.map((session, idx) => (
                    <div key={idx} style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                      padding: 10, background: 'white', borderRadius: 6, border: '1px solid #eee', flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 12, color: '#888', width: 30 }}>#{idx + 1}</span>
                      <select value={session.frequency} onChange={(e) => updateRegularSession(idx, 'frequency', e.target.value)} style={{ ...inputStyle, width: 100 }}>
                        {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <select value={session.day_of_week} onChange={(e) => updateRegularSession(idx, 'day_of_week', parseInt(e.target.value))} style={{ ...inputStyle, width: 90 }}>
                        {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}요일</option>)}
                      </select>
                      <input type="time" value={session.start_time} onChange={(e) => updateRegularSession(idx, 'start_time', e.target.value)} style={{ ...inputStyle, width: 110 }} />
                      <span style={{ fontSize: 12, color: '#888' }}>~</span>
                      <input type="time" value={session.end_time} onChange={(e) => updateRegularSession(idx, 'end_time', e.target.value)} style={{ ...inputStyle, width: 110 }} />
                      <button type="button" onClick={() => removeRegularSession(idx)} style={{
                        padding: '6px 10px', background: 'white', border: '1px solid #ddd',
                        borderRadius: 4, color: '#A32D2D', cursor: 'pointer', fontSize: 12,
                      }}>✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addRegularSession} style={{
                  padding: '8px 14px', background: 'white',
                  border: '1px dashed #185FA5', color: '#185FA5',
                  borderRadius: 6, cursor: 'pointer', fontSize: 13,
                }}>+ 세션 추가</button>
              </div>
            )}

            {editOperationType === 'irregular' && (
              <div>
                <label style={labelStyle}>수업 날짜</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {editIrregularSessions.map((session, idx) => (
                    <div key={idx} style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                      padding: 10, background: 'white', borderRadius: 6, border: '1px solid #eee',
                    }}>
                      <span style={{ fontSize: 12, color: '#888', width: 30 }}>#{idx + 1}</span>
                      <input type="date" value={session.specific_date || ''} onChange={(e) => updateIrregularSession(idx, 'specific_date', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      <input type="time" value={session.start_time} onChange={(e) => updateIrregularSession(idx, 'start_time', e.target.value)} style={{ ...inputStyle, width: 110 }} />
                      <span style={{ fontSize: 12, color: '#888' }}>~</span>
                      <input type="time" value={session.end_time} onChange={(e) => updateIrregularSession(idx, 'end_time', e.target.value)} style={{ ...inputStyle, width: 110 }} />
                      <button type="button" onClick={() => removeIrregularSession(idx)} style={{
                        padding: '6px 10px', background: 'white', border: '1px solid #ddd',
                        borderRadius: 4, color: '#A32D2D', cursor: 'pointer', fontSize: 12,
                      }}>✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addIrregularSession} style={{
                  padding: '8px 14px', background: 'white',
                  border: '1px dashed #185FA5', color: '#185FA5',
                  borderRadius: 6, cursor: 'pointer', fontSize: 13,
                }}>+ 날짜 추가</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 수강생 명단 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>
            수강생 명단 (수강중 {activeList.length}명 / 대기 {waitingList.length}명)
            {isFull && <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: '#A32D2D', color: 'white', borderRadius: 4 }}>정원 마감</span>}
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href={`/courses/${course.id}/enroll-upload`} style={{
              padding: '8px 14px', fontSize: 13, borderRadius: 6,
              background: '#1D9E75', color: 'white',
              border: 'none', textDecoration: 'none', fontWeight: 500,
            }}>
              📤 엑셀 일괄 업로드
            </Link>
            <button onClick={() => setShowEnrollForm(!showEnrollForm)} style={primaryBtnStyle}>
              {showEnrollForm ? '닫기' : '+ 수강신청 받기'}
            </button>
          </div>
        </div>

        {showEnrollForm && (
          <div style={{ background: '#f9f9f9', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #eee' }}>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>회원을 검색해서 수강신청을 추가하세요</p>

            {course.use_levels && (
              <div style={{
                marginBottom: 12, padding: 12,
                background: levels.length === 0 ? '#FFF5F5' : '#F8F4FF',
                border: levels.length === 0 ? '1px solid #FECACA' : '1px solid #D6BFFF',
                borderRadius: 8,
              }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#7B3FBF' }}>
                  📊 등급 선택 (필수)
                </label>
                {levels.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#A32D2D', margin: 0 }}>
                    이 강좌의 등급이 등록되지 않았습니다. 위쪽 강좌 정보 수정에서 등급을 먼저 등록해주세요.
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {levels.map(lv => (
                      <label
                        key={lv.id}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                          background: selectedLevelId === String(lv.id) ? '#7B3FBF' : 'white',
                          color: selectedLevelId === String(lv.id) ? 'white' : '#333',
                          border: '1px solid ' + (selectedLevelId === String(lv.id) ? '#7B3FBF' : '#ddd'),
                          fontSize: 13,
                        }}
                      >
                        <input
                          type="radio"
                          name="levelSelect"
                          checked={selectedLevelId === String(lv.id)}
                          onChange={() => setSelectedLevelId(String(lv.id))}
                          style={{ display: 'none' }}
                        />
                        <strong>{lv.level_name}</strong>
                        <span style={{ fontSize: 11, opacity: 0.85 }}>
                          ({lv.fee_jung_gu.toLocaleString()}/{lv.fee_other.toLocaleString()}원)
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchMember()} placeholder="이름 또는 연락처로 검색" style={{ flex: 1, ...inputStyle }} />
              <button onClick={handleSearchMember} style={primaryBtnStyle}>검색</button>
            </div>
            {searching ? (<p style={{ fontSize: 13, color: '#888' }}>검색 중...</p>
            ) : searchResults.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {searchResults.map((m) => {
                  const alreadyEnrolled = enrolledMemberIds.has(m.id);
                  const existing = enrollments.find(e => e.member_id === m.id);
                  return (
                    <div key={m.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: 10, background: 'white', borderRadius: 6, border: '1px solid #eee',
                    }}>
                      <div>
                        <strong style={{ fontSize: 14 }}>{m.name}</strong>
                        <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>
                          {m.phone || '-'} · {m.region_type || '-'} · {m.birth_date || '-'}
                        </span>
                      </div>
                      {alreadyEnrolled && existing?.status !== 'ended' ? (
                        <span style={{ fontSize: 12, color: '#888' }}>이미 등록됨 ({STATUS_LABELS[existing!.status]})</span>
                      ) : (
                        <button onClick={() => handleEnroll(m.id, m.name)} style={{
                          padding: '6px 14px', background: isFull ? '#BA7517' : '#185FA5',
                          color: 'white', border: 'none', borderRadius: 4,
                          cursor: 'pointer', fontSize: 12,
                        }}>
                          {alreadyEnrolled ? '재신청' : (isFull ? '대기 등록' : '수강신청')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : searchQuery && !searching ? (
              <p style={{ fontSize: 13, color: '#888' }}>검색 결과가 없습니다.</p>
            ) : null}
          </div>
        )}

        {activeList.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>아직 수강생이 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>연락처</th>
                <th style={thStyle}>거주구분</th>
                {course.use_levels && <th style={thStyle}>등급</th>}
                <th style={thStyle}>상태</th>
                <th style={thStyle}>신청일</th>
                <th style={thStyle}>관리</th>
              </tr>
            </thead>
            <tbody>
              {activeList.map((e) => {
                const levelName = e.course_level_id ? (levels.find(lv => lv.id === e.course_level_id)?.level_name || '-') : '-';
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={tdStyle}>
                      <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                        <strong>{e.members?.name}</strong>
                      </Link>
                    </td>
                    <td style={tdStyle}>{e.members?.phone || '-'}</td>
                    <td style={tdStyle}>{e.members?.region_type || '-'}</td>
                    {course.use_levels && (
                      <td style={tdStyle}>
                        {e.course_level_id ? (
                          <span style={{ fontSize: 11, padding: '2px 8px', background: '#7B3FBF', color: 'white', borderRadius: 4 }}>
                            {levelName}
                          </span>
                        ) : (
                          <span style={{ color: '#A32D2D', fontSize: 11 }}>⚠ 미선택</span>
                        )}
                      </td>
                    )}
                    <td style={tdStyle}><span style={badgeStyle(STATUS_COLORS[e.status])}>{STATUS_LABELS[e.status]}</span></td>
                    <td style={tdStyle}>{e.enrolled_at?.substring(0, 10)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button onClick={() => handleDeleteEnrollment(e)} style={{ ...smallBtnStyle, color: '#A32D2D' }}>수강신청 취소</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {waitingList.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#BA7517' }}>⏳ 대기 명단 ({waitingList.length}명)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                  <th style={thStyle}>순번</th>
                  <th style={thStyle}>이름</th>
                  <th style={thStyle}>연락처</th>
                  <th style={thStyle}>신청일</th>
                  <th style={thStyle}>관리</th>
                </tr>
              </thead>
              <tbody>
                {waitingList.map((e, idx) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={tdStyle}><strong style={{ color: '#BA7517' }}>{e.waiting_order}</strong></td>
                    <td style={tdStyle}>
                      <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{e.members?.name}</Link>
                    </td>
                    <td style={tdStyle}>{e.members?.phone || '-'}</td>
                    <td style={tdStyle}>{e.enrolled_at?.substring(0, 10)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button onClick={() => handleMoveWaitingOrder(e, 'up')} disabled={idx === 0} style={{ ...smallBtnStyle, opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                      <button onClick={() => handleMoveWaitingOrder(e, 'down')} disabled={idx === waitingList.length - 1} style={{ ...smallBtnStyle, opacity: idx === waitingList.length - 1 ? 0.3 : 1 }}>▼</button>
                      <button onClick={() => handleChangeStatus(e, 'active')} style={smallBtnStyle}>수강전환</button>
                      <button onClick={() => handleDeleteEnrollment(e)} style={{ ...smallBtnStyle, color: '#A32D2D' }}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {endedList.length > 0 && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#888' }}>수강종료 명단 ({endedList.length}명) - 클릭해서 보기</summary>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                  <th style={thStyle}>이름</th>
                  <th style={thStyle}>종료 사유</th>
                  <th style={thStyle}>종료일</th>
                  <th style={thStyle}>환불 정보</th>
                  <th style={thStyle}>관리</th>
                </tr>
              </thead>
              <tbody>
                {endedList.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: 0.7 }}>
                    <td style={tdStyle}>
                      <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{e.members?.name}</Link>
                    </td>
                    <td style={tdStyle}>
                      {e.end_reason ? (
                        <span style={badgeStyle((END_REASON_COLORS as any)[e.end_reason] || '#888')}>
                          {(END_REASON_LABELS as any)[e.end_reason] || e.end_reason}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={tdStyle}>{e.ended_at?.substring(0, 10)}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>
                      {e.refund_date ? (
                        <span>
                          <strong>{e.refund_date}</strong>
                          {e.refund_memo && <span style={{ color: '#888', marginLeft: 4 }}>· {e.refund_memo}</span>}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button onClick={() => handleChangeStatus(e, 'active')} style={smallBtnStyle}>재신청</button>
                      <button onClick={() => handleDeleteEnrollment(e)} style={{ ...smallBtnStyle, color: '#A32D2D' }}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <Link href={`/courses/${course.id}/dates`} style={{
        display: 'block', padding: 20,
        background: '#E6F1FB', border: '1px solid #B5D4F4',
        borderRadius: 12, textDecoration: 'none', color: '#042C53',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>📅 수업 날짜 관리</h3>
            <p style={{ fontSize: 13, margin: 0, color: '#6E7E97' }}>수업 날짜 확인, 휴강·보강 처리</p>
          </div>
          <span style={{ fontSize: 18 }}>→</span>
        </div>
      </Link>

      {/* 수강 종료/재개는 수납관리 또는 회원 상세 페이지에서 처리합니다. */}
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

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box', width: '100%',
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', background: '#185FA5', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', background: 'white', color: '#666',
  border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const dangerBtnStyle: React.CSSProperties = {
  padding: '8px 16px', background: 'white', color: '#A32D2D',
  border: '1px solid #A32D2D', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: 'white', border: '1px solid #ddd',
  borderRadius: 4, cursor: 'pointer', fontSize: 11, marginRight: 4,
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
