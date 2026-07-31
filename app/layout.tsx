import type { Metadata, Viewport } from 'next';
import RegisterSW from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: '평생학습센터 회원관리',
  description: '회원 관리 시스템',
  // 태블릿 "홈 화면에 추가"(설치) 시 사용되는 이름/아이콘 설정
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '늘품학습센터',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#185FA5',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body style={{
        margin: 0,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: '#f5f5f5',
        minHeight: '100vh',
      }}>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
