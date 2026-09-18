/* KLAIM Identity — minimal service worker.
 *
 * Offline support is for the APPLICATION SHELL only. Verification operations
 * are network-dependent and are never cached: any /api/ request bypasses the
 * cache entirely so consent/verification always hits the live KLAIM API.
 */
const CACHE = "klaim-shell-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/klaim-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() =>
      self.clients.claim(),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API or cross-origin/non-GET traffic — verification stays live.
  if (request.method !== "GET" || url.pathname.startsWith("/api/") || url.origin !== self.location.origin) {
    return;
  }

  // Navigations (HTML documents): NETWORK-FIRST so routing changes are never
  // served stale. Fall back to the cached shell only when offline. This avoids
  // the SW pinning an old client-side route (e.g. an outdated "/" redirect).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html").then((c) => c ?? fetch(request))),
    );
    return;
  }

  // Static same-origin assets: cache-first (fast, offline-capable).
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match("/index.html")),
    ),
  );
});
