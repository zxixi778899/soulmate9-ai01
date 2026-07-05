// SoulMate Service Worker - Plan Z v9: DISABLED cache (always network)
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  // Pass through everything - no cache interception
});
