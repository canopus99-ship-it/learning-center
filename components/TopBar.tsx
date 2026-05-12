'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function TopBar({
  staffName,
  staffEmail,
  staffRole,
}: {
  staffName: string;
  staffEmail: string;
  staffRole: string;
}) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div style={{
      background: 'white',
      borderBottom: '1px solid #eee',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
        <strong style={{ fontSize: 15 }}>평생학습센터 회원관리</strong>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 13, color: '#666' }}>
          {staffName} <span style={{ fontSize: 11, color: '#aaa' }}>({staffEmail})</span>
          {staffRole === 'admin' && (
            <span style={{
              marginLeft: 8,
              fontSize: 10,
              padding: '2px 6px',
              background: '#185FA5',
              color: 'white',
              borderRadius: 4,
            }}>관리자</span>
          )}
        </span>
        <button
          onClick={handleLogout}
          style={{
            padding: '6px 12px',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
