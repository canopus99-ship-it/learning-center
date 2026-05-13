'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DAY_LABELS, FREQUENCY_LABELS } from '@/lib/courseDates';
import { STATUS_LABELS, STATUS_COLORS, type EnrollmentStatus } from '@/lib/enrollment';

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
  frequency: string | null;
  day_of_week: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
};

type Instructor = { id: number; name: string; is_active: boolean };

type MemberInEnrollment = {
  id: number;
  name: string;
  phone: string | null;
  birth_date: string | null;
  region_type: string | null;
};

type Enrollment = {
  id: number;
  member_id: number;
  course_id: number;
  status: EnrollmentStatus;
  waiting_order: number | null;
  enrolled_at: string;
  ended_at: string | null;
  memo: string | null;
  members: MemberInEnrollment | null;
};

type MemberSearchResult = {
  id: number;
  name: string;
  phone: string | null;
  birth_date: string | null;
  region_type: string | null;
};

const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5', '성숙한시민': '#7B3FBF', '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517', '기타': '#666',
};

export default function CourseDetailClient({
  course: initialCourse,
  sessions,
  instructors,
  initialEnrollments,
}: {
  course: Course;
  sessions: Session[];
  instructors: Instructor[];
  initialEnrollments: Enrollment[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [course, setCourse] = useState<Course>(initialCourse);
  const [enrollments, setEnrollments] = useState<Enrollment[]>(initialEnrollments);

  // 수강신청 추가 모달
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const instructorMap = new Map(instructors.map(i => [i.id, i.name]));
  const operationMonthsArr = course.operation_months ? course.operation_months.split(',').filter(Boolean).map(Number) : [];

  // 카운트 계산
  const activeCount = enrollments.filter(e => e.status === 'active' || e.status === 'paused').length;
  const waitingList = enrollments
    .filter(e => e.status === 'waiting')
    .sort((a, b) => (a.waiting_order || 0) - (b.waiting_order || 0));
  const activeList = enrollments
    .filter(e => e.status === 'active' || e.status === 'paused')
    .sort((a, b) => (a.members?.name || '').localeCompare(b.members?.name || ''));
  const endedList = enrollments
    .filter(e => e.status === 'ended')
    .sort((a, b) => (b.ended_at || '').localeCompare(a.ended_at || ''));

  const isFull = activeCount >= course.capacity;
  const enrolledMemberIds = new Set(enrollments.map(e => e.member_id));

  async function reloadEnrollments() {
    const { data } = await supabase
      .from('enrollments')
      .select('*, members(id, name, phone, birth_date, region_type)')
      .eq('course_id', course.id);
    setEnrollments((data as Enrollment[]) || []);
  }

  async function handleSearchMember() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const q = searchQuery.trim();
    const { data, error } = await supabase
      .from('members')
      .select('id, name, phone, birth_date, region_type')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20);

    if (error) {
      console.error('검색 실패:', error);
      setSearchResults([]);
    } else {
      setSearchResults(data || []);
    }
    setSearching(false);
  }

  async function handleEnroll(memberId: number, memberName: string) {
    // 이미 신청한 회원인지 확인
    if (enrolledMemberIds.has(memberId)) {
      const existing = enrollments.find(e => e.member_id === memberId);
      if (existing?.status === 'ended') {
        if (!confirm(`${memberName}님은 이전에 이 강좌를 수강하셨습니다 (수강종료). 다시 신청하시겠습니까?`)) return;
        // 종료된 거 재활성화
        const status = isFull ? 'waiting' : 'active';
        const waitingOrder = status === 'waiting' ? (waitingList.length + 1) : null;
        const { error } = await supabase
          .from('enrollments')
          .update({
            status,
            waiting_order: waitingOrder,
            enrolled_at: new Date().toISOString(),
            ended_at: null,
          })
          .eq('id', existing.id);
        if (error) {
          alert('처리 실패: ' + error.message);
          return;
        }
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

    const { error } = await supabase.from('enrollments').insert([{
      member_id: memberId,
      course_id: course.id,
      status,
      waiting_order: waitingOrder,
    }]);

    if (error) {
      alert('수강신청 실패: ' + error.message);
    } else {
      alert(`${memberName}님이 ${status === 'waiting' ? `대기 ${waitingOrder}순위에 추가` : '수강신청'}되었습니다!`);
      reloadEnrollments();
    }
  }

  async function handleChangeStatus(e: Enrollment, newStatus: EnrollmentStatus) {
    const memberName = e.members?.name || '회원';
    const statusLabel = STATUS_LABELS[newStatus];

    if (!confirm(`${memberName}님을 "${statusLabel}" 상태로 변경하시겠습니까?`)) return;

    const updates: any = { status: newStatus };

    if (newStatus === 'ended') {
      updates.ended_at = new Date().toISOString();
      updates.waiting_order = null;
    } else if (newStatus === 'paused') {
      updates.pause_start = new Date().toISOString();
      updates.waiting_order = null;
    } else if (newStatus === 'active') {
      updates.waiting_order = null;
      // 일시중지에서 재개라면 pause_end 기록
      if (e.status === 'paused') {
        updates.pause_end = new Date().toISOString();
      }
      // 종료에서 재활성화면 ended_at 초기화
      if (e.status === 'ended') {
        updates.ended_at = null;
        updates.enrolled_at = new Date().toISOString();
      }
    } else if (newStatus === 'waiting') {
      updates.waiting_order = waitingList.length + 1;
    }

    const { error } = await supabase.from('enrollments').update(updates).eq('id', e.id);

    if (error) {
      alert('변경 실패: ' + error.message);
    } else {
      reloadEnrollments();
    }
  }

  async function handleMoveWaitingOrder(e: Enrollment, direction: 'up' | 'down') {
    const currentOrder = e.waiting_order || 0;
    const targetOrder = direction === 'up' ? currentOrder - 1 : currentOrder + 1;

    if (targetOrder < 1 || targetOrder > waitingList.length) return;

    const target = waitingList.find(w => w.waiting_order === targetOrder);
    if (!target) return;

    // 순서 바꾸기
    await supabase.from('enrollments').update({ waiting_order: targetOrder }).eq('id', e.id);
    await supabase.from('enrollments').update({ waiting_order: currentOrder }).eq('id', target.id);

    reloadEnrollments();
  }

  async function handleDelete(e: Enrollment) {
    const memberName = e.members?.name || '회원';
    if (!confirm(`${memberName}님의 수강 정보를 완전히 삭제하시겠습니까?\n(취소가 아닌 완전 삭제입니다)`)) return;

    const { error } = await supabase.from('enrollments').delete().eq('id', e.id);

    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      reloadEnrollments();
    }
  }

  async function handleToggleActive() {
    const action = course.is_active ? '종료' : '운영중';
    if (!confirm(`${course.name} 강좌를 "${action}" 상태로 변경하시겠습니까?`)) return;

    const { error } = await supabase.from('courses').update({ is_active: !course.is_active }).eq('id', course.id);

    if (error) {
      alert('변경 실패: ' + error.message);
    } else {
      setCourse({ ...course, is_active: !course.is_active });
    }
  }

  async function handleDeleteCourse() {
    if (!confirm(`정말 "${course.name}" 강좌를 완전히 삭제하시겠습니까?\n\n관련된 모든 세션, 수업 날짜, 수강신청도 함께 삭제됩니다.`)) return;

    const { error } = await supabase.from('courses').delete().eq('id', course.id);

    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      alert('강좌가 삭제되었습니다');
      router.push('/courses');
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', padding: 20 }}>
      <Link href="/courses" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 강좌 목록으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {course.name}
        <span style={{ ...badgeStyle(CATEGORY_COLORS[course.category] || '#666'), fontSize: 12 }}>
          {course.category}
        </span>
        {!course.is_active && (
          <span style={{ fontSize: 11, padding: '3px 10px', background: '#eee', color: '#888', borderRadius: 4, fontWeight: 'normal' }}>종료</span>
        )}
      </h1>

      {/* 강좌 정보 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>강좌 정보</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleToggleActive} style={secondaryBtnStyle}>
              {course.is_active ? '종료 처리' : '재개'}
            </button>
            <button onClick={handleDeleteCourse} style={dangerBtnStyle}>강좌 삭제</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: 14 }}>
          <InfoRow label="강사" value={course.instructor_id ? instructorMap.get(course.instructor_id) || '-' : '미정'} />
          <InfoRow label="강의실" value={course.classroom} />
          <InfoRow label="정원" value={`${course.capacity}명 (현재 ${activeCount}명)`} />
        </div>

        {course.operation_type === 'regular' && (
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>운영월</label>
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
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

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>
            {course.operation_type === 'regular' ? '수업 세션' : '수업 날짜'} ({sessions.length}개)
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {sessions.map((s, idx) => (
              <span key={s.id} style={{
                padding: '4px 10px', background: '#fafafa',
                border: '1px solid #eee', borderRadius: 4, fontSize: 12,
              }}>
                {course.operation_type === 'regular' ? (
                  <>{s.frequency ? FREQUENCY_LABELS[s.frequency] : ''} {s.day_of_week ? DAY_LABELS[s.day_of_week] : ''} {s.start_time}~{s.end_time}</>
                ) : (
                  <>{s.specific_date} {s.start_time}~{s.end_time}</>
                )}
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>수강료</label>
          <div style={{ fontSize: 14, marginTop: 2 }}>
            {course.is_free ? (
              <span style={badgeStyle('#1D9E75')}>무료</span>
            ) : (
              <span>중구민 <strong>{course.fee_jung_gu.toLocaleString()}원</strong> / 타구민 <strong>{course.fee_other.toLocaleString()}원</strong></span>
            )}
          </div>
        </div>
      </div>

      {/* 수강생 명단 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>
            수강생 명단 (수강중 {activeList.length}명 / 대기 {waitingList.length}명)
            {isFull && <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: '#A32D2D', color: 'white', borderRadius: 4 }}>정원 마감</span>}
          </h2>
          <button onClick={() => setShowEnrollForm(!showEnrollForm)} style={primaryBtnStyle}>
            {showEnrollForm ? '닫기' : '+ 수강신청 받기'}
          </button>
        </div>

        {showEnrollForm && (
          <div style={{
            background: '#f9f9f9', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #eee',
          }}>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>회원을 검색해서 수강신청을 추가하세요</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchMember()}
                placeholder="이름 또는 연락처로 검색"
                style={{ flex: 1, ...inputStyle }}
              />
              <button onClick={handleSearchMember} style={primaryBtnStyle}>검색</button>
            </div>

            {searching ? (
              <p style={{ fontSize: 13, color: '#888' }}>검색 중...</p>
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
                        <span style={{ fontSize: 12, color: '#888' }}>
                          이미 등록됨 ({STATUS_LABELS[existing!.status]})
                        </span>
                      ) : (
                        <button
                          onClick={() => handleEnroll(m.id, m.name)}
                          style={{
                            padding: '6px 14px',
                            background: isFull ? '#BA7517' : '#185FA5',
                            color: 'white', border: 'none', borderRadius: 4,
                            cursor: 'pointer', fontSize: 12,
                          }}
                        >
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

        {/* 수강중/일시중지 명단 */}
        {activeList.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>아직 수강생이 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>연락처</th>
                <th style={thStyle}>거주구분</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>신청일</th>
                <th style={thStyle}>관리</th>
              </tr>
            </thead>
            <tbody>
              {activeList.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={tdStyle}>
                    <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                      <strong>{e.members?.name}</strong>
                    </Link>
                  </td>
                  <td style={tdStyle}>{e.members?.phone || '-'}</td>
                  <td style={tdStyle}>{e.members?.region_type || '-'}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(STATUS_COLORS[e.status])}>{STATUS_LABELS[e.status]}</span>
                  </td>
                  <td style={tdStyle}>{e.enrolled_at?.substring(0, 10)}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {e.status === 'active' && (
                      <>
                        <button onClick={() => handleChangeStatus(e, 'paused')} style={smallBtnStyle}>일시중지</button>
                        <button onClick={() => handleChangeStatus(e, 'ended')} style={smallBtnStyle}>수강종료</button>
                      </>
                    )}
                    {e.status === 'paused' && (
                      <button onClick={() => handleChangeStatus(e, 'active')} style={smallBtnStyle}>재개</button>
                    )}
                    <button onClick={() => handleDelete(e)} style={{ ...smallBtnStyle, color: '#A32D2D' }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 대기 명단 */}
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
                    <td style={tdStyle}>
                      <strong style={{ color: '#BA7517' }}>{e.waiting_order}</strong>
                    </td>
                    <td style={tdStyle}>
                      <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                        {e.members?.name}
                      </Link>
                    </td>
                    <td style={tdStyle}>{e.members?.phone || '-'}</td>
                    <td style={tdStyle}>{e.enrolled_at?.substring(0, 10)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => handleMoveWaitingOrder(e, 'up')}
                        disabled={idx === 0}
                        style={{ ...smallBtnStyle, opacity: idx === 0 ? 0.3 : 1 }}
                      >▲</button>
                      <button
                        onClick={() => handleMoveWaitingOrder(e, 'down')}
                        disabled={idx === waitingList.length - 1}
                        style={{ ...smallBtnStyle, opacity: idx === waitingList.length - 1 ? 0.3 : 1 }}
                      >▼</button>
                      <button onClick={() => handleChangeStatus(e, 'active')} style={smallBtnStyle}>
                        수강전환
                      </button>
                      <button onClick={() => handleDelete(e)} style={{ ...smallBtnStyle, color: '#A32D2D' }}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 수강종료 명단 (접혀있음) */}
        {endedList.length > 0 && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#888' }}>
              수강종료 명단 ({endedList.length}명) - 클릭해서 보기
            </summary>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                  <th style={thStyle}>이름</th>
                  <th style={thStyle}>연락처</th>
                  <th style={thStyle}>종료일</th>
                  <th style={thStyle}>관리</th>
                </tr>
              </thead>
              <tbody>
                {endedList.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: 0.7 }}>
                    <td style={tdStyle}>
                      <Link href={`/members/${e.member_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                        {e.members?.name}
                      </Link>
                    </td>
                    <td style={tdStyle}>{e.members?.phone || '-'}</td>
                    <td style={tdStyle}>{e.ended_at?.substring(0, 10)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button onClick={() => handleChangeStatus(e, 'active')} style={smallBtnStyle}>재신청</button>
                      <button onClick={() => handleDelete(e)} style={{ ...smallBtnStyle, color: '#A32D2D' }}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      {/* 출석부 보기 */}
      <Link href={`/courses/${course.id}/dates`} style={{
        display: 'block', padding: 20,
        background: '#E6F1FB', border: '1px solid #B5D4F4',
        borderRadius: 12, textDecoration: 'none', color: '#042C53',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>📅 수업 날짜 / 출석부 관리</h3>
            <p style={{ fontSize: 13, margin: 0, color: '#6E7E97' }}>
              수업 날짜 확인, 휴강·보강 처리
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

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box',
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
