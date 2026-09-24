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
 * Aksi yang AMAN diulang otomatis bila sambungan terputus (v3.3).
 *
 * "Failed to fetch" berarti peramban tidak menerima jawaban yang boleh dibaca —
 * biasanya gangguan sesaat di sisi Google, terutama pada pekerjaan berat
 * seperti membuat PDF. Mengulang sekali hampir selalu berhasil.
 *
 * Yang diulang hanya aksi yang tidak berbahaya bila ternyata terjadi dua kali:
 * membaca data, login, dan membuat dokumen (paling buruk: satu salinan PDF
 * tambahan di folder Drive). Aksi yang MENYIMPAN, MENGUBAH, atau MENGHAPUS
 * data sengaja TIDAK diulang — bisa saja permintaan pertama sebenarnya sudah
 * sampai dan tersimpan, dan mengulangnya berarti catatan poin ganda.
 */
const API_ULANG_AMAN = ['doLogin', 'getDaftarGuruLogin', 'refreshData', 'cekPasang', 'getTemplateImport',
                        'buatLaporanPDF', 'buatLaporanPendampinganPDF', 'buatSuratPDF'];
const JEDA_ULANG_MS = 1500;

/** Galat jaringan dari fetch() — bukan jawaban galat dari aplikasi */
function galatJaringan(e) {
  return e instanceof TypeError ||
         /Failed to fetch|NetworkError|Load failed|network/i.test(String(e && e.message));
}

async function kirimSekali(aksi, muatan) {
  let res;
  if (API_BACA.indexOf(aksi) !== -1 && aksi !== 'doLogin') {
    const q = Object.keys(muatan)
      .filter(function (k) { return muatan[k] !== undefined; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(muatan[k]); })
      .join('&');
    res = await fetch(GAS_URL + '?' + q, { method: 'GET', redirect: 'follow' });
  } else {
    res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // lihat catatan di atas
      body: JSON.stringify(muatan),
      redirect: 'follow'
    });
  }

  if (!res.ok) {
    const g = new Error('Server menjawab ' + res.status);
    g.bolehUlang = res.status >= 500;          // 5xx = gangguan sesaat di Google
    throw g;
  }

  const teks = await res.text();
  try {
    return JSON.parse(teks);
  } catch (e) {
    // Jawaban bukan JSON biasanya berarti halaman galat Google — misalnya
    // setelan akses salah, alamat /exec sudah tidak berlaku, atau gangguan sesaat.
    const g = new Error('Jawaban server tidak terbaca. Periksa GAS_URL di js/config.js ' +
                        'dan pastikan setelan aksesnya "Anyone".');
    g.bolehUlang = true;
    throw g;
  }
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

  const amanDiulang = API_ULANG_AMAN.indexOf(aksi) !== -1;
  try {
    return await kirimSekali(aksi, muatan);
  } catch (e) {
    const sementara = galatJaringan(e) || e.bolehUlang === true;
    if (amanDiulang && sementara) {
      await new Promise(function (ok) { setTimeout(ok, JEDA_ULANG_MS); });
      try {
        return await kirimSekali(aksi, muatan);
      } catch (e2) {
        if (galatJaringan(e2)) {
          throw new Error('Tidak dapat terhubung ke server, sudah dicoba dua kali. ' +
                          'Periksa sambungan internet, lalu coba lagi sebentar lagi.');
        }
        throw e2;
      }
    }
    if (galatJaringan(e)) {
      // Aksi yang menyimpan data: permintaan mungkin SUDAH sampai sebelum terputus
      throw new Error('Sambungan ke server terputus sebelum jawaban diterima. ' +
                      'Periksa dulu apakah data sudah tersimpan (muat ulang halaman) sebelum mencoba lagi.');
    }
    throw e;
  }
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
      apiKirim(aksi, args)
        .then(function (hasil) { if (onSukses) onSukses(hasil); })
        .catch(function (err)  {
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
