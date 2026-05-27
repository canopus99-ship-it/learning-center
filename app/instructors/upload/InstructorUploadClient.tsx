'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

type ParsedRow = {
  name: string;
  phone: string;
  payType: 'hourly' | 'daily' | '';
  payTypeRaw: string;
  payAmount: number;
  classHours: number;
  bankAccount: string;
  bonusNote: string;
  memo: string;
  // 검증 결과
  status: 'ok' | 'duplicate' | 'error';
  errors: string[];
  warnings: string[];
};

function formatPhone(raw: string): string {
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return String(raw).trim();
}

export default function InstructorUploadClient() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number; errors: number } | null>(null);

  // 양식 다운로드
  function downloadTemplate() {
    const headers = ['이름', '연락처', '급여방식', '단가', '1회당시간', '입금계좌', '추가급여메모', '메모'];
    const examples = [
      ['홍길동', '010-1234-5678', '시급', 37000, 1.5, '국민은행 123-456-789012', '인센티브 별도', ''],
      ['김선생', '010-2222-3333', '시급', 40000, 1, '신한은행 110-016-251920', '', '월요일 가곡교실'],
      ['이지도', '010-4444-5555', '일급', 80000, 1, '우리은행 1002-123-456789', '', ''],
    ];
    const note = [
      [],
      ['※ 입력 안내'],
      ['1. 이름은 필수입니다.'],
      ['2. 급여방식은 "시급" 또는 "일급"으로 정확히 입력해주세요.'],
      ['3. 단가는 숫자만 입력 (예: 37000)'],
      ['4. 1회당시간은 시간 단위 숫자 (예: 1, 1.5, 2)'],
      ['5. 일급의 경우 1회당시간은 1로 입력하거나 비워두면 됩니다.'],
      ['6. 이미 등록된 강사(이름+연락처 동일)는 자동으로 건너뜁니다.'],
      ['7. 이 안내 행과 예시 행은 삭제하고 업로드해도 됩니다.'],
    ];
    const rows = [headers, ...examples, ...note];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 24 }, { wch: 20 }, { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '강사등록');
    XLSX.writeFile(wb, '강사_일괄등록_양식.xlsx');
  }

  // 파일 선택 → 파싱
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1, defval: '' });

    // 헤더 찾기
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

    // 기존 강사 로드 (중복 체크용)
    const { data: existingInstructors } = await supabase
      .from('instructors')
      .select('name, phone');
    const existingSet = new Set(
      (existingInstructors || []).map(i => `${(i.name || '').trim()}|${formatPhone(i.phone || '')}`)
    );

    const parsed: ParsedRow[] = [];
    const seenInFile = new Set<string>();

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const name = String(r[0] || '').trim();
      if (!name || name.startsWith('※')) continue;

      const phone = formatPhone(String(r[1] || ''));
      const payTypeRaw = String(r[2] || '').trim();
      const payAmountRaw = r[3];
      const classHoursRaw = r[4];
      const bankAccount = String(r[5] || '').trim();
      const bonusNote = String(r[6] || '').trim();
      const memo = String(r[7] || '').trim();

      const errors: string[] = [];
      const warnings: string[] = [];

      // 급여방식 매핑
      let payType: 'hourly' | 'daily' | '' = '';
      if (payTypeRaw === '시급' || payTypeRaw === 'hourly') payType = 'hourly';
      else if (payTypeRaw === '일급' || payTypeRaw === 'daily') payType = 'daily';
      else if (payTypeRaw) {
        warnings.push(`급여방식 "${payTypeRaw}" 인식 못함 → 시급으로 처리`);
        payType = 'hourly';
      } else {
        warnings.push('급여방식 미입력 → 시급으로 처리');
        payType = 'hourly';
      }

      // 단가
      const payAmount = parseInt(String(payAmountRaw).replace(/[^0-9]/g, ''), 10);
      if (isNaN(payAmount) || payAmount <= 0) {
        errors.push('단가가 올바르지 않습니다');
      }

      // 1회당시간 (일급이면 무시되지만 일단 입력값 받음)
      let classHours = parseFloat(String(classHoursRaw));
      if (isNaN(classHours) || classHours <= 0) {
        classHours = 1;
        if (payType === 'hourly') {
          warnings.push('1회당시간 미입력 → 1로 처리');
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
        name, phone, payType, payTypeRaw,
        payAmount: isNaN(payAmount) ? 0 : payAmount,
        classHours,
        bankAccount, bonusNote, memo,
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

    const newInstructors = okRows.map(r => ({
      name: r.name,
      phone: r.phone || null,
      pay_type: r.payType || 'hourly',
      pay_amount: r.payAmount,
      class_hours: r.classHours,
      bonus_note: r.bonusNote || null,
      bank_account: r.bankAccount || null,
      memo: r.memo || null,
      is_active: true,
    }));

    const { error } = await supabase.from('instructors').insert(newInstructors);

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
      <Link href="/instructors" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 강사 목록으로</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>📤 강사 엑셀 일괄 업로드</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        엑셀 양식에 강사 정보를 입력하고 업로드하면 한 번에 등록됩니다. 이미 등록된 강사는 자동으로 건너뜁니다.
      </p>

      {/* STEP 1. 양식 다운로드 */}
      <div style={{
        background: '#E6F1FB', border: '1px solid #B5D4F4',
        borderRadius: 12, padding: 20, marginBottom: 16,
      }}>
        <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#042C53' }}>📋 STEP 1. 엑셀 양식 다운로드</h3>
        <p style={{ fontSize: 13, color: '#042C53', margin: '0 0 12px', lineHeight: 1.6 }}>
          양식 파일을 다운받아 강사 정보를 채워주세요. 안내 문구에 입력 방법이 적혀있습니다.
        </p>
        <button onClick={downloadTemplate} style={{
          padding: '8px 16px', background: '#185FA5', color: 'white',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}>
          📥 양식 다운로드
        </button>
      </div>

      {/* STEP 2. 파일 업로드 */}
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

      {/* STEP 3. 미리보기 */}
      {parsedRows.length > 0 && (
        <div style={{
          background: 'white', borderRadius: 12, padding: 20, marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h3 style={{ fontSize: 14, margin: '0 0 12px' }}>👀 STEP 3. 미리보기 및 확인</h3>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ padding: '6px 12px', background: '#1D9E75', color: 'white', borderRadius: 6, fontSize: 13 }}>
              등록 가능 {okCount}건
            </span>
            <span style={{ padding: '6px 12px', background: '#BA7517', color: 'white', borderRadius: 6, fontSize: 13 }}>
              중복 건너뜀 {dupCount}건
            </span>
            <span style={{ padding: '6px 12px', background: '#A32D2D', color: 'white', borderRadius: 6, fontSize: 13 }}>
              오류 {errCount}건
            </span>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fafafa', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <th style={th}>연번</th>
                  <th style={th}>상태</th>
                  <th style={th}>이름</th>
                  <th style={th}>연락처</th>
                  <th style={th}>급여방식</th>
                  <th style={th}>단가</th>
                  <th style={th}>1회당시간</th>
                  <th style={th}>입금계좌</th>
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
                    <tr key={idx} style={{
                      borderBottom: '1px solid #f0f0f0',
                      background: r.status === 'duplicate' ? '#fffbf0' : r.status === 'error' ? '#fff5f5' : 'white'
                    }}>
                      <td style={td}>{idx + 1}</td>
                      <td style={td}>
                        <span style={{
                          padding: '2px 6px', background: statusColor, color: 'white',
                          borderRadius: 3, fontSize: 11,
                        }}>{statusLabel}</span>
                      </td>
                      <td style={td}><strong>{r.name}</strong></td>
                      <td style={td}>{r.phone || '-'}</td>
                      <td style={td}>
                        {r.payType === 'hourly' ? '시급' : r.payType === 'daily' ? '일급' : '-'}
                      </td>
                      <td style={td}>{r.payAmount ? r.payAmount.toLocaleString() + '원' : '-'}</td>
                      <td style={td}>{r.classHours}시간</td>
                      <td style={td} title={r.bankAccount}>
                        {r.bankAccount ? (r.bankAccount.length > 18 ? r.bankAccount.substring(0, 18) + '...' : r.bankAccount) : '-'}
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
                          <span style={{ color: '#BA7517', fontSize: 11 }}>이미 등록된 강사</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
            <Link href="/instructors" style={{
              padding: '8px 16px', background: '#185FA5', color: 'white',
              border: 'none', borderRadius: 6, fontSize: 13, textDecoration: 'none',
            }}>
              강사 목록으로 이동
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600, color: '#555' };
const td: React.CSSProperties = { padding: '6px 10px', whiteSpace: 'nowrap' };
