import type { Metadata } from 'next';
import CoursesSearchClient from './CoursesSearchClient';

// 로그인 없이 누구나 볼 수 있는 공개 강좌 검색 페이지.
// middleware.ts에서 이 경로를 로그인 필수 대상에서 제외해뒀습니다.
export const metadata: Metadata = {
  title: '늘품학습센터 강좌 검색',
  description: '중림종합사회복지관 늘품학습센터 강좌 기본정보를 검색합니다.',
};

export default function CoursesSearchPage() {
  return <CoursesSearchClient />;
}
