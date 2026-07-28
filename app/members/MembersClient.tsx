'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/fetchAll';
import * as XLSX from 'xlsx';

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
  discount_recipient: boolean;
  discount_multi_child: boolean;
  discount_low_income: boolean;
  discount_single_parent: boolean;
  discount_veteran: boolean;
  discount_disabled: boolean;
  discount_other: boolean;
  received_date: string | null;
  memo: string;
  created_at: string;
};

export default function MembersClient() {
  const supabase = createClient();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 폼 입력값
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rrnFront, setRrnFront] = useState('');
  const [address, setAddress] = useState('');
  const [isJungGu, setIsJungGu] = useState(false);
  const [isDiscount50, setIsDiscount50] = useState(false);
  const [isDiscount100, setIsDiscount100] = useState(false);
  // 감면 사유
  const [discRecipient, setDiscRecipient] = useState(false);
  const [discMultiChild, setDiscMultiChild] = useState(false);
  const [discLowIncome, setDiscLowIncome] = useState(false);
  const [discSingleParent, setDiscSingleParent] = useState(false);
  const [discVeteran, setDiscVeteran] = useState(false);
  const [discDisabled, setDiscDisabled] = useState(false);
  const [discOther, setDiscOther] = useState(false);
  const [memo, setMemo] = useState('');

  // 자동 계산되는 값
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [regionType, setRegionType] = useState('');

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMembers() {
    setLoading(true);
    // 회원 수가 1000명을 넘으면 기본 조회로는 뒤쪽이 잘리므로 끝까지 페이지로 가져옴
    const { data, error } = await fetchAllRows<Member>((from, to) =>
      supabase
        .from('members')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    if (error) {
      alert('회원 목록 불러오기 실패: ' + error.message);
    } else {
      setMembers(data || []);
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
    } else {
      setBirthDate('');
      setGender('');
    }
  }

  function handleAddressChange(value: string) {
    setAddress(value);
    if (value.includes('중구')) {
      setRegionType('중구민');
    } else if (value.length > 0) {
      setRegionType('타구민');
    } else {
      setRegionType('');
    }
  }

  function resetForm() {
    setName(''); setPhone(''); setRrnFront(''); setAddress('');
    setIsJungGu(false); setIsDiscount50(false); setIsDiscount100(false);
    setDiscRecipient(false); setDiscMultiChild(false); setDiscLowIncome(false);
    setDiscSingleParent(false); setDiscVeteran(false); setDiscDisabled(false); setDiscOther(false);
    setMemo(''); setBirthDate(''); setGender(''); setRegionType('');
  }

  // 회원 명부 엑셀 다운로드
  function downloadMembersExcel() {
    if (members.length === 0) {
      alert('다운로드할 회원이 없습니다.');
      return;
    }
    // 헤더
    const headers = [
      '연번', '이름', '연락처', '주민번호앞', '생년월일', '성별', '거주구분', '주소',
      '중구민', '감면100%', '감면50%',
      '수급자', '다자녀', '차상위', '한부모', '국가유공자', '장애인', '기타',
      '접수일', '메모'
    ];
    // 이름 정렬
    const sorted = [...members].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const rows: (string | number)[][] = [headers];
    sorted.forEach((m, idx) => {
      rows.push([
        idx + 1,
        m.name || '',
        m.phone || '',
        m.rrn_front || '',
        m.birth_date || '',
        m.gender || '',
        m.region_type || '',
        m.address || '',
        m.is_jung_gu ? 'O' : '',
        m.is_discount_100 ? 'O' : '',
        m.is_discount_50 ? 'O' : '',
        (m as any).discount_recipient ? 'O' : '',
        (m as any).discount_multi_child ? 'O' : '',
        (m as any).discount_low_income ? 'O' : '',
        (m as any).discount_single_parent ? 'O' : '',
        (m as any).discount_veteran ? 'O' : '',
        (m as any).discount_disabled ? 'O' : '',
        (m as any).discount_other ? 'O' : '',
        m.received_date || '',
        m.memo || '',
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
      { wch: 6 }, { wch: 8 }, { wch: 28 },
      { wch: 7 }, { wch: 8 }, { wch: 7 },
      { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 10 }, { wch: 7 }, { wch: 7 },
      { wch: 12 }, { wch: 24 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '회원명부');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `회원명부_${today}.xlsx`);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      alert('이름을 입력하세요');
      return;
    }

    const newMember = {
      name, phone, rrn_front: rrnFront,
      birth_date: birthDate || null,
      gender, address, region_type: regionType,
      is_jung_gu: isJungGu,
      is_discount_50: isDiscount50,
      is_discount_100: isDiscount100,
      discount_recipient: discRecipient,
      discount_multi_child: discMultiChild,
      discount_low_income: discLowIncome,
      discount_single_parent: discSingleParent,
      discount_veteran: discVeteran,
      discount_disabled: discDisabled,
      discount_other: discOther,
      received_date: new Date().toISOString().split('T')[0],
      memo,
    };

    const { error } = await supabase.from('members').insert([newMember]);

    if (error) {
      alert('회원 등록 실패: ' + error.message);
    } else {
      alert('회원이 등록되었습니다!');
      resetForm();
      setShowForm(false);
      loadMembers();
    }
  }

  // 검색 필터
  const filteredMembers = members.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.name?.toLowerCase().includes(q) ||
      m.phone?.includes(q) ||
      m.address?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ maxWidth: 1100, margin: '40px auto', padding: 20 }}>
      <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 20 }}>회원 관리</h1>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 20px',
          background: showForm ? '#888' : '#185FA5',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
        }}>
          {showForm ? '닫기' : '+ 신규 회원 등록'}
        </button>
        <Link href="/members/upload" style={{
          padding: '10px 16px',
          background: '#1D9E75',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
          textDecoration: 'none',
        }}>
          📤 엑셀 일괄 업로드
        </Link>
        <button onClick={downloadMembersExcel} style={{
          padding: '10px 16px',
          background: '#7B3FBF',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
        }}>
          📥 명부 다운로드
        </button>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 이름, 연락처, 주소로 검색"
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid #ddd',
            borderRadius: 8,
            fontSize: 14,
          }}
        />
      </div>

      {showForm && (
        <div style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>새 회원 등록</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>이름 *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="홍길동" />
            </div>
            <div>
              <label style={labelStyle}>연락처</label>
              <input value={phone} onChange={(e) => handlePhoneChange(e.target.value)} style={inputStyle} placeholder="010-1234-5678" maxLength={13} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>주민번호 앞자리</label>
              <input value={rrnFront} onChange={(e) => handleRrnChange(e.target.value)} style={inputStyle} placeholder="800101-2" maxLength={8} />
            </div>
            <div>
              <label style={labelStyle}>생년월일 (자동)</label>
              <input value={birthDate} readOnly style={{ ...inputStyle, background: '#f5f5f5' }} />
            </div>
            <div>
              <label style={labelStyle}>성별 (자동)</label>
              <input value={gender} readOnly style={{ ...inputStyle, background: '#f5f5f5' }} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>거주지</label>
            <input value={address} onChange={(e) => handleAddressChange(e.target.value)} style={inputStyle} placeholder="서울특별시 중구 신당동" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>거주구분 (자동)</label>
            <input value={regionType} readOnly style={{ ...inputStyle, background: '#f5f5f5' }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>서류확인 (해당하는 항목 모두 체크)</label>
            <div style={{ marginTop: 8, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
              {/* 중구민 */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
                  <input type="checkbox" checked={isJungGu} onChange={(e) => {
                    setIsJungGu(e.target.checked);
                    if (!e.target.checked) {
                      // 중구민 해제 시 모든 감면 해제
                      setIsDiscount50(false); setIsDiscount100(false);
                      setDiscRecipient(false); setDiscMultiChild(false); setDiscLowIncome(false);
                      setDiscSingleParent(false); setDiscVeteran(false); setDiscDisabled(false); setDiscOther(false);
                    }
                  }} />
                  중구민
                </label>
              </div>
              {/* 감면 100% */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', opacity: isJungGu ? 1 : 0.4 }}>
                <strong style={{ fontSize: 13, color: '#A32D2D', minWidth: 70 }}>감면 100%</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: isJungGu ? 'pointer' : 'not-allowed' }}>
                  <input type="checkbox" checked={discRecipient} disabled={!isJungGu} onChange={(e) => {
                    setDiscRecipient(e.target.checked);
                    setIsDiscount100(e.target.checked);
                    if (e.target.checked) {
                      // 100% 체크 시 50% 사유 모두 해제
                      setIsDiscount50(false);
                      setDiscMultiChild(false); setDiscLowIncome(false); setDiscSingleParent(false);
                      setDiscVeteran(false); setDiscDisabled(false); setDiscOther(false);
                    }
                  }} />
                  수급자 (생계/의료/주거)
                </label>
              </div>
              {/* 감면 50% */}
              <div style={{ padding: '10px 12px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', opacity: isJungGu ? 1 : 0.4 }}>
                <strong style={{ fontSize: 13, color: '#BA7517', minWidth: 70, paddingTop: 2 }}>감면 50%</strong>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', flex: 1 }}>
                  {[
                    { label: '다자녀', value: discMultiChild, setter: setDiscMultiChild },
                    { label: '차상위', value: discLowIncome, setter: setDiscLowIncome },
                    { label: '한부모', value: discSingleParent, setter: setDiscSingleParent },
                    { label: '국가유공자', value: discVeteran, setter: setDiscVeteran },
                    { label: '장애인', value: discDisabled, setter: setDiscDisabled },
                    { label: '기타', value: discOther, setter: setDiscOther },
                  ].map(item => (
                    <label key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: isJungGu ? 'pointer' : 'not-allowed' }}>
                      <input type="checkbox" checked={item.value} disabled={!isJungGu} onChange={(e) => {
                        item.setter(e.target.checked);
                        // 50% 사유 중 하나라도 체크되면 is_discount_50=true
                        const next = {
                          discMultiChild, discLowIncome, discSingleParent, discVeteran, discDisabled, discOther,
                          [item.label === '다자녀' ? 'discMultiChild' :
                            item.label === '차상위' ? 'discLowIncome' :
                            item.label === '한부모' ? 'discSingleParent' :
                            item.label === '국가유공자' ? 'discVeteran' :
                            item.label === '장애인' ? 'discDisabled' : 'discOther']: e.target.checked,
                        };
                        const any50 = Object.values(next).some(v => v);
                        setIsDiscount50(any50);
                        if (e.target.checked) {
                          // 50% 체크 시 100% 해제
                          setIsDiscount100(false); setDiscRecipient(false);
                        }
                      }} />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {!isJungGu && (
              <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                ※ 운영세칙상 중구민만 감면 적용 가능합니다
              </p>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>메모</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} placeholder="비상연락처, 특이사항 등" />
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
          {searchQuery ? `검색 결과 (${filteredMembers.length}명)` : `전체 회원 (${members.length}명)`}
        </h2>

        {loading ? (
          <p style={{ color: '#888' }}>불러오는 중...</p>
        ) : filteredMembers.length === 0 ? (
          <p style={{ color: '#888' }}>
            {searchQuery ? '검색 결과가 없습니다.' : '아직 등록된 회원이 없습니다.'}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>연락처</th>
                <th style={thStyle}>생년월일</th>
                <th style={thStyle}>성별</th>
                <th style={thStyle}>거주구분</th>
                <th style={thStyle}>서류확인</th>
                <th style={thStyle}>등록일</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => router.push(`/members/${m.id}`)}
                  style={{
                    borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                >
                  <td style={tdStyle}><strong>{m.name}</strong></td>
                  <td style={tdStyle}>{m.phone}</td>
                  <td style={tdStyle}>{m.birth_date}</td>
                  <td style={tdStyle}>{m.gender}</td>
                  <td style={tdStyle}>{m.region_type}</td>
                  <td style={tdStyle}>
                    {m.is_jung_gu && <span style={badgeStyle('#185FA5')}>중구민</span>}
                    {m.is_discount_50 && <span style={badgeStyle('#BA7517')}>감면50%</span>}
                    {m.is_discount_100 && <span style={badgeStyle('#A32D2D')}>감면100%</span>}
                  </td>
                  <td style={tdStyle}>{m.received_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filteredMembers.length > 0 && (
          <p style={{ fontSize: 11, color: '#888', marginTop: 12, textAlign: 'center' }}>
            회원을 클릭하면 상세 화면으로 이동합니다
          </p>
        )}
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
const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px',
  background: color + '22', color: color,
  borderRadius: 4, fontSize: 11, marginRight: 4,
});
