import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/auth';
import TopBar from '@/components/TopBar';

export default async function Home() {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect('/login?error=no_access');
  }

  return (
    <div>
      <TopBar staffName={staff.name || '직원'} staffEmail={staff.email} staffRole={staff.role} />

      <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>홈</h1>
        <p style={{ color: '#666', marginBottom: 30, fontSize: 14 }}>
          {staff.name || staff.email}님, 환영합니다 👋
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}>
          <MenuCard
            href="/members"
            title="회원 관리"
            description="회원 등록 및 목록 조회"
            icon="👥"
          />
          {staff.role === 'admin' && (
            <MenuCard
              href="/staff"
              title="직원 명단 관리"
              description="시스템 접근 직원 관리"
              icon="🔐"
              adminOnly
            />
          )}
        </div>

        <div style={{
          marginTop: 40,
          padding: 16,
          background: '#FFF8E1',
          border: '1px solid #FFE082',
          borderRadius: 8,
          fontSize: 13,
          color: '#5D4037',
        }}>
          <strong>💡 안내</strong><br />
          이 시스템은 등록된 직원만 사용할 수 있습니다. 다른 분께 알려주시려면 직원 명단에 등록해주세요.
        </div>
      </div>
    </div>
  );
}

function MenuCard({
  href,
  title,
  description,
  icon,
  adminOnly,
}: {
  href: string;
  title: string;
  description: string;
  icon: string;
  adminOnly?: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        cursor: 'pointer',
        transition: 'transform 0.15s',
      }}>
        <div style={{ fontSize: 32 }}>{icon}</div>
        <p style={{ fontSize: 15, fontWeight: 500, margin: '8px 0 4px' }}>
          {title}
          {adminOnly && (
            <span style={{
              marginLeft: 6,
              fontSize: 10,
              padding: '2px 6px',
              background: '#185FA5',
              color: 'white',
              borderRadius: 4,
            }}>관리자</span>
          )}
        </p>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{description}</p>
      </div>
    </Link>
  );
}
