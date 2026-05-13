'use client';

import { useState } from 'react';
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

export default function InstructorDetailClient({
  instructor: initialInstructor,
}: {
  instructor: Instructor;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [instructor, setInstructor] = useState<Instructor>(initialInstructor);
  const [editing, setEditing] = useState(false);

  // 수정 폼 상태
  const [name, setName] = useState(instructor.name || '');
  const [phone, setPhone] = useState(instructor.phone || '');
  const [payType, setPayType] = useState(instructor.pay_type || 'hourly');
  const [payAmount, setPayAmount] = useState(String(instructor.pay_amount || ''));
  const [classMinutes, setClassMinutes] = useState(String(instructor.class_minutes || 60));
  const [bonusNote, setBonusNote] = useState(instructor.bonus_note || '');
  const [memo, setMemo] = useState(instructor.memo || '');

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

  async function handleSaveEdit() {
    if (!name.trim()) {
      alert('이름을 입력하세요');
      return;
    }

    const updated = {
      name: name.trim(),
      phone: phone || null,
      pay_type: payType,
      pay_amount: parseInt(payAmount, 10) || 0,
      class_minutes: parseInt(classMinutes, 10) || 60,
      bonus_note: bonusNote.trim() || null,
      memo: memo.trim() || null,
    };

    const { error } = await supabase
      .from('instructors')
      .update(updated)
      .eq('id', instructor.id);

    if (error) {
      alert('수정 실패: ' + error.message);
    } else {
      alert('강사 정보가 수정되었습니다!');
      setInstructor({ ...instructor, ...updated });
      setEditing(false);
    }
  }

  function handleCancelEdit() {
    setName(instructor.name || '');
    setPhone(instructor.phone || '');
    setPayType(instructor.pay_type || 'hourly');
    setPayAmount(String(instructor.pay_amount || ''));
    setClassMinutes(String(instructor.class_minutes || 60));
    setBonusNote(instructor.bonus_note || '');
    setMemo(instructor.memo || '');
    setEditing(false);
  }

  async function handleToggleActive() {
    const action = instructor.is_active ? '비활동' : '활동';
    if (!confirm(`${instructor.name} 강사를 ${action} 상태로 변경하시겠습니까?`)) return;

    const { error } = await supabase
      .from('instructors')
      .update({ is_active: !instructor.is_active })
      .eq('id', instructor.id);

    if (error) {
      alert('변경 실패: ' + error.message);
    } else {
      setInstructor({ ...instructor, is_active: !instructor.is_active });
    }
  }

  async function handleDelete() {
    const confirmText = `정말 "${instructor.name}" 강사를 완전히 삭제하시겠습니까?\n\n되돌릴 수 없습니다.\n(잠시 안 하실 거면 "비활동" 상태로 변경하는 것을 추천드립니다)`;
    if (!confirm(confirmText)) return;

    const { error } = await supabase.from('instructors').delete().eq('id', instructor.id);

    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      alert('강사가 삭제되었습니다');
      router.push('/instructors');
    }
  }

  // 강사비 미리보기 계산 (예시 - 월 8회 기준)
  const previewMonthlyPay = () => {
    const sessions = 8;
    if (instructor.pay_type === 'hourly') {
      const hours = (instructor.class_minutes / 60) * sessions;
      return instructor.pay_amount * hours;
    } else {
      return instructor.pay_amount * sessions;
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
      <Link href="/instructors" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 강사 목록으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        {instructor.name} 강사
        {!instructor.is_active && (
          <span style={{
            fontSize: 11,
            padding: '3px 10px',
            background: '#eee',
            color: '#888',
            borderRadius: 4,
            fontWeight: 'normal',
          }}>비활동</span>
        )}
      </h1>

      {/* 기본 정보 카드 */}
      <div style={{
        background: 'white', borderRadius: 12, padding: 24, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>기본 정보</h2>
          {!editing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditing(true)} style={primaryBtnStyle}>수정</button>
              <button onClick={handleToggleActive} style={secondaryBtnStyle}>
                {instructor.is_active ? '비활동으로' : '활동으로'}
              </button>
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
          // 보기 모드
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14 }}>
            <InfoRow label="이름" value={instructor.name} />
            <InfoRow label="연락처" value={instructor.phone} />
            <InfoRow
              label="급여"
              value={`${instructor.pay_type === 'hourly' ? '시급' : '일급'} ${instructor.pay_amount.toLocaleString()}원`}
            />
            <InfoRow label="1회 강의 시간" value={`${instructor.class_minutes}분`} />
            <div style={{ gridColumn: '1 / -1' }}>
              <InfoRow label="추가급여 메모" value={instructor.bonus_note} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <InfoRow label="메모" value={instructor.memo} />
            </div>
          </div>
        ) : (
          // 수정 모드
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
                <label style={labelStyle}>급여 방식 *</label>
                <select value={payType} onChange={(e) => setPayType(e.target.value)} style={inputStyle}>
                  <option value="hourly">시급</option>
                  <option value="daily">일급</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>단가 (원) *</label>
                <input value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>1회 강의 시간 (분)</label>
                <input value={classMinutes} onChange={(e) => setClassMinutes(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>추가급여 메모</label>
              <input value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} style={inputStyle} placeholder="예: 인센티브 월 10만원, 원고료 별도" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>메모</label>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
            </div>
          </div>
        )}
      </div>

      {/* 강사비 미리보기 */}
      <div style={{
        background: '#E6F1FB', border: '1px solid #B5D4F4',
        borderRadius: 12, padding: 20,
      }}>
        <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#042C53' }}>💰 강사비 계산 미리보기</h3>
        <p style={{ fontSize: 13, color: '#042C53', margin: 0, lineHeight: 1.7 }}>
          {instructor.pay_type === 'hourly' ? (
            <>
              시급 <strong>{instructor.pay_amount.toLocaleString()}원</strong> × {instructor.class_minutes}분<br />
              월 8회 기준: <strong>{previewMonthlyPay().toLocaleString()}원</strong> {instructor.bonus_note && `+ 추가급여 (${instructor.bonus_note})`}
            </>
          ) : (
            <>
              일급 <strong>{instructor.pay_amount.toLocaleString()}원</strong><br />
              월 8회 기준: <strong>{previewMonthlyPay().toLocaleString()}원</strong> {instructor.bonus_note && `+ 추가급여 (${instructor.bonus_note})`}
            </>
          )}
        </p>
        <p style={{ fontSize: 11, color: '#6E7E97', margin: '8px 0 0' }}>
          ※ 실제 강사비는 출석부 만들어진 후 자동 계산됩니다 (출석 횟수 기준)
        </p>
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

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#888', marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box',
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#185FA5', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'white', color: '#666',
  border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer',
  fontSize: 13,
};
const dangerBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'white', color: '#A32D2D',
  border: '1px solid #A32D2D', borderRadius: 6, cursor: 'pointer',
  fontSize: 13,
};
