// 홈 화면 설치("앱처럼 보이기")를 위한 최소 서비스워커.
// 데이터가 자주 바뀌는 관리 프로그램 특성상 화면/데이터를 캐시하지 않고,
// 항상 네트워크에서 최신 내용을 받아오도록 함 (설치 요건 충족용 최소 구현).
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
