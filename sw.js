/* ============================================================================
   Service Worker — template skill "pwa-installable"
   • App shell cache-first  → aplikasi terbuka instan & tetap tampil saat offline
   • API / POST tidak pernah di-cache → data selalu langsung ke server
   • Update berversi       → naikkan VERSION (pakai scripts/bump_version.py)
   Letakkan file ini di ROOT aplikasi (satu folder dengan index.html).
   ========================================================================== */
const VERSION = 'sikap-bk-v3.10.1';            // ← NAIKKAN setiap kali file frontend berubah
const SPA = true;                        // true = 1 halaman (routing #), false = banyak halaman .html
const OFFLINE_PAGE = 'offline.html';     // cadangan bila halaman belum pernah di-cache

// Semua file yang dibutuhkan agar aplikasi tampil pertama kali (path RELATIF, persis seperti di HTML).
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'offline.html',
  'pwa.js?v=3.10.1',
  'css/style.css?v=3.10.1',
  'js/config.js?v=3.10.1',
  'js/api.js?v=3.10.1',
  'js/app.js?v=3.10.1',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

// Domain API/data yang TIDAK BOLEH di-cache (selalu langsung ke jaringan).
const API_HOSTS = [
  /(^|\.)script\.google\.com$/,
  /(^|\.)script\.googleusercontent\.com$/,
  // SIKAP BK: foto bukti & dokumen di Google Drive selalu diambil langsung
  /(^|\.)drive\.google\.com$/,
  /(^|\.)docs\.google\.com$/
];
// Path di domain sendiri yang juga selalu ke jaringan (mis. '/api/', 'data.json').
const NETWORK_ONLY_PATHS = [/\/api\//];

// Pustaka & font dari CDN → disimpan, diperbarui di latar (stale-while-revalidate).
const CDN_HOSTS = /fonts\.(googleapis|gstatic)\.com$|cdnjs\.cloudflare\.com$|cdn\.jsdelivr\.net$|unpkg\.com$/;

const RUNTIME = VERSION + '-rt';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // cache: 'reload' → lewati cache HTTP agar benar-benar mengambil versi terbaru
    await Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch((err) => console.warn('[SW] gagal cache', u, err))));
  })());
  // Tidak langsung skipWaiting: pwa.js menampilkan banner "Versi baru tersedia" dulu.
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                                         // POST/PUT tidak pernah di-cache
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (API_HOSTS.some((re) => re.test(url.hostname))) return;                 // API → langsung ke server
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && NETWORK_ONLY_PATHS.some((re) => re.test(url.pathname))) return;

  // 1) Navigasi halaman → tampil instan dari cache, diperbarui di latar
  if (req.mode === 'navigate') {
    e.respondWith(handleNavigate(req, url));
    return;
  }
  // 2) File aplikasi sendiri → cache-first
  if (sameOrigin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); }
      return res;
    })));
    return;
  }
  // 3) CDN (font, library) → stale-while-revalidate
  if (CDN_HOSTS.test(url.hostname)) {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // lainnya → biarkan browser menangani
});

async function handleNavigate(req, url) {
  const c = await caches.open(VERSION);
  // Kunci cache = path halaman relatif terhadap scope, tanpa ?query.
  //   /            → index.html        /toko.html → toko.html        /a/  → a/index.html
  //   SPA: path tanpa .html (mis. /produk/12) → index.html (routing di sisi aplikasi)
  let key = url.href.split(/[?#]/)[0].slice(self.registration.scope.length);
  if (key === '' || key.endsWith('/')) key += 'index.html';
  if (SPA && !/\.html?$/.test(key)) key = 'index.html';
  const hit = (await c.match(key)) || (await c.match(req, { ignoreSearch: true }));
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') c.put(key, res.clone());
    return res;
  }).catch(async () => hit || (await c.match(OFFLINE_PAGE)) || Response.error());
  return hit || net;
}
