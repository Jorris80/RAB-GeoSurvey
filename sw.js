/* GeoSurvey Enterprise — Service Worker (GitHub Pages)
 * PERBAIKAN dari versi asli:
 *  - Path relatif (versi lama "/" absolut → gagal di https://USER.github.io/REPO/)
 *  - Shell app (index.html satu-file) di-precache → aplikasi terbuka tanpa sinyal
 *  - Permintaan API ke script.google.com TIDAK pernah di-cache (POST & data dinamis);
 *    antrean offline ditangani aplikasi di IndexedDB
 *  - Thumbnail foto Google Drive di-cache (runtime) agar bukti tetap tampil offline
 *  - Naikkan VERSION setiap kali index.html diperbarui
 */
const VERSION = 'gse-v2.1.0';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const RUNTIME = 'gse-runtime-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return; // API: selalu jaringan

  // Foto Drive: cache-first
  if (url.hostname === 'drive.google.com' && url.pathname.startsWith('/thumbnail')) {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req, { mode: 'no-cors' }); c.put(req, res.clone()); trim(c, 300); return res; }
      catch (err) { return hit || Response.error(); }
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // Navigasi: network-first → fallback index.html dari cache
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(async () => (await caches.match('./index.html', { ignoreSearch: true })) || (await caches.match('./')))
    );
    return;
  }

  // Aset statis: stale-while-revalidate
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
