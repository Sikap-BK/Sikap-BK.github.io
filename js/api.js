/**
 * api.js — penyambung antara aplikasi dan Google Apps Script
 * SIKAP BK — frontend GitHub Pages
 *
 * ══════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════
 *
 * Aplikasi ini semula berjalan DI DALAM Google Apps Script, dan memanggil
 * server lewat `google.script.run` — jembatan bawaan Google yang hanya ada
 * di dalam halaman buatan Apps Script sendiri. Di GitHub Pages jembatan itu
 * tidak ada.
 *
 * Berkas ini menyediakan penggantinya: sebuah `google.script.run` tiruan
 * yang bentuk pemakaiannya SAMA PERSIS, tetapi di baliknya memakai fetch()
 * biasa ke alamat /exec.
 *
 * Ini keputusan yang disengaja. Logika aplikasi di app.js berjumlah lebih
 * dari 6.000 baris dan sudah teruji ratusan pengujian. Membongkar 33 titik
 * panggilannya satu per satu berarti mengutak-atik kode yang sudah terbukti
 * — dan di situlah bug baru biasanya lahir. Dengan penyambung ini, app.js
 * berpindah tanpa diubah sebaris pun.
 *
 * ══════════════════════════════════════════════════════════════════
 * DUA HAL TEKNIS YANG TIDAK BOLEH DIUBAH
 * ══════════════════════════════════════════════════════════════════
 *
 * 1. Content-Type WAJIB 'text/plain'.
 *    Bukan soal selera. Bila memakai 'application/json', peramban akan
 *    mengirim permintaan pendahuluan (preflight OPTIONS) lebih dulu, dan
 *    Apps Script tidak bisa menjawab permintaan semacam itu. Akibatnya
 *    seluruh operasi simpan gagal dengan pesan CORS yang membingungkan,
 *    padahal kodenya benar.
 *
 * 2. redirect: 'follow' harus dibiarkan.
 *    Apps Script selalu mengalihkan permintaan ke alamat googleusercontent
 *    sebelum menjawab. Tanpa mengikuti pengalihan itu, jawabannya tidak
 *    pernah sampai.
 */

/** Argumen tiap aksi — DISALIN dari daftar API_AKSI di Kode.gs.
 *  Urutannya penting: nama-nama inilah yang dipakai server menyusun
 *  panggilan. Bila Kode.gs berubah, daftar ini harus ikut berubah. */
const API_ARGUMEN = {
  doLogin                   : ['kredensial'],
  getDaftarGuruLogin        : [],
  doLogout                  : ['token'],
  catatMasuk                : ['token'],
  refreshData               : ['token'],
  ubahPasswordSendiri       : ['token', 'passwordLama', 'passwordBaru'],
  simpanPoinBatch           : ['token', 'catatan'],
  editRiwayat               : ['token', 'payload'],
  hapusRiwayat              : ['token', 'idRiwayat'],
  simpanTindakLanjut        : ['token', 'payload'],
  hapusTindakLanjut         : ['token', 'idGrup'],
  tuntaskanTindakLanjut     : ['token', 'idGrup'],
  tambahEvaluasi            : ['token', 'payload'],
  hapusEvaluasi             : ['token', 'id'],
  simpanPengaduan           : ['token', 'payload'],
  tambahCatatanPengaduan    : ['token', 'payload'],
  tuntaskanPengaduan        : ['token', 'id'],
  hapusPengaduan            : ['token', 'id'],
  simpanMaster              : ['token', 'namaSheet', 'record'],
  hapusMaster               : ['token', 'namaSheet', 'id'],
  setGuruBK                 : ['token', 'idGuru', 'aktifkan'],
  setKepalaSekolah          : ['token', 'idGuru'],
  importMassal              : ['token', 'jenis', 'baris'],
  getTemplateImport         : ['jenis'],
  simpanKonfigurasi         : ['token', 'perubahan'],
  unggahBerkas              : ['token', 'kategori', 'base64', 'namaFile', 'mime'],
  ujiNotifikasiEmail        : ['token', 'tujuan'],
  buatLaporanPDF            : ['token', 'opsi'],
  buatLaporanPendampinganPDF: ['token', 'opsi'],
  buatSuratPDF              : ['token', 'opsi'],
  // v3.2 — kelola siswa sekaligus (Admin)
  naikKelasMassal           : ['token', 'payload'],
  resetPoinMassal           : ['token', 'payload'],
  hapusSiswaMassal          : ['token', 'payload']
};


/** Aksi yang boleh lewat GET — sisanya wajib POST (lihat Kode.gs) */
const API_BACA = ['doLogin', 'getDaftarGuruLogin', 'refreshData'];

/**
 * Kirim satu permintaan ke server.
 * @return {Promise<object>} jawaban { success, data, message }
 */
/**
 * Aksi BACA yang aman diulang otomatis bila sambungan terputus (v3.3).
 *
 * "Failed to fetch" berarti peramban tidak menerima jawaban yang boleh dibaca —
 * biasanya gangguan sesaat di sisi Google, terutama pada pekerjaan berat
 * seperti membuat PDF. Mengulang sekali hampir selalu berhasil.
 *
 * Isinya: membaca data, login, dan membuat dokumen (paling buruk: satu salinan
 * PDF tambahan di folder Drive — yang diunduh tetap satu).
 */
const API_ULANG_AMAN = ['doLogin', 'getDaftarGuruLogin', 'refreshData', 'cekPasang', 'getTemplateImport',
                        'buatLaporanPDF', 'buatLaporanPendampinganPDF', 'buatSuratPDF'];
// Jeda sebelum tiap percobaan ulang. Beberapa menit setelah "Versi baru"
// diterapkan, server Google kadang menjawab 404 atau putus sesaat.
const JEDA_ULANG_MS       = [1500, 3500];
// Aksi TULIS diberi waktu lebih panjang: permintaan pertama mungkin masih
// dikerjakan server ketika sambungannya putus, dan jawabannya ditunggu.
const JEDA_ULANG_TULIS_MS = [1500, 3000, 5000, 8000];
// Server menjawab "masih diproses" = permintaannya PASTI sudah diterima dan
// sedang dikerjakan (mis. 30 siswa + foto + e-mail). Jangan menyerah: tanyakan
// lagi tiap 5 detik, sampai batas waktu eksekusi Apps Script (6 menit).
const JEDA_TANYA_PROSES_MS = 5000;
const BATAS_TANYA_PROSES_MS = 6 * 60 * 1000;
// Batas menunggu satu permintaan. Tanpa ini, sambungan yang "menggantung"
// (mis. Wi-Fi berpindah) membuat aplikasi menunggu selamanya. Aksi tulis boleh
// dihentikan lebih cepat — mengulangnya aman berkat kunci sekali-jalan.
const BATAS_TUNGGU_TULIS_MS = 60 * 1000;
const BATAS_TUNGGU_BACA_MS  = 150 * 1000;

/**
 * AKSI TULIS DAN "KUNCI SEKALI-JALAN" (v3.5)
 *
 * Aksi yang menyimpan, mengubah, atau menghapus data dulu tidak pernah diulang:
 * bila sambungan putus sesudah permintaan terkirim, server mungkin SUDAH
 * menyimpannya, dan mengulang berarti catatan poin ganda.
 *
 * Sekarang setiap permintaan tulis membawa kunci acak. Server (Kode.gs ≥ 3.5)
 * mengingat kunci itu selama 10 menit beserta jawabannya. Bila permintaan yang
 * sama datang lagi, server TIDAK menjalankannya ulang — ia hanya mengirim
 * jawaban yang tadi. Maka mengulang menjadi aman: paling buruk, jawaban yang
 * sama diterima dua kali.
 *
 * Pengulangan aksi tulis baru dinyalakan setelah server terbukti mengenal kunci
 * ini (jawabannya bertanda `idem`). Dengan begitu, frontend baru yang tanpa
 * sengaja dipasang di atas Kode.gs lama tidak menggandakan data.
 */
let API_IDEM_SERVER = false;

function buatKunciIdem() {
  let acak = '';
  try {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    acak = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  } catch (e) {
    acak = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  return Date.now().toString(36) + '-' + acak;
}

/** Galat jaringan dari fetch() — bukan jawaban galat dari aplikasi */
function galatJaringan(e) {
  return e instanceof TypeError ||
         /Failed to fetch|NetworkError|Load failed|network/i.test(String(e && e.message));
}

/** Galat sesaat yang layak dicoba lagi */
function galatSesaat(e) { return galatJaringan(e) || (e && e.bolehUlang === true); }

async function kirimSekali(aksi, muatan, batasMs) {
  let res;
  const henti = typeof AbortController === 'function' ? new AbortController() : null;
  const pewaktu = henti && batasMs ? setTimeout(function () { henti.abort(); }, batasMs) : null;
  try {
    if (API_BACA.indexOf(aksi) !== -1 && aksi !== 'doLogin') {
      const q = Object.keys(muatan)
        .filter(function (k) { return muatan[k] !== undefined; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(muatan[k]); })
        .join('&');
      res = await fetch(GAS_URL + '?' + q, { method: 'GET', redirect: 'follow', signal: henti ? henti.signal : undefined });
    } else {
      res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // lihat catatan di atas
        body: JSON.stringify(muatan),
        redirect: 'follow',
        signal: henti ? henti.signal : undefined
      });
    }
  } catch (e) {
    if (pewaktu) clearTimeout(pewaktu);
    if (e && e.name === 'AbortError') {
      const g = new Error('Server terlalu lama menjawab.');
      g.bolehUlang = true; g.takPasti = true;      // permintaannya mungkin sedang dikerjakan
      throw g;
    }
    throw e;
  }

  // Apps Script menjalankan skrip DULU, baru mengalihkan (302) ke alamat
  // googleusercontent untuk mengambil jawabannya. Jadi bila pengalihan sudah
  // terjadi, skripnya sudah berjalan — galat sesudah titik itu berarti
  // "jawaban hilang", bukan "tidak diproses".
  const sudahDijalankan = res.redirected === true;

  if (!res.ok) {
    const g = new Error(res.status === 404 && !sudahDijalankan
      ? 'Server belum dapat dijangkau (404). Bila aplikasi baru saja diperbarui, tunggu 1–2 menit lalu coba lagi.'
      : 'Server menjawab ' + res.status);
    // 404 sesudah pembaruan & 5xx = gangguan sesaat di Google
    g.bolehUlang = res.status >= 500 || res.status === 404;
    g.takPasti = sudahDijalankan;
    throw g;
  }

  let teks;
  try { teks = await res.text(); }
  catch (e) {
    const g = new Error(e && e.name === 'AbortError' ? 'Server terlalu lama menjawab.' : 'Jawaban server terputus di tengah jalan.');
    g.bolehUlang = true; g.takPasti = true;
    throw g;
  } finally { if (pewaktu) clearTimeout(pewaktu); }
  let hasil;
  try {
    hasil = JSON.parse(teks);
  } catch (e) {
    // Jawaban bukan JSON biasanya berarti halaman galat Google — misalnya
    // setelan akses salah, alamat /exec sudah tidak berlaku, atau gangguan sesaat.
    const g = new Error('Jawaban server tidak terbaca. Periksa GAS_URL di js/config.js ' +
                        'dan pastikan setelan aksesnya "Anyone".');
    g.bolehUlang = true;
    g.takPasti = sudahDijalankan;
    throw g;
  }
  if (hasil && hasil.idem) API_IDEM_SERVER = true;
  if (hasil && hasil.sedangProses) {
    // Permintaan yang sama (kunci sama) masih dikerjakan server — tunggu lalu tanyakan lagi
    const g = new Error('Server masih mengerjakan permintaan sebelumnya.');
    g.bolehUlang = true;
    g.takPasti = true;
    g.sedangProses = true;
    throw g;
  }
  return hasil;
}

async function apiKirim(aksi, args) {
  // Sekolah tidak dikenal → berhenti di sini, jangan menembak alamat kosong.
  // Tanpa ini, fetch('') menghasilkan galat jaringan yang tidak berarti
  // apa-apa bagi guru, dan menutupi pesan sebenarnya yang sudah tampil.
  if (!GAS_URL) {
    throw new Error('Sekolah belum dikenali. Periksa alamat aplikasi Anda.');
  }

  const namaArg = API_ARGUMEN[aksi];
  if (!namaArg) throw new Error('Aksi tidak dikenal di sisi aplikasi: ' + aksi);

  // Argumen posisi dari pemanggil diubah menjadi bernama, sesuai urutan
  // yang diharapkan server.
  const muatan = { action: aksi };
  namaArg.forEach(function (nama, i) { muatan[nama] = args[i]; });

  const tulis = API_ULANG_AMAN.indexOf(aksi) === -1;
  if (tulis) muatan.kunciIdem = buatKunciIdem();      // SAMA untuk setiap percobaan ulang
  const jeda = tulis ? JEDA_ULANG_TULIS_MS : JEDA_ULANG_MS;
  // Unggah berkas (PDF tata tertib s.d. 10 MB) bisa lama di internet sekolah yang lambat
  const batasMs = aksi === 'unggahBerkas' ? 5 * 60 * 1000 : (tulis ? BATAS_TUNGGU_TULIS_MS : BATAS_TUNGGU_BACA_MS);
  const tidur = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };

  let terakhir = null;
  let takPasti = false;              // pernah ada percobaan yang MUNGKIN sudah dijalankan server
  for (let i = 0; i <= jeda.length; i++) {
    if (i > 0) await tidur(jeda[i - 1]);
    try {
      return await kirimSekali(aksi, muatan, batasMs);
    } catch (e) {
      terakhir = e;
      // Galat jaringan pada POST: permintaan bisa saja sudah sampai
      if (galatJaringan(e) || e.takPasti) takPasti = true;
      const bolehUlang = galatSesaat(e) && (!tulis || API_IDEM_SERVER);
      if (!bolehUlang) break;
    }
  }

  // Server terakhir menjawab "masih diproses": permintaannya PASTI diterima.
  // Terus tanyakan dengan kunci yang sama sampai jawabannya jadi.
  const mulaiTanya = Date.now();
  while (tulis && terakhir && terakhir.sedangProses && Date.now() - mulaiTanya < BATAS_TANYA_PROSES_MS) {
    await tidur(JEDA_TANYA_PROSES_MS);
    try {
      return await kirimSekali(aksi, muatan, batasMs);
    } catch (e) {
      // Galat jaringan di sela-sela: tetap anggap masih diproses dan tanyakan lagi
      terakhir = galatSesaat(e) ? Object.assign(e, { sedangProses: true }) : e;
    }
  }

  if (tulis && takPasti) {
    const g = new Error('Sambungan ke server terputus sebelum jawaban diterima, jadi belum pasti apakah data sudah tersimpan. ' +
                        'Muat ulang data (tombol ↻) untuk memeriksanya sebelum mencoba lagi.');
    g.takPasti = true;
    throw g;
  }
  if (galatJaringan(terakhir)) {
    const kali = tulis && !API_IDEM_SERVER ? 1 : jeda.length + 1;
    throw new Error('Tidak dapat terhubung ke server' + (kali > 1 ? ', sudah dicoba ' + kali + ' kali' : '') + '. ' +
                    'Periksa sambungan internet, lalu coba lagi sebentar lagi.');
  }
  throw terakhir;
}

/**
 * Tiruan google.script.run.
 *
 * Dipakai persis seperti aslinya:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .withFailureHandler(fn)
 *     .namaFungsi(arg1, arg2);
 */
function buatPemanggil(onSukses, onGagal) {
  const pemanggil = {
    withSuccessHandler: function (f) { return buatPemanggil(f, onGagal); },
    withFailureHandler: function (f) { return buatPemanggil(onSukses, f); }
  };

  Object.keys(API_ARGUMEN).forEach(function (aksi) {
    pemanggil[aksi] = function () {
      const args = Array.prototype.slice.call(arguments);
      // Dua cabang TERPISAH (bukan .then().catch()): galat di DALAM onSukses
      // tidak boleh dilaporkan sebagai "gagal tersimpan" — datanya sudah
      // tersimpan, dan pembatalan optimistik akan menghapusnya dari layar.
      // Sama seperti google.script.run aslinya.
      apiKirim(aksi, args).then(
        function (hasil) {
          if (!onSukses) return;
          try { onSukses(hasil); } catch (e) { console.error('[SIKAP BK] ' + aksi + ' — galat pada penanganan jawaban:', e); }
        },
        function (err) {
          if (onGagal) onGagal(err);
          else console.error('[SIKAP BK] ' + aksi + ' gagal:', err);
        });
    };
  });

  return pemanggil;
}

// Dipasang sebagai variabel global bernama sama, sehingga app.js yang
// menulis `google.script.run.xxx` berjalan tanpa perubahan apa pun.
window.google = window.google || {};
window.google.script = { run: buatPemanggil(null, null) };
