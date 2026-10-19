// 오프라인 지원. 앱 전체가 파일 몇 개뿐이라 설치 시점에 통째로 캐시한다.
// 앱을 수정하면 CACHE 이름의 숫자를 반드시 올려야 새 버전이 반영된다.
const CACHE = 'bvq-v17';
const ASSETS = [
  './',
  './index.html',
  './data/toddler.js',
  './data/child.js',
  './data/elem.js',
  './data/mid.js',
  './data/high.js',
  './data/univ.js',
  './data/work.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // 자산 하나가 실패해도 설치는 진행
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // 현재 버전의 캐시만 본다. caches.match(요청)은 옛 버전 캐시까지 뒤져서, 업데이트 직후 옛 데이터를 줄 수 있다.
    caches.open(CACHE).then(c => c.match(e.request)).then(hit => {
      if (hit) {
        // 데이터 파일은 용량이 커서 매번 다시 받지 않는다(CACHE 버전을 올리면 갱신됨)
        if (e.request.url.includes('/data/')) return hit;
        // 캐시를 먼저 주고, 뒤에서 조용히 최신본을 받아 둔다
        fetch(e.request).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(e.request).catch(() => caches.open(CACHE).then(c => c.match('./index.html')));
    })
  );
});
