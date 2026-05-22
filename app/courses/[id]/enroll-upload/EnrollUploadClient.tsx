'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

type Course = {
  id: number;
  name: string;
  category: string;
  capacity: number;
  is_active: boolean;
};

type ParsedRow = {
  name: string;
  phone: string;
  // 매칭된 회원 정보
  memberId: number | null;
  // 검증 결과
  status: 'new' | 'already' | 'resume' | 'no_member' | 'duplicate_in_file';
  message: string;
  existingEnrollmentId: number | null; // 종료 → 재개용
};

// 연락처 자동 포맷
function formatPhone(raw: string): string {
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return String(raw).trim();
}

export default function EnrollUploadClient({ course }: { course: Course }) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ added: number; resumed: number; skipped: number; errors: number } | null>(null);

  // 양식 다운로드
  function downloadTemplate() {
    const headers = ['이름', '연락처'];
    const examples = [
      ['김중구', '010-1111-2222'],
      ['이수급', '010-3333-4444'],
      ['박다자', '010-5555-6666'],
    ];
    const note = [
      [],
      ['※ 입력 안내'],
      ['1. 이름과 연락처는 회원 정보와 정확히 일치해야 합니다.'],
      ['2. 회원으로 먼저 등록되어 있어야 수강신청이 가능합니다.'],
      ['3. 회원 일괄 등록은 회원관리 메뉴에서 가능합니다.'],
      ['4. 이미 이 강좌에 신청된 회원은 자동으로 건너뜁니다.'],
      ['5. 이 안내 행과 예시 행은 삭제하고 업로드해도 됩니다.'],
    ];

    const rows = [headers, ...examples, ...note];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '수강신청');
    const safeName = course.name.replace(/[\\/?*[\]:]/g, '');
    XLSX.writeFile(wb, `수강신청_일괄등록_양식_${safeName}.xlsx`);
  }

  // 파일 선택 → 파싱 + 검증 + 회원 매칭 + 기존 신청 체크
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

    // 전체 회원 + 이 강좌의 기존 enrollment 모두 로드
    const [mRes, eRes] = await Promise.all([
      supabase.from('members').select('id, name, phone'),
      supabase.from('enrollments').select('id, member_id, status').eq('course_id', course.id),
    ]);
    const allMembers = mRes.data || [];
    const existingEnrollments = eRes.data || [];

    // 매칭 맵 (이름+연락처)
    const memberMap = new Map<string, number>(); // key → member_id
    allMembers.forEach(m => {
      const key = `${(m.name || '').trim()}|${formatPhone(m.phone || '')}`;
      memberMap.set(key, m.id);
    });

    // 이 강좌 기존 신청 맵 (member_id → enrollment)
    const enrollMap = new Map<number, { id: number; status: string }>();
    existingEnrollments.forEach(e => {
      enrollMap.set(e.member_id, { id: e.id, status: e.status });
    });

    const parsed: ParsedRow[] = [];
    const seenInFile = new Set<string>();

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const name = String(r[0] || '').trim();
      if (!name || name.startsWith('※')) continue;

      const phone = formatPhone(String(r[1] || ''));
      const key = `${name}|${phone}`;

      // 파일 내 중복
      if (seenInFile.has(key)) {
        parsed.push({
          name, phone,
          memberId: null,
          status: 'duplicate_in_file',
          message: '파일 내 중복',
          existingEnrollmentId: null,
        });
        continue;
      }
      seenInFile.add(key);

      const memberId = memberMap.get(key);
      if (!memberId) {
        parsed.push({
          name, phone,
          memberId: null,
          status: 'no_member',
          message: '회원 정보 없음 (먼저 회원 등록 필요)',
          existingEnrollmentId: null,
        });
        continue;
      }

      const existing = enrollMap.get(memberId);
      if (existing) {
        if (existing.status === 'ended') {
          parsed.push({
            name, phone,
            memberId,
            status: 'resume',
            message: '이전 종료된 신청 → 재개됨',
            existingEnrollmentId: existing.id,
          });
        } else {
          parsed.push({
            name, phone,
            memberId,
            status: 'already',
            message: `이미 신청됨 (${existing.status === 'waiting' ? '대기' : existing.status === 'paused' ? '일시중지' : '수강중'})`,
            existingEnrollmentId: existing.id,
          });
        }
      } else {
        parsed.push({
          name, phone,
          memberId,
          status: 'new',
          message: '',
          existingEnrollmentId: null,
        });
      }
    }

    setParsedRows(parsed);
  }

  // 일괄 등록 실행
  async function handleSubmit() {
    const newRows = parsedRows.filter(r => r.status === 'new');
    const resumeRows = parsedRows.filter(r => r.status === 'resume');
    if (newRows.length === 0 && resumeRows.length === 0) {
      alert('등록 또는 재개할 행이 없습니다.');
      return;
    }
    const total = newRows.length + resumeRows.length;
    if (!confirm(`신규 ${newRows.length}건 + 재개 ${resumeRows.length}건 = 총 ${total}건을 처리합니다.\n계속하시겠습니까?`)) return;

    setUploading(true);
    const today = new Date().toISOString().split('T')[0];

    // 1) 신규 신청 insert
    let addedCount = 0;
    if (newRows.length > 0) {
      const inserts = newRows.map(r => ({
        member_id: r.memberId,
        course_id: course.id,
        status: 'active',
        enrolled_at: today,
      }));
      const { error: insertErr } = await supabase.from('enrollments').insert(inserts);
      if (insertErr) {
        alert('신규 신청 등록 실패: ' + insertErr.message);
        setUploading(false);
        return;
      }
      addedCount = newRows.length;
    }

    // 2) 종료 → 재개 (status='active' 업데이트, end_date/end_reason 등 초기화)
    let resumedCount = 0;
    for (const r of resumeRows) {
      if (!r.existingEnrollmentId) continue;
      const { error } = await supabase.from('enrollments').update({
        status: 'active',
        end_date: null,
        end_reason: null,
        end_from_year: null,
        end_from_month: null,
        ended_at: null,
        // 재개 시 신청일도 갱신
        enrolled_at: today,
      }).eq('id', r.existingEnrollmentId);
      if (!error) resumedCount++;
    }

    setUploading(false);

    const skipped = parsedRows.filter(r => r.status === 'already').length;
    const errors = parsedRows.filter(r => r.status === 'no_member' || r.status === 'duplicate_in_file').length;
    setResult({ added: addedCount, resumed: resumedCount, skipped, errors });
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

  const newCount = parsedRows.filter(r => r.status === 'new').length;
  const resumeCount = parsedRows.filter(r => r.status === 'resume').length;
  const alreadyCount = parsedRows.filter(r => r.status === 'already').length;
  const noMemberCount = parsedRows.filter(r => r.status === 'no_member').length;
  const dupInFileCount = parsedRows.filter(r => r.status === 'duplicate_in_file').length;

  // 회원 미등록 명단만 추출 → CSV 다운로드용
  function downloadMissingMembers() {
    const missing = parsedRows.filter(r => r.status === 'no_member');
    if (missing.length === 0) return;
    const headers = ['이름', '연락처', '주민번호앞', '주소', '감면'];
    const rows = [headers, ...missing.map(r => [r.name, r.phone, '', '', ''])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '회원등록');
    XLSX.writeFile(wb, `미등록회원_${course.name.replace(/[\\/?*[\]:]/g, '')}.xlsx`);
  }

  return (
    <div style={{ maxWidth: 1100, margin: '40px auto', padding: 20 }}>
      <Link href={`/courses/${course.id}`} style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← {course.name}으로 돌아가기</Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>📤 수강신청 일괄 업로드</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        <strong style={{ color: '#185FA5' }}>{course.name}</strong> 강좌에 회원들을 한 번에 수강신청 등록합니다.
        이미 신청된 회원은 자동으로 건너뜁니다.
      </p>

      {/* STEP 1. 양식 다운로드 */}
      <div style={{
        background: '#E6F1FB', border: '1px solid #B5D4F4',
        borderRadius: 12, padding: 20, marginBottom: 16,
      }}>
        <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#042C53' }}>📋 STEP 1. 엑셀 양식 다운로드</h3>
        <p style={{ fontSize: 13, color: '#042C53', margin: '0 0 12px', lineHeight: 1.6 }}>
          양식 파일을 다운받아 신청자 명단 (이름, 연락처)을 채워주세요.
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

          {/* 요약 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ padding: '6px 12px', background: '#1D9E75', color: 'white', borderRadius: 6, fontSize: 13 }}>
              신규 등록 {newCount}건
            </span>
            {resumeCount > 0 && (
              <span style={{ padding: '6px 12px', background: '#7B3FBF', color: 'white', borderRadius: 6, fontSize: 13 }}>
                재개 {resumeCount}건
              </span>
            )}
            <span style={{ padding: '6px 12px', background: '#BA7517', color: 'white', borderRadius: 6, fontSize: 13 }}>
              이미 신청 {alreadyCount}건
            </span>
            {noMemberCount > 0 && (
              <span style={{ padding: '6px 12px', background: '#A32D2D', color: 'white', borderRadius: 6, fontSize: 13 }}>
                회원 미등록 {noMemberCount}건
              </span>
            )}
            {dupInFileCount > 0 && (
              <span style={{ padding: '6px 12px', background: '#888', color: 'white', borderRadius: 6, fontSize: 13 }}>
                파일 내 중복 {dupInFileCount}건
              </span>
            )}
          </div>

          {/* 미등록 회원 CSV 다운로드 안내 */}
          {noMemberCount > 0 && (
            <div style={{
              background: '#FFF5F5', border: '1px solid #FECACA',
              borderRadius: 8, padding: 12, marginBottom: 12,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ fontSize: 12, color: '#A32D2D' }}>
                💡 회원으로 먼저 등록되어야 수강신청이 가능합니다.<br />
                미등록 회원 명단을 다운받아 <Link href="/members/upload" style={{ color: '#185FA5' }}>회원 일괄 등록</Link>에 사용하세요.
              </div>
              <button onClick={downloadMissingMembers} style={{
                padding: '6px 12px', background: '#A32D2D', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                📥 미등록 회원 명단 다운로드
              </button>
            </div>
          )}

          {/* 테이블 */}
          <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fafafa', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <th style={th}>연번</th>
                  <th style={th}>상태</th>
                  <th style={th}>이름</th>
                  <th style={th}>연락처</th>
                  <th style={th}>비고</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((r, idx) => {
                  const statusColor = r.status === 'new' ? '#1D9E75'
                    : r.status === 'resume' ? '#7B3FBF'
                    : r.status === 'already' ? '#BA7517'
                    : r.status === 'no_member' ? '#A32D2D'
                    : '#888';
                  const statusLabel = r.status === 'new' ? '등록'
                    : r.status === 'resume' ? '재개'
                    : r.status === 'already' ? '중복'
                    : r.status === 'no_member' ? '미등록'
                    : '파일중복';
                  const bgColor = r.status === 'new' ? 'white'
                    : r.status === 'resume' ? '#F8F4FF'
                    : r.status === 'already' ? '#FFFBF0'
                    : r.status === 'no_member' ? '#FFF5F5'
                    : '#fafafa';
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0', background: bgColor }}>
                      <td style={td}>{idx + 1}</td>
                      <td style={td}>
                        <span style={{
                          padding: '2px 8px', background: statusColor, color: 'white',
                          borderRadius: 3, fontSize: 11, fontWeight: 500,
                        }}>{statusLabel}</span>
                      </td>
                      <td style={td}><strong>{r.name}</strong></td>
                      <td style={td}>{r.phone || '-'}</td>
                      <td style={td}>
                        {r.message ? (
                          <span style={{ fontSize: 12, color: statusColor }}>{r.message}</span>
                        ) : (
                          <span style={{ color: '#888', fontSize: 12 }}>-</span>
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
              disabled={uploading || (newCount === 0 && resumeCount === 0)}
              style={{
                padding: '12px 24px',
                background: (newCount === 0 && resumeCount === 0) ? '#ccc' : '#185FA5',
                color: 'white', border: 'none', borderRadius: 8,
                cursor: uploading || (newCount === 0 && resumeCount === 0) ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 500,
              }}
            >
              {uploading ? '처리 중...' : `✅ ${newCount + resumeCount}건 처리 (신규 ${newCount} + 재개 ${resumeCount})`}
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
          <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#1B5E20' }}>✅ 수강신청 완료</h3>
          <p style={{ fontSize: 13, color: '#1B5E20', margin: 0, lineHeight: 1.6 }}>
            신규 등록: <strong>{result.added}건</strong><br />
            재개 처리: {result.resumed}건<br />
            이미 신청됨 (건너뜀): {result.skipped}건<br />
            오류 (회원 미등록 등): {result.errors}건
          </p>
          <div style={{ marginTop: 12 }}>
            <Link href={`/courses/${course.id}`} style={{
              padding: '8px 16px', background: '#185FA5', color: 'white',
              border: 'none', borderRadius: 6, fontSize: 13, textDecoration: 'none',
            }}>
              {course.name}으로 돌아가기
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600, color: '#555' };
const td: React.CSSProperties = { padding: '6px 10px', whiteSpace: 'nowrap' };
