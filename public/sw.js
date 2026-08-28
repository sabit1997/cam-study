/**
 * 서비스 워커.
 *
 * ## 예전 구현의 문제
 * 모든 GET 을 network-first 로 처리했다. 그런데 install 에서 캐시한 것은 "/" 하나뿐이라
 * 두 가지가 동시에 일어났다.
 *
 * - 해시가 박힌 불변 자산(/assets/index-XXX.js)까지 매번 네트워크를 쳤다. 재방문에서
 *   얻는 것이 없으면서 SW 를 거치는 비용만 얹혔다.
 * - 오프라인에서는 index.html 만 나오고 JS·CSS 는 503 이 났다. 즉 껍데기만 뜨고 앱은
 *   동작하지 않았다 — 오프라인 지원이라고 부를 수 없는 상태였다.
 *
 * ## 지금
 * 경로에 따라 전략을 나눈다.
 *
 * - /assets/**  cache-first. 파일명에 콘텐츠 해시가 들어 있어 내용이 바뀌면 URL 이
 *               바뀐다. 그래서 캐시된 응답이 낡을 수 없다. 재방문은 네트워크 왕복 0.
 * - 그 외       network-first. index.html 은 새 배포의 자산 해시를 담고 있으므로 항상
 *               최신을 시도해야 한다. 실패하면 캐시로 떨어지고, 내비게이션이면 "/" 를
 *               껍데기로 준다(SPA 라 모든 경로가 같은 문서다).
 * - /api/**     건드리지 않는다. 인증·타이머 기록을 캐시하면 틀린 값을 보여준다.
 *
 * ## 캐시가 무한정 자라지 않게
 * 배포할 때마다 새 해시의 자산이 쌓인다. Cache API 는 삽입 순서로 keys() 를 주므로
 * 상한을 넘으면 앞에서부터 지운다(FIFO). 정확한 LRU 가 아니어도 되는 이유는 낡은
 * 항목을 지우는 것이 목적이지 적중률을 최적화하는 것이 아니기 때문이다.
 */

const SHELL_CACHE = "cam-study-shell-v2";
const ASSET_CACHE = "cam-study-assets-v2";
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];

/** 배포 3~4회분의 자산. 넘으면 오래된 것부터 버린다. */
const MAX_ASSET_ENTRIES = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !CURRENT_CACHES.includes(k)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // 부분 응답(206)이나 오류를 캐시하면 다음 방문이 깨진다.
  if (response.ok && response.status === 200) {
    await cache.put(request, response.clone());
    // 응답은 즉시 돌려주고 정리는 뒤에서 한다.
    void trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES);
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // SPA 는 모든 경로가 같은 문서다. 캐시에 그 경로가 없어도 "/" 로 띄울 수 있다.
    if (request.mode === "navigate") {
      const shell = await cache.match("/");
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // 다른 오리진(YouTube 임베드 등)은 브라우저에 맡긴다.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
