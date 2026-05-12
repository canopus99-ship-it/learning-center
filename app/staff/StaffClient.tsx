'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Staff = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  notes: string | null;
};

export default function StaffClient({ currentEmail }: { currentEmail: string }) {
  const supabase = createClient();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // 폼 입력값
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('admin');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStaff() {
    setLoading(true);
    const { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      alert('직원 명단 불러오기 실패: ' + error.message);
    } else {
      setStaff(data || []);
    }
    setLoading(false);
  }

  async function handleAdd() {
    if (!email.trim()) {
      alert('이메일을 입력하세요');
      return;
    }
    if (!email.includes('@')) {
      alert('올바른 이메일 형식이 아닙니다');
      return;
    }

    const { error } = await supabase.from('staff_members').insert([{
      email: email.trim().toLowerCase(),
      name: name.trim() || null,
      role,
      is_active: true,
      notes: notes.trim() || null,
    }]);

    if (error) {
      if (error.message.includes('duplicate')) {
        alert('이미 등록된 이메일입니다');
      } else {
        alert('등록 실패: ' + error.message);
      }
    } else {
      alert('직원이 등록되었습니다!');
      setEmail(''); setName(''); setRole('admin'); setNotes('');
      setShowForm(false);
      loadStaff();
    }
  }

  async function toggleActive(s: Staff) {
    if (s.email === currentEmail) {
      alert('본인 계정은 비활성화할 수 없습니다');
      return;
    }
    if (!confirm(`${s.email}을(를) ${s.is_active ? '비활성화' : '활성화'}하시겠습니까?`)) return;

    const { error } = await supabase
      .from('staff_members')
      .update({ is_active: !s.is_active })
      .eq('id', s.id);

    if (error) {
      alert('변경 실패: ' + error.message);
    } else {
      loadStaff();
    }
  }

  async function handleDelete(s: Staff) {
    if (s.email === currentEmail) {
      alert('본인 계정은 삭제할 수 없습니다');
      return;
    }
    if (!confirm(`${s.email}을(를) 명단에서 완전히 삭제하시겠습니까?\n(되돌릴 수 없습니다)`)) return;

    const { error } = await supabase
      .from('staff_members')
      .delete()
      .eq('id', s.id);

    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      loadStaff();
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', padding: 20 }}>
      <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>직원 명단 관리</h1>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 13 }}>
        시스템에 접속 가능한 직원과 권한을 관리합니다.
      </p>

      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 20px',
          background: showForm ? '#888' : '#185FA5',
          color: 'white', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontSize: 14,
        }}>
          {showForm ? '닫기' : '+ 직원 추가'}
        </button>
      </div>

      {showForm && (
        <div style={{
          background: 'white', borderRadius: 12, padding: 24,
          marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>새 직원 추가</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>이메일 * <span style={{ color: '#888', fontWeight: 'normal' }}>(jlcwc.or.kr Google 계정)</span></label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="hong@jlcwc.or.kr" />
            </div>
            <div>
              <label style={labelStyle}>이름</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="홍길동" />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>권한</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
              <option value="admin">관리자 (모든 기능 사용)</option>
              <option value="tablet">태블릿 (출석체크 전용)</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>메모</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} placeholder="예: 1번 태블릿, 가곡/노래/태극권용" />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAdd} style={{
              flex: 1, padding: '12px',
              background: '#185FA5', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 14, fontWeight: 500,
            }}>등록</button>
          </div>
        </div>
      )}

      <div style={{
        background: 'white', borderRadius: 12, padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 16 }}>
          등록된 직원 ({staff.length}명)
        </h2>

        {loading ? (
          <p style={{ color: '#888' }}>불러오는 중...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <th style={thStyle}>이메일</th>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>권한</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>메모</th>
                <th style={thStyle}>작업</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} style={{
                  borderBottom: '1px solid #f0f0f0',
                  opacity: s.is_active ? 1 : 0.5,
                }}>
                  <td style={tdStyle}>
                    <strong>{s.email}</strong>
                    {s.email === currentEmail && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: '#888' }}>(본인)</span>
                    )}
                  </td>
                  <td style={tdStyle}>{s.name || '-'}</td>
                  <td style={tdStyle}>
                    {s.role === 'admin' ? (
                      <span style={badgeStyle('#185FA5')}>관리자</span>
                    ) : (
                      <span style={badgeStyle('#1D9E75')}>태블릿</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {s.is_active ? (
                      <span style={{ color: '#1D9E75' }}>● 활성</span>
                    ) : (
                      <span style={{ color: '#A32D2D' }}>● 비활성</span>
                    )}
                  </td>
                  <td style={tdStyle}>{s.notes || '-'}</td>
                  <td style={tdStyle}>
                    {s.email !== currentEmail && (
                      <>
                        <button onClick={() => toggleActive(s)} style={smallBtnStyle}>
                          {s.is_active ? '비활성화' : '활성화'}
                        </button>
                        <button onClick={() => handleDelete(s)} style={{
                          ...smallBtnStyle,
                          color: '#A32D2D',
                          marginLeft: 4,
                        }}>삭제</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{
        marginTop: 24, padding: 16,
        background: '#E6F1FB', border: '1px solid #B5D4F4',
        borderRadius: 8, fontSize: 13, color: '#042C53',
      }}>
        <strong>💡 권한 안내</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>관리자</strong>: 회원/강좌/수납 등 모든 기능 사용 가능</li>
          <li><strong>태블릿</strong>: 강사 출석체크용 (출석 기능만)</li>
          <li>비활성화하면 즉시 시스템 접속이 차단됩니다</li>
          <li>본인 계정은 비활성화/삭제할 수 없습니다 (다른 관리자가 처리)</li>
        </ul>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, color: '#666', marginBottom: 6, fontWeight: 500,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box',
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
const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: 'white', border: '1px solid #ddd',
  borderRadius: 4, cursor: 'pointer', fontSize: 11,
};
