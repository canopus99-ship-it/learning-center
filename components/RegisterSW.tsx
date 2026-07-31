'use client';

import { useEffect } from 'react';

// 태블릿 홈 화면 설치(PWA)를 위해 서비스워커를 등록만 해두는 컴포넌트.
// 화면에는 아무것도 표시하지 않음.
export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 등록 실패해도 사이트 사용에는 지장 없음 (그냥 홈 화면 설치만 안 될 뿐)
      });
    }
  }, []);
  return null;
}
