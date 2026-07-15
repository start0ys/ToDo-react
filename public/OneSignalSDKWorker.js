// OneSignal 웹푸시 워커 (v16) — 루트(/OneSignalSDKWorker.js)에 위치해야 함.
// OneSignal이 기본으로 이 경로/파일명을 찾으므로 여기 둔다.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// --- 앱 오프라인 캐시 (기존 sw.js에서 이관) ---
// 푸시/알림클릭 핸들러는 OneSignal SDK가 처리하므로 여기서는 캐시만 담당한다.
const CACHE = 'todo-calendar-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/favicon.ico'])));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
  }
});
