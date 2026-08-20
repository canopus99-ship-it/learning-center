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
};

type EnrollmentRow = {
  id: number;
  member_id: number;
  course_level_id: number | null;
  members: { id: number; name: string } | { id: number; name: string }[] | null;
  courses: { name: string } | { name: string }[] | null;
};

type CourseLevelRow = { id: number; level_name: string };

type Line = {
  paymentId: number;
  courseName: string; // 등급이 있으면 "강좌명 - 등급명" 형태로 조합
  year: number;
  month: number;
  amount: number;
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

  const load = useCallback(async () => {
    setLoading(true);

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('id, enrollment_id, payment_year, payment_month, amount, payment_method, is_paid, status_type')
      .eq('paid_at', date);

    // 결제완료 & 환불/이월되지 않은 건만 (환불·이월은 그날의 실제 수입이 아니므로 제외)
    const validPayments = ((paymentsData || []) as (PaymentRow & { is_paid: boolean; status_type: string | null })[])
      .filter((p) => p.is_paid && !p.status_type);

    if (validPayments.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }

    const enrollmentIds = Array.from(new Set(validPayments.map((p) => p.enrollment_id)));
    const { data: enrollmentsData } = await supabase
      .from('enrollments')
      .select('id, member_id, course_level_id, members(id, name), courses(name)')
      .in('id', enrollmentIds);

    const enrMap = new Map<number, EnrollmentRow>();
    ((enrollmentsData || []) as unknown as EnrollmentRow[]).forEach((e) => enrMap.set(e.id, e));

    // 등급(초급/중급/고급 등)이 걸린 수강신청이 있으면 등급명도 함께 조회
    // (피아노교실처럼 강좌 하나에 등급별로 수강료가 다른 경우, 강좌명 란에 "강좌명 - 등급명"으로 표시)
    const levelIds = Array.from(
      new Set(
        ((enrollmentsData || []) as unknown as EnrollmentRow[])
          .map((e) => e.course_level_id)
          .filter((v): v is number => !!v)
      )
    );
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
      const courseObj = unwrap<{ name: string }>(enr.courses);
      if (!memberObj) return;

      const baseCourseName = courseObj?.name || '-';
      const levelName = enr.course_level_id ? levelMap.get(enr.course_level_id) : null;

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
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
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
          disabled={loading || groups.length === 0}
          style={{
            padding: '10px 28px',
            background: (loading || groups.length === 0) ? '#ccc' : '#1D9E75',
            color: 'white', border: 'none', borderRadius: 8,
            cursor: (loading || groups.length === 0) ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600,
            marginBottom: 20,
          }}
        >
          🖨️ 인쇄 / PDF 저장
        </button>

        <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
          {loading ? '불러오는 중...' : groups.length === 0
            ? '이 날짜에 등록된 결제 내역이 없습니다.'
            : `${groups.length}명 · 합계 ${grandTotal.toLocaleString()}원`}
        </div>
      </div>

      {!loading && groups.length > 0 && (
        <div className="print-only" style={{ display: 'none' }}>
          <div style={{ padding: '10px 4px', fontFamily: 'sans-serif', color: '#000', background: 'white' }}>
            <h1 style={{ textAlign: 'center', fontSize: 20, fontWeight: 'bold', margin: '4px 0 24px' }}>
              {dateObj.getFullYear()}년 {dateObj.getMonth() + 1}월 {dateObj.getDate()}일 늘품학습센터 수강료
            </h1>

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
