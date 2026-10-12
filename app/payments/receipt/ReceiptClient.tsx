'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/payments';
import { nextReceiptNumber, receiptNumberPrefix, receiptDatePart, formatKoreanDate, formatKoreanDateFromStr } from '@/lib/receipts';

type PaymentRow = {
  id: number;
  enrollment_id: number;
  payment_year: number;
  payment_month: number;
  amount: number;
  is_paid: boolean;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  receipt_number: string | null;
  status_type: string | null;
  // 결제 시점에 스냅샷된 등급. 승급 이후에도 이 결제건은 원래 등급 그대로 유지됨.
  // 이 컬럼 추가 이전에 만들어진 예전 결제건은 null이므로, 그 경우엔 enrollment의 현재 등급으로 대체 표시.
  course_level_id: number | null;
};

type EnrollmentRow = {
  id: number;
  member_id: number;
  course_id: number;
  course_level_id: number | null;
  members: { id: number; name: string; phone: string | null } | { id: number; name: string; phone: string | null }[] | null;
  courses: { name: string; is_free?: boolean } | { name: string; is_free?: boolean }[] | null;
};

type CourseLevelRow = { id: number; level_name: string };

type LineItem = {
  paymentId: number;
  courseName: string; // 등급이 있으면 "강좌명 - 등급명" 형태로 조합
  year: number;
  month: number;
  amount: number;
  method: PaymentMethod | null;
  paidAt: string | null;
};

// supabase가 관계를 배열로 주든 단일 객체로 주든 안전하게 꺼내기
function unwrap<T>(v: unknown): T | null {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return v as T;
}

const ALL_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'zeropay'];

export default function ReceiptClient({ ids }: { ids: number[] }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [receiptNumber, setReceiptNumber] = useState('');
  // 이번 영수증에 포함된 결제 중 예전에 이미 다른 번호로 발급된 것들 (번호는 바꾸지 않고 참고로 표시)
  const [previousNumbers, setPreviousNumbers] = useState<string[]>([]);
  const [isReissue, setIsReissue] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError(null);

    if (ids.length === 0) {
      setError('출력할 결제 항목이 없습니다.');
      setLoading(false);
      return;
    }

    const { data: paymentsData, error: pErr } = await supabase
      .from('payments')
      .select('id, enrollment_id, payment_year, payment_month, amount, is_paid, paid_at, payment_method, receipt_number, status_type, course_level_id')
      .in('id', ids);

    if (pErr || !paymentsData || paymentsData.length === 0) {
      setError('결제 내역을 불러오지 못했습니다.');
      setLoading(false);
      return;
    }

    // 결제완료 & 환불/이월되지 않은 건만 (안전장치 - 이미 호출하는 쪽에서 걸러서 넘겨줘야 함)
    let validPayments = (paymentsData as PaymentRow[]).filter((p) => p.is_paid && !p.status_type);
    if (validPayments.length === 0) {
      setError('선택한 항목 중 영수증으로 출력할 수 있는 결제완료 내역이 없습니다.\n(환불·이월된 건은 제외됩니다)');
      setLoading(false);
      return;
    }

    const enrollmentIds = Array.from(new Set(validPayments.map((p) => p.enrollment_id)));
    const { data: enrollmentsData, error: eErr } = await supabase
      .from('enrollments')
      .select('id, member_id, course_id, course_level_id, members(id, name, phone), courses(name, is_free)')
      .in('id', enrollmentIds);

    if (eErr || !enrollmentsData || enrollmentsData.length === 0) {
      setError('회원/강좌 정보를 불러오지 못했습니다.');
      setLoading(false);
      return;
    }

    const enrRows = enrollmentsData as unknown as EnrollmentRow[];
    const enrMap = new Map<number, EnrollmentRow>();
    enrRows.forEach((e) => enrMap.set(e.id, e));
    // 무료강좌 '등록 확인' 기록은 결제가 아니므로 영수증에서 제외
    validPayments = validPayments.filter((p) => {
      const enr = enrMap.get(p.enrollment_id);
      const c = enr ? (Array.isArray(enr.courses) ? enr.courses[0] : enr.courses) : null;
      return !c?.is_free;
    });
    if (validPayments.length === 0) {
      setError('영수증으로 출력할 결제가 없습니다. (무료강좌 등록 확인은 영수증 대상이 아닙니다)');
      setLoading(false);
      return;
    }

    // 등급(초급/중급/고급 등)이 걸린 수강신청이 있으면 등급명도 함께 조회
    // (피아노교실처럼 강좌 하나에 등급별로 수강료가 다른 경우, 영수증 강좌명에 "강좌명 - 등급명"으로 표시)
    // 결제건 자체에 스냅샷된 등급(course_level_id)과, 그게 없는 예전 결제건을 위한 enrollment의 현재 등급을 모두 모은다.
    const levelIds = Array.from(new Set([
      ...validPayments.map((p) => p.course_level_id).filter((v): v is number => !!v),
      ...enrRows.map((e) => e.course_level_id).filter((v): v is number => !!v),
    ]));
    const levelMap = new Map<number, string>();
    if (levelIds.length > 0) {
      const { data: levelsData } = await supabase
        .from('course_levels')
        .select('id, level_name')
        .in('id', levelIds);
      ((levelsData || []) as CourseLevelRow[]).forEach((lv) => levelMap.set(lv.id, lv.level_name));
    }

    // 여러 회원이 섞여있으면 중단 (영수증은 한 회원 단위)
    const memberIds = new Set(enrRows.map((e) => e.member_id));
    if (memberIds.size > 1) {
      setError('선택한 결제 항목에 여러 회원이 섞여 있습니다.\n한 회원의 항목만 선택해서 출력해주세요.');
      setLoading(false);
      return;
    }

    const memberObj = unwrap<{ id: number; name: string; phone: string | null }>(enrRows[0].members);
    setMemberName(memberObj?.name || '-');
    setMemberPhone(memberObj?.phone || '-');

    const builtLines: LineItem[] = validPayments
      .map((p) => {
        const enr = enrMap.get(p.enrollment_id);
        const courseObj = enr ? unwrap<{ name: string }>(enr.courses) : null;
        const baseName = courseObj?.name || '-';
        // 이 결제건에 등급이 스냅샷되어 있으면 그걸 우선 사용(승급 전후 관계없이 그 당시 등급 그대로).
        // 스냅샷이 없는 예전 결제건(이 기능 추가 이전)은 enrollment의 현재 등급으로 대체 표시.
        const effectiveLevelId = p.course_level_id ?? enr?.course_level_id ?? null;
        const levelName = effectiveLevelId ? levelMap.get(effectiveLevelId) : null;
        return {
          paymentId: p.id,
          courseName: levelName ? `${baseName} - ${levelName}` : baseName,
          year: p.payment_year,
          month: p.payment_month,
          amount: p.amount,
          method: p.payment_method,
          paidAt: p.paid_at,
        };
      })
      .sort((a, b) => {
        if (a.courseName !== b.courseName) return a.courseName.localeCompare(b.courseName, 'ko');
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });
    setLines(builtLines);

    // 영수증 번호
    // - 선택한 결제가 모두 같은 번호를 이미 갖고 있으면 그 번호 그대로(재발행)
    // - 아니면 새 번호를 발급해서 "아직 번호가 없는 결제"에만 저장. 이미 번호가 있는 결제는 번호를 바꾸지 않음
    //   (예전에는 섞어서 출력하면 이미 발급해 준 영수증 번호가 새 번호로 덮어써졌음)
    // - 새 번호는 DB 함수(next_receipt_number)가 하나씩 발급 → 두 사람이 동시에 출력해도 겹치지 않음
    //   (DB 함수가 아직 없으면 예전 방식으로 대체)
    const nums = validPayments.map((p) => p.receipt_number);
    const allSame = nums.length > 0 && nums.every((n) => !!n && n === nums[0]);

    const hasUnnumbered = validPayments.some((p) => !p.receipt_number);
    if (allSame) {
      setReceiptNumber(nums[0] as string);
      setPreviousNumbers([]);
    } else if (!hasUnnumbered) {
      // 모두 이미 (서로 다른) 번호가 있는 결제들 → 새 번호를 만들지 않음 (저장되지 않는 번호가 인쇄되는 것 방지)
      const existing = Array.from(new Set(nums.filter((n): n is string => !!n))).sort();
      setReceiptNumber(existing.join(', '));
      setPreviousNumbers(existing);
    } else {
      let newNumber: string | null = null;
      const { data: rpcNo, error: rpcErr } = await supabase.rpc('next_receipt_number', {
        p_day: `${receiptDatePart().substring(0, 4)}-${receiptDatePart().substring(4, 6)}-${receiptDatePart().substring(6, 8)}`,
      });
      if (!rpcErr && typeof rpcNo === 'string') {
        newNumber = rpcNo;
      } else {
        const prefix = receiptNumberPrefix();
        const { data: existingRows } = await supabase
          .from('payments')
          .select('receipt_number')
          .like('receipt_number', `${prefix}%`);
        newNumber = nextReceiptNumber((existingRows || []).map((r) => r.receipt_number));
      }

      const unnumberedIds = validPayments.filter((p) => !p.receipt_number).map((p) => p.id);
      if (unnumberedIds.length > 0) {
        const { error: updErr } = await supabase
          .from('payments')
          .update({ receipt_number: newNumber })
          .in('id', unnumberedIds);
        if (updErr) {
          console.error('영수증 번호 저장 실패:', updErr);
          alert('영수증 번호 저장에 실패했습니다. 인터넷 연결을 확인하고 다시 열어 주세요.\n(' + updErr.message + ')');
        }
      }
      setReceiptNumber(newNumber as string);
      setPreviousNumbers(Array.from(new Set(nums.filter((n): n is string => !!n))));
    }

    setLoading(false);
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const methods = Array.from(new Set(lines.map((l) => l.method).filter((m): m is PaymentMethod => !!m)));
  const latestPaidAt = lines.reduce<string | null>((latest, l) => {
    if (!l.paidAt) return latest;
    if (!latest || l.paidAt > latest) return l.paidAt;
    return latest;
  }, null);

  const printStyle = `
    @media print {
      @page { size: A4 portrait; margin: 20mm 18mm; }
      html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
      .print-only { display: block !important; }
    }
  `;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
      <style>{printStyle}</style>

      <div className="no-print">
        <Link href="/payments" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>
          ← 수납관리로
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '12px 0 16px' }}>🧾 수강료 영수증 출력</h1>

        {loading && <p style={{ color: '#888', fontSize: 13 }}>불러오는 중...</p>}

        {error && (
          <div style={{
            padding: 16, background: '#FCEBEB', border: '1px solid #f3b8b8',
            borderRadius: 8, color: '#A32D2D', fontSize: 13, whiteSpace: 'pre-line',
          }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={isReissue} onChange={(e) => setIsReissue(e.target.checked)} />
              재발행으로 표시 (같은 영수증을 다시 출력하는 경우 체크)
            </label>
            <div>
              <button
                onClick={() => window.print()}
                style={{
                  padding: '10px 28px', background: '#1D9E75', color: 'white',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                  marginBottom: 20,
                }}
              >
                🖨️ 인쇄 / PDF 저장
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
              영수증 번호 {receiptNumber} · {memberName}님 · {lines.length}건 · 합계 {total.toLocaleString()}원
              {previousNumbers.length > 0 && (
                <div style={{ color: '#E8820E', marginTop: 4 }}>
                  ※ 이 중 일부는 이미 {previousNumbers.join(', ')} 번호로 영수증이 발급된 결제입니다. (기존 번호는 그대로 유지)
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {!loading && !error && (
        <div className="print-only" style={{ display: 'none' }}>
          <div style={{ padding: '10px 4px', fontFamily: 'sans-serif', color: '#000', background: 'white' }}>
            <div style={{ textAlign: 'right', fontSize: 13, marginBottom: 4 }}>
              {receiptNumber}
              {isReissue && <span style={{ marginLeft: 8, fontWeight: 700, color: '#A32D2D' }}>[재발행]</span>}
            </div>

            <h1 style={{ textAlign: 'center', fontSize: 22, fontWeight: 'bold', margin: '4px 0 24px' }}>
              늘품학습센터 수강료 영수증
            </h1>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
              <tbody>
                <tr>
                  <td style={labelCell}>회원명</td>
                  <td style={valueCell}>{memberName}</td>
                  <td style={labelCell}>연락처</td>
                  <td style={valueCell}>{memberPhone}</td>
                </tr>
                <tr>
                  <td style={labelCell}>납부일</td>
                  <td style={valueCell} colSpan={3}>{formatKoreanDateFromStr(latestPaidAt)}</td>
                </tr>
                <tr>
                  <td style={labelCell}>납부방법</td>
                  <td style={valueCell} colSpan={3}>
                    {ALL_METHODS.map((m) => (
                      <span key={m} style={{ marginRight: 16 }}>
                        {methods.includes(m) ? '☑' : '☐'} {PAYMENT_METHOD_LABELS[m]}
                      </span>
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 }}>
              <thead>
                <tr>
                  <th style={thStyle}>강좌명</th>
                  <th style={thStyle}>해당월</th>
                  <th style={thStyle}>금액</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.paymentId}>
                    <td style={tdStyle}>{l.courseName}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{l.year}년 {l.month}월</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{l.amount.toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...tdStyle, fontWeight: 'bold', background: '#f5f5f5' }} colSpan={2}>합계</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', background: '#f5f5f5', textAlign: 'right' }}>
                    {total.toLocaleString()}원
                  </td>
                </tr>
              </tfoot>
            </table>

            <div style={{ textAlign: 'right', fontSize: 12, color: '#444', margin: '24px 0 40px' }}>
              발행일: {formatKoreanDate()}
            </div>

            <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 'bold' }}>
              중림종합사회복지관
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelCell: React.CSSProperties = {
  border: '1px solid #000', padding: '6px 10px', background: '#eee', width: '15%', fontWeight: 600,
};
const valueCell: React.CSSProperties = {
  border: '1px solid #000', padding: '6px 10px', width: '35%',
};
const thStyle: React.CSSProperties = {
  border: '1px solid #000', padding: '6px 8px', background: '#eee',
};
const tdStyle: React.CSSProperties = {
  border: '1px solid #000', padding: '6px 8px',
};
