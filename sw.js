// Offline support: cache the app shell, serve it cache-first, refresh in the background.
// Bump VERSION whenever you change any file so phones pick up the new build.
const VERSION = "rl-v5"; // app 3.2
const SHELL = [
  "./", "index.html", "css/app.css", "manifest.webmanifest",
  "js/app.js", "js/calc.js", "js/charts.js", "js/store.js", "js/defaults.js",
  "icons/icon-192.png", "icons/icon-512.png",
  "fonts/bricolage-grotesque-latin-500-normal.woff2", "fonts/bricolage-grotesque-latin-700-normal.woff2",
  "fonts/instrument-sans-latin-400-normal.woff2", "fonts/instrument-sans-latin-500-normal.woff2", "fonts/instrument-sans-latin-600-normal.woff2",
  "fonts/ibm-plex-mono-latin-400-normal.woff2", "fonts/ibm-plex-mono-latin-500-normal.woff2"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || fresh;
  }));
});
