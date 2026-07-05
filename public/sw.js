/* eslint-disable */
/**
 * SoulMate Service Worker v2
 *
 * 策略：
 * 1. /api/* 完全不缓存（私密数据）
 * 2. 静态资源（_next/static, /icon-*, /manifest）走 stale-while-revalidate
 * 3. HTML 走 network-first（确保用户拿到最新版本）
 * 4. 图片走 cache-first（提升回访体验）
 * 5. 主动消息 / Sentry 上报直接跳过
 */

const VERSION = 'v8';
const STATIC_CACHE = `soulmate-static-${VERSION}`;
const IMAGE_CACHE = `soulmate-images-${VERSION}`;
const RUNTIME_CACHE = `soulmate-runtime-${VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => ![STATIC_CACHE, IMAGE_CACHE, RUNTIME_CACHE].includes(name))
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 完全跳过：API、私密路径、上报
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/data/') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.includes('/chat/') && url.pathname !== '/' ||
    url.host !== self.location.host
  ) {
    return;
  }

  // 静态资源（_next/static/* 因为是 hash filename，永不变 — 不缓存，直接 network）
  // 其他静态资源走 stale-while-revalidate
  if (url.pathname.startsWith('/_next/static/')) {
    // hash filename 永远不变：放行，让浏览器 HTTP cache + ETag 处理
    return;
  }
  if (url.pathname.match(/\.(js|css|woff2?|ttf)$/)) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  // 图片：cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg|gif|avif)$/) || url.pathname.includes('/storage/')) {
    event.respondWith(cacheFirst(req, IMAGE_CACHE));
    return;
  }

  // HTML：network-first
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
    return;
  }

  // 默认：stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
});

// 缓存策略实现
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return cached || new Response('', { status: 504 });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response('Offline', { status: 503 });
  }
}

// 处理 push（Web Push 接入预埋）
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    event.waitUntil(
      self.registration.showNotification(payload.title || 'SoulMate', {
        body: payload.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: payload.data,
        tag: payload.tag,
      })
    );
  } catch {}
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});