import type { MetadataRoute } from 'next';

// 태블릿 바탕화면에 "설치"했을 때 사용되는 앱 정보
// (Chrome/Android: 홈 화면에 추가 → 아이콘·이름·전체화면 여부 등을 여기서 결정)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '늘품학습센터 회원관리',
    short_name: '늘품학습센터',
    description: '늘품학습센터 회원·수납·출석 관리 시스템',
    start_url: '/members',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f5f5',
    theme_color: '#185FA5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
