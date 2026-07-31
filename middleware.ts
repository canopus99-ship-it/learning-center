import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicPath = path === '/login' || path.startsWith('/auth');

  // 로그인 안 한 상태에서 보호된 페이지 접근 시도 → 로그인 페이지로
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 로그인했는데 로그인 페이지 접근 시도 → 홈으로
  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // manifest.webmanifest·sw.js·icons/*는 태블릿 홈 화면 설치(PWA)에 쓰이는 공개 정적 파일이라
  // 로그인 여부와 상관없이 항상 그대로 응답해야 함. 이 목록에서 빠져 있으면 로그인 페이지로
  // 리다이렉트되어 버려서(= HTML 응답), 크롬이 유효한 매니페스트로 인식하지 못하고
  // "앱으로 설치" 대신 그냥 브라우저 탭으로 여는 바로가기만 만들어준다.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)'],
};
