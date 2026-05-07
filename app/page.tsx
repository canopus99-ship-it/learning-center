import Link from 'next/link';

export default function Home() {
  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: 20 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>평생학습센터 회원관리</h1>
      <p style={{ color: '#666', marginBottom: 30 }}>1단계: 회원 등록 기능</p>

      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: 30,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>메뉴</h2>
        <Link href="/members" style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#185FA5',
          color: 'white',
          borderRadius: 8,
          textDecoration: 'none',
          fontSize: 14,
        }}>
          회원 관리로 이동 →
        </Link>
      </div>
    </div>
  );
}
