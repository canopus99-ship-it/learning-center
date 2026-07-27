'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/payments';
import { formatReceiptNo, todayDateStr, sameIdSet, type ReceiptItem } from '@/lib/receipt';

export default function ReceiptPrintClient({
  member,
  items,
}: {
  member: { id: number; name: string; phone: string | null };
  items: ReceiptItem[];
}) {
  const supabase = createClient();
  const [receiptNo, setReceiptNo] = useState('');
  const [isReissue, setIsReissue] = useState(false);
  const [loading, setLoading] = useState(true);

  const total = items.reduce((s, it) => s + it.amount, 0);

  // 납부일: 전부 같으면 그 날짜, 다르면 최초~최종 범위
  const paidDates = items.map((it) => it.paidAt).filter(Boolean) as string[];
  const uniqueDates = Array.from(new Set(paidDates)).sort();
  const paidDateLabel =
    uniqueDates.length === 0 ? '-' : uniqueDates.length === 1 ? uniqueDates[0] : `${uniqueDates[0]} ~ ${uniqueDates[uniqueDates.length - 1]}`;

  const usedMethods = new Set(items.map((it) => it.method).filter(Boolean) as string[]);

  const today = new Date();
  const issueDateLabel = `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const paymentIds = items.map((it) => it.id);

      // 동일한 결제 항목 조합으로 이미 발급된 영수증이 있는지 확인 → 있으면 번호 재사용 + 재발행 기본 체크
      const { data: existingRows } = await supabase
        .from('receipts')
        .select('receipt_no, payment_ids')
        .eq('member_id', member.id);

      const existing = (existingRows || []).find((r: any) => sameIdSet((r.payment_ids || []) as number[], paymentIds));

      if (existing) {
        if (!cancelled) {
          setReceiptNo(existing.receipt_no);
          setIsReissue(true);
          setLoading(false);
        }
        return;
      }

      // 신규 발급: 오늘 날짜 기준 순번 계산 후 저장
      const dateStr = todayDateStr();
      const { count } = await supabase
        .from('receipts')
        .select('id', { count: 'exact', head: true })
        .eq('issued_date', dateStr);

      const seq = (count || 0) + 1;
      const no = formatReceiptNo(today, seq);

      const { error } = await supabase.from('receipts').insert({
        receipt_no: no,
        issued_date: dateStr,
        member_id: member.id,
        payment_ids: paymentIds,
        total_amount: total,
      });
      if (error) {
        console.error('영수증 저장 실패:', error.message);
      }

      if (!cancelled) {
        setReceiptNo(no);
        setIsReissue(false);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const printStyle = `
    @media print {
      @page { size: A4 portrait; margin: 20mm 18mm; }
      html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
    }
  `;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px' }}>
      <style>{printStyle}</style>

      <div className="no-print">
        <Link href="/payments" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>
          ← 수납관리로
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '12px 0 16px' }}>🧾 수강료 영수증 출력</h1>

        {items.length === 0 ? (
          <p style={{ color: '#A32D2D', fontSize: 13 }}>선택된 항목 중 영수증으로 발행 가능한(정상 결제) 내역이 없습니다.</p>
        ) : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={isReissue} onChange={(e) => setIsReissue(e.target.checked)} />
              재발행 (이미 발급된 영수증을 다시 인쇄하는 경우 체크 · 동일 항목이면 자동으로 체크됩니다)
            </label>

            <button
              onClick={() => window.print()}
              disabled={loading}
              style={{
                padding: '10px 28px',
                background: loading ? '#ccc' : '#1D9E75',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              {loading ? '영수증 번호 발급 중...' : '🖨️ 인쇄 / PDF 저장'}
            </button>

            <p style={{ fontSize: 12, color: '#888' }}>
              수납내역 {items.length}건 · 합계 {total.toLocaleString()}원
            </p>
          </>
        )}
      </div>

      {items.length > 0 && (
        <div style={{ padding: '10px 4px', fontFamily: 'sans-serif', color: '#000', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12, marginBottom: 4 }}>
            <span>
              {loading ? '발급 중...' : receiptNo}
              {!loading && isReissue && <strong style={{ marginLeft: 6, color: '#A32D2D' }}>[재발행]</strong>}
            </span>
          </div>

          <h1 style={{ textAlign: 'center', fontSize: 22, margin: '8px 0 24px' }}>늘품학습센터 수강료 영수증</h1>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
            <tbody>
              <tr>
                <td style={labelCell}>회원명</td>
                <td style={valueCell}>{member.name}</td>
                <td style={labelCell}>연락처</td>
                <td style={valueCell}>{member.phone || '-'}</td>
              </tr>
              <tr>
                <td style={labelCell}>납부일</td>
                <td style={valueCell} colSpan={3}>
                  {paidDateLabel}
                </td>
              </tr>
              <tr>
                <td style={labelCell}>납부방법</td>
                <td style={valueCell} colSpan={3}>
                  {(['cash', 'card', 'transfer', 'zeropay'] as PaymentMethod[]).map((m) => (
                    <span key={m} style={{ marginRight: 16 }}>
                      {usedMethods.has(m) ? '☑' : '☐'} {PAYMENT_METHOD_LABELS[m]}
                    </span>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th style={thStyle}>강좌명</th>
                <th style={thStyle}>납부월</th>
                <th style={thStyle}>금액</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={tdStyle}>{it.courseName}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {it.year}년 {it.month}월
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{it.amount.toLocaleString()}원</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} style={{ ...tdStyle, textAlign: 'center', fontWeight: 'bold', background: '#fafafa' }}>
                  합계
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', background: '#fafafa' }}>{total.toLocaleString()}원</td>
              </tr>
            </tbody>
          </table>

          <div style={{ textAlign: 'right', fontSize: 12, marginBottom: 40 }}>발행일: {issueDateLabel}</div>

          <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>중림종합사회복지관</div>
        </div>
      )}
    </div>
  );
}

const labelCell: React.CSSProperties = { border: '1px solid #ccc', padding: '8px 10px', background: '#f5f5f5', width: 90, fontWeight: 600 };
const valueCell: React.CSSProperties = { border: '1px solid #ccc', padding: '8px 10px' };
const thStyle: React.CSSProperties = { border: '1px solid #ccc', padding: '6px 10px' };
const tdStyle: React.CSSProperties = { border: '1px solid #ccc', padding: '6px 10px' };
