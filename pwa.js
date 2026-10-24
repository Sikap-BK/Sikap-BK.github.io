/* ============================================================================
   pwa.js — template skill "pwa-installable"
   1. Mendaftarkan service worker (sw.js di folder yang sama dengan halaman)
   2. Banner "Versi baru tersedia → Muat ulang" saat aplikasi diperbarui
   3. Tombol Instal: elemen ber-atribut data-pwa-install (otomatis tampil/sembunyi)
      + petunjuk khusus iPhone/iPad ("Bagikan → Tambahkan ke Layar Utama")
   API kecil:  window.PWA.install()  ·  window.PWA.canInstall  ·  window.PWA.isInstalled
               window.PWA.checkUpdate()   ·  event 'pwa:installable', 'pwa:installed', 'pwa:update'
   Muat dengan: <script src="pwa.js" defer></script>   (tanpa dependensi)
   ========================================================================== */
(function () {
  'use strict';
  var TEXT = {
    update: 'Versi baru SIKAP BK tersedia',
    reload: 'Muat ulang',
    later: 'Nanti',
    iosTitle: 'Pasang di iPhone / iPad',
    iosStep1: 'Ketuk tombol <b>Bagikan</b> <span aria-hidden="true">⬆︎</span> di bawah layar Safari',
    iosStep2: 'Pilih <b>Tambahkan ke Layar Utama</b>',
    iosStep3: 'Ketuk <b>Tambah</b> di kanan atas',
    iosNotSafari: 'Buka halaman ini di <b>Safari</b> terlebih dahulu, lalu ikuti langkah di atas.',
    close: 'Mengerti',
    installed: 'Aplikasi berhasil dipasang'
  };
  var SW_URL = 'sw.js';
  var CHECK_EVERY_MS = 30 * 60 * 1000;             // cek versi baru tiap 30 menit selama aplikasi terbuka

  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line/.test(ua);
  var standalone = function () { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; };
  var deferred = null, reg = null, reloading = false;

  var PWA = window.PWA = {
    get canInstall() { return !!deferred || (isIOS && !standalone()); },
    get isInstalled() { return standalone(); },
    install: function () {
      if (deferred) {
        var d = deferred; deferred = null; paintButtons();
        d.prompt();
        return d.userChoice.then(function (r) { return r && r.outcome === 'accepted'; });
      }
      if (isIOS && !standalone()) { iosSheet(); return Promise.resolve(false); }
      return Promise.resolve(false);
    },
    checkUpdate: function () { return reg ? reg.update().catch(function () {}) : Promise.resolve(); }
  };

  /* ------------------------------------------------------------ gaya kecil */
  function css() {
    if (document.getElementById('pwa-css')) return;
    var s = document.createElement('style'); s.id = 'pwa-css';
    s.textContent =
      '.pwa-bar{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;display:flex;gap:10px;align-items:center;' +
      'background:#1c1917;color:#fff;padding:10px 10px 10px 16px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:600 14px/1.3 system-ui,sans-serif;max-width:calc(100vw - 24px)}' +
      '.pwa-bar button{font:inherit;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}.pwa-bar .go{background:var(--pwa-accent,#F26B1D);color:#fff}.pwa-bar .no{background:transparent;color:#d6d3d1}' +
      '.pwa-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483001;display:flex;align-items:flex-end;justify-content:center}' +
      '.pwa-sheet{background:#fff;color:#1c1917;width:100%;max-width:440px;border-radius:20px 20px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom));font:15px/1.5 system-ui,sans-serif}' +
      '.pwa-sheet h3{margin:0 0 12px;font-size:17px}.pwa-sheet ol{margin:0 0 14px;padding-left:20px}.pwa-sheet li{margin:6px 0}.pwa-sheet p{margin:0 0 14px;color:#a16207;background:#fef6e0;padding:10px 12px;border-radius:10px;font-size:14px}' +
      '.pwa-sheet button{width:100%;font:700 15px system-ui,sans-serif;border:0;border-radius:12px;padding:12px;background:var(--pwa-accent,#F26B1D);color:#fff;cursor:pointer}';
    document.head.appendChild(s);
  }
  function accent() { var m = document.querySelector('meta[name="theme-color"]'); if (m) document.documentElement.style.setProperty('--pwa-accent', m.content); }

  /* ------------------------------------------------------- tombol Instal */
  function paintButtons() {
    var show = PWA.canInstall;
    var els = document.querySelectorAll('[data-pwa-install]');
    for (var i = 0; i < els.length; i++) {
      els[i].hidden = !show;
      if (!els[i]._pwa) { els[i]._pwa = true; els[i].addEventListener('click', function (e) { e.preventDefault(); PWA.install(); }); }
    }
  }
  function iosSheet() {
    css();
    var ov = document.createElement('div'); ov.className = 'pwa-ov';
    ov.innerHTML = '<div class="pwa-sheet" role="dialog" aria-modal="true"><h3>' + TEXT.iosTitle + '</h3><ol><li>' + TEXT.iosStep1 + '</li><li>' + TEXT.iosStep2 + '</li><li>' + TEXT.iosStep3 + '</li></ol>' +
      (isSafari ? '' : '<p>' + TEXT.iosNotSafari + '</p>') + '<button type="button">' + TEXT.close + '</button></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.tagName === 'BUTTON') ov.remove(); });
    document.body.appendChild(ov);
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();                       // simpan; tampilkan lewat tombol aplikasi sendiri
    deferred = e; paintButtons();
    window.dispatchEvent(new Event('pwa:installable'));
  });
  window.addEventListener('appinstalled', function () {
    deferred = null; paintButtons();
    window.dispatchEvent(new Event('pwa:installed'));
  });

  /* ------------------------------------------------------- banner update */
  function updateBar(worker) {
    css();
    if (document.querySelector('.pwa-bar')) return;
    var bar = document.createElement('div'); bar.className = 'pwa-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>' + TEXT.update + '</span><button class="go" type="button">' + TEXT.reload + '</button><button class="no" type="button">' + TEXT.later + '</button>';
    bar.querySelector('.go').onclick = function () { bar.remove(); worker.postMessage('SKIP_WAITING'); };
    bar.querySelector('.no').onclick = function () { bar.remove(); };
    document.body.appendChild(bar);
    window.dispatchEvent(new CustomEvent('pwa:update', { detail: { apply: function () { worker.postMessage('SKIP_WAITING'); } } }));
  }
  function watch(r) {
    if (r.waiting && navigator.serviceWorker.controller) updateBar(r.waiting);
    r.addEventListener('updatefound', function () {
      var w = r.installing; if (!w) return;
      w.addEventListener('statechange', function () {
        if (w.state === 'installed' && navigator.serviceWorker.controller) updateBar(w);   // ada versi lama → ini update
      });
    });
  }

  function start() {
    accent(); paintButtons();
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) { console.warn('[PWA] butuh HTTPS'); return; }
    navigator.serviceWorker.register(SW_URL).then(function (r) {
      reg = r; watch(r);
      setInterval(function () { r.update().catch(function () {}); }, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') r.update().catch(function () {}); });
    }).catch(function (err) { console.warn('[PWA] gagal mendaftarkan service worker:', err); });
    var hadController = !!navigator.serviceWorker.controller;            // kunjungan pertama → jangan muat ulang
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }
      if (reloading) return; reloading = true;
      // SIKAP BK: tunggu bila masih ada data yang sedang disimpan ke server
      (function muatUlang() {
        if (window.AppState && AppState.antrianSync > 0) return setTimeout(muatUlang, 500);
        location.reload();
      })();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
