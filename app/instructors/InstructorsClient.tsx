'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Instructor = {
  id: number;
  name: string;
  phone: string | null;
  pay_type: string;
  pay_amount: number;
  class_minutes: number;
  bonus_note: string | null;
  is_active: boolean;
  created_at: string;
  memo: string | null;
};

export default function InstructorsClient() {
  const supabase = createClient();
  const router = useRouter();
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');

  // 폼 입력값
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [payType, setPayType] = useState('hourly');
  const [payAmount, setPayAmount] = useState('');
  const [classMinutes, setClassMinutes] = useState('60');
  const [bonusNote, setBonusNote] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    loadInstructors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadInstructors() {
    setLoading(true);
    const { data, error } = await supabase
      .from('instructors')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      alert('강사 목록 불러오기 실패: ' + error.message);
    } else {
      setInstructors(data || []);
    }
    setLoading(false);
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

  function resetForm() {
    setName(''); setPhone(''); setPayType('hourly');
    setPayAmount(''); setClassMinutes('60'); setBonusNote(''); setMemo('');
  }

  async function handleSubmit() {
    if (!name.trim()) {
      alert('이름을 입력하세요');
      return;
    }

    const newInstructor = {
      name: name.trim(),
      phone: phone || null,
      pay_type: payType,
      pay_amount: parseInt(payAmount, 10) || 0,
      class_minutes: parseInt(classMinutes, 10) || 60,
      bonus_note: bonusNote.trim() || null,
      memo: memo.trim() || null,
      is_active: true,
    };

    const { error } = await supabase.from('instructors').insert([newInstructor]);

    if (error) {
      alert('강사 등록 실패: ' + error.message);
    } else {
      alert('강사가 등록되었습니다!');
      resetForm();
      setShowForm(false);
      loadInstructors();
    }
  }

  // 필터링
  const filteredInstructors = instructors.filter((i) => {
    // 활성 상태 필터
    if (filterActive === 'active' && !i.is_active) return false;
    if (filterActive === 'inactive' && i.is_active) return false;

    // 검색어 필터
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      i.name?.toLowerCase().includes(q) ||
      i.phone?.includes(q) ||
      i.memo?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ maxWidth: 1100, margin: '40px auto', padding: 20 }}>
      <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20 }}>강사 관리</h1>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 20px',
          background: showForm ? '#888' : '#185FA5',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
        }}>
          {showForm ? '닫기' : '+ 신규 강사 등록'}
        </button>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 이름, 연락처, 메모로 검색"
          style={{
            flex: 1,
            minWidth: 200,
            padding: '10px 14px',
            border: '1px solid #ddd',
            borderRadius: 8,
            fontSize: 14,
          }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['active', 'inactive', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterActive(f)}
              style={{
                padding: '8px 14px',
                background: filterActive === f ? '#185FA5' : 'white',
                color: filterActive === f ? 'white' : '#666',
                border: '1px solid #ddd',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {f === 'active' ? '활동중' : f === 'inactive' ? '비활동' : '전체'}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <div style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>새 강사 등록</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>이름 *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="김지영" />
            </div>
            <div>
              <label style={labelStyle}>연락처</label>
              <input value={phone} onChange={(e) => handlePhoneChange(e.target.value)} style={inputStyle} placeholder="010-1234-5678" maxLength={13} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>급여 방식 *</label>
              <select value={payType} onChange={(e) => setPayType(e.target.value)} style={inputStyle}>
                <option value="hourly">시급</option>
                <option value="daily">일급</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>단가 (원) *</label>
              <input value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} placeholder="30000" />
            </div>
            <div>
              <label style={labelStyle}>1회 강의 시간 (분)</label>
              <input value={classMinutes} onChange={(e) => setClassMinutes(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} placeholder="60" />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>추가급여 메모</label>
            <input value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} style={inputStyle} placeholder="예: 인센티브 월 10만원, 원고료 별도" />
            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
              인센티브, 원고료 등 시급/일급 외 추가 급여 내용을 자유롭게 적어주세요
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>메모</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} placeholder="강의 전문 분야, 특이사항 등" />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSubmit} style={{
              flex: 1, padding: '12px',
              background: '#185FA5', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 14, fontWeight: 500,
            }}>등록</button>
            <button onClick={resetForm} style={{
              padding: '12px 20px', background: 'white',
              border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 14,
            }}>초기화</button>
          </div>
        </div>
      )}

      <div style={{
        background: 'white', borderRadius: 12, padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 16 }}>
          {searchQuery || filterActive !== 'all'
            ? `검색 결과 (${filteredInstructors.length}명)`
            : `전체 강사 (${instructors.length}명)`}
        </h2>

        {loading ? (
          <p style={{ color: '#888' }}>불러오는 중...</p>
        ) : filteredInstructors.length === 0 ? (
          <p style={{ color: '#888' }}>
            {searchQuery ? '검색 결과가 없습니다.' : '등록된 강사가 없습니다.'}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>연락처</th>
                <th style={thStyle}>급여</th>
                <th style={thStyle}>1회 강의</th>
                <th style={thStyle}>추가급여</th>
                <th style={thStyle}>상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstructors.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => router.push(`/instructors/${i.id}`)}
                  style={{
                    borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    opacity: i.is_active ? 1 : 0.5,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                >
                  <td style={tdStyle}><strong>{i.name}</strong></td>
                  <td style={tdStyle}>{i.phone || '-'}</td>
                  <td style={tdStyle}>
                    {i.pay_type === 'hourly' ? '시급' : '일급'}{' '}
                    <strong>{i.pay_amount.toLocaleString()}원</strong>
                  </td>
                  <td style={tdStyle}>{i.class_minutes}분</td>
                  <td style={tdStyle}>
                    {i.bonus_note ? (
                      <span style={{ fontSize: 12, color: '#666' }}>{i.bonus_note}</span>
                    ) : '-'}
                  </td>
                  <td style={tdStyle}>
                    {i.is_active ? (
                      <span style={{ color: '#1D9E75', fontSize: 12 }}>● 활동중</span>
                    ) : (
                      <span style={{ color: '#888', fontSize: 12 }}>● 비활동</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filteredInstructors.length > 0 && (
          <p style={{ fontSize: 11, color: '#888', marginTop: 12, textAlign: 'center' }}>
            강사를 클릭하면 상세 화면으로 이동합니다
          </p>
        )}
      </div>

      <div style={{
        marginTop: 24, padding: 16,
        background: '#E6F1FB', border: '1px solid #B5D4F4',
        borderRadius: 8, fontSize: 13, color: '#042C53',
      }}>
        <strong>💡 강사비 자동 계산 안내</strong>
        <p style={{ margin: '8px 0 0', lineHeight: 1.7 }}>
          출석부가 만들어지면, 강사가 출석체크한 횟수를 기준으로 강사비가 자동 계산됩니다.<br />
          (예: 시급 30,000원 × 1회 90분 × 월 8회 = 360,000원 + 추가급여)
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, color: '#666', marginBottom: 6,
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
