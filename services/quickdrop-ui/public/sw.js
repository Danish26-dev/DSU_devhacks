/* QuickDrop — minimal PWA service worker (app shell only).
 * API calls to the KLAIM backend are never cached: verification stays live. */
const CACHE = "quickdrop-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Never cache cross-origin (the KLAIM API) or non-GET traffic.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => { caches.open(CACHE).then((c) => c.put("/index.html", res.clone())).catch(() => {}); return res; })
        .catch(() => caches.match("/index.html").then((c) => c ?? fetch(request))),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((res) => {
      caches.open(CACHE).then((c) => c.put(request, res.clone())).catch(() => {});
      return res;
    }).catch(() => caches.match("/index.html"))),
  );
});
