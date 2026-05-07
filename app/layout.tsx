export const metadata = {
  title: '평생학습센터 회원관리',
  description: '회원 관리 시스템',
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
        {children}
      </body>
    </html>
  );
}
