'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { STATUS_LABELS, STATUS_COLORS, type EnrollmentStatus } from '@/lib/enrollment';

type Member = {
  id: number;
  name: string;
  phone: string;
  rrn_front: string;
  birth_date: string | null;
  gender: string;
  address: string;
  region_type: string;
  is_jung_gu: boolean;
  is_discount_50: boolean;
  is_discount_100: boolean;
  received_date: string | null;
  memo: string;
  created_at: string;
};

type Memo = {
  id: number;
  member_id: number;
  category: string;
  content: string;
  created_by: string | null;
  created_at: string;
};

type CourseInEnrollment = {
  id: number;
  name: string;
  category: string;
  is_free: boolean;
  fee_jung_gu: number;
  fee_other: number;
  classroom: string | null;
  capacity: number;
  is_active: boolean;
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
  courses: CourseInEnrollment | null;
};

type CourseSearchResult = {
  id: number;
  name: string;
  category: string;
  classroom: string | null;
  capacity: number;
  is_active: boolean;
};

const CATEGORIES = [
  { value: '상담', color: '#185FA5' },
  { value: '환불요청', color: '#A32D2D' },
  { value: '대기순서확인', color: '#BA7517' },
  { value: '기타', color: '#666666' },
];

const COURSE_CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5', '성숙한시민': '#7B3FBF', '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517', '기타': '#666',
};

export default function MemberDetailClient({
  member: initialMember,
  staffName,
  initialEnrollments,
}: {
  member: Member;
  staffName: string;
  staffEmail: string;
  initialEnrollments: Enrollment[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [member, setMember] = useState<Member>(initialMember);
  const [editing, setEditing] = useState(false);
  const [enrollments, setEnrollments] = useState<Enrollment[]>(initialEnrollments);

  // 수정용 폼 상태
  const [name, setName] = useState(member.name || '');
  const [phone, setPhone] = useState(member.phone || '');
  const [rrnFront, setRrnFront] = useState(member.rrn_front || '');
  const [address, setAddress] = useState(member.address || '');
  const [isJungGu, setIsJungGu] = useState(member.is_jung_gu);
  const [isDiscount50, setIsDiscount50] = useState(member.is_discount_50);
  const [isDiscount100, setIsDiscount100] = useState(member.is_discount_100);
  const [memo, setMemo] = useState(member.memo || '');
  const [birthDate, setBirthDate] = useState(member.birth_date || '');
  const [gender, setGender] = useState(member.gender || '');
  const [regionType, setRegionType] = useState(member.region_type || '');

  // 메모 히스토리
  const [memos, setMemos] = useState<Memo[]>([]);
  const [memosLoading, setMemosLoading] = useState(true);
  const [newCategory, setNewCategory] = useState('상담');
  const [newContent, setNewContent] = useState('');

  // 강좌 추가 모달
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [courseSearchResults, setCourseSearchResults] = useState<CourseSearchResult[]>([]);
  const [courseSearching, setCourseSearching] = useState(false);

  useEffect(() => {
    loadMemos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMemos() {
    setMemosLoading(true);
    const { data } = await supabase
      .from('member_memos')
      .select('*')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false });
    setMemos(data || []);
    setMemosLoading(false);
  }

  async function reloadEnrollments() {
    const { data } = await supabase
      .from('enrollments')
      .select('*, courses(id, name, category, is_free, fee_jung_gu, fee_other, classroom, capacity, is_active)')
      .eq('member_id', member.id);
    setEnrollments((data as Enrollment[]) || []);
  }

  function handlePhoneChange(value: string) {
    const numbers = value.replace(/[^0-9]/g, '');
    let formatted = numbers;
    if (numbers.length > 3 && numbers.length <= 7) {
      formatted = numbers.slice(0, 3) + '-' + numbers.slice(3);
    } else if (numbers.length > 7) {
      formatted = numbers.slice(0, 3) + '-' + numbers.slice(3, 7) + '-' + numbers.slice(7, 11);
    }
    setPhone(formatted);
  }

  function handleRrnChange(value: string) {
    const numbers = value.replace(/[^0-9]/g, '');
    let formatted = numbers;
    if (numbers.length > 6) {
      formatted = numbers.slice(0, 6) + '-' + numbers.slice(6, 7);
    }
    setRrnFront(formatted);

    if (numbers.length === 7) {
      const yy = numbers.substring(0, 2);
      const mm = numbers.substring(2, 4);
      const dd = numbers.substring(4, 6);
      const g = numbers.substring(6, 7);
      const century = (g === '1' || g === '2') ? '19' : '20';
      setBirthDate(`${century}${yy}-${mm}-${dd}`);
      setGender((g === '1' || g === '3') ? '남' : '여');
    }
  }

  function handleAddressChange(value: string) {
    setAddress(value);
    if (value.includes('중구')) setRegionType('중구민');
    else if (value.length > 0) setRegionType('타구민');
    else setRegionType('');
  }

  async function handleSaveEdit() {
    if (!name.trim()) { alert('이름을 입력하세요'); return; }

    const updated = {
      name, phone, rrn_front: rrnFront,
      birth_date: birthDate || null,
      gender, address, region_type: regionType,
      is_jung_gu: isJungGu, is_discount_50: isDiscount50, is_discount_100: isDiscount100,
      memo,
    };

    const { error } = await supabase.from('members').update(updated).eq('id', member.id);

    if (error) {
      alert('수정 실패: ' + error.message);
    } else {
      alert('회원 정보가 수정되었습니다!');
      setMember({ ...member, ...updated });
      setEditing(false);
    }
  }

  function handleCancelEdit() {
    setName(member.name || ''); setPhone(member.phone || ''); setRrnFront(member.rrn_front || '');
    setAddress(member.address || ''); setIsJungGu(member.is_jung_gu);
    setIsDiscount50(member.is_discount_50); setIsDiscount100(member.is_discount_100);
    setMemo(member.memo || ''); setBirthDate(member.birth_date || '');
    setGender(member.gender || ''); setRegionType(member.region_type || '');
    setEditing(false);
  }

  async function handleDelete() {
    const confirmText = `정말 "${member.name}" 회원을 삭제하시겠습니까?\n\n이 회원의 모든 정보, 메모, 수강신청이 함께 삭제되며,\n되돌릴 수 없습니다.`;
    if (!confirm(confirmText)) return;

    const { error } = await supabase.from('members').delete().eq('id', member.id);

    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      alert('회원이 삭제되었습니다');
      router.push('/members');
    }
  }

  async function handleAddMemo() {
    if (!newContent.trim()) { alert('메모 내용을 입력하세요'); return; }

    const { error } = await supabase.from('member_memos').insert([{
      member_id: member.id,
      category: newCategory,
      content: newContent.trim(),
      created_by: staffName,
    }]);

    if (error) {
      alert('메모 추가 실패: ' + error.message);
    } else {
      setNewContent('');
      setNewCategory('상담');
      loadMemos();
    }
  }

  async function handleDeleteMemo(memoId: number) {
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('member_memos').delete().eq('id', memoId);
    if (error) alert('삭제 실패: ' + error.message);
    else loadMemos();
  }

  const getCategoryColor = (cat: string) => CATEGORIES.find((c) => c.value === cat)?.color || '#666';

  // 강좌 검색
  async function handleSearchCourse() {
    if (!courseSearchQuery.trim()) { setCourseSearchResults([]); return; }
    setCourseSearching(true);

    const { data, error } = await supabase
      .from('courses')
      .select('id, name, category, classroom, capacity, is_active')
      .ilike('name', `%${courseSearchQuery.trim()}%`)
      .eq('is_active', true)
      .limit(20);

    if (error) {
      console.error('강좌 검색 실패:', error);
      setCourseSearchResults([]);
    } else {
      setCourseSearchResults(data || []);
    }
    setCourseSearching(false);
  }

  async function handleEnrollCourse(courseId: number, courseName: string) {
    // 이미 등록된 강좌인지 확인
    const existing = enrollments.find(e => e.course_id === courseId);
    if (existing && existing.status !== 'ended') {
      alert(`이미 이 강좌에 등록되어 있습니다 (${STATUS_LABELS[existing.status]})`);
      return;
    }

    // 현재 정원 확인
    const { data: courseEnrollments } = await supabase
      .from('enrollments')
      .select('id, status')
      .eq('course_id', courseId);

    const activeCount = (courseEnrollments || []).filter(e => e.status === 'active' || e.status === 'paused').length;
    const waitingCount = (courseEnrollments || []).filter(e => e.status === 'waiting').length;

    const { data: courseData } = await supabase.from('courses').select('capacity').eq('id', courseId).single();
    const capacity = courseData?.capacity || 20;
    const isFull = activeCount >= capacity;

    if (existing && existing.status === 'ended') {
      // 재신청
      if (!confirm(`${courseName}은 이전에 수강하셨습니다 (수강종료). 다시 신청하시겠습니까?`)) return;

      const status = isFull ? 'waiting' : 'active';
      const waitingOrder = status === 'waiting' ? (waitingCount + 1) : null;

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
      } else {
        alert(`${courseName}에 ${status === 'waiting' ? `대기 ${waitingOrder}순위로 등록` : '수강신청'}되었습니다!`);
        reloadEnrollments();
      }
      return;
    }

    const status = isFull ? 'waiting' : 'active';
    const waitingOrder = status === 'waiting' ? (waitingCount + 1) : null;

    const { error } = await supabase.from('enrollments').insert([{
      member_id: member.id,
      course_id: courseId,
      status,
      waiting_order: waitingOrder,
    }]);

    if (error) {
      alert('수강신청 실패: ' + error.message);
    } else {
      alert(`${courseName}에 ${status === 'waiting' ? `대기 ${waitingOrder}순위로 등록` : '수강신청'}되었습니다!`);
      reloadEnrollments();
    }
  }

  async function handleChangeEnrollmentStatus(e: Enrollment, newStatus: EnrollmentStatus) {
    const statusLabel = STATUS_LABELS[newStatus];
    if (!confirm(`"${e.courses?.name}"의 상태를 "${statusLabel}"로 변경하시겠습니까?`)) return;

    const updates: any = { status: newStatus };

    if (newStatus === 'ended') {
      updates.ended_at = new Date().toISOString();
      updates.waiting_order = null;
    } else if (newStatus === 'paused') {
      updates.pause_start = new Date().toISOString();
      updates.waiting_order = null;
    } else if (newStatus === 'active') {
      updates.waiting_order = null;
      if (e.status === 'paused') updates.pause_end = new Date().toISOString();
      if (e.status === 'ended') {
        updates.ended_at = null;
        updates.enrolled_at = new Date().toISOString();
      }
    }

    const { error } = await supabase.from('enrollments').update(updates).eq('id', e.id);
    if (error) alert('변경 실패: ' + error.message);
    else reloadEnrollments();
  }

  async function handleDeleteEnrollment(e: Enrollment) {
    if (!confirm(`${e.courses?.name} 수강 정보를 완전히 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from('enrollments').delete().eq('id', e.id);
    if (error) alert('삭제 실패: ' + error.message);
    else reloadEnrollments();
  }

  // 상태별 정렬
  const activeEnrollments = enrollments.filter(e => e.status === 'active' || e.status === 'paused' || e.status === 'waiting');
  const endedEnrollments = enrollments.filter(e => e.status === 'ended');

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
      <Link href="/members" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 회원 목록으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20 }}>
        {member.name} 회원 상세
      </h1>

      {/* 기본 정보 카드 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>기본 정보</h2>
          {!editing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditing(true)} style={primaryBtnStyle}>수정</button>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14 }}>
            <InfoRow label="이름" value={member.name} />
            <InfoRow label="연락처" value={member.phone} />
            <InfoRow label="주민번호 앞자리" value={member.rrn_front} />
            <InfoRow label="생년월일" value={member.birth_date} />
            <InfoRow label="성별" value={member.gender} />
            <InfoRow label="거주구분" value={member.region_type} />
            <div style={{ gridColumn: '1 / -1' }}><InfoRow label="거주지" value={member.address} /></div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>서류확인</label>
              <div style={{ marginTop: 4 }}>
                {member.is_jung_gu && <span style={badgeStyle('#185FA5')}>중구민</span>}
                {member.is_discount_50 && <span style={badgeStyle('#BA7517')}>감면50%</span>}
                {member.is_discount_100 && <span style={badgeStyle('#A32D2D')}>감면100%</span>}
                {!member.is_jung_gu && !member.is_discount_50 && !member.is_discount_100 && (
                  <span style={{ color: '#888', fontSize: 13 }}>-</span>
                )}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}><InfoRow label="접수일" value={member.received_date} /></div>
            <div style={{ gridColumn: '1 / -1' }}><InfoRow label="메모" value={member.memo} /></div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>이름 *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>연락처</label>
                <input value={phone} onChange={(e) => handlePhoneChange(e.target.value)} style={inputStyle} maxLength={13} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>주민번호 앞자리</label>
                <input value={rrnFront} onChange={(e) => handleRrnChange(e.target.value)} style={inputStyle} maxLength={8} />
              </div>
              <div>
                <label style={labelStyle}>생년월일</label>
                <input value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={inputStyle} placeholder="YYYY-MM-DD" />
              </div>
              <div>
                <label style={labelStyle}>성별</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} style={inputStyle}>
                  <option value="">선택</option>
                  <option value="남">남</option>
                  <option value="여">여</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>거주지</label>
              <input value={address} onChange={(e) => handleAddressChange(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>거주구분</label>
              <input value={regionType} readOnly style={{ ...inputStyle, background: '#f5f5f5' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>서류확인</label>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={isJungGu} onChange={(e) => setIsJungGu(e.target.checked)} />중구민
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={isDiscount50} onChange={(e) => {
                    setIsDiscount50(e.target.checked);
                    if (e.target.checked) setIsDiscount100(false);
                  }} />감면 50%
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={isDiscount100} onChange={(e) => {
                    setIsDiscount100(e.target.checked);
                    if (e.target.checked) setIsDiscount50(false);
                  }} />감면 100%
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>메모</label>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
            </div>
          </div>
        )}
      </div>

      {/* 신청 강좌 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>
            📚 신청 강좌 ({activeEnrollments.length}개{endedEnrollments.length > 0 ? ` + 종료 ${endedEnrollments.length}` : ''})
          </h2>
          <button onClick={() => setShowAddCourse(!showAddCourse)} style={primaryBtnStyle}>
            {showAddCourse ? '닫기' : '+ 강좌 추가'}
          </button>
        </div>

        {showAddCourse && (
          <div style={{ background: '#f9f9f9', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #eee' }}>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>강좌명으로 검색하세요 (운영중인 강좌만)</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={courseSearchQuery}
                onChange={(e) => setCourseSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchCourse()}
                placeholder="강좌명 입력"
                style={{ flex: 1, ...inputStyle }}
              />
              <button onClick={handleSearchCourse} style={primaryBtnStyle}>검색</button>
            </div>

            {courseSearching ? (
              <p style={{ fontSize: 13, color: '#888' }}>검색 중...</p>
            ) : courseSearchResults.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {courseSearchResults.map((c) => {
                  const existing = enrollments.find(e => e.course_id === c.id);
                  const alreadyActive = existing && existing.status !== 'ended';
                  return (
                    <div key={c.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: 10, background: 'white', borderRadius: 6, border: '1px solid #eee',
                    }}>
                      <div>
                        <strong style={{ fontSize: 14 }}>{c.name}</strong>
                        <span style={{ ...badgeStyle(COURSE_CATEGORY_COLORS[c.category] || '#666'), marginLeft: 8 }}>{c.category}</span>
                        <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>{c.classroom || '-'} · 정원 {c.capacity}명</span>
                      </div>
                      {alreadyActive ? (
                        <span style={{ fontSize: 12, color: '#888' }}>이미 등록됨 ({STATUS_LABELS[existing!.status]})</span>
                      ) : (
                        <button
                          onClick={() => handleEnrollCourse(c.id, c.name)}
                          style={{
                            padding: '6px 14px', background: '#185FA5', color: 'white',
                            border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          {existing ? '재신청' : '수강신청'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : courseSearchQuery && !courseSearching ? (
              <p style={{ fontSize: 13, color: '#888' }}>검색 결과가 없습니다.</p>
            ) : null}
          </div>
        )}

        {activeEnrollments.length === 0 && endedEnrollments.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>아직 신청한 강좌가 없습니다.</p>
        ) : activeEnrollments.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <th style={thStyle}>강좌</th>
                <th style={thStyle}>구분</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>신청일</th>
                <th style={thStyle}>관리</th>
              </tr>
            </thead>
            <tbody>
              {activeEnrollments.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={tdStyle}>
                    <Link href={`/courses/${e.course_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                      <strong>{e.courses?.name || '-'}</strong>
                    </Link>
                  </td>
                  <td style={tdStyle}>
                    {e.courses && <span style={badgeStyle(COURSE_CATEGORY_COLORS[e.courses.category] || '#666')}>{e.courses.category}</span>}
                  </td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(STATUS_COLORS[e.status])}>
                      {STATUS_LABELS[e.status]}
                      {e.status === 'waiting' && e.waiting_order && ` ${e.waiting_order}번`}
                    </span>
                  </td>
                  <td style={tdStyle}>{e.enrolled_at?.substring(0, 10)}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {e.status === 'active' && (
                      <>
                        <button onClick={() => handleChangeEnrollmentStatus(e, 'paused')} style={smallBtnStyle}>일시중지</button>
                        <button onClick={() => handleChangeEnrollmentStatus(e, 'ended')} style={smallBtnStyle}>수강종료</button>
                      </>
                    )}
                    {e.status === 'paused' && (
                      <button onClick={() => handleChangeEnrollmentStatus(e, 'active')} style={smallBtnStyle}>재개</button>
                    )}
                    {e.status === 'waiting' && (
                      <button onClick={() => handleChangeEnrollmentStatus(e, 'active')} style={smallBtnStyle}>수강전환</button>
                    )}
                    <button onClick={() => handleDeleteEnrollment(e)} style={{ ...smallBtnStyle, color: '#A32D2D' }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {endedEnrollments.length > 0 && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#888' }}>
              종료된 강좌 ({endedEnrollments.length}개)
            </summary>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                  <th style={thStyle}>강좌</th>
                  <th style={thStyle}>구분</th>
                  <th style={thStyle}>종료일</th>
                  <th style={thStyle}>관리</th>
                </tr>
              </thead>
              <tbody>
                {endedEnrollments.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: 0.7 }}>
                    <td style={tdStyle}>
                      <Link href={`/courses/${e.course_id}`} style={{ color: '#185FA5', textDecoration: 'none' }}>
                        {e.courses?.name || '-'}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      {e.courses && <span style={badgeStyle(COURSE_CATEGORY_COLORS[e.courses.category] || '#666')}>{e.courses.category}</span>}
                    </td>
                    <td style={tdStyle}>{e.ended_at?.substring(0, 10)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button onClick={() => handleChangeEnrollmentStatus(e, 'active')} style={smallBtnStyle}>재신청</button>
                      <button onClick={() => handleDeleteEnrollment(e)} style={{ ...smallBtnStyle, color: '#A32D2D' }}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      {/* 메모 히스토리 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 16, margin: '0 0 16px' }}>💬 메모 히스토리 ({memos.length}건)</h2>

        <div style={{ background: '#f9f9f9', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ ...inputStyle, width: 140 }}>
              {CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.value}</option>))}
            </select>
            <input
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddMemo();
                }
              }}
              placeholder="메모 내용 입력 후 Enter 또는 저장 버튼"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={handleAddMemo} style={primaryBtnStyle}>저장</button>
          </div>
        </div>

        {memosLoading ? (
          <p style={{ color: '#888', fontSize: 13 }}>불러오는 중...</p>
        ) : memos.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>아직 메모가 없습니다.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memos.map((m) => (
              <div key={m.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={badgeStyle(getCategoryColor(m.category))}>{m.category}</span>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {m.created_by && <span style={{ marginRight: 8 }}>{m.created_by}</span>}
                    {new Date(m.created_at).toLocaleString('ko-KR')}
                    <button
                      onClick={() => handleDeleteMemo(m.id)}
                      style={{ marginLeft: 8, background: 'none', border: 'none', color: '#A32D2D', cursor: 'pointer', fontSize: 11 }}
                    >삭제</button>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</p>
              </div>
            ))}
          </div>
        )}
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
  borderRadius: 4, fontSize: 11, marginRight: 4,
});
