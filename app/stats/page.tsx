import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import TopBar from '@/components/TopBar';

export default async function StatsHomePage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login?error=no_access');

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />
      <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
        <Link href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← 홈으로</Link>
        <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 8 }}>📊 통계</h1>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
          기간을 선택하여 회원·강좌 현황을 조회하고 엑셀로 다운로드할 수 있습니다.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}>
          <MenuCard
            href="/stats/courses"
            title="강좌 현황"
            description="월별 강의 횟수·신규·실인원·연인원 통계"
            icon="📚"
          />
          <MenuCard
            href="/stats/members"
            title="회원 통계"
            description="신규 가입·성별·연령대·중구민·감면 분포"
            icon="👥"
          />
        </div>

        <div style={{
          marginTop: 40, padding: 16,
          background: '#FFF8E1', border: '1px solid #FFE082',
          borderRadius: 8, fontSize: 13, color: '#5D4037',
        }}>
          <strong>💡 안내</strong><br />
          수납 및 강사비 통계는 회계 시스템에서 관리됩니다.
        </div>
      </div>
    </div>
  );
}

function MenuCard({ href, title, description, icon }: { href: string; title: string; description: string; icon: string; }) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer',
      }}>
        <div style={{ fontSize: 32 }}>{icon}</div>
        <p style={{ fontSize: 15, fontWeight: 500, margin: '8px 0 4px' }}>{title}</p>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{description}</p>
      </div>
    </Link>
  );
}
