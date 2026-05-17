'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type StaffMember = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  allowed_course_ids: string | null;
  created_at: string;
};

type Course = {
  id: number;
  name: string;
  category: string;
};

const CATEGORIES = ['문화강좌', '성숙한시민', '능동적시민', '평등한시민', '기타'];
const CATEGORY_COLORS: Record<string, string> = {
  '문화강좌': '#185FA5', '성숙한시민': '#7B3FBF', '능동적시민': '#1D9E75',
  '평등한시민': '#BA7517', '기타': '#666',
};

export default function StaffClient({
  initialStaff,
  courses,
}: {
  initialStaff: StaffMember[];
  courses: Course[];
}) {
  const supabase = createClient();
  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaff);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // 폼 입력값
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'tablet'>('admin');
  const [formAllowedCourseIds, setFormAllowedCourseIds] = useState<Set<number>>(new Set());

  // 카테고리별 강좌 그룹핑
  const coursesByCategory = CATEGORIES.reduce<Record<string, Course[]>>((acc, cat) => {
    acc[cat] = courses.filter(c => c.category === cat);
    return acc;
  }, {});

  async function reload() {
    const { data } = await supabase.from('staff_members').select('*').order('role').order('name');
    setStaffList(data || []);
  }

  function resetForm() {
    setFormEmail('');
    setFormName('');
    setFormRole('admin');
    setFormAllowedCourseIds(new Set());
    setEditingId(null);
    setShowAddForm(false);
  }

  function startEdit(s: StaffMember) {
    setEditingId(s.id);
    setFormEmail(s.email);
    setFormName(s.name || '');
    setFormRole(s.role as 'admin' | 'tablet');
    if (s.allowed_course_ids) {
      setFormAllowedCourseIds(new Set(s.allowed_course_ids.split(',').filter(Boolean).map(Number)));
    } else {
      setFormAllowedCourseIds(new Set());
    }
    setShowAddForm(true);
  }

  function toggleCourse(courseId: number) {
    setFormAllowedCourseIds(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }

  function toggleCategory(category: string) {
    const categoryCourseIds = coursesByCategory[category].map(c => c.id);
    const allSelected = categoryCourseIds.every(id => formAllowedCourseIds.has(id));

    setFormAllowedCourseIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        categoryCourseIds.forEach(id => next.delete(id));
      } else {
        categoryCourseIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  async function handleSave() {
    if (!formEmail.trim()) { alert('이메일을 입력하세요'); return; }
    if (!formName.trim()) { alert('이름을 입력하세요'); return; }

    if (formRole === 'tablet' && formAllowedCourseIds.size === 0) {
      if (!confirm('태블릿에 강좌가 1개도 선택되지 않았습니다. 그래도 저장하시겠습니까?\n(나중에 수정 가능)')) return;
    }

    const data = {
      email: formEmail.trim().toLowerCase(),
      name: formName.trim(),
      role: formRole,
      allowed_course_ids: formRole === 'tablet' && formAllowedCourseIds.size > 0
        ? Array.from(formAllowedCourseIds).sort((a, b) => a - b).join(',')
        : null,
      is_active: true,
    };

    let error;
    if (editingId) {
      const res = await supabase.from('staff_members').update(data).eq('id', editingId);
      error = res.error;
    } else {
      const res = await supabase.from('staff_members').insert([data]);
      error = res.error;
    }

    if (error) {
      alert('저장 실패: ' + error.message);
    } else {
      alert(editingId ? '수정되었습니다' : '추가되었습니다');
      resetForm();
      reload();
    }
  }

  async function handleToggleActive(s: StaffMember) {
    const { error } = await supabase
      .from('staff_members')
      .update({ is_active: !s.is_active })
      .eq('id', s.id);
    if (error) alert('변경 실패: ' + error.message);
    else reload();
  }

  async function handleDelete(s: StaffMember) {
    if (!confirm(`${s.name || s.email} 계정을 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from('staff_members').delete().eq('id', s.id);
    if (error) alert('삭제 실패: ' + error.message);
    else reload();
  }

  const admins = staffList.filter(s => s.role === 'admin');
  const tablets = staffList.filter(s => s.role === 'tablet');

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', padding: 20 }}>
      <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20 }}>🔐 직원 명단 관리</h1>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
          시스템 접근 가능한 직원과 태블릿을 관리합니다.
        </p>
        <button onClick={() => { resetForm(); setShowAddForm(true); }} style={primaryBtnStyle}>
          + 직원/태블릿 추가
        </button>
      </div>

      {/* 추가/수정 폼 */}
      {showAddForm && (
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 16, margin: '0 0 16px' }}>
            {editingId ? '직원/태블릿 수정' : '직원/태블릿 추가'}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>이메일 *</label>
              <input
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="example@jlcwc.or.kr"
                style={inputStyle}
              />
              <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                Google 로그인에 사용할 이메일
              </p>
            </div>
            <div>
              <label style={labelStyle}>이름 *</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="홍길동 또는 '태블릿1 (음악교실)'"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>권한 *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setFormRole('admin')}
                style={{
                  flex: 1, padding: 12,
                  background: formRole === 'admin' ? '#185FA5' : 'white',
                  color: formRole === 'admin' ? 'white' : '#666',
                  border: '1px solid ' + (formRole === 'admin' ? '#185FA5' : '#ddd'),
                  borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}
              >
                👤 관리자
                <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>모든 메뉴 접근</div>
              </button>
              <button
                type="button"
                onClick={() => setFormRole('tablet')}
                style={{
                  flex: 1, padding: 12,
                  background: formRole === 'tablet' ? '#185FA5' : 'white',
                  color: formRole === 'tablet' ? 'white' : '#666',
                  border: '1px solid ' + (formRole === 'tablet' ? '#185FA5' : '#ddd'),
                  borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}
              >
                📱 태블릿
                <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>출석체크만</div>
              </button>
            </div>
          </div>

          {/* 태블릿일 때만 강좌 매핑 UI 표시 */}
          {formRole === 'tablet' && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                이 태블릿에서 볼 수 있는 강좌 ({formAllowedCourseIds.size}개 선택됨)
              </label>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
                카테고리 전체 선택/해제는 카테고리명을 클릭하세요.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {CATEGORIES.map(category => {
                  const categoryCourses = coursesByCategory[category];
                  if (categoryCourses.length === 0) return null;

                  const selectedInCategory = categoryCourses.filter(c => formAllowedCourseIds.has(c.id)).length;
                  const allSelected = selectedInCategory === categoryCourses.length;
                  const someSelected = selectedInCategory > 0 && selectedInCategory < categoryCourses.length;

                  return (
                    <div key={category} style={{
                      border: '1px solid #eee', borderRadius: 8, padding: 12,
                      background: someSelected || allSelected ? '#f8f9fa' : 'white',
                    }}>
                      <div
                        onClick={() => toggleCategory(category)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          cursor: 'pointer', marginBottom: 8,
                          paddingBottom: 8, borderBottom: '1px solid #eee',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected; }}
                          onChange={() => {}}
                          style={{ pointerEvents: 'none' }}
                        />
                        <strong style={{
                          fontSize: 13,
                          color: CATEGORY_COLORS[category],
                        }}>{category}</strong>
                        <span style={{ fontSize: 11, color: '#888' }}>
                          ({selectedInCategory}/{categoryCourses.length})
                        </span>
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: 6,
                        paddingLeft: 24,
                      }}>
                        {categoryCourses.map(course => (
                          <label key={course.id} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 8px', cursor: 'pointer',
                            background: formAllowedCourseIds.has(course.id) ? '#E6F1FB' : 'transparent',
                            borderRadius: 4,
                            fontSize: 13,
                          }}>
                            <input
                              type="checkbox"
                              checked={formAllowedCourseIds.has(course.id)}
                              onChange={() => toggleCourse(course.id)}
                            />
                            <span>{course.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {courses.length === 0 && (
                <p style={{ fontSize: 13, color: '#888', padding: 16, textAlign: 'center', background: '#fafafa', borderRadius: 6 }}>
                  등록된 강좌가 없습니다. 먼저 강좌를 등록하세요.
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={handleSave} style={primaryBtnStyle}>
              {editingId ? '수정' : '추가'}
            </button>
            <button onClick={resetForm} style={secondaryBtnStyle}>취소</button>
          </div>
        </div>
      )}

      {/* 관리자 목록 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>
          👤 관리자 ({admins.length}명)
        </h2>
        {admins.length === 0 ? (
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>등록된 관리자가 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>이메일</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>관리</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: s.is_active ? 1 : 0.5 }}>
                  <td style={tdStyle}><strong>{s.name || '-'}</strong></td>
                  <td style={tdStyle}>{s.email}</td>
                  <td style={tdStyle}>
                    {s.is_active ? <span style={badgeStyle('#1D9E75')}>활성</span> : <span style={badgeStyle('#888')}>비활성</span>}
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => startEdit(s)} style={smallBtnStyle}>수정</button>
                    <button onClick={() => handleToggleActive(s)} style={smallBtnStyle}>
                      {s.is_active ? '비활성화' : '활성화'}
                    </button>
                    <button onClick={() => handleDelete(s)} style={{ ...smallBtnStyle, color: '#A32D2D' }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 태블릿 목록 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>
          📱 태블릿 ({tablets.length}대)
        </h2>
        {tablets.length === 0 ? (
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>등록된 태블릿이 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>이메일</th>
                <th style={thStyle}>접근 가능 강좌</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>관리</th>
              </tr>
            </thead>
            <tbody>
              {tablets.map(s => {
                const allowedIds = s.allowed_course_ids ? s.allowed_course_ids.split(',').filter(Boolean).map(Number) : [];
                const allowedCourses = courses.filter(c => allowedIds.includes(c.id));
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: s.is_active ? 1 : 0.5 }}>
                    <td style={tdStyle}><strong>{s.name || '-'}</strong></td>
                    <td style={tdStyle}>{s.email}</td>
                    <td style={tdStyle}>
                      {allowedCourses.length === 0 ? (
                        <span style={{ color: '#A32D2D', fontSize: 12 }}>⚠️ 강좌 미할당</span>
                      ) : (
                        <span style={{ fontSize: 12 }}>
                          <strong>{allowedCourses.length}개</strong>
                          <span style={{ color: '#888', marginLeft: 6 }}>
                            ({allowedCourses.slice(0, 3).map(c => c.name).join(', ')}{allowedCourses.length > 3 ? ` 외 ${allowedCourses.length - 3}` : ''})
                          </span>
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {s.is_active ? <span style={badgeStyle('#1D9E75')}>활성</span> : <span style={badgeStyle('#888')}>비활성</span>}
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => startEdit(s)} style={smallBtnStyle}>수정</button>
                      <button onClick={() => handleToggleActive(s)} style={smallBtnStyle}>
                        {s.is_active ? '비활성화' : '활성화'}
                      </button>
                      <button onClick={() => handleDelete(s)} style={{ ...smallBtnStyle, color: '#A32D2D' }}>삭제</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{
        marginTop: 16, padding: 12,
        background: '#FFF8E1', border: '1px solid #FFE082',
        borderRadius: 8, fontSize: 12, color: '#5D4037',
      }}>
        <strong>💡 안내</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
          <li><strong>관리자</strong>: 모든 메뉴(회원/강사/강좌/수납 등)에 접근 가능</li>
          <li><strong>태블릿</strong>: 출석체크 화면만 접근 가능, 할당된 강좌만 보임</li>
          <li>태블릿은 Google Workspace에서 별도 계정(예: tablet1@jlcwc.or.kr)을 만들어 사용하세요</li>
          <li>계정 추가 후 첫 로그인은 해당 이메일로 직접 로그인해야 합니다</li>
        </ul>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #ddd', borderRadius: 6,
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
