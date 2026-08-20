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

  // 홈 화면에 설치해서 쓰는 경우, 화면을 그냥 닫았다가 다시 열면 예전에 열어둔 화면이
  // 그대로 남아있어서 프로그램 수정사항이나 새로 등록한 회원이 바로 안 보일 수 있음.
  // 이 버튼은 서비스워커·캐시를 전부 지우고 서버에서 완전히 새로 불러오도록 강제함
  // (일반적인 "새로고침"보다 확실하게 초기화됨).
  async function handleHardRefresh() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.error('새로고침 준비 중 오류(무시하고 계속 진행):', e);
    } finally {
      // location.reload() 대신 쿼리스트링을 붙여 주소를 바꿔서, 브라우저가
      // 캐시된 페이지를 재사용하지 않고 반드시 서버에 새로 요청하도록 함.
      window.location.href = window.location.pathname + '?_refresh=' + Date.now();
    }
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
          onClick={handleHardRefresh}
          title="화면이 이상하거나, 프로그램 수정사항·새로 등록한 회원이 안 보일 때 눌러주세요"
          style={{
            padding: '6px 12px',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          🔄 새로고침
        </button>
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
