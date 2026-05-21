'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

// 감면 매핑
const DISCOUNT_MAP: Record<string, { col: string; level: 50 | 100 }> = {
  '수급자': { col: 'discount_recipient', level: 100 },
  '다자녀': { col: 'discount_multi_child', level: 50 },
  '차상위': { col: 'discount_low_income', level: 50 },
  '한부모': { col: 'discount_single_parent', level: 50 },
  '국가유공자': { col: 'discount_veteran', level: 50 },
  '장애인': { col: 'discount_disabled', level: 50 },
  '기타': { col: 'discount_other', level: 50 },
};

type ParsedRow = {
  rowIdx: number; // 엑셀 행 번호 (2부터 시작)
  name: string;
  phone: string;
  rrnFront: string;
  address: string;
  discountText: string;
  // 계산된 값
  birthDate: string | null;
  gender: string;
  regionType: string;
  isJungGu: boolean;
  isDiscount50: boolean;
  isDiscount100: boolean;
  discFlags: Record<string, boolean>;
  // 검증 결과
  status: 'ok' | 'duplicate' | 'error';
  errors: string[];
  warnings: string[];
};

// 연락처 자동 포맷
function formatPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw.trim();
}

// 주민번호로 생년월일 계산
function calcBirthDate(rrn: string): string | null {
  const cleaned = rrn.replace(/[^0-9]/g, '');
  if (cleaned.length < 7) return null;
  const yy = cleaned.substring(0, 2);
  const mm = cleaned.substring(2, 4);
  const dd = cleaned.substring(4, 6);
  const genderDigit = cleaned[6];
  // 1900년대: 1,2 / 2000년대: 3,4 / 1800년대: 9,0
  let yyyy: string;
  if (genderDigit === '1' || genderDigit === '2') yyyy = `19${yy}`;
  else if (genderDigit === '3' || genderDigit === '4') yyyy = `20${yy}`;
  else if (genderDigit === '9' || genderDigit === '0') yyyy = `18${yy}`;
  else return null;
  // 유효성 체크
  const m = parseInt(mm, 10);
  const d = parseInt(dd, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function calcGender(rrn: string): string {
  const cleaned = rrn.replace(/[^0-9]/g, '');
  if (cleaned.length < 7) return '';
  const g = cleaned[6];
  if (g === '1' || g === '3' || g === '9') return '남';
  if (g === '2' || g === '4' || g === '0') return '여';
  return '';
}

// 주민번호 형식 정규화 (############ → ######-#)
function normalizeRrn(raw: string): string {
  const cleaned = String(raw).replace(/[^0-9]/g, '');
  if (cleaned.length === 7) return `${cleaned.substring(0, 6)}-${cleaned.substring(6)}`;
  // 이미 - 가 있는 경우
  const m = String(raw).match(/^(\d{6})-?(\d)/);
  if (m) return `${m[1]}-${m[2]}`;
  return String(raw).trim();
}

export default function UploadClient() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number; errors: number } | null>(null);

  // 양식 다운로드
  function downloadTemplate() {
    const headers = ['이름', '연락처', '주민번호앞', '주소', '감면'];
    const examples = [
      ['김중구', '010-1111-2222', '801010-2', '서울시 중구 중림동', ''],
      ['이수급', '010-3333-4444', '500505-2', '서울시 중구 신당동', '수급자'],
      ['박다자', '010-5555-6666', '750710-1', '서울시 중구 명동', '다자녀,한부모'],
      ['최타구', '010-7777-8888', '900615-2', '서울시 강남구 역삼동', ''],
    ];
    const note = [
      [],
      ['※ 입력 안내'],
      ['1. 이름은 필수입니다.'],
      ['2. 주민번호앞은 ######-# 형식 (예: 801010-2)'],
      ['3. 주소에 "중구"가 포함되면 자동으로 중구민 처리됩니다.'],
      ['4. 감면 입력값: 수급자 / 다자녀 / 차상위 / 한부모 / 국가유공자 / 장애인 / 기타'],
      ['5. 감면 여러 개는 쉼표로 구분 (예: 다자녀,한부모)'],
      ['6. 운영세칙상 중구민만 감면 적용됩니다. (타구민에 감면 입력해도 무시)'],
      ['7. 이미 등록된 회원(이름+연락처 동일)은 자동으로 건너뜁니다.'],
      ['8. 이 안내 행과 예시 행은 삭제하고 업로드해도 됩니다.'],
    ];

    const rows = [headers, ...examples, ...note];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 },
      { wch: 16 },
      { wch: 14 },
      { wch: 30 },
      { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '회원등록');
    XLSX.writeFile(wb, '회원_일괄등록_양식.xlsx');
  }

  // 파일 선택 → 파싱 + 검증 + 중복 체크
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1, defval: '' });

    // 헤더 찾기 (첫 번째 비어있지 않은 행)
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r && r.length > 0 && String(r[0]).trim() === '이름') {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) {
      alert('엑셀에서 "이름" 헤더를 찾을 수 없습니다. 양식을 다시 확인해주세요.');
      return;
    }

    // 기존 회원 로드 (중복 체크용)
    const { data: existingMembers } = await supabase
      .from('members')
      .select('name, phone');
    const existingSet = new Set(
      (existingMembers || []).map(m => `${(m.name || '').trim()}|${formatPhone(m.phone || '')}`)
    );

    const parsed: ParsedRow[] = [];
    const seenInFile = new Set<string>(); // 파일 내 중복 체크

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const name = String(r[0] || '').trim();
      // 안내 문구 행 스킵 ("※"로 시작)
      if (!name || name.startsWith('※')) continue;

      const phone = formatPhone(String(r[1] || ''));
      const rrnRaw = String(r[2] || '').trim();
      const rrnFront = rrnRaw ? normalizeRrn(rrnRaw) : '';
      const address = String(r[3] || '').trim();
      const discountText = String(r[4] || '').trim();

      const errors: string[] = [];
      const warnings: string[] = [];

      // 이름은 위에서 체크함

      // 주민번호 형식 체크
      let birthDate: string | null = null;
      let gender = '';
      if (rrnFront) {
        if (!/^\d{6}-\d$/.test(rrnFront)) {
          warnings.push('주민번호 형식 오류 (생년월일/성별 자동계산 안 됨)');
        } else {
          birthDate = calcBirthDate(rrnFront);
          gender = calcGender(rrnFront);
          if (!birthDate) warnings.push('주민번호로 생년월일 계산 실패');
        }
      }

      // 거주구분 자동
      const regionType = address.includes('중구') ? '중구민' : (address ? '타구민' : '');
      const isJungGu = address.includes('중구');

      // 감면 파싱
      const discFlags: Record<string, boolean> = {
        discount_recipient: false,
        discount_multi_child: false,
        discount_low_income: false,
        discount_single_parent: false,
        discount_veteran: false,
        discount_disabled: false,
        discount_other: false,
      };
      let isDiscount50 = false;
      let isDiscount100 = false;

      if (discountText) {
        const tokens = discountText.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        for (const t of tokens) {
          const matched = DISCOUNT_MAP[t];
          if (!matched) {
            warnings.push(`알 수 없는 감면값 "${t}" (무시됨)`);
            continue;
          }
          if (!isJungGu) {
            warnings.push(`중구민 아님 → 감면 "${t}" 무시됨`);
            continue;
          }
          discFlags[matched.col] = true;
          if (matched.level === 100) isDiscount100 = true;
          else isDiscount50 = true;
        }
        // 100% 와 50% 동시에 있으면 100% 우선 (운영세칙: 가장 높은 비율 1개)
        if (isDiscount100 && isDiscount50) {
          isDiscount50 = false;
          discFlags.discount_multi_child = false;
          discFlags.discount_low_income = false;
          discFlags.discount_single_parent = false;
          discFlags.discount_veteran = false;
          discFlags.discount_disabled = false;
          discFlags.discount_other = false;
          warnings.push('100%와 50% 동시 입력 → 100%만 적용');
        }
      }

      // 중복 체크
      const key = `${name}|${phone}`;
      let status: ParsedRow['status'] = 'ok';
      if (existingSet.has(key)) {
        status = 'duplicate';
      } else if (seenInFile.has(key)) {
        status = 'duplicate';
        errors.push('파일 내 중복 행');
      } else {
        seenInFile.add(key);
      }

      if (errors.length > 0) status = 'error';

      parsed.push({
        rowIdx: i + 1, // 엑셀 행 번호 (1부터)
        name, phone, rrnFront, address, discountText,
        birthDate, gender, regionType, isJungGu,
        isDiscount50, isDiscount100, discFlags,
        status, errors, warnings,
      });
    }

    setParsedRows(parsed);
  }

  // 일괄 등록 실행
  async function handleSubmit() {
    const okRows = parsedRows.filter(r => r.status === 'ok');
    if (okRows.length === 0) {
      alert('등록할 행이 없습니다.');
      return;
    }
    if (!confirm(`정상 ${okRows.length}건을 등록합니다.\n계속하시겠습니까?`)) return;

    setUploading(true);
    const today = new Date().toISOString().split('T')[0];

    const newMembers = okRows.map(r => ({
      name: r.name,
      phone: r.phone,
      rrn_front: r.rrnFront,
      birth_date: r.birthDate,
      gender: r.gender,
      address: r.address,
      region_type: r.regionType,
      is_jung_gu: r.isJungGu,
      is_discount_50: r.isDiscount50,
      is_discount_100: r.isDiscount100,
      discount_recipient: r.discFlags.discount_recipient,
      discount_multi_child: r.discFlags.discount_multi_child,
      discount_low_income: r.discFlags.discount_low_income,
      discount_single_parent: r.discFlags.discount_single_parent,
      discount_veteran: r.discFlags.discount_veteran,
      discount_disabled: r.discFlags.discount_disabled,
      discount_other: r.discFlags.discount_other,
      received_date: today,
      memo: '',
    }));

    const { error } = await supabase.from('members').insert(newMembers);

    setUploading(false);

    if (error) {
      alert('등록 실패: ' + error.message);
      return;
    }

    const dup = parsedRows.filter(r => r.status === 'duplicate').length;
    const err = parsedRows.filter(r => r.status === 'error').length;
    setResult({ added: okRows.length, skipped: dup, errors: err });
    setParsedRows([]);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function reset() {
    setParsedRows([]);
    setFileName('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const okCount = parsedRows.filter(r => r.status === 'ok').length;
  const dupCount = parsedRows.filter(r => r.status === 'duplicate').length;
  const errCount = parsedRows.filter(r => r.status === 'error').length;

  return (
    <div style={{ maxWidth: 1100, margin: '40px auto', padding: 20 }}>
      <Link href="/members" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 회원 목록으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>📤 회원 엑셀 일괄 업로드</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        엑셀 양식에 회원 정보를 입력하고 업로드하면 한 번에 등록됩니다. 이미 등록된 회원은 자동으로 건너뜁니다.
      </p>

      {/* 양식 다운로드 안내 카드 */}
      <div style={{
        background: '#E6F1FB', border: '1px solid #B5D4F4',
        borderRadius: 12, padding: 20, marginBottom: 16,
      }}>
        <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#042C53' }}>📋 STEP 1. 엑셀 양식 다운로드</h3>
        <p style={{ fontSize: 13, color: '#042C53', margin: '0 0 12px', lineHeight: 1.6 }}>
          양식 파일을 다운받아 회원 정보를 채워주세요. 안내 문구에 입력 방법이 적혀있습니다.
        </p>
        <button onClick={downloadTemplate} style={{
          padding: '8px 16px', background: '#185FA5', color: 'white',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}>
          📥 양식 다운로드
        </button>
      </div>

      {/* 파일 업로드 */}
      <div style={{
        background: 'white', borderRadius: 12, padding: 20, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>📂 STEP 2. 작성한 엑셀 파일 업로드</h3>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          style={{ fontSize: 13 }}
        />
        {fileName && (
          <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>선택된 파일: {fileName}</p>
        )}
      </div>

      {/* 미리보기 */}
      {parsedRows.length > 0 && (
        <div style={{
          background: 'white', borderRadius: 12, padding: 20, marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>👀 STEP 3. 미리보기 및 확인</h3>

          {/* 요약 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{
              padding: '6px 12px', background: '#1D9E75', color: 'white',
              borderRadius: 6, fontSize: 13,
            }}>등록 가능 {okCount}건</span>
            <span style={{
              padding: '6px 12px', background: '#BA7517', color: 'white',
              borderRadius: 6, fontSize: 13,
            }}>중복 건너뜀 {dupCount}건</span>
            <span style={{
              padding: '6px 12px', background: '#A32D2D', color: 'white',
              borderRadius: 6, fontSize: 13,
            }}>오류 {errCount}건</span>
          </div>

          {/* 테이블 */}
          <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fafafa', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <th style={th}>행</th>
                  <th style={th}>상태</th>
                  <th style={th}>이름</th>
                  <th style={th}>연락처</th>
                  <th style={th}>주민번호앞</th>
                  <th style={th}>생년월일</th>
                  <th style={th}>성별</th>
                  <th style={th}>거주구분</th>
                  <th style={th}>주소</th>
                  <th style={th}>감면</th>
                  <th style={th}>비고</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((r, idx) => {
                  const statusColor = r.status === 'ok' ? '#1D9E75'
                    : r.status === 'duplicate' ? '#BA7517' : '#A32D2D';
                  const statusLabel = r.status === 'ok' ? '등록'
                    : r.status === 'duplicate' ? '중복' : '오류';
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0', background: r.status === 'duplicate' ? '#fffbf0' : r.status === 'error' ? '#fff5f5' : 'white' }}>
                      <td style={td}>{r.rowIdx}</td>
                      <td style={td}>
                        <span style={{
                          padding: '2px 6px', background: statusColor, color: 'white',
                          borderRadius: 3, fontSize: 11,
                        }}>{statusLabel}</span>
                      </td>
                      <td style={td}><strong>{r.name}</strong></td>
                      <td style={td}>{r.phone || '-'}</td>
                      <td style={td}>{r.rrnFront || '-'}</td>
                      <td style={td}>{r.birthDate || '-'}</td>
                      <td style={td}>{r.gender || '-'}</td>
                      <td style={td}>
                        {r.regionType === '중구민' && <span style={{ color: '#185FA5', fontWeight: 500 }}>중구민</span>}
                        {r.regionType === '타구민' && <span style={{ color: '#888' }}>타구민</span>}
                        {!r.regionType && '-'}
                      </td>
                      <td style={td}>{r.address || '-'}</td>
                      <td style={td}>
                        {r.isDiscount100 && <span style={{ color: '#A32D2D', fontSize: 11 }}>100% </span>}
                        {r.isDiscount50 && <span style={{ color: '#BA7517', fontSize: 11 }}>50% </span>}
                        {Object.entries(r.discFlags).filter(([_, v]) => v).map(([k]) => {
                          const label = Object.entries(DISCOUNT_MAP).find(([_, v]) => v.col === k)?.[0] || '';
                          return label;
                        }).join(', ') || '-'}
                      </td>
                      <td style={td}>
                        {r.errors.map((e, i) => (
                          <div key={`e${i}`} style={{ color: '#A32D2D', fontSize: 11 }}>❌ {e}</div>
                        ))}
                        {r.warnings.map((w, i) => (
                          <div key={`w${i}`} style={{ color: '#BA7517', fontSize: 11 }}>⚠ {w}</div>
                        ))}
                        {r.errors.length === 0 && r.warnings.length === 0 && r.status === 'ok' && (
                          <span style={{ color: '#888', fontSize: 11 }}>-</span>
                        )}
                        {r.status === 'duplicate' && r.errors.length === 0 && (
                          <span style={{ color: '#BA7517', fontSize: 11 }}>이미 등록된 회원</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 액션 버튼 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={handleSubmit}
              disabled={uploading || okCount === 0}
              style={{
                padding: '12px 24px', background: okCount === 0 ? '#ccc' : '#185FA5',
                color: 'white', border: 'none', borderRadius: 8,
                cursor: uploading || okCount === 0 ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 500,
              }}
            >
              {uploading ? '등록 중...' : `✅ 등록 가능한 ${okCount}건 등록`}
            </button>
            <button onClick={reset} style={{
              padding: '12px 20px', background: 'white',
              border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 14,
            }}>
              취소 / 다시 선택
            </button>
          </div>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div style={{
          background: '#E8F5E9', border: '1px solid #A5D6A7',
          borderRadius: 12, padding: 20, marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#1B5E20' }}>✅ 등록 완료</h3>
          <p style={{ fontSize: 13, color: '#1B5E20', margin: 0, lineHeight: 1.6 }}>
            신규 등록: <strong>{result.added}건</strong><br />
            중복 건너뜀: {result.skipped}건<br />
            오류: {result.errors}건
          </p>
          <div style={{ marginTop: 12 }}>
            <Link href="/members" style={{
              padding: '8px 16px', background: '#185FA5', color: 'white',
              border: 'none', borderRadius: 6, fontSize: 13, textDecoration: 'none',
            }}>
              회원 목록으로 이동
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600, color: '#555' };
const td: React.CSSProperties = { padding: '6px 10px', whiteSpace: 'nowrap' };
