'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/payments';

type PaymentRow = {
  id: number;
  enrollment_id: number;
  payment_year: number;
  payment_month: number;
  amount: number;
  payment_method: PaymentMethod | null;
  // 결제 시점에 스냅샷된 등급. 승급 이후에도 이 결제건은 원래 등급 그대로 유지됨.
  // 이 컬럼 추가 이전에 만들어진 예전 결제건은 null이므로, 그 경우엔 enrollment의 현재 등급으로 대체 표시.
  course_level_id: number | null;
};

type EnrollmentRow = {
  id: number;
  member_id: number;
  course_level_id: number | null;
  members: { id: number; name: string } | { id: number; name: string }[] | null;
  courses: { name: string; is_free?: boolean } | { name: string; is_free?: boolean }[] | null;
};

type CourseLevelRow = { id: number; level_name: string };

type Line = {
  paymentId: number;
  courseName: string; // 등급이 있으면 "강좌명 - 등급명" 형태로 조합
  year: number;
  month: number;
  amount: number;
};

// 그날 처리한 환불·이월 (원래 결제일 현황은 그대로 두고, 처리한 날 현황에 따로 표시)
type AdjustLine = {
  paymentId: number;
  memberName: string;
  courseName: string;
  year: number;
  month: number;
  amount: number;
  method: string | null;
};

type MemberGroup = {
  memberId: number;
  memberName: string;
  lines: Line[];
  total: number;
  method: PaymentMethod | null;
  firstPaymentId: number;
};

// supabase가 관계를 배열로 주든 단일 객체로 주든 안전하게 꺼내기
function unwrap<T>(v: unknown): T | null {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return v as T;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysToStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function DailyReportClient({ initialDate }: { initialDate: string | null }) {
  const supabase = createClient();
  const [date, setDate] = useState(initialDate || todayStr());
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [refunds, setRefunds] = useState<AdjustLine[]>([]);
  const [carryovers, setCarryovers] = useState<AdjustLine[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    type AdjRow = { id: number; enrollment_id: number; payment_year: number; payment_month: number; refund_amount: number | null; refund_method: string | null; carryover_amount: number | null; course_level_id: number | null };
    const [{ data: paymentsData }, { data: refundData }, { data: carryData }] = await Promise.all([
      supabase
        .from('payments')
        .select('id, enrollment_id, payment_year, payment_month, amount, payment_method, is_paid, status_type, course_level_id')
        .eq('paid_at', date),
      supabase
        .from('payments')
        .select('id, enrollment_id, payment_year, payment_month, refund_amount, refund_method, carryover_amount, course_level_id')
        .eq('refund_date', date)
        .eq('status_type', 'refunded'),
      supabase
        .from('payments')
        .select('id, enrollment_id, payment_year, payment_month, refund_amount, refund_method, carryover_amount, course_level_id')
        .eq('carryover_date', date)
        .eq('status_type', 'carryover'),
    ]);

    // 그날 받은 결제: 나중에 환불·이월되었더라도 그날 받은 돈이므로 그대로 포함
    // (예전에는 환불·이월하면 원래 결제일 현황에서 빠져서, 이미 마감한 장부와 금액이 달라졌음)
    // 수강변경 '대체'(transferred)는 실제 결제가 아니므로 제외
    const validPayments = ((paymentsData || []) as (PaymentRow & { is_paid: boolean; status_type: string | null })[])
      .filter((p) => p.is_paid && p.status_type !== 'transferred');
    const refundRows = (refundData || []) as AdjRow[];
    const carryRows = (carryData || []) as AdjRow[];

    if (validPayments.length === 0 && refundRows.length === 0 && carryRows.length === 0) {
      setGroups([]);
      setRefunds([]);
      setCarryovers([]);
      setLoading(false);
      return;
    }

    const enrollmentIds = Array.from(new Set([
      ...validPayments.map((p) => p.enrollment_id),
      ...refundRows.map((p) => p.enrollment_id),
      ...carryRows.map((p) => p.enrollment_id),
    ]));
    const { data: enrollmentsData } = await supabase
      .from('enrollments')
      .select('id, member_id, course_level_id, members(id, name), courses(name, is_free)')
      .in('id', enrollmentIds);

    const enrMap = new Map<number, EnrollmentRow>();
    ((enrollmentsData || []) as unknown as EnrollmentRow[]).forEach((e) => enrMap.set(e.id, e));

    // 등급(초급/중급/고급 등)이 걸린 수강신청이 있으면 등급명도 함께 조회
    // (피아노교실처럼 강좌 하나에 등급별로 수강료가 다른 경우, 강좌명 란에 "강좌명 - 등급명"으로 표시)
    // 결제건 자체에 스냅샷된 등급(course_level_id)과, 그게 없는 예전 결제건을 위한 enrollment의 현재 등급을 모두 모은다.
    const levelIds = Array.from(new Set([
      ...validPayments.map((p) => p.course_level_id).filter((v): v is number => !!v),
      ...refundRows.map((p) => p.course_level_id).filter((v): v is number => !!v),
      ...carryRows.map((p) => p.course_level_id).filter((v): v is number => !!v),
      ...((enrollmentsData || []) as unknown as EnrollmentRow[])
        .map((e) => e.course_level_id)
        .filter((v): v is number => !!v),
    ]));
    const levelMap = new Map<number, string>();
    if (levelIds.length > 0) {
      const { data: levelsData } = await supabase
        .from('course_levels')
        .select('id, level_name')
        .in('id', levelIds);
      ((levelsData || []) as CourseLevelRow[]).forEach((lv) => levelMap.set(lv.id, lv.level_name));
    }

    const byMember = new Map<number, MemberGroup>();
    validPayments.forEach((p) => {
      const enr = enrMap.get(p.enrollment_id);
      if (!enr) return;
      const memberObj = unwrap<{ id: number; name: string }>(enr.members);
      const courseObj = unwrap<{ name: string; is_free?: boolean }>(enr.courses);
      if (!memberObj) return;
      if (courseObj?.is_free) return; // 무료강좌 '등록 확인'은 결제가 아니므로 일별결제현황에서 제외

      const baseCourseName = courseObj?.name || '-';
      // 이 결제건에 등급이 스냅샷되어 있으면 그걸 우선 사용(승급 전후 관계없이 그 당시 등급 그대로).
      // 스냅샷이 없는 예전 결제건(이 기능 추가 이전)은 enrollment의 현재 등급으로 대체 표시.
      const effectiveLevelId = p.course_level_id ?? enr.course_level_id ?? null;
      const levelName = effectiveLevelId ? levelMap.get(effectiveLevelId) : null;

      const line: Line = {
        paymentId: p.id,
        courseName: levelName ? `${baseCourseName} - ${levelName}` : baseCourseName,
        year: p.payment_year,
        month: p.payment_month,
        amount: p.amount,
      };

      const existing = byMember.get(memberObj.id);
      if (existing) {
        existing.lines.push(line);
        existing.total += p.amount;
        existing.firstPaymentId = Math.min(existing.firstPaymentId, p.id);
      } else {
        byMember.set(memberObj.id, {
          memberId: memberObj.id,
          memberName: memberObj.name,
          lines: [line],
          total: p.amount,
          method: p.payment_method,
          firstPaymentId: p.id,
        });
      }
    });

    // 그날 결제한 순서(등록 순서)대로 표시
    const result = Array.from(byMember.values()).sort((a, b) => a.firstPaymentId - b.firstPaymentId);
    result.forEach((g) => g.lines.sort((a, b) => a.paymentId - b.paymentId));
    setGroups(result);

    // 그날 처리한 환불·이월 목록
    const toAdjust = (rows: AdjRow[], kind: 'refund' | 'carry'): AdjustLine[] => rows.flatMap((p) => {
      const enr = enrMap.get(p.enrollment_id);
      if (!enr) return [];
      const memberObj = unwrap<{ id: number; name: string }>(enr.members);
      const courseObj = unwrap<{ name: string; is_free?: boolean }>(enr.courses);
      if (courseObj?.is_free) return [];
      const lvId = p.course_level_id ?? enr.course_level_id ?? null;
      const lvName = lvId ? levelMap.get(lvId) : null;
      const baseName = courseObj?.name || '-';
      return [{
        paymentId: p.id,
        memberName: memberObj?.name || '-',
        courseName: lvName ? `${baseName} - ${lvName}` : baseName,
        year: p.payment_year,
        month: p.payment_month,
        amount: (kind === 'refund' ? p.refund_amount : p.carryover_amount) || 0,
        method: kind === 'refund' ? p.refund_method : null,
      }];
    });
    setRefunds(toAdjust(refundRows, 'refund').sort((a, b) => a.paymentId - b.paymentId));
    setCarryovers(toAdjust(carryRows, 'carry').sort((a, b) => a.paymentId - b.paymentId));
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  const refundTotal = refunds.reduce((s, r) => s + r.amount, 0);
  const hasAny = groups.length > 0 || refunds.length > 0 || carryovers.length > 0;
  const dateObj = new Date(date + 'T00:00:00');

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
        <Link href="/payments" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 수납관리로</Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '12px 0 16px' }}>📅 일별 수강료 결제 현황</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setDate(d => addDaysToStr(d, -1))} style={navBtn}>◀</button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
          />
          <button onClick={() => setDate(d => addDaysToStr(d, 1))} style={navBtn}>▶</button>
          {date !== todayStr() && (
            <button onClick={() => setDate(todayStr())} style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: 12 }}>오늘</button>
          )}
        </div>

        <button
          onClick={() => window.print()}
          disabled={loading || !hasAny}
          style={{
            padding: '10px 28px',
            background: (loading || !hasAny) ? '#ccc' : '#1D9E75',
            color: 'white', border: 'none', borderRadius: 8,
            cursor: (loading || !hasAny) ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600,
            marginBottom: 20,
          }}
        >
          🖨️ 인쇄 / PDF 저장
        </button>

        <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
          {loading ? '불러오는 중...' : !hasAny
            ? '이 날짜에 등록된 결제·환불 내역이 없습니다.'
            : `수납 ${groups.length}명 ${grandTotal.toLocaleString()}원`
              + (refunds.length > 0 ? ` · 환불 ${refunds.length}건 ${refundTotal.toLocaleString()}원 · 순수입 ${(grandTotal - refundTotal).toLocaleString()}원` : '')
              + (carryovers.length > 0 ? ` · 이월 ${carryovers.length}건` : '')}
          <div style={{ marginTop: 4 }}>
            결제한 날 현황은 나중에 환불·이월해도 바뀌지 않고, 환불·이월은 처리한 날짜의 현황에 따로 표시됩니다.
          </div>
        </div>
      </div>

      {!loading && hasAny && (
        <div className="print-only" style={{ display: 'none' }}>
          <div style={{ padding: '10px 4px', fontFamily: 'sans-serif', color: '#000', background: 'white' }}>
            <h1 style={{ textAlign: 'center', fontSize: 20, fontWeight: 'bold', margin: '4px 0 24px' }}>
              {dateObj.getFullYear()}년 {dateObj.getMonth() + 1}월 {dateObj.getDate()}일 늘품학습센터 수강료
            </h1>

            {groups.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>성명</th>
                  <th style={thStyle}>납부내역</th>
                  <th style={thStyle}>금액</th>
                  <th style={thStyle}>합계</th>
                  <th style={thStyle}>납부방법</th>
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((g) =>
                  g.lines.map((l, li) => (
                    <tr key={l.paymentId}>
                      {li === 0 && (
                        <td style={tdCenter} rowSpan={g.lines.length}>{g.memberName}</td>
                      )}
                      <td style={tdStyle}>{l.courseName}({l.year}.{String(l.month).padStart(2, '0')}.)</td>
                      <td style={tdRight}>{l.amount.toLocaleString()}원</td>
                      {li === 0 && (
                        <td style={tdRight} rowSpan={g.lines.length}>{g.total.toLocaleString()}원</td>
                      )}
                      {li === 0 && (
                        <td style={tdCenter} rowSpan={g.lines.length}>
                          {g.method ? PAYMENT_METHOD_LABELS[g.method] : '-'}
                        </td>
                      )}
                    </tr>
                  ))
                )}
                <tr>
                  <td colSpan={2} style={{ ...tdCenter, fontWeight: 'bold', background: '#f5f5f5' }}>합계</td>
                  <td style={{ ...tdRight, fontWeight: 'bold', background: '#f5f5f5' }} colSpan={3}>
                    {grandTotal.toLocaleString()}원
                  </td>
                </tr>
              </tbody>
            </table>
            )}

            {refunds.length > 0 && (
              <>
                <h2 style={{ fontSize: 15, margin: '24px 0 8px' }}>환불</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>성명</th>
                      <th style={thStyle}>환불내역</th>
                      <th style={thStyle}>환불금액</th>
                      <th style={thStyle}>환불방법</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.map(r => (
                      <tr key={r.paymentId}>
                        <td style={tdCenter}>{r.memberName}</td>
                        <td style={tdStyle}>{r.courseName}({r.year}.{String(r.month).padStart(2, '0')}.)</td>
                        <td style={tdRight}>-{r.amount.toLocaleString()}원</td>
                        <td style={tdCenter}>{r.method ? (PAYMENT_METHOD_LABELS as Record<string, string>)[r.method] || r.method : '-'}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2} style={{ ...tdCenter, fontWeight: 'bold', background: '#f5f5f5' }}>환불 합계</td>
                      <td colSpan={2} style={{ ...tdRight, fontWeight: 'bold', background: '#f5f5f5' }}>-{refundTotal.toLocaleString()}원</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 'bold', marginTop: 10 }}>
                  순수입(수납 - 환불): {(grandTotal - refundTotal).toLocaleString()}원
                </div>
              </>
            )}

            {carryovers.length > 0 && (
              <>
                <h2 style={{ fontSize: 15, margin: '24px 0 8px' }}>이월 처리 (금액 이동 없음 · 참고)</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>성명</th>
                      <th style={thStyle}>이월내역</th>
                      <th style={thStyle}>이월금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carryovers.map(r => (
                      <tr key={r.paymentId}>
                        <td style={tdCenter}>{r.memberName}</td>
                        <td style={tdStyle}>{r.courseName}({r.year}.{String(r.month).padStart(2, '0')}.)</td>
                        <td style={tdRight}>{r.amount.toLocaleString()}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd',
  background: 'white', cursor: 'pointer', fontSize: 14, color: '#555',
};
const thStyle: React.CSSProperties = {
  border: '1px solid #000', padding: '6px 8px', background: '#eee',
};
const tdStyle: React.CSSProperties = {
  border: '1px solid #000', padding: '6px 8px',
};
const tdCenter: React.CSSProperties = { ...tdStyle, textAlign: 'center' };
const tdRight: React.CSSProperties = { ...tdStyle, textAlign: 'right' };
