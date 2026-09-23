/* app.js — SIKAP BK
   Logika aplikasi, DISALIN APA ADANYA dari JavaScript.html.
   Tidak ada satu baris pun yang diubah: panggilan google.script.run
   tetap seperti semula, dan js/api.js yang menyediakan penggantinya. */

/* ============================================================================
   SIKAP BK — Frontend (JavaScript.html)

   Arsitektur Instant UX:
   • Seluruh data dimuat SEKALI saat login (bootstrap) ke window.AppState
   • Navigasi antar halaman murni client-side → 0 ms, tanpa google.script.run
   • Aksi tulis memakai Optimistic UI: tampilan berubah dulu, server menyusul
   • URL tidak pernah berubah → aman di dalam iframe Blogger
   ============================================================================ */

// ════════════════════════════════════════════════════════════════════
// BAGIAN 1: STATE APLIKASI
// ════════════════════════════════════════════════════════════════════

const AppState = {
  token       : null,
  profil      : null,
  konfigurasi : {},
  siswa       : [],
  guru        : [],
  pelanggaran : [],
  kebaikan    : [],
  riwayat     : [],
  kelas       : [],
  tindakLanjut : [],
  evaluasi     : [],
  // Pengaduan & konseling — sudah disaring server sesuai hak baca pengguna ini
  pengaduan        : [],
  catatanPengaduan : [],
  bolehPengaduan   : false,
  jalurTL          : 'disiplin',   // tab aktif: 'disiplin' | 'pengaduan'
  formPengaduan    : { id: null, nisn: '', cari: '', kelas: 'SEMUA', siswaLingkup: [] },
  kopSusunan   : [],
  kopGeser     : null,
  kopDigeser   : '',
  // Bukti foto yang sedang diubah pada form Edit Catatan Poin
  fotoRiwayat  : { asal: '', baru: null, hapus: false },
  formTL       : { idGrup: null, nisnUtama: '', nisnTerpilih: [], cari: '' },
  formSurat    : { idGrup: null, nisnTerpilih: [], tanggal: '', kelompok: false, perwakilan: '' },
  kepalaSekolah: { nama: '', nuptk: '' },
  guruBKSekolah: { nama: '', nuptk: '' },
  halamanAktif: 'dashboard',
  peranLogin  : 'admin',
  grafik      : {},          // instance Chart.js aktif
  antrianSync : 0,           // jumlah operasi yang sedang disinkronkan
  filter      : { siswa: '', riwayat: '', kelasDipilih: 'SEMUA', zonaDipilih: 'SEMUA' },
  // Pengaturan halaman Cetak Laporan; bulan = array (kosong berarti seluruh bulan)
  laporan     : {
    mode: 'kelas', kelas: 'SEMUA', kelasSiswa: 'SEMUA',
    nisnTerpilih: [], cari: '', bulan: [], tahun: new Date().getFullYear()
  },
  // nisnTerpilih = array, memungkinkan satu catatan untuk banyak siswa sekaligus
  draftPoin   : { jenis: 'Pelanggaran', nisnTerpilih: [], idJenis: '', foto: null, cari: '', kelasCari: 'SEMUA' },
  detailNisn  : null
};

/** Jenis nomor identitas guru yang lazim dipakai sekolah di Indonesia */
const JENIS_NOMOR = [
  { kode: 'NIP',   contoh: '196805142019031004', ket: 'Nomor Induk Pegawai — untuk guru berstatus ASN/PNS/PPPK.' },
  { kode: 'NUPTK', contoh: '2234567890123456',   ket: 'Nomor Unik Pendidik dan Tenaga Kependidikan dari Kemendikbud.' },
  { kode: 'NIY',   contoh: '198203102021081',    ket: 'Nomor Induk Yayasan — untuk guru tetap yayasan.' },
  { kode: 'NIK',   contoh: '6403011203850001',   ket: 'Nomor Induk Kependudukan — dipakai bila ketiganya belum ada.' }
];

function labelNomorJS(jenis) {
  const j = String(jenis || '').trim().toUpperCase();
  return ['NIP', 'NUPTK', 'NIY', 'NIK'].indexOf(j) !== -1 ? j : 'NUPTK';
}

const SHEET = {
  SISWA: 'Sheet_Siswa',
  GURU: 'Sheet_Guru',
  PELANGGARAN: 'Sheet_JenisPelanggaran',
  KEBAIKAN: 'Sheet_JenisKebaikan'
};

// ════════════════════════════════════════════════════════════════════
// BAGIAN 2: INISIALISASI
// ════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {
  terapkanTemaTersimpan();

  // Tutup daftar hasil pencarian siswa saat pengguna mengklik di luar blok pemilih.
  // Cakupannya SELURUH blok (kolom cari + filter kelas + tombol Semua/Tambahkan),
  // bukan kotak carinya saja — kalau tidak, menekan "Tambahkan" justru menutup
  // kembali daftar yang baru saja dibuka oleh tombol itu sendiri.
  document.addEventListener('click', function (ev) {
    const blok = document.getElementById('blokPilihSiswa');
    const hasil = document.getElementById('hasilCariSiswa');
    if (hasil && blok && !blok.contains(ev.target)) hasil.innerHTML = '';
  });

  // Muat daftar guru + identitas sekolah untuk halaman login (satu panggilan)
  google.script.run
    .withSuccessHandler(function (res) {
      if (res && res.success) {
        isiDropdownGuru(res.data.guru);
        const el = document.getElementById('namaSekolahLogin');
        el.textContent = res.data.namaSekolah + (res.data.tahunAjaran ? ' • TA ' + res.data.tahunAjaran : '');
        if (res.data.logoUrl) {
          document.getElementById('logoLogin').innerHTML = imgDrive(res.data.logoUrl, 'Logo sekolah');
        }
      } else {
        tampilGalatLogin(res && res.message ? res.message :
          'Database belum siap. Jalankan setupAppEnvironment() di editor Apps Script.');
      }
      tampilkanLayarLogin();
    })
    .withFailureHandler(function (err) {
      tampilGalatLogin('Gagal terhubung ke server: ' + err.message);
      tampilkanLayarLogin();
    })
    .getDaftarGuruLogin();
});

function tampilkanLayarLogin() {
  const ov = document.getElementById('overlayMuat');
  ov.style.opacity = '0';
  setTimeout(function () { ov.style.display = 'none'; }, 300);
  document.getElementById('layarLogin').style.display = 'flex';
}

function isiDropdownGuru(daftar) {
  const sel = document.getElementById('guruPilih');
  if (!daftar || !daftar.length) {
    sel.innerHTML = '<option value="">Belum ada data guru</option>';
    return;
  }
  sel.innerHTML = '<option value="">— Pilih nama Anda —</option>' +
    daftar.map(function (g) {
      return '<option value="' + g.id + '">' + escHtml(g.nama) + ' — ' + escHtml(g.jabatan) + '</option>';
    }).join('');
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 3: TEMA GELAP / TERANG
// ════════════════════════════════════════════════════════════════════

function terapkanTemaTersimpan() {
  let tema = 'light';
  try { tema = localStorage.getItem('sikap_tema') || 'light'; } catch (e) {}
  document.documentElement.setAttribute('data-theme', tema);
  perbaruiIkonTema(tema);
}

function gantiTema() {
  const sekarang = document.documentElement.getAttribute('data-theme');
  const baru = sekarang === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', baru);
  try { localStorage.setItem('sikap_tema', baru); } catch (e) {}
  perbaruiIkonTema(baru);
  perbaruiTemaGrafik();
}

function perbaruiIkonTema(tema) {
  const gelap = tema === 'dark';
  const set = function (id, kelas) { const el = document.getElementById(id); if (el) el.className = kelas; };
  set('ikonTema', gelap ? 'bi bi-sun' : 'bi bi-moon-stars');
  set('ikonTemaLogin', gelap ? 'bi bi-sun' : 'bi bi-moon-stars');
  set('saklarIkon', gelap ? 'bi bi-toggle-on' : 'bi bi-toggle-off');
  const lbl = document.getElementById('labelTema');
  if (lbl) lbl.textContent = gelap ? 'Mode Terang' : 'Mode Gelap';
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 4: LOGIN & LOGOUT
// ════════════════════════════════════════════════════════════════════

function pilihPeran(peran) {
  AppState.peranLogin = peran;
  document.querySelectorAll('.tab-peran button').forEach(function (b) {
    b.classList.toggle('aktif', b.dataset.peran === peran);
  });
  document.getElementById('kolomAdmin').style.display = peran === 'admin' ? '' : 'none';
  document.getElementById('kolomGuru').style.display  = peran === 'guru'  ? '' : 'none';
  document.getElementById('kolomSiswa').style.display = peran === 'siswa' ? '' : 'none';
  document.getElementById('galatLogin').style.display = 'none';
}

function tampilGalatLogin(pesan) {
  document.getElementById('pesanGalatLogin').textContent = pesan;
  document.getElementById('galatLogin').style.display = 'flex';
}

function tanganiLogin(ev) {
  ev.preventDefault();
  const peran = AppState.peranLogin;
  let username = '', password = '';

  if (peran === 'admin') {
    username = document.getElementById('adminUser').value.trim();
    password = document.getElementById('adminPass').value;
  } else if (peran === 'guru') {
    username = document.getElementById('guruPilih').value;
    password = document.getElementById('guruPass').value;
    if (!username) return tampilGalatLogin('Pilih nama Anda terlebih dahulu.');
  } else {
    username = document.getElementById('siswaNisn').value.trim();
    password = document.getElementById('siswaTgl').value.trim();
    if (password && password.replace(/\D/g, '').length !== 8) {
      return tampilGalatLogin('Tanggal lahir harus lengkap dengan format dd-mm-yyyy, contoh 17-05-2011.');
    }
  }

  if (!username || !password) return tampilGalatLogin('Lengkapi seluruh kolom login.');

  const btn = document.getElementById('tombolLogin');
  const asli = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-inline"></span> Memverifikasi…';
  btn.disabled = true;
  document.getElementById('galatLogin').style.display = 'none';
  bukaSambutan();

  google.script.run
    .withSuccessHandler(function (res) {
      btn.innerHTML = asli; btn.disabled = false;
      if (!res.success) { tutupSambutan(); return tampilGalatLogin(res.message); }

      // Simpan token di memori JavaScript — TIDAK PERNAH di URL
      AppState.token  = res.data.token;
      AppState.profil = res.data.profil;
      terapkanBootstrap(res.data.bootstrap);

      document.getElementById('layarLogin').style.display = 'none';
      document.getElementById('layarAplikasi').style.display = 'block';

      siapkanAplikasi();
      tutupSambutan();
      toast('Selamat datang', res.message, 'sukses');

      // Catat "berhasil masuk" SESUDAH layar terbuka (v2.18). Sebelumnya baris
      // log ini ditulis di server sebelum data diambil, sehingga pengguna ikut
      // menunggu operasi tulis yang tidak ada hubungannya dengan layarnya.
      catatMasukDiamDiam();
    })
    .withFailureHandler(function (err) {
      btn.innerHTML = asli; btn.disabled = false;
      tutupSambutan();
      tampilGalatLogin('Gagal terhubung: ' + err.message);
    })
    .doLogin({ peran: peran, username: username, password: password });
}

/**
 * Tampilkan layar sambutan — tetapi hanya bila penantiannya memang terasa.
 *
 * Jeda 250 ms membuat login yang kebetulan cepat tidak menampilkan kedipan
 * layar yang justru mengganggu. Begitu jawaban server datang, tutupSambutan()
 * membatalkan jeda ini, jadi overlay tidak pernah menambah waktu tunggu.
 */
let _jedaSambut = null;
function bukaSambutan() {
  const el = document.getElementById('overlaySambut');
  if (!el) return;
  clearTimeout(_jedaSambut);
  _jedaSambut = setTimeout(function () {
    el.classList.add('tampil');
    el.setAttribute('aria-hidden', 'false');
  }, 250);
}

function tutupSambutan() {
  const el = document.getElementById('overlaySambut');
  clearTimeout(_jedaSambut);          // batalkan bila belum sempat muncul
  if (!el) return;
  el.classList.remove('tampil');
  el.setAttribute('aria-hidden', 'true');
}

/**
 * Catat log masuk tanpa ditunggu siapa pun.
 *
 * Tidak ada penanganan hasil: berhasil atau tidak, layar pengguna sudah
 * terbuka dan tidak boleh terganggu. Isinya diambil server dari sesi, bukan
 * dari sini — aplikasi hanya menyerahkan token.
 */
function catatMasukDiamDiam() {
  try {
    google.script.run
      .withFailureHandler(function () { /* log gagal — bukan urusan pengguna */ })
      .catatMasuk(AppState.token);
  } catch (e) { /* diabaikan dengan sengaja */ }
}

function terapkanBootstrap(b) {
  AppState.konfigurasi  = b.konfigurasi || {};
  AppState.siswa        = b.siswa || [];
  AppState.guru         = b.guru || [];
  AppState.pelanggaran  = b.pelanggaran || [];
  AppState.kebaikan     = b.kebaikan || [];
  AppState.riwayat      = b.riwayat || [];
  AppState.kelas        = b.kelas || [];
  AppState.kepalaSekolah= b.kepalaSekolah || { nama: '', nuptk: '' };
  AppState.guruBKSekolah= b.guruBKSekolah || { nama: '', nuptk: '' };
  AppState.tindakLanjut = b.tindakLanjut || [];
  AppState.evaluasi     = b.evaluasi || [];
  AppState.pengaduan        = b.pengaduan || [];
  AppState.catatanPengaduan = b.catatanPengaduan || [];
  AppState.bolehPengaduan   = !!b.bolehPengaduan;
}

function siapkanAplikasi() {
  const p = AppState.profil;
  document.getElementById('namaPengguna').textContent = p.nama;
  document.getElementById('peranPengguna').textContent = p.labelPeran;
  document.getElementById('avatarPengguna').textContent = inisial(p.nama);
  document.getElementById('sekolahSidebar').textContent = AppState.konfigurasi.namaSekolah || 'Portal Sekolah';
  if (AppState.konfigurasi.logoUrl) {
    document.getElementById('logoSidebar').innerHTML = imgDrive(AppState.konfigurasi.logoUrl, 'Logo sekolah');
  }

  // Ubah password hanya untuk akun guru (admin lewat Pengaturan, siswa pakai tanggal lahir)
  const tblPass = document.getElementById('tombolUbahPassword');
  if (tblPass) tblPass.style.display = p.peran === 'guru' ? '' : 'none';

  renderMenu();

  // Pulihkan preferensi tampilan dari kunjungan sebelumnya (lihat BAGIAN 5b).
  // Halaman hanya dipulihkan bila peran ini memang berhak membukanya.
  const pref = muatPreferensi();
  if (pref.kelasDipilih) AppState.filter.kelasDipilih = pref.kelasDipilih;
  if (pref.zonaDipilih)  AppState.filter.zonaDipilih  = pref.zonaDipilih;

  let awal = p.peran === 'siswa' ? 'portalSiswa' : 'dashboard';
  if (p.peran !== 'siswa' && pref.halaman) {
    const boleh = definisiMenu().filter(function (m) { return m.id; })
                                .map(function (m) { return m.id; });
    if (boleh.indexOf(pref.halaman) !== -1) awal = pref.halaman;
  }
  navigateTo(awal);
}

/** Formulir ubah password untuk akun guru sendiri */
function bukaUbahPassword() {
  tutupSidebar();
  bukaModalForm('Ubah Password Saya',
    '<div class="kotak-info mb-3"><i class="bi bi-person-badge"></i><div>' +
      '<b>' + escHtml(AppState.profil.nama) + '</b><br>' +
      '<span style="font-size:12px">' + escHtml(AppState.profil.labelPeran) + '</span></div></div>' +

    '<div class="mb-3">' +
      '<label class="form-label" for="pwLama">Password Saat Ini <span class="wajib">*</span></label>' +
      '<div class="input-group">' +
        '<input type="password" class="form-control" id="pwLama" autocomplete="current-password">' +
        '<button class="btn btn-hantu" type="button" onclick="lihatSandi(\'pwLama\',this)" ' +
          'title="Tampilkan"><i class="bi bi-eye"></i></button>' +
      '</div>' +
    '</div>' +

    '<div class="mb-3">' +
      '<label class="form-label" for="pwBaru">Password Baru <span class="wajib">*</span></label>' +
      '<div class="input-group">' +
        '<input type="password" class="form-control" id="pwBaru" autocomplete="new-password" ' +
          'oninput="nilaiKekuatanSandi()">' +
        '<button class="btn btn-hantu" type="button" onclick="lihatSandi(\'pwBaru\',this)" ' +
          'title="Tampilkan"><i class="bi bi-eye"></i></button>' +
      '</div>' +
      '<div id="kekuatanSandi" class="form-text">Minimal 6 karakter.</div>' +
    '</div>' +

    '<div class="mb-3">' +
      '<label class="form-label" for="pwUlang">Ulangi Password Baru <span class="wajib">*</span></label>' +
      '<input type="password" class="form-control" id="pwUlang" autocomplete="new-password">' +
    '</div>' +

    '<div class="kotak-info peringatan"><i class="bi bi-shield-lock"></i><div>' +
      'Password tersimpan sebagai teks biasa di database sekolah dan dapat dibaca Administrator. ' +
      'Karena itu, <b>jangan memakai password yang sama dengan email atau rekening pribadi Anda</b>.' +
    '</div></div>',

    function (modal) {
      const lama  = document.getElementById('pwLama').value;
      const baru  = document.getElementById('pwBaru').value;
      const ulang = document.getElementById('pwUlang').value;

      if (!lama || !baru || !ulang) return toast('Belum lengkap', 'Isi seluruh kolom terlebih dahulu.', 'peringatan');
      if (baru.length < 6)  return toast('Terlalu pendek', 'Password baru minimal 6 karakter.', 'peringatan');
      if (baru === lama)    return toast('Password sama', 'Password baru harus berbeda dari yang lama.', 'peringatan');
      if (baru !== ulang)   return toast('Tidak cocok', 'Ulangi password baru dengan benar.', 'peringatan');

      const btn = document.getElementById('tombolSimpanModal');
      const asli = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-inline"></span> Menyimpan…';
      btn.disabled = true;

      google.script.run
        .withSuccessHandler(function (res) {
          btn.innerHTML = asli; btn.disabled = false;
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          modal.hide();
          toast('Berhasil', res.message, 'sukses');
        })
        .withFailureHandler(function (err) {
          btn.innerHTML = asli; btn.disabled = false;
          toast('Error', err.message, 'bahaya');
        })
        .ubahPasswordSendiri(AppState.token, lama, baru);
    }, 'Simpan Password');
}

/** Tampilkan / sembunyikan isi kolom sandi */
function lihatSandi(id, tombol) {
  const inp = document.getElementById(id);
  if (!inp) return;
  const tampil = inp.type === 'password';
  inp.type = tampil ? 'text' : 'password';
  tombol.innerHTML = '<i class="bi bi-eye' + (tampil ? '-slash' : '') + '"></i>';
  tombol.title = tampil ? 'Sembunyikan' : 'Tampilkan';
}

/** Petunjuk kekuatan sandi sederhana — membantu tanpa memaksa */
function nilaiKekuatanSandi() {
  const el = document.getElementById('kekuatanSandi');
  const v = document.getElementById('pwBaru').value;
  if (!el) return;

  if (!v)           { el.textContent = 'Minimal 6 karakter.'; el.style.color = ''; return; }
  if (v.length < 6) { el.textContent = 'Kurang ' + (6 - v.length) + ' karakter lagi.'; el.style.color = 'var(--merah-tx)'; return; }

  let skor = 0;
  if (v.length >= 10)   skor++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) skor++;
  if (/\d/.test(v))     skor++;
  if (/[^A-Za-z0-9]/.test(v)) skor++;

  const label = ['Cukup — sebaiknya tambah angka atau huruf besar', 'Lumayan', 'Kuat', 'Sangat kuat', 'Sangat kuat'][skor];
  el.textContent = label;
  el.style.color = skor <= 0 ? 'var(--kuning-tx)' : 'var(--hijau-tx)';
}

function tanganiLogout() {
  konfirmasi('Keluar Aplikasi', 'Anda yakin ingin keluar dari SIKAP BK?', function () {
    const token = AppState.token;
    // Bersihkan state lokal lebih dulu (tidak menunggu server)
    AppState.token = null; AppState.profil = null;
    Object.keys(AppState.grafik).forEach(function (k) {
      try { AppState.grafik[k].destroy(); } catch (e) {}
    });
    AppState.grafik = {};

    // Bersihkan data siswa dari memori — SIKAP BK banyak dipakai di komputer
    // bersama, jangan tinggalkan data kelas lain untuk pengguna berikutnya
    AppState.siswa = []; AppState.guru = []; AppState.riwayat = [];
    AppState.tindakLanjut = []; AppState.evaluasi = []; AppState.kelas = [];
    AppState.pelanggaran = []; AppState.kebaikan = [];
    lupakanPreferensi();

    document.getElementById('layarAplikasi').style.display = 'none';
    document.getElementById('layarLogin').style.display = 'flex';
    document.getElementById('formLogin').reset();
    google.script.run.doLogout(token); // fire & forget
  }, 'Ya, Keluar');
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 5: MENU DINAMIS PER PERAN (RBAC)
// ════════════════════════════════════════════════════════════════════

// ── Pemeriksaan hak akses di sisi tampilan ────────────────────────────
// Catatan: ini hanya mengatur APA YANG TAMPIL. Pembatasan sesungguhnya
// tetap diberlakukan server (Kode.gs) pada setiap permintaan.

function isAdmin()  { return AppState.profil.peran === 'admin'; }
function isSiswa()  { return AppState.profil.peran === 'siswa'; }
function isKepsek() { return AppState.profil.kepalaSekolah === true; }
function isGuruBK() { return AppState.profil.guruBK === true; }
function isWali()   { return !!(AppState.profil.waliKelas && String(AppState.profil.waliKelas).trim()); }

/** Admin, Kepala Sekolah, dan Guru BK menjangkau seluruh sekolah */
function punyaLingkupPenuh() { return isAdmin() || isKepsek() || isGuruBK(); }

/** Guru tanpa jabatan tambahan — menu dibatasi pada tugas hariannya saja */
function isGuruBiasa() {
  return AppState.profil.peran === 'guru' && !isKepsek() && !isGuruBK() && !isWali();
}

/** Tampilannya hanya satu kelas (wali kelas murni) → filter kelas tidak diperlukan */
function lingkupSatuKelas() {
  return AppState.profil.peran === 'guru' && !punyaLingkupPenuh() && isWali();
}

/** Boleh menambah / mengubah / menghapus data siswa — khusus Admin */
function bolehKelolaSiswa() { return isAdmin(); }

/** Boleh mengubah / menghapus riwayat poin */
/** Menu Tindak Lanjut terlihat oleh Admin, Kepsek, Guru BK, dan Wali Kelas */
function bolehLihatTindakLanjut() {
  return isAdmin() || isKepsek() || isGuruBK() || isWali();
}

/** Hanya Guru BK dan Admin yang boleh mengisi/mengubah/menghapus & mencetak surat */
function bolehAksiTindakLanjut() { return isAdmin() || isGuruBK(); }

/** Penanda sesi pembinaan yang dibuat manual, di luar deteksi otomatis (v2.15) */
const PEMICU_MANUAL = 'Tindak lanjut manual — di luar deteksi otomatis';

/** Apakah catatan riwayat ini dibuat oleh pengguna yang sedang login? */
function catatanMilikSaya(r) {
  if (!r) return false;
  const id = String(r.IDGuru || '').trim();
  if (id) return id === String(AppState.profil.id);
  // Catatan lama (sebelum kolom IDGuru ada) dicocokkan lewat nama pencatat
  return String(r.GuruPencatat || '').trim() === String(AppState.profil.nama).trim();
}

/**
 * Wewenang mengubah/menghapus SATU catatan riwayat.
 * Admin dan Guru BK boleh atas semua catatan; guru lain hanya catatannya sendiri.
 */
function bolehKelolaRiwayat(r) {
  if (isSiswa()) return false;
  if (isAdmin() || isGuruBK()) return true;
  return catatanMilikSaya(r);
}

function definisiMenu() {
  // ── SISWA ──
  if (isSiswa()) {
    return [
      { seksi: 'Portal Saya' },
      { id: 'portalSiswa', ikon: 'bi-person-vcard', label: 'Kartu Karakter' },
      { id: 'tataTertib',  ikon: 'bi-journal-text', label: 'Buku Tata Tertib' }
    ];
  }

  // ── GURU BIASA: hanya tugas harian ──
  if (isGuruBiasa()) {
    return [
      { seksi: 'Utama' },
      { id: 'dashboard',  ikon: 'bi-grid-1x2',      label: 'Dashboard' },
      { id: 'inputPoin',  ikon: 'bi-plus-circle',   label: 'Input Poin' },
      { id: 'riwayat',    ikon: 'bi-clock-history', label: 'Riwayat Poin Saya' },
      { id: 'tataTertib', ikon: 'bi-journal-text',  label: 'Tata Tertib' }
    ];
  }

  // ── ADMIN / KEPALA SEKOLAH / GURU BK / WALI KELAS ──
  const menu = [{ seksi: 'Utama' }, { id: 'dashboard', ikon: 'bi-grid-1x2', label: 'Dashboard' }];

  menu.push({ seksi: 'Operasional' });
  menu.push({ id: 'inputPoin', ikon: 'bi-plus-circle', label: 'Input Poin' });
  menu.push({ id: 'dataSiswa', ikon: 'bi-people',
              label: lingkupSatuKelas() ? 'Siswa Kelas Saya' : 'Data Siswa' });
  menu.push({ id: 'riwayat',    ikon: 'bi-clock-history', label: 'Riwayat Poin' });
  menu.push({ id: 'tataTertib', ikon: 'bi-journal-text',  label: 'Tata Tertib' });

  if (bolehLihatTindakLanjut()) {
    const perlu = kasusPerluTindakLanjut().filter(function (k) { return k.perluSesiBaru; }).length;
    menu.push({ id: 'tindakLanjut', ikon: 'bi-clipboard2-pulse', label: 'Tindak Lanjut',
                lencana: perlu || 0 });
  }

  menu.push({ seksi: 'Pelaporan' });
  menu.push({ id: 'laporan', ikon: 'bi-printer', label: 'Cetak Laporan' });

  // Jenis Poin: Admin, Kepala Sekolah, dan Guru BK
  if (isAdmin() || isKepsek() || isGuruBK()) {
    menu.push({ seksi: 'Master Data' });
    menu.push({ id: 'jenisPoin', ikon: 'bi-list-check', label: 'Jenis Poin' });
    // Data Guru: Admin & Kepala Sekolah saja — Guru BK tidak melihat menu ini
    if (isAdmin() || isKepsek()) {
      menu.push({ id: 'dataGuru', ikon: 'bi-person-badge', label: 'Data Guru' });
    }
  }

  // Pengaturan: Admin saja
  if (isAdmin()) {
    menu.push({ seksi: 'Sistem' });
    menu.push({ id: 'pengaturan', ikon: 'bi-gear', label: 'Pengaturan' });
  }

  return menu;
}

function renderMenu() {
  const merah = AppState.siswa.filter(function (s) { return zonaDari(s.PoinSaatIni) === 'Merah'; }).length;
  document.getElementById('menuSidebar').innerHTML = definisiMenu().map(function (m) {
    if (m.seksi) return '<li class="seksi">' + escHtml(m.seksi) + '</li>';
    let lencana = '';
    if (m.id === 'dataSiswa' && merah > 0) lencana = '<span class="lencana">' + merah + '</span>';
    if (m.lencana) lencana = '<span class="lencana">' + m.lencana + '</span>';
    return '<li><a href="javascript:void(0)" data-halaman="' + m.id + '" onclick="navigateTo(\'' + m.id + '\')">' +
      '<i class="bi ' + m.ikon + '"></i><span>' + escHtml(m.label) + '</span>' + lencana + '</a></li>';
  }).join('');
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 6: ROUTER SPA — 0 ms, tanpa URL, tanpa google.script.run
// ════════════════════════════════════════════════════════════════════

const JUDUL = {
  dashboard  : ['Dashboard', 'Portal SIKAP BK'],
  inputPoin  : ['Input Catatan Poin Siswa', 'Portal SIKAP BK / Operasional'],
  dataSiswa  : ['Data Peserta Didik', 'Portal SIKAP BK / Operasional'],
  dataGuru   : ['Data Guru & Tenaga Pendidik', 'Portal SIKAP BK / Master Data'],
  jenisPoin  : ['Jenis Pelanggaran & Kebaikan', 'Portal SIKAP BK / Master Data'],
  tataTertib : ['Buku Tata Tertib Sekolah', 'Portal SIKAP BK / Referensi'],
  riwayat    : ['Riwayat Catatan Poin', 'Portal SIKAP BK / Operasional'],
  tindakLanjut: ['Tindak Lanjut & Pembinaan Siswa', 'Portal SIKAP BK / Bimbingan Konseling'],
  laporan    : ['Cetak & Unduh Laporan Karakter', 'Portal SIKAP BK / Pusat Pelaporan'],
  portalSiswa: ['Kartu Karakter Saya', 'Portal SIKAP BK / Siswa'],
  pengaturan : ['Pengaturan Aplikasi', 'Portal SIKAP BK / Sistem'],
  detailSiswa: ['Detail Karakter Siswa', 'Portal SIKAP BK / Data Siswa']
};

function navigateTo(halaman) {
  if (!JUDUL[halaman]) return;

  document.querySelectorAll('.content-section').forEach(function (s) { s.classList.remove('active'); });
  const target = document.getElementById('section-' + halaman);
  if (target) target.classList.add('active');

  document.querySelectorAll('.sidebar-nav a').forEach(function (a) {
    a.classList.toggle('aktif', a.dataset.halaman === halaman);
  });

  document.getElementById('judulTopbar').textContent = JUDUL[halaman][0];
  document.getElementById('remahHalaman').textContent = JUDUL[halaman][1];
  AppState.halamanAktif = halaman;
  // detailSiswa butuh siswa terpilih, jadi tidak layak dipulihkan saat login
  if (halaman !== 'detailSiswa') simpanPreferensi({ halaman: halaman });
  tutupSidebar();
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Render dari data lokal — tidak ada panggilan server
  render(halaman);
}

function render(halaman) {
  const fn = {
    dashboard  : renderDashboard,
    inputPoin  : renderInputPoin,
    dataSiswa  : renderDataSiswa,
    dataGuru   : renderDataGuru,
    jenisPoin  : renderJenisPoin,
    tataTertib : renderTataTertib,
    riwayat    : renderRiwayat,
    tindakLanjut: renderTindakLanjut,
    laporan    : renderLaporan,
    portalSiswa: renderPortalSiswa,
    pengaturan : renderPengaturan,
    detailSiswa: renderDetailSiswa
  }[halaman];
  if (fn) fn();
}

/** Render ulang halaman yang sedang tampil (setelah data berubah) */
function renderUlang() { render(AppState.halamanAktif); renderMenu(); }

function bukaSidebar() {
  document.getElementById('sidebar').classList.add('tampil');
  document.getElementById('hamparanSidebar').classList.add('tampil');
}
function tutupSidebar() {
  document.getElementById('sidebar').classList.remove('tampil');
  document.getElementById('hamparanSidebar').classList.remove('tampil');
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 7: UTILITAS UI
// ════════════════════════════════════════════════════════════════════

// ── Gambar Drive ──────────────────────────────────────────────────────
// Drive punya dua endpoint tampil gambar. Yang utama (lh3.googleusercontent.com)
// paling cepat, namun kadang gagal untuk berkas yang baru diunggah karena
// pengindeksan belum selesai. Bila gagal, otomatis dialihkan ke endpoint thumbnail.

function idDrive(idAtauUrl) {
  if (!idAtauUrl) return '';
  const s = String(idAtauUrl).trim();
  if (/^[A-Za-z0-9_-]{15,}$/.test(s)) return s;
  let m = s.match(/[?&]id=([A-Za-z0-9_-]+)/); if (m) return m[1];
  m = s.match(/\/d\/([A-Za-z0-9_-]+)/);       if (m) return m[1];
  return '';
}

/** Membuat tag <img> untuk gambar Drive lengkap dengan alamat cadangan */
function imgDrive(url, alt, gaya) {
  const id = idDrive(url);
  const utama = id ? 'https://lh3.googleusercontent.com/d/' + id : String(url || '');
  const cadangan = id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w800' : '';
  return '<img src="' + escHtml(utama) + '" alt="' + escHtml(alt || '') + '"' +
    (gaya ? ' style="' + gaya + '"' : '') +
    (cadangan ? ' onerror="gambarCadangan(this,\'' + cadangan + '\')"' : '') + '>';
}

/** Dipanggil oleh onerror — hanya sekali agar tidak berputar tanpa henti */
function gambarCadangan(el, url) {
  if (el.dataset.sudahCadangan) {
    el.style.display = 'none';
    return;
  }
  el.dataset.sudahCadangan = '1';
  el.src = url;
}

/**
 * Memperkecil & mengompres gambar di browser sebelum diunggah.
 * Manfaatnya: unggahan jauh lebih cepat, hemat ruang Drive, dan PDF tetap ringan
 * karena logo disisipkan sebagai data gambar.
 */
function kompresGambar(file, maksSisi, callback) {
  // Format yang tidak bisa digambar ulang (SVG, GIF animasi) dikirim apa adanya
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    const r0 = new FileReader();
    r0.onload = function () {
      callback({ base64: r0.result.split(',')[1], mime: file.type, nama: file.name, dataUrl: r0.result });
    };
    r0.readAsDataURL(file);
    return;
  }

  const r = new FileReader();
  r.onload = function () {
    const img = new Image();
    img.onload = function () {
      const skala = Math.min(1, maksSisi / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * skala));
      const h = Math.max(1, Math.round(img.height * skala));

      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);

      // PNG dipertahankan agar latar transparan logo tidak berubah jadi hitam
      const transparan = /png/i.test(file.type);
      const mime = transparan ? 'image/png' : 'image/jpeg';
      const dataUrl = transparan ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);

      callback({
        base64: dataUrl.split(',')[1],
        mime: mime,
        nama: file.name.replace(/\.[^.]+$/, '') + (transparan ? '.png' : '.jpg'),
        dataUrl: dataUrl
      });
    };
    img.onerror = function () { callback(null); };
    img.src = r.result;
  };
  r.readAsDataURL(file);
}

function escHtml(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inisial(nama) {
  const bag = String(nama || '?').trim().split(/\s+/);
  return ((bag[0] || '')[0] + (bag[1] ? bag[1][0] : '')).toUpperCase();
}

function zonaDari(poin) {
  const b = AppState.konfigurasi;
  const p = Number(poin) || 0;
  if (p > (Number(b.batasHijau) || 70)) return 'Hijau';
  if (p < (Number(b.batasMerah) || 30)) return 'Merah';
  return 'Kuning';
}

function kelasZona(z) { return z === 'Hijau' ? 'hijau' : (z === 'Kuning' ? 'kuning' : 'merah'); }

function toast(judul, pesan, tipe) {
  const el = document.getElementById('toastApp');
  document.getElementById('judulToast').textContent = judul;
  document.getElementById('isiToast').textContent = pesan;
  el.className = 'toast ' + (tipe || '');
  const ikon = { sukses: 'bi-check-circle-fill', bahaya: 'bi-exclamation-octagon-fill', peringatan: 'bi-exclamation-triangle-fill' }[tipe] || 'bi-info-circle-fill';
  document.getElementById('ikonToast').className = 'bi ' + ikon + ' me-2';
  new bootstrap.Toast(el, { delay: 4200 }).show();
}

function konfirmasi(judul, pesan, aksi, labelTombol) {
  document.getElementById('judulKonfirmasi').textContent = judul;
  document.getElementById('pesanKonfirmasi').textContent = pesan;
  const btn = document.getElementById('tombolKonfirmasi');
  btn.textContent = labelTombol || 'Ya, Lanjutkan';
  const modal = new bootstrap.Modal(document.getElementById('modalKonfirmasi'));
  btn.onclick = function () { modal.hide(); aksi(); };
  modal.show();
}

/** Modal form serbaguna */
function bukaModalForm(judul, isiHtml, onSimpan, labelSimpan) {
  document.getElementById('judulModalForm').textContent = judul;
  document.getElementById('isiModalForm').innerHTML = isiHtml;
  const btn = document.getElementById('tombolSimpanModal');
  btn.innerHTML = '<i class="bi bi-save"></i> ' + (labelSimpan || 'Simpan');
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalForm'));
  btn.onclick = function () { onSimpan(modal); };
  modal.show();
  return modal;
}

/** Pratinjau berkas dalam modal (bukan tab baru) */
function pratinjau(url, nama, tipe) {
  document.getElementById('judulPratinjau').textContent = nama || 'Pratinjau Dokumen';
  const isi = document.getElementById('isiPratinjau');
  if (tipe === 'gambar') {
    isi.innerHTML = imgDrive(url, nama, 'max-width:100%;height:auto;border-radius:var(--r-md)');
  } else {
    isi.innerHTML = '<iframe src="' + escHtml(url) + '" class="bingkai-pdf"></iframe>';
  }
  document.getElementById('tombolUnduhPratinjau').onclick = function () {
    toast('Unduh', 'Gunakan tombol unduh di dalam pratinjau dokumen.', 'peringatan');
  };
  new bootstrap.Modal(document.getElementById('modalPratinjau')).show();
}

/** Unduh file dari base64 tanpa membuka tab baru */
function unduhBase64(base64, namaFile, mime) {
  try {
    const biner = atob(base64);
    const arr = new Uint8Array(biner.length);
    for (let i = 0; i < biner.length; i++) arr[i] = biner.charCodeAt(i);
    const blob = new Blob([arr], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = namaFile;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  } catch (e) {
    toast('Gagal', 'Tidak dapat mengunduh berkas: ' + e.message, 'bahaya');
  }
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 5b: PREFERENSI TAMPILAN (localStorage)
// ════════════════════════════════════════════════════════════════════
//
// PENTING — yang BOLEH masuk ke sini hanya preferensi tampilan: halaman
// terakhir, pilihan filter, dan tema. Data siswa (nama, poin, riwayat
// pelanggaran, catatan konseling) SENGAJA TIDAK disimpan di localStorage,
// karena localStorage bertahan di disk setelah guru menutup aplikasi dan
// SIKAP BK banyak dipakai di komputer bersama ruang guru maupun lab. Data
// tersebut cukup hidup di AppState (memori JavaScript) — ikut hilang begitu
// tab ditutup, sama seperti token sesi yang juga tidak pernah disimpan.
// Navigasi sudah 0 ms dari AppState, jadi menyalin data ke localStorage
// tidak menambah kecepatan apa pun — hanya menambah risiko.

const KUNCI_PREF = 'sikap_pref';

function muatPreferensi() {
  try {
    const p = JSON.parse(localStorage.getItem(KUNCI_PREF) || '{}');
    return p && typeof p === 'object' ? p : {};
  } catch (e) { return {}; }   // mode penyamaran / penyimpanan diblokir
}

function simpanPreferensi(ubahan) {
  try {
    const gabung = muatPreferensi();
    Object.keys(ubahan).forEach(function (k) { gabung[k] = ubahan[k]; });
    localStorage.setItem(KUNCI_PREF, JSON.stringify(gabung));
  } catch (e) { /* penyimpanan penuh atau diblokir — diabaikan, bukan galat fatal */ }
}

function lupakanPreferensi() {
  try { localStorage.removeItem(KUNCI_PREF); } catch (e) {}
}

function tandaSinkron(mulai) {
  AppState.antrianSync += mulai ? 1 : -1;
  if (AppState.antrianSync < 0) AppState.antrianSync = 0;
  const sibuk = AppState.antrianSync > 0;

  // Bilah tipis di puncak layar — satu-satunya umpan balik yang terlihat di HP
  const bilah = document.getElementById('bilahSinkron');
  if (bilah) bilah.classList.toggle('tampil', sibuk);

  const el = document.getElementById('statusData');
  if (!el) return;
  if (sibuk) {
    el.className = 'lencana kuning d-none d-lg-inline-flex';
    el.textContent = 'Menyinkronkan…';
  } else {
    el.className = 'lencana hijau d-none d-lg-inline-flex';
    el.textContent = 'Data Aktif';
  }
}

/**
 * Mengunci sebuah tombol selama menunggu server dan mengembalikan fungsi pemulih.
 * Dipakai agar tidak ada tombol yang bisa ditekan dua kali — penting untuk
 * operasi yang menulis ke Sheets (simpan poin, hapus, unggah).
 *
 *   const pulih = tombolSibuk(btn, 'Menyimpan…');
 *   ... google.script.run.withSuccessHandler(function(){ pulih(); }) ...
 */
function tombolSibuk(el, label) {
  const btn = typeof el === 'string' ? document.getElementById(el) : el;
  if (!btn) return function () {};
  if (btn.dataset.sibuk) return function () {};      // sudah terkunci
  const asli = btn.innerHTML;
  btn.dataset.sibuk = '1';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-inline"></span> ' + (label || 'Memproses…');
  let selesai = false;
  return function () {
    if (selesai) return;
    selesai = true;
    delete btn.dataset.sibuk;
    btn.disabled = false;
    btn.innerHTML = asli;
  };
}

/** Ambil data terbaru dari server (tombol refresh) */
function segarkanData() {
  const ikon = document.getElementById('ikonSegarkan');
  ikon.className = 'bi bi-arrow-clockwise';
  ikon.style.animation = 'putar .7s linear infinite';
  tandaSinkron(true);

  google.script.run
    .withSuccessHandler(function (res) {
      ikon.style.animation = ''; tandaSinkron(false);
      if (res.success) { terapkanBootstrap(res.data); renderUlang(); toast('Berhasil', res.message, 'sukses'); }
      else toast('Gagal', res.message, 'bahaya');
    })
    .withFailureHandler(function (err) {
      ikon.style.animation = ''; tandaSinkron(false);
      toast('Error', err.message, 'bahaya');
    })
    .refreshData(AppState.token);
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 8: PENGOLAHAN DATA LOKAL (semua instan, tanpa server)
// ════════════════════════════════════════════════════════════════════

/** Ruang lingkup siswa yang boleh dilihat pengguna saat ini */
function siswaDalamLingkup() {
  if (lingkupSatuKelas()) {
    const kelas = String(AppState.profil.waliKelas);
    return AppState.siswa.filter(function (s) { return String(s.Kelas) === kelas; });
  }
  return AppState.siswa;
}

/**
 * Ruang lingkup khusus halaman Input Poin.
 *
 * Berbeda dari siswaDalamLingkup(): SEMUA guru — termasuk wali kelas — boleh
 * mencatat poin untuk siswa dari kelas mana pun, karena pelanggaran sering
 * terjadi di luar kelas perwalian (upacara, kantin, jam piket).
 * Pembatasan wali kelas tetap berlaku pada menu lain seperti Data Siswa,
 * Riwayat Poin, dan Cetak Laporan.
 */
function siswaUntukInputPoin() {
  return AppState.siswa;
}

function riwayatDalamLingkup() {
  if (lingkupSatuKelas()) {
    const kelas = String(AppState.profil.waliKelas);
    return AppState.riwayat.filter(function (r) { return String(r.Kelas) === kelas; });
  }
  return AppState.riwayat;
}

function hitungZonaSiswa(daftar) {
  const h = { Hijau: 0, Kuning: 0, Merah: 0 };
  daftar.forEach(function (s) { h[zonaDari(s.PoinSaatIni)]++; });
  return h;
}

/** Statistik jenis pelanggaran terbanyak */
function statistikPelanggaran(riwayat, batas) {
  const peta = {};
  riwayat.forEach(function (r) {
    if (String(r.Jenis) !== 'Pelanggaran') return;
    const k = r.NamaKejadian || 'Lainnya';
    peta[k] = (peta[k] || 0) + 1;
  });
  return Object.keys(peta)
    .map(function (k) { return { nama: k, jumlah: peta[k] }; })
    .sort(function (a, b) { return b.jumlah - a.jumlah; })
    .slice(0, batas || 6);
}

/** Wawasan otomatis berbasis data (panel "analisis") */
function susunWawasan(siswa, riwayat) {
  const w = [];
  const z = hitungZonaSiswa(siswa);
  const total = siswa.length || 1;

  w.push('Total <b>' + siswa.length + '</b> peserta didik terpantau, <b>' +
    ((z.Hijau / total) * 100).toFixed(1) + '%</b> berada di Zona Hijau.');

  if (z.Merah > 0) {
    w.push('<b>' + z.Merah + ' siswa</b> berada di Zona Merah dan memerlukan panggilan orang tua serta konseling BK.');
  } else {
    w.push('Tidak ada siswa di Zona Merah pada periode ini — kondisi kedisiplinan terkendali.');
  }

  const top = statistikPelanggaran(riwayat, 1)[0];
  if (top) {
    w.push('Pelanggaran paling sering: <b>' + escHtml(top.nama) + '</b> (' + top.jumlah + ' kasus). ' +
      'Pertimbangkan pembinaan tematik untuk jenis ini.');
  }

  const kebaikan = riwayat.filter(function (r) { return String(r.Jenis) === 'Kebaikan'; }).length;
  const pelanggaran = riwayat.filter(function (r) { return String(r.Jenis) === 'Pelanggaran'; }).length;
  if (kebaikan + pelanggaran > 0) {
    const rasio = (kebaikan / (kebaikan + pelanggaran) * 100).toFixed(0);
    w.push('Rasio catatan positif <b>' + rasio + '%</b> dari ' + (kebaikan + pelanggaran) + ' total catatan' +
      (Number(rasio) < 40 ? ' — tingkatkan apresiasi kebaikan agar seimbang.' : ' — apresiasi berjalan baik.'));
  } else {
    w.push('Belum ada catatan poin. Mulai input melalui menu <b>Input Poin</b>.');
  }
  return w;
}

function nomorBulan() {
  return ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 9: HALAMAN — DASHBOARD
// ════════════════════════════════════════════════════════════════════

function renderDashboard() {
  const p = AppState.profil;
  const siswa = siswaDalamLingkup();
  const riwayat = riwayatDalamLingkup();
  const z = hitungZonaSiswa(siswa);
  const total = siswa.length || 1;
  const lingkup = lingkupSatuKelas() ? ('Kelas ' + p.waliKelas) : 'Seluruh Sekolah';

  const boleh = {
    laporan : !isGuruBiasa(),
    master  : isAdmin() || isKepsek() || isGuruBK(),
    siswa   : !isGuruBiasa()
  };

  const html =
  '<div class="judul-seksi">' +
    '<div>' +
      '<h2>Dashboard ' + escHtml(p.labelPeran) + ' <span class="lencana hijau">Online</span></h2>' +
      '<p>Monitoring karakter &amp; kedisiplinan — ' + escHtml(lingkup) +
        ' • TA ' + escHtml(AppState.konfigurasi.tahunAjaran) + ' Semester ' + escHtml(AppState.konfigurasi.semester) + '</p>' +
    '</div>' +
    '<div class="aksi">' +
      '<button class="btn btn-gold" onclick="navigateTo(\'inputPoin\')"><i class="bi bi-plus-lg"></i> Tambah Catatan Poin</button>' +
      (boleh.laporan ? '<button class="btn btn-hantu" onclick="navigateTo(\'laporan\')"><i class="bi bi-printer"></i> Cetak Laporan</button>' : '') +
    '</div>' +
  '</div>' +

  // ── Kartu zona ──
  '<div class="grid-zona">' +
    kartuZona('zona-hijau',  'bi-shield-check',        'Zona Hijau',  z.Hijau,  total, 'Siswa dengan catatan bersih') +
    kartuZona('zona-kuning', 'bi-exclamation-triangle','Zona Kuning', z.Kuning, total, 'Perlu pembinaan berkala') +
    kartuZona('zona-merah',  'bi-exclamation-octagon', 'Zona Merah',  z.Merah,  total, 'Panggilan orang tua &amp; BK') +
  '</div>' +

  '<div class="tata-utama">' +
    // ── Kolom kiri ──
    '<div class="tumpuk">' +
      '<div class="card">' +
        '<div class="card-header">' +
          '<div><h5>Pelanggaran Terbanyak</h5><p class="sub">Jenis pelanggaran yang paling sering terjadi</p></div>' +
          '<div class="kanan">' +
            '<select class="form-select form-select-sm" style="width:auto;min-height:36px" id="periodeGrafik" onchange="renderGrafikPelanggaran()">' +
              '<option value="bulan">Bulan Ini</option><option value="semua">Seluruh Periode</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="card-body"><div class="bungkus-grafik"><canvas id="grafikPelanggaran"></canvas></div></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header">' +
          '<div><h5>Riwayat Poin Terbaru</h5><p class="sub">Catatan pelanggaran dan penghargaan siswa</p></div>' +
        '</div>' +
        // Maksimal 5 baris (v2.19). Dasbor hanya perlu memberi gambaran sekilas;
        // riwayat selengkapnya ada di menu Riwayat Poin pada sidebar.
        '<div class="card-body p-0">' + tabelRiwayatRingkas(riwayat.slice(0, 5)) + '</div>' +
      '</div>' +
    '</div>' +

    // ── Kolom kanan ──
    '<div class="tumpuk">' +
      '<div class="panel-wawasan">' +
        '<h6><i class="bi bi-lightbulb-fill"></i> Analisis Otomatis</h6>' +
        '<ul>' + susunWawasan(siswa, riwayat).map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header"><div><h5>Aksi Cepat</h5><p class="sub">Pintasan tugas penting</p></div></div>' +
        '<div class="card-body">' +
          '<div class="aksi-cepat">' +
            aksiCepat('bi-plus-circle', 'Input Catatan Poin', 'Pelanggaran atau kebaikan siswa', "navigateTo('inputPoin')") +
            (boleh.siswa ? aksiCepat('bi-people',
              lingkupSatuKelas() ? 'Siswa Kelas Saya' : 'Daftar Peserta Didik',
              'Pantau poin & zona per siswa', "navigateTo('dataSiswa')") : '') +
            (boleh.laporan ? aksiCepat('bi-printer', 'Cetak Rekap Bulanan', 'Ekspor laporan PDF resmi', "navigateTo('laporan')") : '') +
            (boleh.master ? aksiCepat('bi-list-check', 'Atur Bobot Poin & Pasal', 'Kelola jenis pelanggaran/kebaikan', "navigateTo('jenisPoin')") : '') +
            aksiCepat('bi-journal-text', 'Buku Tata Tertib', 'Referensi pasal & sanksi', "navigateTo('tataTertib')") +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header"><div><h5>Statistik Pelanggaran</h5><p class="sub">Akumulasi periode berjalan</p></div></div>' +
        '<div class="card-body">' + barStatistik(riwayat) + '</div>' +
      '</div>' +

      (z.Merah > 0 ? '<div class="kotak-info bahaya"><i class="bi bi-bell-fill"></i><div>' +
        '<b>' + z.Merah + ' siswa di Zona Merah.</b> Wali kelas terkait telah menerima notifikasi email otomatis. ' +
        'Segera jadwalkan konseling BK dan panggilan orang tua.</div></div>' : '') +
    '</div>' +
  '</div>';

  document.getElementById('section-dashboard').innerHTML = html;
  renderGrafikPelanggaran();
}

function kartuZona(kelas, ikon, label, jumlah, total, deskripsi) {
  const persen = ((jumlah / total) * 100).toFixed(0);
  return '<div class="kartu-zona ' + kelas + '">' +
    '<div class="atas"><div class="label">' + label + '</div>' +
      '<div class="lencana-ikon"><i class="bi ' + ikon + '"></i></div></div>' +
    '<div class="angka">' + jumlah + ' <span style="font-size:14px;font-weight:500;color:var(--text-secondary)">Siswa</span></div>' +
    '<div class="kaki"><span>' + deskripsi + '</span><span class="persen">' + persen + '%</span></div>' +
  '</div>';
}

function aksiCepat(ikon, judul, sub, aksi) {
  return '<button type="button" onclick="' + aksi + '">' +
    '<span class="ikon"><i class="bi ' + ikon + '"></i></span>' +
    '<span class="teks"><strong>' + judul + '</strong><span>' + sub + '</span></span>' +
    '<i class="bi bi-chevron-right panah"></i></button>';
}

function barStatistik(riwayat) {
  const stat = statistikPelanggaran(riwayat, 4);
  if (!stat.length) return '<div class="kosong"><i class="bi bi-clipboard-check"></i><h6>Belum ada pelanggaran</h6><p class="mb-0">Semua siswa berperilaku baik pada periode ini.</p></div>';
  const maks = stat[0].jumlah || 1;
  const warna = ['var(--navy)', 'var(--gold)', 'var(--kuning-line)', 'var(--merah-line)'];
  return stat.map(function (s, i) {
    const persen = ((s.jumlah / maks) * 100).toFixed(0);
    return '<div class="bar-statistik">' +
      '<div class="baris-label"><span>' + escHtml(s.nama) + '</span><span class="nilai">' + s.jumlah + ' kasus</span></div>' +
      '<div class="jalur"><span style="width:' + persen + '%;background:' + warna[i % 4] + '"></span></div>' +
    '</div>';
  }).join('');
}

function tabelRiwayatRingkas(riwayat) {
  if (!riwayat.length) {
    return '<div class="kosong"><i class="bi bi-inbox"></i><h6>Belum ada catatan poin</h6>' +
      '<p class="mb-0">Catatan akan muncul di sini setelah guru melakukan input.</p></div>';
  }
  return '<div class="bungkus-tabel" style="border:0">' +
    '<table class="tabel"><thead><tr>' +
      '<th>Nama Siswa</th><th>Kelas</th><th>Jenis Kejadian</th><th class="text-center">Poin</th><th>Tanggal</th>' +
    '</tr></thead><tbody>' +
    riwayat.map(function (r) {
      const plus = Number(r.Poin) >= 0;
      return '<tr>' +
        '<td><div class="sel-nama"><div class="avatar-mini">' + inisial(r.NamaSiswa) + '</div>' +
          '<div><div style="font-weight:600">' + escHtml(r.NamaSiswa) + '</div>' +
          '<div class="sub mono">' + escHtml(r.NISN) + '</div></div></div></td>' +
        '<td>' + escHtml(r.Kelas) + '</td>' +
        '<td>' + escHtml(r.NamaKejadian) + '</td>' +
        '<td class="text-center mono ' + (plus ? 'poin-plus' : 'poin-minus') + '">' + (plus ? '+' : '') + escHtml(r.Poin) + '</td>' +
        '<td class="mono" style="font-size:12.5px">' + escHtml(String(r.Tanggal).split(' ')[0]) + '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';
}

function renderGrafikPelanggaran() {
  const canvas = document.getElementById('grafikPelanggaran');
  if (!canvas) return;
  const periode = (document.getElementById('periodeGrafik') || {}).value || 'bulan';
  let riwayat = riwayatDalamLingkup();

  if (periode === 'bulan') {
    const kini = new Date();
    riwayat = riwayat.filter(function (r) {
      const m = String(r.Tanggal).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      return m && Number(m[2]) === kini.getMonth() + 1 && Number(m[3]) === kini.getFullYear();
    });
  }

  const stat = statistikPelanggaran(riwayat, 6);
  if (AppState.grafik.pelanggaran) AppState.grafik.pelanggaran.destroy();

  const gelap = document.documentElement.getAttribute('data-theme') === 'dark';
  const warnaTeks = gelap ? '#9aa8bd' : '#6b7280';
  const warnaGaris = gelap ? '#263349' : '#e2e8f0';
  const maksIdx = 0;

  AppState.grafik.pelanggaran = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: stat.length ? stat.map(function (s) { return potong(s.nama, 18); }) : ['Belum ada data'],
      datasets: [{
        label: 'Jumlah kasus',
        data: stat.length ? stat.map(function (s) { return s.jumlah; }) : [0],
        backgroundColor: stat.map(function (_, i) { return i === maksIdx ? '#f5a623' : (gelap ? '#2d4a72' : '#1e3a5f'); }),
        borderRadius: 6,
        maxBarThickness: 54
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e3a5f', padding: 10, cornerRadius: 6,
          callbacks: { label: function (c) { return c.parsed.y + ' kasus tercatat'; } }
        }
      },
      scales: {
        x: { ticks: { color: warnaTeks, font: { size: 11 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: warnaTeks, precision: 0 }, grid: { color: warnaGaris } }
      }
    }
  });
}

function perbaruiTemaGrafik() {
  if (AppState.halamanAktif === 'dashboard') renderGrafikPelanggaran();
  if (AppState.halamanAktif === 'portalSiswa') renderPortalSiswa();
}

function potong(t, n) { const s = String(t); return s.length > n ? s.substring(0, n - 1) + '…' : s; }

// ════════════════════════════════════════════════════════════════════
// BAGIAN 10: HALAMAN — INPUT POIN
// ════════════════════════════════════════════════════════════════════

function renderInputPoin() {
  const d = AppState.draftPoin;
  const siswa = siswaUntukInputPoin();   // semua kelas, untuk semua guru
  const isPelanggaran = d.jenis === 'Pelanggaran';
  const daftarJenis = isPelanggaran ? AppState.pelanggaran : AppState.kebaikan;

  const opsiJenis = '<option value="">— Pilih jenis ' + (isPelanggaran ? 'pelanggaran' : 'kebaikan') + ' —</option>' +
    daftarJenis.map(function (j) {
      const nama = isPelanggaran ? j.NamaPelanggaran : j.NamaKebaikan;
      const poin = (isPelanggaran ? '-' : '+') + Math.abs(Number(j.Poin));
      return '<option value="' + escHtml(j.ID) + '"' + (d.idJenis === String(j.ID) ? ' selected' : '') + '>' +
        escHtml(nama) + ' (' + poin + ' poin)</option>';
    }).join('') +
    '<option value="MANUAL"' + (d.idJenis === 'MANUAL' ? ' selected' : '') + '>' +
    '➕ Lainnya — ketik manual…</option>';

  const bolehSimpanMaster = isAdmin() || isKepsek() || isGuruBK();

  const html =
  '<div class="judul-seksi">' +
    '<div><h2>Input Catatan Poin Siswa</h2></div>' +
    '<div class="aksi"><span class="lencana info polos"><i class="bi bi-person-badge"></i> Pencatat: ' + escHtml(AppState.profil.nama) + '</span></div>' +
  '</div>' +

  '<div class="tata-utama">' +
    '<div class="card">' +
      '<div class="card-body">' +
        '<form id="formPoin" onsubmit="simpanCatatanPoin(event)">' +

          '<label class="form-label">Tipe Catatan <span class="wajib">*</span></label>' +
          '<div class="segmen mb-4">' +
            '<button type="button" class="' + (isPelanggaran ? 'aktif-minus' : '') + '" onclick="gantiJenisPoin(\'Pelanggaran\')">' +
              '<i class="bi bi-exclamation-triangle-fill"></i> Pelanggaran (Poin Minus)</button>' +
            '<button type="button" class="' + (!isPelanggaran ? 'aktif-plus' : '') + '" onclick="gantiJenisPoin(\'Kebaikan\')">' +
              '<i class="bi bi-patch-check-fill"></i> Kebaikan (Poin Plus)</button>' +
          '</div>' +

          // ── Pemilih siswa: cari, klik, bisa lebih dari satu ──
          '<div class="mb-3" id="blokPilihSiswa">' +
            '<label class="form-label" for="poinCariSiswa">Pilih Siswa <span class="wajib">*</span></label>' +
            '<div class="row g-2 mb-1">' +
              '<div class="col-12 col-sm-7"><div class="pemilih-siswa">' +
                '<div class="kotak-cari">' +
                  '<i class="bi bi-search"></i>' +
                  '<input class="form-control" id="poinCariSiswa" autocomplete="off" ' +
                    'placeholder="Ketik nama atau NISN siswa…" ' +
                    'oninput="cariSiswaPoin(this.value)" onfocus="cariSiswaPoin(this.value)" ' +
                    'onkeydown="navigasiHasilCari(event)">' +
                '</div>' +
                '<div id="hasilCariSiswa"></div>' +
              '</div></div>' +
              '<div class="col-7 col-sm-3">' +
                '<select class="form-select" id="poinFilterKelas" onchange="gantiKelasCari(this.value)">' +
                  opsiKelasCari(siswa, d.kelasCari) +
                '</select>' +
              '</div>' +
              '<div class="col-5 col-sm-2">' +
                '<button type="button" class="btn btn-hantu w-100" onclick="tambahSemuaKelas()" ' +
                  'title="Tambahkan seluruh siswa dari kelas terpilih">' +
                  '<i class="bi bi-people-fill"></i> Semua</button>' +
              '</div>' +
            '</div>' +
            '<div id="wadahSiswaTerpilih"></div>' +
          '</div>' +

          '<div class="mb-3">' +
            '<label class="form-label" for="poinJenis">Jenis ' + (isPelanggaran ? 'Pelanggaran' : 'Kebaikan') + ' <span class="wajib">*</span></label>' +
            '<select class="form-select" id="poinJenis" required onchange="pilihJenisPoin(this.value)">' + opsiJenis + '</select>' +
            '<div class="form-text">Tidak ada di daftar? Pilih <b>Lainnya — ketik manual</b> di paling bawah.</div>' +
          '</div>' +

          // ── Blok ketik manual (muncul saat memilih "Lainnya") ──
          '<div id="blokManual" class="blok-manual mb-3" style="display:none">' +
            '<div class="label-kecil mb-2"><i class="bi bi-pencil-square"></i> Jenis ' +
              (isPelanggaran ? 'Pelanggaran' : 'Kebaikan') + ' Baru</div>' +
            '<div class="mb-3">' +
              '<label class="form-label" for="poinNamaManual">Nama Kejadian <span class="wajib">*</span></label>' +
              '<input class="form-control" id="poinNamaManual" placeholder="' +
                (isPelanggaran ? 'Contoh: Terlambat mengikuti apel pagi' : 'Contoh: Membantu panitia kegiatan sekolah') + '">' +
            '</div>' +
            '<div class="mb-3">' +
              '<label class="form-label" for="poinKategoriManual">Kategori <span class="text-secondary-2">(opsional)</span></label>' +
              '<input class="form-control" id="poinKategoriManual" list="daftarKategori" placeholder="' +
                (isPelanggaran ? 'Kedisiplinan Waktu, Adab & Akhlak…' : 'Prestasi Akademik, Kepedulian Sosial…') + '">' +
              '<datalist id="daftarKategori">' + daftarKategoriUnik(isPelanggaran) + '</datalist>' +
            '</div>' +
            (bolehSimpanMaster ?
              '<div class="form-check mb-1">' +
                '<input class="form-check-input" type="checkbox" id="poinSimpanMaster">' +
                '<label class="form-check-label" for="poinSimpanMaster">' +
                  'Simpan jenis ini ke master data agar bisa dipilih lain kali</label>' +
              '</div>' : '') +
          '</div>' +

          // ── Nilai poin: selalu bisa diubah, termasuk diisi 0 ──
          '<div class="mb-3">' +
            '<label class="form-label" for="poinNilai">Nilai Poin <span class="wajib">*</span></label>' +
            '<div class="input-group">' +
              '<span class="input-group-text" style="font-weight:700;min-width:44px;justify-content:center">' +
                (isPelanggaran ? '−' : '+') + '</span>' +
              '<input type="number" min="0" step="1" class="form-control mono" id="poinNilai" required value="0" ' +
                'oninput="hitungDampakPoin()">' +
            '</div>' +
            '<div class="form-text">Terisi otomatis dari tata tertib, namun <b>boleh diubah</b>. ' +
              'Isi <span class="mono">0</span> bila siswa cukup diberi Tindakan Disipliner tanpa pengurangan poin.</div>' +
          '</div>' +

          '<div id="kotakDampak" class="mb-3"></div>' +

          // ── Tindakan Disipliner: saran otomatis + tetap bisa diketik manual ──
          '<div class="mb-3">' +
            '<label class="form-label" for="poinTindakan">' +
              (isPelanggaran ? 'Tindakan Disipliner yang Diberikan' : 'Bentuk Apresiasi yang Diberikan') +
              ' <span class="text-secondary-2">(opsional)</span></label>' +
            '<div id="saranTindakan"></div>' +
            '<textarea class="form-control" id="poinTindakan" style="min-height:70px" ' +
              'oninput="perbaruiSaranTindakan()" placeholder="' +
              (isPelanggaran
                ? 'Contoh: Menyapu halaman kantor • HP disita selama 14 hari • Menghafal surat pendek'
                : 'Contoh: Piagam penghargaan • Diumumkan saat upacara') + '"></textarea>' +
            '<div class="form-text">Tercetak di riwayat siswa dan laporan PDF sebagai bukti pembinaan ' +
              'walaupun nilai poin diisi 0.</div>' +
          '</div>' +

          '<div class="mb-3">' +
            '<label class="form-label" for="poinTanggal">Tanggal Kejadian <span class="wajib">*</span></label>' +
            '<input type="date" class="form-control" id="poinTanggal" required value="' + tanggalHariIniISO() + '">' +
          '</div>' +

          '<div class="mb-3">' +
            '<label class="form-label" for="poinCatatan">Catatan / Kronologi <span class="text-secondary-2">(opsional)</span></label>' +
            '<textarea class="form-control" id="poinCatatan" placeholder="Tuliskan kronologi atau catatan khusus untuk orang tua…"></textarea>' +
          '</div>' +

          '<div class="mb-4">' +
            '<label class="form-label">Unggah Bukti Foto Kejadian <span class="text-secondary-2">(opsional)</span></label>' +
            '<div class="area-unggah" onclick="document.getElementById(\'poinFoto\').click()">' +
              '<div class="ikon-besar"><i class="bi bi-camera-fill"></i></div>' +
              '<div style="font-weight:600;color:var(--text-primary)">Klik untuk mengunggah foto bukti</div>' +
              '<div style="font-size:12px">Format JPG atau PNG, maksimal 5 MB</div>' +
            '</div>' +
            '<input type="file" id="poinFoto" accept="image/*" style="display:none" onchange="pilihFotoBukti(this)">' +
            '<div id="pratinjauFoto" class="mt-3"></div>' +
          '</div>' +

          '<div class="d-flex gap-2">' +
            '<button type="button" class="btn btn-hantu" onclick="resetFormPoin()">Batal</button>' +
            '<button type="submit" class="btn btn-navy flex-fill" id="tombolSimpanPoin">' +
              '<i class="bi bi-save"></i> Simpan &amp; Perbarui Poin Siswa</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>' +

    // ── Sidebar referensi ──
    '<div class="tumpuk">' +
      '<div class="card">' +
        '<div class="card-header">' +
          '<div><h5><i class="bi bi-journal-text"></i> Referensi Tata Tertib</h5>' +
          '<p class="sub">Ringkasan pasal poin terberat</p></div>' +
        '</div>' +
        '<div class="card-body">' +
          AppState.pelanggaran.slice().sort(function (a, b) { return Number(b.Poin) - Number(a.Poin); }).slice(0, 3)
            .map(function (p, i) {
              return '<div class="ref-pasal"><div class="kepala"><strong>Pasal ' + (i + 1) + '</strong>' +
                '<span class="poin-ref">-' + Math.abs(Number(p.Poin)) + ' Poin</span></div>' +
                '<p>' + escHtml(p.NamaPelanggaran) + '</p>' +
                '<p style="margin-top:4px"><i class="bi bi-arrow-return-right"></i> ' + escHtml(p.Hukuman || '-') + '</p></div>';
            }).join('') +
          '<button class="btn btn-hantu w-100 btn-kecil mt-2" onclick="navigateTo(\'tataTertib\')">' +
            '<i class="bi bi-file-earmark-pdf"></i> Buka Buku Tata Tertib</button>' +
        '</div>' +
      '</div>' +

      // v2.19: panel "Panduan Input Cepat" dan "Aktivitas Terbaru" dihapus dari
      // sini. Keduanya membuat halaman ini panjang — terutama di HP, tempat
      // kolom kanan jatuh ke bawah formulir dan harus digulir melewatinya.
    '</div>' +
  '</div>';

  document.getElementById('section-inputPoin').innerHTML = html;
  renderSiswaTerpilih();
  if (d.idJenis) pilihJenisPoin(d.idJenis);
  hitungDampakPoin();
  if (d.foto) tampilPratinjauFoto(d.foto.dataUrl, d.foto.nama);
}

function tanggalHariIniISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// ════════════════════════════════════════════════════════════════════
// PEMILIH SISWA GANDA — cari, klik, tambahkan; berlaku untuk banyak siswa
// ════════════════════════════════════════════════════════════════════

/**
 * Urutan kelas secara alami: 7A, 7B, 8A, 9A, 10A …
 * Perbandingan teks biasa keliru menempatkan "10A" sebelum "9A",
 * karena itu angka tingkat dibandingkan sebagai bilangan lebih dulu.
 */
function bandingKelas(a, b) {
  const ka = String(a || ''), kb = String(b || '');
  const na = parseInt(ka.match(/\d+/) ? ka.match(/\d+/)[0] : '0', 10);
  const nb = parseInt(kb.match(/\d+/) ? kb.match(/\d+/)[0] : '0', 10);
  if (na !== nb) return na - nb;
  return ka.localeCompare(kb, 'id');
}

/** Urutan baku daftar siswa: kelas menaik, lalu nama A→Z */
function urutSiswa(daftar) {
  return daftar.slice().sort(function (a, b) {
    const k = bandingKelas(a.Kelas, b.Kelas);
    return k !== 0 ? k : String(a.Nama).localeCompare(String(b.Nama), 'id');
  });
}

function opsiKelasCari(siswa, terpilih) {
  const kelas = [];
  siswa.forEach(function (s) {
    const k = String(s.Kelas || '').trim();
    if (k && kelas.indexOf(k) === -1) kelas.push(k);
  });
  kelas.sort(bandingKelas);
  return '<option value="SEMUA">Semua kelas</option>' + kelas.map(function (k) {
    return '<option value="' + escHtml(k) + '"' + (terpilih === k ? ' selected' : '') + '>Kelas ' + escHtml(k) + '</option>';
  }).join('');
}

function gantiKelasCari(v) {
  AppState.draftPoin.kelasCari = v;
  const inp = document.getElementById('poinCariSiswa');
  cariSiswaPoin(inp ? inp.value : '');
}

/** Siswa yang cocok dengan kata kunci & filter kelas, belum terpilih */
function kandidatSiswa(kata) {
  const d = AppState.draftPoin;
  const q = String(kata || '').trim().toLowerCase();
  let hasil = siswaUntukInputPoin().filter(function (s) {
    if (d.nisnTerpilih.indexOf(String(s.NISN)) !== -1) return false;
    if (d.kelasCari !== 'SEMUA' && String(s.Kelas) !== d.kelasCari) return false;
    if (!q) return true;
    return String(s.Nama).toLowerCase().indexOf(q) !== -1 ||
           String(s.NISN).indexOf(q) !== -1;
  });
  return urutSiswa(hasil);
}

let sorotHasil = -1;

/** Menampilkan daftar hasil pencarian di bawah kolom ketik */
function cariSiswaPoin(kata) {
  AppState.draftPoin.cari = kata;
  const wadah = document.getElementById('hasilCariSiswa');
  if (!wadah) return;

  const hasil = kandidatSiswa(kata);
  sorotHasil = -1;

  if (!hasil.length) {
    wadah.innerHTML = '<div class="hasil-cari"><div class="kosong-hasil">' +
      (kata ? 'Tidak ada siswa yang cocok dengan "' + escHtml(kata) + '"' : 'Semua siswa pada filter ini sudah dipilih') +
      '</div></div>';
    return;
  }

  wadah.innerHTML = '<div class="hasil-cari">' + hasil.slice(0, 40).map(function (s, i) {
    const z = zonaDari(s.PoinSaatIni);
    return '<button type="button" data-idx="' + i + '" onclick="tambahSiswaPoin(\'' + escHtml(s.NISN) + '\')">' +
      '<span class="avatar-mini">' + inisial(s.Nama) + '</span>' +
      '<span style="min-width:0">' +
        '<span class="nm d-block">' + escHtml(s.Nama) + '</span>' +
        '<span class="sb">' + escHtml(s.Kelas) + ' • ' + escHtml(s.NISN) + '</span>' +
      '</span>' +
      '<span class="kanan">' +
        '<span class="mono d-block" style="font-weight:700">' + escHtml(s.PoinSaatIni) + '</span>' +
        '<span class="lencana ' + kelasZona(z) + '" style="font-size:10px;padding:1px 7px">' + z + '</span>' +
      '</span>' +
    '</button>';
  }).join('') +
  (hasil.length > 40 ? '<div class="kosong-hasil">…dan ' + (hasil.length - 40) +
    ' siswa lain. Persempit pencarian.</div>' : '') +
  '</div>';
}

/** Panah atas/bawah + Enter untuk memilih tanpa menyentuh tetikus */
function navigasiHasilCari(ev) {
  const tombol = document.querySelectorAll('#hasilCariSiswa .hasil-cari button');
  if (!tombol.length) return;

  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    sorotHasil += (ev.key === 'ArrowDown' ? 1 : -1);
    if (sorotHasil < 0) sorotHasil = tombol.length - 1;
    if (sorotHasil >= tombol.length) sorotHasil = 0;
    tombol.forEach(function (b, i) { b.classList.toggle('sorot', i === sorotHasil); });
    tombol[sorotHasil].scrollIntoView({ block: 'nearest' });
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    (tombol[sorotHasil >= 0 ? sorotHasil : 0]).click();
  } else if (ev.key === 'Escape') {
    document.getElementById('hasilCariSiswa').innerHTML = '';
  }
}

function tambahSiswaPoin(nisn) {
  const d = AppState.draftPoin;
  if (d.nisnTerpilih.indexOf(String(nisn)) === -1) d.nisnTerpilih.push(String(nisn));

  const inp = document.getElementById('poinCariSiswa');
  if (inp) { inp.value = ''; inp.focus(); }
  cariSiswaPoin('');
  renderSiswaTerpilih();
  hitungDampakPoin();
}

function hapusSiswaPoin(nisn) {
  const d = AppState.draftPoin;
  d.nisnTerpilih = d.nisnTerpilih.filter(function (x) { return x !== String(nisn); });
  cariSiswaPoin(document.getElementById('poinCariSiswa') ? document.getElementById('poinCariSiswa').value : '');
  renderSiswaTerpilih();
  hitungDampakPoin();
}

/**
 * Kembali ke kolom pencarian untuk menambah siswa berikutnya.
 * Daftar pilihan langsung terbuka sehingga guru cukup mengetik atau memilih.
 */
function fokusTambahSiswa() {
  const inp = document.getElementById('poinCariSiswa');
  if (!inp) return;
  inp.value = '';
  inp.focus();
  inp.scrollIntoView({ block: 'center', behavior: 'smooth' });
  // Kosongkan kata kunci agar SELURUH siswa sesuai filter kelas langsung tampil:
  // filter "Semua kelas" menampilkan semua, filter kelas tertentu hanya kelas itu.
  cariSiswaPoin('');
}

function kosongkanSiswaPoin() {
  AppState.draftPoin.nisnTerpilih = [];
  cariSiswaPoin('');
  renderSiswaTerpilih();
  hitungDampakPoin();
}

/** Tambahkan seluruh siswa pada kelas yang sedang difilter */
function tambahSemuaKelas() {
  const d = AppState.draftPoin;
  if (d.kelasCari === 'SEMUA') {
    return toast('Pilih kelas dulu', 'Tentukan kelas pada kotak di sebelahnya sebelum menambah semua siswa.', 'peringatan');
  }
  const kandidat = siswaUntukInputPoin().filter(function (s) { return String(s.Kelas) === d.kelasCari; });
  let baru = 0;
  kandidat.forEach(function (s) {
    if (d.nisnTerpilih.indexOf(String(s.NISN)) === -1) { d.nisnTerpilih.push(String(s.NISN)); baru++; }
  });
  cariSiswaPoin('');
  renderSiswaTerpilih();
  hitungDampakPoin();
  toast('Ditambahkan', baru + ' siswa kelas ' + d.kelasCari + ' masuk daftar.', baru ? 'sukses' : 'peringatan');
}

/** Daftar chip siswa yang sudah dipilih */
function renderSiswaTerpilih() {
  const wadah = document.getElementById('wadahSiswaTerpilih');
  if (!wadah) return;
  const d = AppState.draftPoin;

  if (!d.nisnTerpilih.length) {
    wadah.innerHTML = '<div class="kotak-info"><i class="bi bi-info-circle"></i><div>' +
      'Belum ada siswa dipilih. Ketik nama pada kolom di atas, atau pilih kelas lalu tekan ' +
      '<b>Semua</b> untuk menambahkan satu kelas sekaligus.</div></div>';
    return;
  }

  const terpilih = urutSiswa(
    d.nisnTerpilih.map(function (n) {
      return AppState.siswa.filter(function (s) { return String(s.NISN) === n; })[0];
    }).filter(Boolean)
  );

  wadah.innerHTML = '<div class="wadah-chip">' +
    '<div class="baris-chip-kepala">' +
      '<span><i class="bi bi-check2-circle"></i> Terpilih <span class="jml">' + terpilih.length + '</span> siswa</span>' +
      '<button type="button" class="btn btn-navy btn-mini ms-auto" onclick="fokusTambahSiswa()">' +
        '<i class="bi bi-person-plus-fill"></i> Tambahkan</button>' +
      '<button type="button" class="btn btn-hantu btn-mini" onclick="kosongkanSiswaPoin()">' +
        '<i class="bi bi-x-lg"></i> Kosongkan</button>' +
    '</div>' +
    terpilih.map(function (s) {
      const z = zonaDari(s.PoinSaatIni);
      return '<span class="chip-siswa ' + (z === 'Merah' ? 'zmerah' : (z === 'Kuning' ? 'zkuning' : '')) + '">' +
        '<span class="kelas">' + escHtml(s.Kelas) + '</span>' +
        '<span class="nama-chip">' + escHtml(s.Nama) + '</span>' +
        '<button type="button" onclick="hapusSiswaPoin(\'' + escHtml(s.NISN) + '\')" ' +
          'aria-label="Hapus ' + escHtml(s.Nama) + '"><i class="bi bi-x-lg"></i></button>' +
      '</span>';
    }).join('') +
  '</div>';
}

function gantiJenisPoin(jenis) {
  AppState.draftPoin.jenis = jenis;
  AppState.draftPoin.idJenis = '';
  renderInputPoin();
}

/** Daftar kategori unik dari master, untuk autocomplete saat mengetik manual */
function daftarKategoriUnik(isPelanggaran) {
  const sumber = isPelanggaran ? AppState.pelanggaran : AppState.kebaikan;
  const set = [];
  sumber.forEach(function (j) {
    const k = String(j.Kategori || '').trim();
    if (k && set.indexOf(k) === -1) set.push(k);
  });
  return set.sort().map(function (k) { return '<option value="' + escHtml(k) + '">'; }).join('');
}

/**
 * Saat jenis dipilih: isi otomatis nilai poin dan Tindakan Disipliner dari master,
 * lalu biarkan guru mengubahnya. Pilihan "MANUAL" membuka blok ketik sendiri.
 */
function pilihJenisPoin(id) {
  AppState.draftPoin.idJenis = id;
  const isPelanggaran = AppState.draftPoin.jenis === 'Pelanggaran';
  const blok = document.getElementById('blokManual');
  const inpPoin = document.getElementById('poinNilai');
  const inpTindakan = document.getElementById('poinTindakan');

  if (id === 'MANUAL') {
    if (blok) blok.style.display = '';
    if (inpPoin && (inpPoin.value === '' || Number(inpPoin.value) === 0)) inpPoin.value = 5;
    const nm = document.getElementById('poinNamaManual');
    if (nm) nm.focus();
    hitungDampakPoin();
    return;
  }

  if (blok) blok.style.display = 'none';

  const sumber = isPelanggaran ? AppState.pelanggaran : AppState.kebaikan;
  const j = sumber.filter(function (x) { return String(x.ID) === String(id); })[0];
  if (!j) {
    if (inpPoin) inpPoin.value = 0;
    hitungDampakPoin();
    return;
  }

  // Prefill — tetap dapat diubah guru
  if (inpPoin) inpPoin.value = Math.abs(Number(j.Poin) || 0);
  if (inpTindakan) inpTindakan.value = isPelanggaran ? (j.Hukuman || '') : (j.Kategori || '');
  hitungDampakPoin();
}

/**
 * Tindakan disipliner yang disarankan untuk pelanggaran berat (poin ≥ 30).
 * Muncul sebagai pilihan cepat — guru tetap bebas mengetik tindakan lain,
 * dan boleh memilih lebih dari satu.
 */
const AMBANG_SARAN_TINDAKAN = 30;
const SARAN_TINDAKAN = ['Konseling Pribadi', 'Konseling Kelompok', 'Pemanggilan Orang Tua'];

/** Pisahkan isi textarea menjadi daftar tindakan (pemisah " • ") */
function pecahTindakan(teks) {
  return String(teks || '').split('•')
    .map(function (t) { return t.trim(); })
    .filter(function (t) { return t !== ''; });
}

function gabungTindakan(daftar) { return daftar.join(' • '); }

/** Tampilkan / sembunyikan baris saran sesuai jenis dan besaran poin */
function perbaruiSaranTindakan() {
  const wadah = document.getElementById('saranTindakan');
  if (!wadah) return;

  const isPelanggaran = AppState.draftPoin.jenis === 'Pelanggaran';
  const inpPoin = document.getElementById('poinNilai');
  const besaran = Math.abs(Number(inpPoin ? inpPoin.value : 0) || 0);

  // Hanya untuk pelanggaran dengan bobot 30 poin ke atas
  if (!isPelanggaran || besaran < AMBANG_SARAN_TINDAKAN) { wadah.innerHTML = ''; return; }

  const terpakai = pecahTindakan(document.getElementById('poinTindakan').value);

  wadah.innerHTML =
    '<div class="kotak-saran">' +
      '<div class="label-kecil mb-2">' +
        '<i class="bi bi-exclamation-diamond-fill"></i> Pelanggaran berat (' + besaran + ' poin) — ' +
        'tindakan yang disarankan' +
      '</div>' +
      '<div class="d-flex flex-wrap gap-2">' +
        SARAN_TINDAKAN.map(function (t) {
          const aktif = terpakai.indexOf(t) !== -1;
          return '<button type="button" class="chip-saran' + (aktif ? ' aktif' : '') + '" ' +
            'onclick="alihkanSaranTindakan(\'' + escHtml(t) + '\')">' +
            '<i class="bi bi-' + (aktif ? 'check-circle-fill' : 'plus-circle') + '"></i> ' + escHtml(t) +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="form-text mt-2">Klik untuk menambahkan. Anda tetap dapat mengetik tindakan lain ' +
        'pada kolom di bawah, atau menggabungkan keduanya.</div>' +
    '</div>';
}

/** Tambah atau hapus satu tindakan saran dari kolom Tindakan Disipliner */
function alihkanSaranTindakan(teks) {
  const inp = document.getElementById('poinTindakan');
  if (!inp) return;

  const daftar = pecahTindakan(inp.value);
  const posisi = daftar.indexOf(teks);
  if (posisi === -1) daftar.push(teks); else daftar.splice(posisi, 1);

  inp.value = gabungTindakan(daftar);
  perbaruiSaranTindakan();
}

/** Hitung ulang kotak dampak poin + proyeksi zona, mengikuti nilai yang sedang diketik */
function hitungDampakPoin() {
  const el = document.getElementById('kotakDampak');
  if (!el) return;
  const isPelanggaran = AppState.draftPoin.jenis === 'Pelanggaran';
  const inpPoin = document.getElementById('poinNilai');
  const besaran = Math.abs(Number(inpPoin ? inpPoin.value : 0) || 0);
  const tanpaPoin = besaran === 0;

  const terpilih = AppState.draftPoin.nisnTerpilih
    .map(function (n) { return AppState.siswa.filter(function (s) { return String(s.NISN) === n; })[0]; })
    .filter(Boolean);

  let proyeksi = '';
  if (terpilih.length === 1) {
    const s = terpilih[0];
    const poinBaru = Number(s.PoinSaatIni) + (isPelanggaran ? -besaran : besaran);
    const zonaBaru = zonaDari(poinBaru);
    proyeksi = '<div class="mt-2" style="font-size:12px">Poin ' + escHtml(s.Nama) + ' setelah disimpan: ' +
      '<span class="mono" style="font-weight:700">' + poinBaru + '</span> ' +
      '<span class="lencana ' + kelasZona(zonaBaru) + '">' + zonaBaru + '</span>' +
      (tanpaPoin ? ' <span class="text-secondary-2">(tidak berubah)</span>' : '') + '</div>';
  } else if (terpilih.length > 1) {
    // Berapa siswa yang akan jatuh ke zona merah bila disimpan
    let jadiMerah = 0;
    terpilih.forEach(function (s) {
      const baru = Number(s.PoinSaatIni) + (isPelanggaran ? -besaran : besaran);
      if (zonaDari(baru) === 'Merah' && zonaDari(s.PoinSaatIni) !== 'Merah') jadiMerah++;
    });
    proyeksi = '<div class="mt-2" style="font-size:12px">Berlaku untuk <b>' + terpilih.length + ' siswa</b> sekaligus' +
      (jadiMerah ? ' • <span style="color:var(--merah-tx);font-weight:700">' + jadiMerah +
        ' siswa akan masuk zona merah</span>' : '') + '</div>';
  }

  perbaruiSaranTindakan();

  el.innerHTML = '<div class="kotak-dampak">' +
    '<div><div class="label-kecil">Dampak Poin</div>' +
      '<span class="nilai-poin ' + (tanpaPoin ? '' : (isPelanggaran ? 'minus' : 'plus')) + '"' +
        (tanpaPoin ? ' style="background:var(--bg-surface-3);color:var(--text-secondary)"' : '') + '>' +
        (tanpaPoin ? '0 Poin' : (isPelanggaran ? '-' : '+') + besaran + ' Poin') + '</span></div>' +
    '<div><div class="label-kecil">' + (tanpaPoin ? 'Pencatatan Tanpa Pengurangan Poin' : 'Status Pencatatan') + '</div>' +
      '<div style="font-weight:600;font-size:13.5px">' +
      (tanpaPoin
        ? 'Tercatat di riwayat sebagai pembinaan — poin siswa tetap'
        : 'Poin siswa akan diperbarui otomatis') + '</div>' +
      proyeksi + '</div>' +
  '</div>';
}

function pilihFotoBukti(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('Ukuran terlalu besar', 'Maksimal ukuran foto adalah 5 MB.', 'peringatan');
    input.value = ''; return;
  }
  // Foto bukti diperkecil maksimal 1280 px agar unggahan cepat meski dari kamera HP
  kompresGambar(file, 1280, function (hasil) {
    if (!hasil) { toast('Gagal', 'Foto tidak dapat dibaca.', 'bahaya'); input.value = ''; return; }
    AppState.draftPoin.foto = {
      nama: hasil.nama, mime: hasil.mime,
      base64: hasil.base64, dataUrl: hasil.dataUrl
    };
    tampilPratinjauFoto(hasil.dataUrl, hasil.nama);
  });
}

function tampilPratinjauFoto(dataUrl, nama) {
  const el = document.getElementById('pratinjauFoto');
  if (!el) return;
  el.innerHTML = '<div class="d-flex align-items-center gap-3">' +
    '<img src="' + dataUrl + '" class="pratinjau-unggah" style="max-height:90px" alt="Pratinjau bukti">' +
    '<div><div style="font-size:13px;font-weight:600">' + escHtml(nama) + '</div>' +
    '<button type="button" class="btn btn-hantu btn-kecil mt-2" onclick="hapusFotoBukti()">' +
    '<i class="bi bi-trash"></i> Hapus foto</button></div></div>';
}

function hapusFotoBukti() {
  AppState.draftPoin.foto = null;
  const inp = document.getElementById('poinFoto'); if (inp) inp.value = '';
  const el = document.getElementById('pratinjauFoto'); if (el) el.innerHTML = '';
}

function resetFormPoin() {
  AppState.draftPoin = {
    jenis: AppState.draftPoin.jenis, nisnTerpilih: [], idJenis: '',
    foto: null, cari: '', kelasCari: AppState.draftPoin.kelasCari || 'SEMUA'
  };
  renderInputPoin();
}

/**
 * OPTIMISTIC UI: poin siswa & riwayat diperbarui di layar SEKARANG,
 * lalu dikirim ke server di latar belakang.
 */
function simpanCatatanPoin(ev) {
  ev.preventDefault();
  const d        = AppState.draftPoin;
  const idJenis  = document.getElementById('poinJenis').value;
  const tanggal  = document.getElementById('poinTanggal').value;
  const catatan  = document.getElementById('poinCatatan').value.trim();
  const tindakan = document.getElementById('poinTindakan').value.trim();
  const besaran  = Math.abs(Number(document.getElementById('poinNilai').value) || 0);
  const jenis    = d.jenis;
  const isPelanggaran = jenis === 'Pelanggaran';
  const manual   = idJenis === 'MANUAL';

  if (!d.nisnTerpilih.length) {
    toast('Belum lengkap', 'Pilih minimal satu siswa terlebih dahulu.', 'peringatan');
    const inp = document.getElementById('poinCariSiswa'); if (inp) inp.focus();
    return;
  }
  if (!idJenis) { toast('Belum lengkap', 'Pilih jenis catatan, atau pilih "Lainnya — ketik manual".', 'peringatan'); return; }
  if (!tanggal) { toast('Belum lengkap', 'Tentukan tanggal kejadian.', 'peringatan'); return; }

  // ── Tentukan nama kejadian & kategori (dari master atau ketikan manual) ──
  let namaKejadian = '', kategori = '', simpanKeMaster = false;

  if (manual) {
    namaKejadian = document.getElementById('poinNamaManual').value.trim();
    kategori     = document.getElementById('poinKategoriManual').value.trim();
    const cbx    = document.getElementById('poinSimpanMaster');
    simpanKeMaster = !!(cbx && cbx.checked);
    if (!namaKejadian) {
      toast('Belum lengkap', 'Tuliskan nama kejadiannya terlebih dahulu.', 'peringatan');
      document.getElementById('poinNamaManual').focus();
      return;
    }
  } else {
    const sumber = isPelanggaran ? AppState.pelanggaran : AppState.kebaikan;
    const j = sumber.filter(function (x) { return String(x.ID) === String(idJenis); })[0];
    if (!j) { toast('Data tidak valid', 'Jenis poin tidak ditemukan.', 'bahaya'); return; }
    namaKejadian = isPelanggaran ? j.NamaPelanggaran : j.NamaKebaikan;
    kategori     = j.Kategori || '';
  }

  // ── Kumpulkan siswa terpilih ──
  const daftarSiswa = d.nisnTerpilih
    .map(function (n) { return AppState.siswa.filter(function (x) { return String(x.NISN) === n; })[0]; })
    .filter(Boolean);
  if (!daftarSiswa.length) { toast('Data tidak valid', 'Siswa tidak ditemukan.', 'bahaya'); return; }

  const delta = (isPelanggaran ? -1 : 1) * besaran;
  const tglTampil = formatTanggalDariInput(tanggal);
  const foto = d.foto;

  // ── 1. Perbarui tampilan seketika untuk SEMUA siswa (0 ms) ──
  const jejak = [];          // untuk membatalkan bila server menolak
  const masukMerah = [];
  const payload = [];

  daftarSiswa.forEach(function (siswa, i) {
    const idSementara = 'TMP-' + Date.now() + '-' + i;
    const zonaSebelum = zonaDari(siswa.PoinSaatIni);

    const catatanBaru = {
      ID: idSementara, NISN: String(siswa.NISN), NamaSiswa: siswa.Nama, Kelas: siswa.Kelas,
      Tanggal: tglTampil, Jenis: jenis,
      NamaKejadian: namaKejadian,
      Poin: delta, Hukuman: tindakan,
      Kategori: kategori, GuruPencatat: AppState.profil.nama,
      LinkFoto: '', Catatan: catatan, Status: 'Aktif', _menunggu: true
    };
    AppState.riwayat.unshift(catatanBaru);

    siswa.PoinSaatIni = Number(siswa.PoinSaatIni) + delta;
    siswa.StatusZona  = zonaDari(siswa.PoinSaatIni);
    if (siswa.StatusZona === 'Merah' && zonaSebelum !== 'Merah') masukMerah.push(siswa.Nama);

    jejak.push({ idSementara: idSementara, siswa: siswa });

    payload.push({
      nisn: String(siswa.NISN), jenis: jenis, idJenis: idJenis,
      namaKejadian: namaKejadian,
      poin: besaran,
      tindakan: tindakan,
      kategori: kategori,
      // Cukup satu catatan yang mendaftarkan jenis baru ke master
      simpanKeMaster: (i === 0) ? simpanKeMaster : false,
      tanggal: tglTampil, catatan: catatan,
      // Foto bukti dilampirkan ke catatan pertama saja agar tidak berulang di Drive
      fotoBase64: (i === 0 && foto) ? foto.base64 : null,
      fotoNama:   (i === 0 && foto) ? foto.nama   : null,
      fotoMime:   (i === 0 && foto) ? foto.mime   : null
    });
  });

  const jumlah = daftarSiswa.length;
  toast('Tersimpan',
    namaKejadian + ' • ' +
    (besaran === 0 ? 'tanpa pengurangan poin' : (delta > 0 ? '+' : '') + delta + ' poin') +
    ' untuk ' + (jumlah === 1 ? daftarSiswa[0].Nama : jumlah + ' siswa'), 'sukses');

  if (masukMerah.length) {
    toast('Zona Merah',
      (masukMerah.length === 1 ? masukMerah[0] : masukMerah.length + ' siswa') +
      ' memasuki zona merah. Notifikasi email dikirim ke wali kelas.', 'bahaya');
  }

  // Kembalikan poin & riwayat seperti semula bila penyimpanan gagal
  const batalkan = function () {
    jejak.forEach(function (j) {
      AppState.riwayat = AppState.riwayat.filter(function (r) { return r.ID !== j.idSementara; });
      j.siswa.PoinSaatIni = Number(j.siswa.PoinSaatIni) - delta;
      j.siswa.StatusZona  = zonaDari(j.siswa.PoinSaatIni);
    });
    renderUlang();
  };

  resetFormPoin();
  renderMenu();

  // ── 2. Satu panggilan server untuk seluruh siswa sekaligus ──
  tandaSinkron(true);
  google.script.run
    .withSuccessHandler(function (res) {
      tandaSinkron(false);
      if (!res.success) { batalkan(); return toast('Gagal disimpan', res.message, 'bahaya'); }

      // Ganti data sementara dengan data resmi dari server
      (res.data.tersimpan || []).forEach(function (resmi, i) {
        const j = jejak[i];
        if (!j) return;
        const idx = AppState.riwayat.findIndex(function (r) { return r.ID === j.idSementara; });
        if (idx !== -1) AppState.riwayat[idx] = resmi.riwayat;
        j.siswa.PoinSaatIni = resmi.poinBaru;
        j.siswa.StatusZona  = resmi.zonaBaru;
      });

      // Jenis baru yang didaftarkan ke master langsung masuk daftar pilihan
      if (res.data.masterBaru && res.data.masterBaru.length) {
        res.data.masterBaru.forEach(function (m) {
          if (m.tipe === 'pelanggaran') AppState.pelanggaran.push(m.record);
          else AppState.kebaikan.push(m.record);
        });
        toast('Master diperbarui', res.data.masterBaru.length +
          ' jenis baru kini tersedia di daftar pilihan.', 'sukses');
        renderInputPoin();
      }

      if (AppState.halamanAktif !== 'inputPoin') renderUlang();
    })
    .withFailureHandler(function (err) {
      tandaSinkron(false);
      batalkan();
      toast('Koneksi gagal', 'Catatan dibatalkan: ' + err.message, 'bahaya');
    })
    .simpanPoinBatch(AppState.token, payload);
}

/** Ubah nilai input type=date (yyyy-mm-dd) menjadi dd/mm/yyyy — tanpa jam */
function formatTanggalDariInput(v) {
  if (!v) return '';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '/' + m[2] + '/' + m[1];
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}

// Catatan: fungsi aktivitasGuruIni() dihapus pada v2.19 bersama panel
// "Aktivitas Terbaru" di halaman Input Poin — satu-satunya pemakainya.

// ════════════════════════════════════════════════════════════════════
// BAGIAN 11: HALAMAN — DATA SISWA
// ════════════════════════════════════════════════════════════════════

function renderDataSiswa() {
  const p = AppState.profil;
  const bolehEdit = bolehKelolaSiswa();
  const satuKelas = lingkupSatuKelas();   // wali kelas → langsung kelasnya, tanpa filter
  const semua = siswaDalamLingkup();
  const f = AppState.filter;

  let data = semua.slice();
  // Filter kelas hanya berlaku bagi peran berlingkup penuh
  if (!satuKelas && f.kelasDipilih !== 'SEMUA') {
    data = data.filter(function (s) { return String(s.Kelas) === f.kelasDipilih; });
  }
  if (f.zonaDipilih !== 'SEMUA') data = data.filter(function (s) { return zonaDari(s.PoinSaatIni) === f.zonaDipilih; });
  if (f.siswa) {
    const q = f.siswa.toLowerCase();
    data = data.filter(function (s) {
      return String(s.Nama).toLowerCase().indexOf(q) !== -1 || String(s.NISN).indexOf(q) !== -1;
    });
  }
  data = urutSiswa(data);   // kelas menaik secara alami (7A, 8A, 9A, 10A), lalu nama A→Z

  const opsiKelas = '<option value="SEMUA">Semua Kelas</option>' + AppState.kelas.map(function (k) {
    return '<option value="' + escHtml(k) + '"' + (f.kelasDipilih === k ? ' selected' : '') + '>Kelas ' + escHtml(k) + '</option>';
  }).join('');

  const opsiZona = ['SEMUA','Hijau','Kuning','Merah'].map(function (z) {
    return '<option value="' + z + '"' + (f.zonaDipilih === z ? ' selected' : '') + '>' +
      (z === 'SEMUA' ? 'Semua Status Zona' : 'Zona ' + z) + '</option>';
  }).join('');

  const html =
  '<div class="judul-seksi">' +
    '<div>' +
      '<h2>' + (satuKelas ? 'Siswa Kelas ' + escHtml(p.waliKelas) : 'Data Peserta Didik') + '</h2>' +
      '<p>' + (satuKelas
        ? 'Kelas perwalian Anda • <b>' + semua.length + '</b> siswa' +
          (f.siswa || f.zonaDipilih !== 'SEMUA' ? ' • menampilkan <b>' + data.length + '</b> hasil' : '')
        : 'Total <b>' + semua.length + '</b> siswa terdaftar • menampilkan <b>' + data.length + '</b> hasil') +
      '</p>' +
    '</div>' +
    '<div class="aksi">' +
      (bolehEdit ? '<button class="btn btn-hantu" onclick="bukaImport(\'siswa\')"><i class="bi bi-upload"></i> Import Excel</button>' +
                   '<button class="btn btn-navy" onclick="bukaFormSiswa()"><i class="bi bi-person-plus"></i> Tambah Siswa</button>' : '') +
    '</div>' +
  '</div>' +

  '<div class="card mb-3"><div class="card-body">' +
    '<div class="row g-2">' +
      '<div class="col-12 ' + (satuKelas ? 'col-md-8' : 'col-md-5') + '">' +
        '<div class="kotak-cari"><i class="bi bi-search"></i>' +
        '<input class="form-control" placeholder="Cari nama atau NISN…" value="' + escHtml(f.siswa) + '" oninput="cariSiswa(this.value)"></div></div>' +
      // Filter kelas disembunyikan untuk wali kelas — daftarnya sudah otomatis kelasnya sendiri
      (satuKelas ? '' :
        '<div class="col-6 col-md-3"><select class="form-select" onchange="filterKelas(this.value)">' + opsiKelas + '</select></div>') +
      '<div class="col-' + (satuKelas ? '8' : '6') + ' col-md-3"><select class="form-select" onchange="filterZona(this.value)">' +
        opsiZona + '</select></div>' +
      '<div class="col-' + (satuKelas ? '4' : '12') + ' col-md-1">' +
        '<button class="btn btn-hantu w-100" onclick="resetFilterSiswa()" title="Reset filter">' +
        '<i class="bi bi-arrow-counterclockwise"></i></button></div>' +
    '</div>' +
  '</div></div>' +

  '<div class="bungkus-tabel">' + tabelSiswa(data, bolehEdit, satuKelas) + '</div>';

  document.getElementById('section-dataSiswa').innerHTML = html;
}

/**
 * Status pembinaan seorang siswa untuk kolom PEMBINAAN pada Data Siswa.
 * Terutama berguna bagi siswa yang sudah TUNTAS dibina — ia sudah keluar dari
 * menu Tindak Lanjut, sehingga tanpa penanda ini jejaknya tidak terlihat
 * di mana pun pada tampilan harian.
 */
function statusPembinaan(nisn) {
  const tl = AppState.tindakLanjut.filter(function (t) { return String(t.NISN) === String(nisn); });
  if (!tl.length) return null;

  let terbaru = null, waktu = -1;
  tl.forEach(function (t) {
    const w = uraiTanggal(t.Tanggal);
    if (w >= waktu) { waktu = w; terbaru = t; }
  });

  const jumlahEvaluasi = tl.reduce(function (n, t) {
    return n + evaluasiSesi(String(t.IDGrup || t.ID)).length;
  }, 0);

  return {
    jumlahSesi: tl.length,
    tuntas: String(terbaru.StatusTL).toLowerCase() === 'selesai',
    tanggal: terbaru.Tanggal,
    jenis: terbaru.JenisTindakan,
    jumlahEvaluasi: jumlahEvaluasi
  };
}

function lencanaPembinaan(nisn) {
  const p = statusPembinaan(nisn);
  if (!p) return '<span class="text-secondary-2" style="font-size:12.5px">—</span>';

  const judul = p.jenis + ' • ' + p.jumlahSesi + ' sesi • ' +
                p.jumlahEvaluasi + ' evaluasi (terakhir ' + p.tanggal + ')';

  return '<span class="lencana ' + (p.tuntas ? 'hijau' : 'kuning') + '" title="' + escHtml(judul) + '">' +
      '<i class="bi bi-' + (p.tuntas ? 'check2-circle' : 'hourglass-split') + '"></i> ' +
      (p.tuntas ? 'Tuntas' : 'Dibina') +
    '</span>' +
    '<div class="sub mono" style="font-size:11px;color:var(--text-secondary);margin-top:3px">' +
      escHtml(p.tanggal) + (p.jumlahEvaluasi ? ' • ' + p.jumlahEvaluasi + ' evaluasi' : '') +
    '</div>';
}

function tabelSiswa(data, bolehEdit, satuKelas) {
  if (!data.length) {
    return '<div class="kosong"><i class="bi bi-search"></i><h6>Tidak ada siswa yang cocok</h6>' +
      '<p class="mb-0">Ubah kata kunci atau filter untuk menampilkan data.</p></div>';
  }
  return '<table class="tabel"><thead><tr>' +
      '<th style="width:48px">NO</th><th>NAMA SISWA</th><th>NISN</th>' +
      (satuKelas ? '' : '<th>KELAS</th>') +
      '<th class="text-center">POIN</th><th>STATUS ZONA</th>' +
      (bolehLihatTindakLanjut() ? '<th>PEMBINAAN</th>' : '') +
      '<th>KEJADIAN TERAKHIR</th><th style="width:96px">AKSI</th>' +
    '</tr></thead><tbody>' +
    data.map(function (s, i) {
      const z = zonaDari(s.PoinSaatIni);
      const terakhir = AppState.riwayat.filter(function (r) { return String(r.NISN) === String(s.NISN); })[0];
      return '<tr class="' + (z === 'Merah' ? 'baris-merah' : '') + '">' +
        '<td class="mono">' + String(i + 1).padStart(2, '0') + '</td>' +
        '<td><div class="sel-nama"><div class="avatar-mini">' + inisial(s.Nama) + '</div>' +
          '<div><div style="font-weight:600">' + escHtml(s.Nama) + '</div>' +
          '<div class="sub">' + (s.JenisKelamin === 'P' ? 'Perempuan' : (s.JenisKelamin === 'L' ? 'Laki-laki' : '—')) + '</div></div></div></td>' +
        '<td class="mono">' + escHtml(s.NISN) + '</td>' +
        (satuKelas ? '' : '<td>' + escHtml(s.Kelas) + '</td>') +
        '<td class="text-center mono" style="font-weight:700;font-size:15px">' + escHtml(s.PoinSaatIni) + '</td>' +
        '<td><span class="lencana ' + kelasZona(z) + '">' + z + (z === 'Hijau' ? ' (Aman)' : (z === 'Kuning' ? ' (Waspada)' : ' (Kritis)')) + '</span></td>' +
        (bolehLihatTindakLanjut() ? '<td>' + lencanaPembinaan(s.NISN) + '</td>' : '') +
        '<td style="font-size:12.5px;color:var(--text-secondary)">' +
          (terakhir ? escHtml(potong(terakhir.NamaKejadian, 28)) : 'Tidak ada pelanggaran') + '</td>' +
        '<td><div class="aksi-baris">' +
          '<button class="btn btn-hantu btn-mini" title="Lihat detail" onclick="bukaDetailSiswa(\'' + escHtml(s.NISN) + '\')"><i class="bi bi-eye"></i></button>' +
          (bolehEdit ? '<button class="btn btn-hantu btn-mini" title="Edit" onclick="bukaFormSiswa(\'' + escHtml(s.ID) + '\')"><i class="bi bi-pencil"></i></button>' +
                       '<button class="btn btn-hantu btn-mini" title="Hapus" onclick="hapusSiswa(\'' + escHtml(s.ID) + '\',\'' + escHtml(s.Nama) + '\')"><i class="bi bi-trash"></i></button>' : '') +
        '</div></td>' +
      '</tr>';
    }).join('') + '</tbody></table>';
}

let timerCari;
function cariSiswa(q) {
  clearTimeout(timerCari);
  timerCari = setTimeout(function () {       // debounce 250 ms, filter lokal → instan
    AppState.filter.siswa = q;
    renderDataSiswa();
    const inp = document.querySelector('#section-dataSiswa .kotak-cari input');
    if (inp) { inp.focus(); inp.setSelectionRange(q.length, q.length); }
  }, 250);
}
function filterKelas(v) {
  AppState.filter.kelasDipilih = v; simpanPreferensi({ kelasDipilih: v }); renderDataSiswa();
}
function filterZona(v) {
  AppState.filter.zonaDipilih = v; simpanPreferensi({ zonaDipilih: v }); renderDataSiswa();
}
function resetFilterSiswa() {
  AppState.filter.siswa = ''; AppState.filter.kelasDipilih = 'SEMUA'; AppState.filter.zonaDipilih = 'SEMUA';
  renderDataSiswa();
}

function bukaFormSiswa(id) {
  const s = id ? AppState.siswa.filter(function (x) { return String(x.ID) === String(id); })[0] : {};
  const opsiKelas = AppState.kelas.map(function (k) {
    return '<option value="' + escHtml(k) + '"' + (s.Kelas === k ? ' selected' : '') + '>' + escHtml(k) + '</option>';
  }).join('');

  bukaModalForm(id ? 'Edit Data Siswa' : 'Tambah Siswa Baru',
    '<div class="mb-3"><label class="form-label">Nama Lengkap <span class="wajib">*</span></label>' +
      '<input class="form-control" id="fSiswaNama" value="' + escHtml(s.Nama || '') + '" required></div>' +
    '<div class="mb-3"><label class="form-label">NISN <span class="wajib">*</span></label>' +
      '<input class="form-control mono" id="fSiswaNisn" value="' + escHtml(s.NISN || '') + '" inputmode="numeric" required></div>' +
    '<div class="row g-2 mb-3">' +
      '<div class="col-6"><label class="form-label">Tanggal Lahir <span class="wajib">*</span></label>' +
        '<input class="form-control mono" id="fSiswaTgl" placeholder="dd-mm-yyyy" inputmode="numeric" maxlength="10" ' +
        'oninput="formatTanggalKetik(this)" value="' + escHtml(s.TanggalLahir || '') + '" required></div>' +
      '<div class="col-6"><label class="form-label">Jenis Kelamin</label>' +
        '<select class="form-select" id="fSiswaJk">' +
          '<option value="L"' + (s.JenisKelamin === 'L' ? ' selected' : '') + '>Laki-laki</option>' +
          '<option value="P"' + (s.JenisKelamin === 'P' ? ' selected' : '') + '>Perempuan</option>' +
        '</select></div>' +
    '</div>' +
    '<div class="row g-2 mb-3">' +
      '<div class="col-6"><label class="form-label">Kelas <span class="wajib">*</span></label>' +
        '<input class="form-control" id="fSiswaKelas" list="daftarKelas" value="' + escHtml(s.Kelas || '') + '" required>' +
        '<datalist id="daftarKelas">' + opsiKelas + '</datalist></div>' +
      '<div class="col-6"><label class="form-label">Poin Saat Ini</label>' +
        '<input type="number" class="form-control mono" id="fSiswaPoin" value="' +
        escHtml(s.PoinSaatIni !== undefined ? s.PoinSaatIni : AppState.konfigurasi.poinAwal) + '"></div>' +
    '</div>' +
    '<div class="kotak-info"><i class="bi bi-info-circle"></i><div>Tanggal lahir wajib berformat ' +
      '<b class="mono">dd-mm-yyyy</b> dan juga berfungsi sebagai <b>password login siswa</b>.</div></div>',
    function (modal) {
      const rec = {
        ID: id || '',
        Nama: document.getElementById('fSiswaNama').value.trim(),
        NISN: document.getElementById('fSiswaNisn').value.trim(),
        TanggalLahir: document.getElementById('fSiswaTgl').value.trim(),
        JenisKelamin: document.getElementById('fSiswaJk').value,
        Kelas: document.getElementById('fSiswaKelas').value.trim(),
        PoinSaatIni: Number(document.getElementById('fSiswaPoin').value)
      };
      if (!rec.Nama || !rec.NISN || !rec.Kelas || !rec.TanggalLahir) {
        return toast('Belum lengkap', 'Nama, NISN, tanggal lahir, dan kelas wajib diisi.', 'peringatan');
      }
      if (rec.TanggalLahir.replace(/\D/g, '').length !== 8) {
        return toast('Format salah', 'Tanggal lahir harus dd-mm-yyyy, contoh 17-05-2011.', 'peringatan');
      }
      simpanMasterData(SHEET.SISWA, rec, modal);
    });
}

function hapusSiswa(id, nama) {
  konfirmasi('Hapus Data Siswa',
    'Hapus data "' + nama + '"? Riwayat poin siswa ini tetap tersimpan di arsip.',
    function () { hapusMasterData(SHEET.SISWA, id); }, 'Ya, Hapus');
}

function bukaDetailSiswa(nisn) {
  AppState.detailNisn = nisn;
  navigateTo('detailSiswa');
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 12: HALAMAN — DETAIL SISWA / PORTAL SISWA
// ════════════════════════════════════════════════════════════════════

function renderDetailSiswa() {
  const s = AppState.siswa.filter(function (x) { return String(x.NISN) === String(AppState.detailNisn); })[0];
  const el = document.getElementById('section-detailSiswa');
  if (!s) {
    el.innerHTML = '<div class="kosong"><i class="bi bi-person-x"></i><h6>Data siswa tidak ditemukan</h6>' +
      '<button class="btn btn-hantu mt-2" onclick="navigateTo(\'dataSiswa\')">Kembali</button></div>';
    return;
  }
  el.innerHTML = '<button class="btn btn-hantu btn-kecil mb-3" onclick="navigateTo(\'dataSiswa\')">' +
    '<i class="bi bi-arrow-left"></i> Kembali ke Data Siswa</button>' + kartuKarakter(s, true);
}

function renderPortalSiswa() {
  const s = AppState.siswa[0];
  const el = document.getElementById('section-portalSiswa');
  if (!s) {
    el.innerHTML = '<div class="kosong"><i class="bi bi-person-x"></i><h6>Data tidak ditemukan</h6></div>';
    return;
  }
  el.innerHTML = kartuKarakter(s, false);
}

/**
 * Kartu riwayat pembinaan pada halaman Detail Siswa.
 * Hanya untuk guru — siswa tidak melihat catatan pembinaan atas dirinya.
 * Inilah tempat menelusuri kembali siswa yang sudah TUNTAS dan karena itu
 * tidak lagi muncul di menu Tindak Lanjut.
 */
function kartuPembinaanSiswa(s) {
  if (!bolehLihatTindakLanjut()) return '';

  const grup = {};
  AppState.tindakLanjut.forEach(function (t) {
    if (String(t.NISN) !== String(s.NISN)) return;
    grup[String(t.IDGrup || t.ID)] = t;
  });
  const daftar = Object.keys(grup).map(function (k) { return grup[k]; })
    .sort(function (a, b) { return uraiTanggal(b.Tanggal) - uraiTanggal(a.Tanggal); });

  if (!daftar.length) return '';

  const total = daftar.length;

  return '<div class="card mb-3">' +
    '<div class="card-header">' +
      '<div><h5><i class="bi bi-clipboard2-pulse"></i> Riwayat Pembinaan</h5>' +
      '<p class="sub">' + total + ' sesi tindak lanjut Guru BK beserta evaluasi berkalanya</p></div>' +
      '<div class="kanan">' + lencanaPembinaan(s.NISN) + '</div>' +
    '</div>' +
    '<div class="card-body"><div class="linimasa">' +
      daftar.map(function (t, urut) {
        const idGrup = String(t.IDGrup || t.ID);
        const nomorSesi = total - urut;   // daftar terbaru di atas, penomoran kronologis
        const tuntas = String(t.StatusTL).toLowerCase() === 'selesai';
        const ev = evaluasiSesi(idGrup);
        return '<div class="item-linimasa ' + (tuntas ? 'plus' : 'minus') + '">' +
          '<div class="tanda"><i class="bi bi-' + (tuntas ? 'check2-circle' : 'hourglass-split') + '"></i></div>' +
          '<div class="isi">' +
            '<div class="kepala">' +
              '<span class="lencana netral">Sesi ke-' + nomorSesi + '</span>' +
              '<span class="lencana info">' + escHtml(t.JenisTindakan) + '</span>' +
              '<span class="lencana ' + (tuntas ? 'hijau' : 'kuning') + '">' +
                escHtml(t.StatusTL || 'Proses') + '</span>' +
              '<span class="meta"><i class="bi bi-calendar3"></i> ' + escHtml(t.Tanggal) + '</span>' +
            '</div>' +
            '<div class="kotak-hukuman" style="border-left-color:var(--navy)">' +
              '<b>Catatan Tindak Lanjut:</b> ' + escHtml(t.CatatanTindakLanjut) + '</div>' +
            ringkasEvaluasiHtml({ evaluasi: ev, evaluasiLama: t.Evaluasi }) +
            '<div class="meta mt-2"><i class="bi bi-person-badge"></i> Petugas: ' + escHtml(t.Petugas) + '</div>' +
            // Tolok ukur kemunculan kembali — ditampilkan agar mudah diperiksa
            (tuntas
              ? '<div class="meta"><i class="bi bi-bullseye"></i> Poin saat dituntaskan: ' +
                  (String(t.PoinSaatTuntas || '').trim() !== ''
                    ? '<b>' + escHtml(t.PoinSaatTuntas) + '</b> — siswa muncul kembali bila poinnya turun di bawah angka ini'
                    : '<b>belum terekam</b> (sesi lama) — penilaian memakai perbandingan tanggal') +
                '</div>'
              : '') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div></div>' +
  '</div>';
}

/** Kartu karakter siswa — dipakai portal siswa & detail dari sisi guru */
function kartuKarakter(s, tampilkanAksiGuru) {
  const z = zonaDari(s.PoinSaatIni);
  const riwayat = AppState.riwayat.filter(function (r) { return String(r.NISN) === String(s.NISN); });
  const plus  = riwayat.filter(function (r) { return Number(r.Poin) > 0; });
  const minus = riwayat.filter(function (r) { return Number(r.Poin) < 0; });
  const totalPlus  = plus.reduce(function (a, r) { return a + Number(r.Poin); }, 0);
  const totalMinus = minus.reduce(function (a, r) { return a + Number(r.Poin); }, 0);

  const wali = AppState.guru.filter(function (g) { return String(g.WaliKelas) === String(s.Kelas); })[0];
  const maksBar = Math.max(Number(s.PoinSaatIni), 120);
  const persenBar = Math.max(4, Math.min(100, (Number(s.PoinSaatIni) / maksBar) * 100));

  return '' +
  '<div class="card mb-3"><div class="card-body">' +
    '<div class="d-flex flex-wrap align-items-center gap-3">' +
      '<div class="avatar-mini" style="width:56px;height:56px;flex:0 0 56px;font-size:19px">' + inisial(s.Nama) + '</div>' +
      '<div style="min-width:0;flex:1">' +
        '<div class="d-flex flex-wrap align-items-center gap-2">' +
          '<h2 class="mb-0">' + escHtml(s.Nama) + '</h2>' +
          '<span class="lencana ' + kelasZona(z) + '">Zona ' + z + (z === 'Hijau' ? ' • Teladan' : '') + '</span>' +
        '</div>' +
        '<p class="mb-0 text-secondary-2" style="font-size:13px">' +
          '<i class="bi bi-upc-scan"></i> NISN <span class="mono">' + escHtml(s.NISN) + '</span> &nbsp;•&nbsp; ' +
          '<i class="bi bi-mortarboard"></i> Kelas ' + escHtml(s.Kelas) + ' &nbsp;•&nbsp; ' +
          '<i class="bi bi-person-check"></i> Wali Kelas: ' + escHtml(wali ? wali.Nama : '—') + '</p>' +
      '</div>' +
      (tampilkanAksiGuru ?
        '<button class="btn btn-gold" onclick="prefillInputPoin(\'' + escHtml(s.NISN) + '\')">' +
        '<i class="bi bi-plus-lg"></i> Catat Poin</button>' : '') +
    '</div>' +

    '<div class="pemisah"></div>' +

    '<div class="label-kecil mb-2">Status Akumulasi Poin Karakter</div>' +
    '<div class="d-flex flex-wrap align-items-end gap-2 mb-2">' +
      '<div class="mono" style="font-size:34px;font-weight:700;line-height:1">' + escHtml(s.PoinSaatIni) + '</div>' +
      '<div class="text-secondary-2 mb-1" style="font-size:13px">Poin • baseline awal ' + escHtml(AppState.konfigurasi.poinAwal) + '</div>' +
      '<div class="ms-auto mb-1" style="font-size:12px;color:var(--text-secondary)">Batas aman minimal: <b class="mono">' + escHtml(AppState.konfigurasi.batasHijau) + '</b></div>' +
    '</div>' +
    '<div class="bar-poin ' + kelasZona(z) + '"><span style="width:' + persenBar + '%"></span></div>' +
    '<div class="skala-zona">' +
      '<span><span class="lencana merah polos" style="padding:1px 7px">Merah &lt; ' + escHtml(AppState.konfigurasi.batasMerah) + '</span></span>' +
      '<span><span class="lencana kuning polos" style="padding:1px 7px">Kuning ' + escHtml(AppState.konfigurasi.batasMerah) + '–' + escHtml(AppState.konfigurasi.batasHijau) + '</span></span>' +
      '<span><span class="lencana hijau polos" style="padding:1px 7px">Hijau &gt; ' + escHtml(AppState.konfigurasi.batasHijau) + '</span></span>' +
    '</div>' +
  '</div></div>' +

  '<div class="grid-zona">' +
    kartuRingkas('zona-navy',  'bi-star-fill',        'Total Poin Aktif', s.PoinSaatIni, 'Selisih ' + (Number(s.PoinSaatIni) - Number(AppState.konfigurasi.poinAwal) >= 0 ? '+' : '') + (Number(s.PoinSaatIni) - Number(AppState.konfigurasi.poinAwal)) + ' dari baseline') +
    kartuRingkas('zona-hijau', 'bi-patch-check-fill', 'Kebaikan Tercatat', '+' + totalPlus, plus.length + ' aktivitas prestasi & kontribusi') +
    kartuRingkas('zona-merah', 'bi-exclamation-triangle-fill', 'Pelanggaran Tercatat', totalMinus, minus.length + ' insiden tata tertib') +
  '</div>' +

  (tampilkanAksiGuru ? kartuPembinaanSiswa(s) : '') +

  '<div class="tata-utama">' +
    '<div class="card">' +
      '<div class="card-header">' +
        '<div><h5>Riwayat Poin Karakter</h5><p class="sub">Catatan audit kedisiplinan dan apresiasi prestasi</p></div>' +
        '<div class="kanan"><span class="lencana netral polos">' + riwayat.length + ' catatan</span></div>' +
      '</div>' +
      '<div class="card-body">' + linimasaRiwayat(riwayat) + '</div>' +
    '</div>' +

    '<div class="tumpuk">' +
      '<div class="card">' +
        '<div class="card-header"><div><h5><i class="bi bi-signpost-split"></i> Pedoman Zona Karakter</h5></div></div>' +
        '<div class="card-body d-flex flex-column gap-2">' +
          pedomanZona('hijau',  'Zona Hijau (&gt; ' + AppState.konfigurasi.batasHijau + ' Poin)', 'AMAN',
            'Hak apresiasi penuh, rekomendasi beasiswa akademik/non-akademik, serta prioritas perwakilan lomba sekolah.') +
          pedomanZona('kuning', 'Zona Kuning (' + AppState.konfigurasi.batasMerah + ' – ' + AppState.konfigurasi.batasHijau + ' Poin)', 'WASPADA',
            'Menerima surat peringatan pembinaan berkala serta sesi mentoring pendampingan dari Wali Kelas.') +
          pedomanZona('merah',  'Zona Merah (&lt; ' + AppState.konfigurasi.batasMerah + ' Poin)', 'KRITIS',
            'Panggilan resmi Orang Tua/Wali ke sekolah, penandatanganan pakta integritas, dan konseling intensif Guru BK.') +
          '<button class="btn btn-hantu btn-kecil mt-2" onclick="navigateTo(\'tataTertib\')">' +
            '<i class="bi bi-file-earmark-pdf"></i> Unduh Buku Saku Tata Tertib</button>' +
        '</div>' +
      '</div>' +

      '<div class="panel-wawasan">' +
        '<h6><i class="bi bi-quote"></i> Mutiara Adab Siswa</h6>' +
        '<p style="font-size:13.5px;font-style:italic;margin:0 0 8px;opacity:.95">' +
          '“Adab dan ketertiban adalah mahkota terbaik bagi seorang penuntut ilmu. ' +
          'Prestasi gemilang berakar dari karakter yang teguh.”</p>' +
        '<div style="font-size:12px;opacity:.8">— Panduan Karakter Peserta Didik</div>' +
      '</div>' +

      '<div class="kotak-info"><i class="bi bi-shield-lock"></i><div>' +
        'Data ini bersifat pribadi dan hanya dapat diakses oleh siswa bersangkutan, Wali Kelas, ' +
        'Guru BK, Kepala Sekolah, dan Administrator.</div></div>' +
    '</div>' +
  '</div>';
}

function kartuRingkas(kelas, ikon, label, nilai, sub) {
  return '<div class="kartu-zona ' + kelas + '">' +
    '<div class="atas"><div class="label">' + label + '</div>' +
      '<div class="lencana-ikon"><i class="bi ' + ikon + '"></i></div></div>' +
    '<div class="angka">' + escHtml(nilai) + '</div>' +
    '<div class="kaki"><span>' + sub + '</span></div></div>';
}

function pedomanZona(warna, judul, status, isi) {
  return '<div style="background:var(--' + warna + '-bg);border-radius:var(--r-md);padding:12px 14px">' +
    '<div class="d-flex align-items-center gap-2 mb-1">' +
      '<span style="font-weight:600;font-size:13px;color:var(--' + warna + '-tx)">' + judul + '</span>' +
      '<span style="margin-left:auto;font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--' + warna + '-tx)">' + status + '</span>' +
    '</div><p style="margin:0;font-size:12px;color:var(--' + warna + '-tx);opacity:.9">' + isi + '</p></div>';
}

function linimasaRiwayat(riwayat) {
  if (!riwayat.length) {
    return '<div class="kosong"><i class="bi bi-journal-check"></i><h6>Belum ada catatan</h6>' +
      '<p class="mb-0">Belum ada pelanggaran maupun kebaikan yang tercatat.</p></div>';
  }
  return '<div class="linimasa">' + riwayat.map(function (r) {
    const plus = Number(r.Poin) >= 0;
    return '<div class="item-linimasa ' + (plus ? 'plus' : 'minus') + '">' +
      '<div class="tanda"><i class="bi ' + (plus ? 'bi-trophy-fill' : 'bi-exclamation-triangle-fill') + '"></i></div>' +
      '<div class="isi">' +
        '<div class="kepala">' +
          '<span class="lencana ' + (plus ? 'hijau' : 'merah') + '">' + escHtml(r.Kategori || r.Jenis) + '</span>' +
          '<span class="meta">' + escHtml(r.Tanggal) + '</span>' +
          (r._menunggu ? '<span class="lencana netral polos"><span class="spinner-inline" style="border-color:var(--text-muted);border-top-color:transparent"></span> menyimpan</span>' : '') +
        '</div>' +
        '<div class="judul">' + escHtml(r.NamaKejadian) + '</div>' +
        '<div class="meta"><i class="bi bi-person-badge"></i> Pencatat: ' + escHtml(r.GuruPencatat) +
          (r.Catatan ? ' &nbsp;•&nbsp; <i class="bi bi-chat-left-text"></i> ' + escHtml(r.Catatan) : '') + '</div>' +
        (r.Hukuman ? '<div class="kotak-hukuman"><b>' +
          (catatanPelanggaran(r) ? 'Tindakan Disipliner' : 'Bentuk Apresiasi') + ':</b> ' +
          escHtml(r.Hukuman) + '</div>' : '') +
        (r.LinkFoto ? '<button class="btn btn-hantu btn-kecil mt-2" onclick="pratinjau(\'' + escHtml(r.LinkFoto) + '\',\'Bukti Kejadian\',\'gambar\')">' +
          '<i class="bi bi-image"></i> Lihat bukti foto</button>' : '') +
      '</div>' +
      '<div class="d-flex flex-column align-items-end gap-2">' +
        '<div class="nilai ' + (Number(r.Poin) === 0 ? 'text-secondary-2' : (plus ? 'poin-plus' : 'poin-minus')) + '">' +
          (Number(r.Poin) === 0 ? '0' : (plus ? '+' : '') + escHtml(r.Poin)) + '</div>' +
        (bolehKelolaRiwayat(r) && !r._menunggu ? '<div class="aksi-baris">' +
          '<button class="btn btn-hantu btn-mini" title="Edit" onclick="bukaEditRiwayat(\'' + escHtml(r.ID) + '\')"><i class="bi bi-pencil"></i></button>' +
          '<button class="btn btn-hantu btn-mini" title="Hapus" onclick="konfirmasiHapusRiwayat(\'' + escHtml(r.ID) + '\')"><i class="bi bi-trash"></i></button></div>' : '') +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function prefillInputPoin(nisn) {
  AppState.draftPoin.nisnTerpilih = [String(nisn)];
  navigateTo('inputPoin');
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 13: HALAMAN — RIWAYAT POIN
// ════════════════════════════════════════════════════════════════════

/**
 * Lingkup halaman Riwayat Poin.
 * Guru tanpa jabatan tambahan hanya melihat catatan yang IA sendiri buat —
 * sesuai wewenangnya, yang memang hanya boleh mengubah catatannya sendiri.
 * Wali kelas tetap sebatas kelas perwaliannya, peran lain melihat seluruhnya.
 */
function riwayatHalamanRiwayat() {
  if (isGuruBiasa()) return AppState.riwayat.filter(catatanMilikSaya);
  return riwayatDalamLingkup();
}

/** Kelas warna nilai poin pada riwayat (0 poin tetap netral) */
function kelasPoinRiwayat(r) {
  const n = Number(r.Poin);
  return n === 0 ? 'text-secondary-2' : (n > 0 ? 'poin-plus' : 'poin-minus');
}

/** Tampilan nilai poin: 0 apa adanya, positif diberi tanda plus */
function labelPoinRiwayat(r) {
  const n = Number(r.Poin);
  return n === 0 ? '0' : (n > 0 ? '+' : '') + escHtml(r.Poin);
}

/** Tombol lihat bukti foto — dipakai tabel maupun kartu */
function tombolBuktiRiwayat(r) {
  return r.LinkFoto
    ? '<button class="btn btn-hantu btn-mini" title="Lihat bukti foto" onclick="pratinjau(\'' +
      escHtml(r.LinkFoto) + '\',\'Bukti Kejadian\',\'gambar\')"><i class="bi bi-image"></i></button>'
    : '';
}

/** Tombol ubah & hapus, atau ikon gembok bila bukan wewenangnya */
function tombolKelolaRiwayat(r) {
  if (!bolehKelolaRiwayat(r)) {
    return '<span class="text-secondary-2" title="Dicatat guru lain"><i class="bi bi-lock"></i></span>';
  }
  return '<button class="btn btn-hantu btn-mini" title="Ubah" onclick="bukaEditRiwayat(\'' +
      escHtml(r.ID) + '\')"><i class="bi bi-pencil"></i></button>' +
    '<button class="btn btn-hantu btn-mini" title="Hapus" onclick="konfirmasiHapusRiwayat(\'' +
      escHtml(r.ID) + '\')"><i class="bi bi-trash"></i></button>';
}

/** Satu baris riwayat digambar sebagai kartu — dipakai pada layar ponsel */
function kartuRiwayat(r) {
  const pelanggaran = catatanPelanggaran(r);
  const label = pelanggaran ? 'Tindakan' : 'Apresiasi';
  return '<div class="kartu-riwayat">' +
    '<div class="kr-atas">' +
      '<div style="min-width:0">' +
        '<div class="kr-nama">' + escHtml(r.NamaSiswa) +
          '<span class="cap-kelas">' + escHtml(r.Kelas) + '</span></div>' +
        '<div class="kr-sub mono">' + escHtml(r.NISN) + ' • ' + escHtml(r.Tanggal) + '</div>' +
      '</div>' +
      '<div class="kr-poin mono ' + kelasPoinRiwayat(r) + '">' + labelPoinRiwayat(r) + '</div>' +
    '</div>' +
    '<div class="kr-kejadian">' + escHtml(r.NamaKejadian) +
      (r.Kategori ? '<div class="kr-sub">' + escHtml(r.Kategori) + '</div>' : '') + '</div>' +
    (r.Hukuman
      ? '<div class="kr-baris"><span class="kr-label">' + label + '</span>' +
        '<span>' + escHtml(r.Hukuman) + '</span></div>'
      : '') +
    '<div class="kr-kaki">' +
      '<span class="kr-sub" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        escHtml(r.GuruPencatat) + '</span>' +
      '<div class="aksi-baris">' + tombolBuktiRiwayat(r) + tombolKelolaRiwayat(r) + '</div>' +
    '</div>' +
  '</div>';
}

function renderRiwayat() {
  let data = riwayatHalamanRiwayat();
  const q = AppState.filter.riwayat.toLowerCase();
  if (q) {
    data = data.filter(function (r) {
      return String(r.NamaSiswa).toLowerCase().indexOf(q) !== -1 ||
             String(r.NamaKejadian).toLowerCase().indexOf(q) !== -1 ||
             String(r.NISN).indexOf(q) !== -1;
    });
  }

  const html =
  '<div class="judul-seksi">' +
    '<div><h2>' + (isGuruBiasa() ? 'Riwayat Poin Saya' : 'Riwayat Catatan Poin') + '</h2>' +
      '<p>' + (isGuruBiasa()
        ? 'Catatan pelanggaran dan kebaikan yang Anda input sendiri'
        : 'Audit lengkap seluruh pencatatan pelanggaran dan kebaikan') +
      ' • <b>' + data.length + '</b> catatan</p></div>' +
    '<div class="aksi">' +
      (isAdmin() || isGuruBK()
        ? '<span class="lencana emas polos"><i class="bi bi-shield-lock"></i> Anda dapat mengedit &amp; menghapus semua catatan</span>'
        : '<span class="lencana info polos"><i class="bi bi-pencil-square"></i> Anda dapat mengubah catatan buatan Anda sendiri</span>') +
    '</div>' +
  '</div>' +

  '<div class="card mb-3"><div class="card-body">' +
    '<div class="kotak-cari"><i class="bi bi-search"></i>' +
    '<input class="form-control" placeholder="Cari nama siswa, NISN, atau jenis kejadian…" value="' + escHtml(AppState.filter.riwayat) + '" oninput="cariRiwayat(this.value)"></div>' +
  '</div></div>' +

  (data.length
    ? '<div class="bungkus-tabel wadah-riwayat">' +
      '<table class="tabel tabel-riwayat"><thead><tr>' +
        '<th>TANGGAL</th><th>SISWA</th><th>JENIS KEJADIAN</th>' +
        '<th class="text-center">POIN</th><th>TINDAKAN DISIPLINER</th><th>BENTUK APRESIASI</th>' +
        '<th>PENCATAT</th>' +
        '<th class="sel-aksi" style="width:118px">AKSI</th>' +
      '</tr></thead><tbody>' +
      data.slice(0, 200).map(function (r) {
        return '<tr>' +
          '<td class="mono" style="font-size:12.5px;white-space:nowrap">' + escHtml(r.Tanggal) + '</td>' +
          // Kelas menempel pada nama siswa — dulu kolom tersendiri selebar 73 px
          '<td><div style="font-weight:600;line-height:1.3">' + escHtml(r.NamaSiswa) +
            '<span class="cap-kelas">' + escHtml(r.Kelas) + '</span></div>' +
            '<div class="sub mono" style="font-size:11.5px;color:var(--text-secondary)">' + escHtml(r.NISN) + '</div></td>' +
          '<td class="kol-kejadian"><div>' + escHtml(r.NamaKejadian) + '</div>' +
            (r.Kategori ? '<div style="font-size:11.5px;color:var(--text-secondary)">' + escHtml(r.Kategori) + '</div>' : '') + '</td>' +
          '<td class="text-center mono ' + kelasPoinRiwayat(r) + '">' + labelPoinRiwayat(r) + '</td>' +
          '<td class="kol-tindakan">' + (r.Hukuman && catatanPelanggaran(r)
              ? escHtml(r.Hukuman) : '<span class="text-secondary-2">—</span>') + '</td>' +
          '<td class="kol-tindakan">' + (r.Hukuman && !catatanPelanggaran(r)
              ? escHtml(r.Hukuman) : '<span class="text-secondary-2">—</span>') + '</td>' +
          '<td class="kol-pencatat">' + escHtml(r.GuruPencatat) + '</td>' +
          // Bukti foto pindah ke sel aksi — dulu kolom tersendiri selebar 69 px
          '<td class="sel-aksi"><div class="aksi-baris">' +
            tombolBuktiRiwayat(r) + tombolKelolaRiwayat(r) + '</div></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>' +

      // Di bawah 768 px tabel disembunyikan dan barisnya tampil sebagai kartu
      '<div class="daftar-kartu-riwayat">' +
        data.slice(0, 200).map(kartuRiwayat).join('') +
      '</div>'

    : '<div class="bungkus-tabel"><div class="kosong"><i class="bi bi-inbox"></i>' +
      '<h6>Belum ada riwayat</h6><p class="mb-0">' +
      (isGuruBiasa() ? 'Catatan poin yang Anda input akan muncul di sini.'
                     : 'Catatan poin akan muncul di sini.') + '</p></div></div>') +
  (data.length > 200 ? '<p class="text-secondary-2 mt-2" style="font-size:12px">Menampilkan 200 catatan terbaru dari ' + data.length + ' total.</p>' : '');

  document.getElementById('section-riwayat').innerHTML = html;
}

let timerCariRiwayat;
function cariRiwayat(q) {
  clearTimeout(timerCariRiwayat);
  timerCariRiwayat = setTimeout(function () {
    AppState.filter.riwayat = q;
    renderRiwayat();
    const inp = document.querySelector('#section-riwayat .kotak-cari input');
    if (inp) { inp.focus(); inp.setSelectionRange(q.length, q.length); }
  }, 250);
}

/**
 * Bukti foto pada form edit riwayat.
 * Tiga keadaan yang mungkin: foto lama dipertahankan, diganti foto baru,
 * atau dihapus. Semuanya baru benar-benar dikirim saat tombol Simpan ditekan.
 */
function renderFotoEditRiwayat() {
  const el = document.getElementById('kotakFotoRiwayat');
  if (!el) return;
  const f = AppState.fotoRiwayat || { asal: '', baru: null, hapus: false };

  if (f.baru) {
    el.innerHTML = '<div class="d-flex align-items-center gap-3">' +
      '<img src="' + f.baru.dataUrl + '" class="pratinjau-unggah" style="max-height:90px" alt="Pratinjau bukti baru">' +
      '<div><div style="font-size:13px;font-weight:600">' + escHtml(f.baru.nama) + '</div>' +
      '<div class="form-text">' + (f.asal ? 'Menggantikan foto lama' : 'Foto baru') + ' setelah disimpan.</div>' +
      '<button type="button" class="btn btn-hantu btn-kecil mt-2" onclick="batalFotoEditRiwayat()">' +
      '<i class="bi bi-arrow-counterclockwise"></i> Batalkan</button></div></div>';
    return;
  }
  if (f.asal && !f.hapus) {
    el.innerHTML = '<div class="d-flex align-items-center gap-3">' +
      imgDrive(f.asal, 'Bukti kejadian', 'max-height:90px;border-radius:var(--r-md);border:1px solid var(--border)') +
      '<div><div style="font-size:13px;font-weight:600">Foto tersimpan</div>' +
      '<div class="d-flex gap-2 mt-2">' +
      '<button type="button" class="btn btn-hantu btn-kecil" onclick="pratinjau(\'' + escHtml(f.asal) + '\',\'Bukti Kejadian\',\'gambar\')">' +
      '<i class="bi bi-zoom-in"></i> Lihat</button>' +
      '<button type="button" class="btn btn-hantu btn-kecil" onclick="tandaiHapusFotoRiwayat()">' +
      '<i class="bi bi-trash"></i> Hapus foto</button></div></div></div>';
    return;
  }
  if (f.asal && f.hapus) {
    el.innerHTML = '<div class="kotak-info peringatan"><i class="bi bi-trash"></i>' +
      '<div>Foto lama akan dihapus saat disimpan. ' +
      '<button type="button" class="btn btn-hantu btn-kecil ms-2" onclick="batalFotoEditRiwayat()">' +
      '<i class="bi bi-arrow-counterclockwise"></i> Batalkan</button></div></div>';
    return;
  }
  el.innerHTML = '<div class="form-text">Belum ada bukti foto untuk catatan ini.</div>';
}

function pilihFotoRiwayat(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('Ukuran terlalu besar', 'Maksimal ukuran foto adalah 5 MB.', 'peringatan');
    input.value = ''; return;
  }
  // Sama seperti input poin: diperkecil maksimal 1280 px agar unggahan tetap cepat
  kompresGambar(file, 1280, function (hasil) {
    if (!hasil) { toast('Gagal', 'Foto tidak dapat dibaca.', 'bahaya'); input.value = ''; return; }
    if (!AppState.fotoRiwayat) AppState.fotoRiwayat = { asal: '', baru: null, hapus: false };
    AppState.fotoRiwayat.baru = {
      nama: hasil.nama, mime: hasil.mime,
      base64: hasil.base64, dataUrl: hasil.dataUrl
    };
    AppState.fotoRiwayat.hapus = false;
    renderFotoEditRiwayat();
  });
}

function tandaiHapusFotoRiwayat() {
  if (!AppState.fotoRiwayat) return;
  AppState.fotoRiwayat.baru = null;
  AppState.fotoRiwayat.hapus = true;
  const inp = document.getElementById('fRwFoto'); if (inp) inp.value = '';
  renderFotoEditRiwayat();
}

function batalFotoEditRiwayat() {
  if (!AppState.fotoRiwayat) return;
  AppState.fotoRiwayat.baru = null;
  AppState.fotoRiwayat.hapus = false;
  const inp = document.getElementById('fRwFoto'); if (inp) inp.value = '';
  renderFotoEditRiwayat();
}

function bukaEditRiwayat(id) {
  const r = AppState.riwayat.filter(function (x) { return String(x.ID) === String(id); })[0];
  if (!r) return;
  AppState.fotoRiwayat = { asal: String(r.LinkFoto || ''), baru: null, hapus: false };
  bukaModalForm('Edit Catatan Poin',
    '<div class="kotak-info mb-3"><i class="bi bi-person-vcard"></i><div><b>' + escHtml(r.NamaSiswa) + '</b> — ' + escHtml(r.Kelas) + '</div></div>' +
    '<div class="mb-3"><label class="form-label">Jenis Kejadian</label>' +
      '<input class="form-control" id="fRwKejadian" value="' + escHtml(r.NamaKejadian) + '"></div>' +
    '<div class="row g-2 mb-3">' +
      '<div class="col-6"><label class="form-label">Tanggal</label>' +
        '<input class="form-control mono" id="fRwTanggal" value="' + escHtml(r.Tanggal) + '"></div>' +
      '<div class="col-6"><label class="form-label">Nilai Poin</label>' +
        '<input type="number" class="form-control mono" id="fRwPoin" value="' + escHtml(r.Poin) + '"></div>' +
    '</div>' +
    '<div class="mb-3"><label class="form-label">' +
      (catatanPelanggaran(r) ? 'Tindakan Disipliner yang Diberikan' : 'Bentuk Apresiasi yang Diberikan') +
      '</label>' +
      '<input class="form-control" id="fRwHukuman" value="' + escHtml(r.Hukuman || '') + '"></div>' +
    '<div class="mb-3"><label class="form-label">Catatan</label>' +
      '<textarea class="form-control" id="fRwCatatan">' + escHtml(r.Catatan || '') + '</textarea></div>' +
    '<div class="mb-3"><label class="form-label">Bukti Foto Kejadian</label>' +
      '<div id="kotakFotoRiwayat"></div>' +
      '<input type="file" class="form-control mt-2" id="fRwFoto" accept="image/*" onchange="pilihFotoRiwayat(this)">' +
      '<div class="form-text">Maksimal 5 MB. Foto otomatis diperkecil sebelum diunggah. ' +
      'Mengunggah foto baru akan menggantikan foto lama.</div></div>' +
    '<div class="kotak-info peringatan"><i class="bi bi-exclamation-triangle"></i><div>' +
      'Mengubah nilai poin akan otomatis menyesuaikan akumulasi poin siswa.</div></div>',
    function (modal) {
      const ubahan = {
        ID: id,
        NamaKejadian: document.getElementById('fRwKejadian').value.trim(),
        Tanggal: document.getElementById('fRwTanggal').value.trim(),
        Poin: Number(document.getElementById('fRwPoin').value),
        Hukuman: document.getElementById('fRwHukuman').value.trim(),
        Catatan: document.getElementById('fRwCatatan').value.trim()
      };
      // Data foto dikirim terpisah agar tidak ikut tersalin ke AppState.riwayat
      const payload = Object.assign({}, ubahan);
      const f = AppState.fotoRiwayat || { asal: '', baru: null, hapus: false };
      if (f.baru) {
        payload.fotoBase64 = f.baru.base64;
        payload.fotoNama   = f.baru.nama;
        payload.fotoMime   = f.baru.mime;
      } else if (f.hapus && f.asal) {
        payload.hapusFoto = true;
      }
      modal.hide();
      tandaSinkron(true);
      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          const idx = AppState.riwayat.findIndex(function (x) { return String(x.ID) === String(id); });
          if (idx !== -1) {
            Object.assign(AppState.riwayat[idx], ubahan);
            if (res.data.linkFoto !== undefined && res.data.linkFoto !== null) {
              AppState.riwayat[idx].LinkFoto = res.data.linkFoto;
            }
          }
          if (res.data.poinBaru !== null && res.data.poinBaru !== undefined) {
            const s = AppState.siswa.filter(function (x) { return String(x.NISN) === String(AppState.riwayat[idx].NISN); })[0];
            if (s) { s.PoinSaatIni = res.data.poinBaru; s.StatusZona = res.data.zonaBaru; }
          }
          renderUlang();
          toast('Berhasil', res.message, 'sukses');
        })
        .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
        .editRiwayat(AppState.token, payload);
    });
  renderFotoEditRiwayat();
}

function konfirmasiHapusRiwayat(id) {
  const r = AppState.riwayat.filter(function (x) { return String(x.ID) === String(id); })[0];
  if (!r) return;
  konfirmasi('Hapus Catatan Poin',
    'Hapus catatan "' + r.NamaKejadian + '" milik ' + r.NamaSiswa + '? Poin sebesar ' + r.Poin + ' akan dikembalikan.',
    function () {
      // ── Optimistic: hapus dari tampilan seketika ──
      const salinan = Object.assign({}, r);
      AppState.riwayat = AppState.riwayat.filter(function (x) { return String(x.ID) !== String(id); });
      const s = AppState.siswa.filter(function (x) { return String(x.NISN) === String(r.NISN); })[0];
      if (s) { s.PoinSaatIni = Number(s.PoinSaatIni) - Number(r.Poin); s.StatusZona = zonaDari(s.PoinSaatIni); }
      renderUlang();
      tandaSinkron(true);

      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) {
            AppState.riwayat.unshift(salinan);
            if (s) { s.PoinSaatIni = Number(s.PoinSaatIni) + Number(r.Poin); s.StatusZona = zonaDari(s.PoinSaatIni); }
            renderUlang();
            return toast('Gagal', res.message, 'bahaya');
          }
          if (s && res.data.poinBaru !== null) { s.PoinSaatIni = res.data.poinBaru; s.StatusZona = res.data.zonaBaru; }
          renderUlang();
          toast('Berhasil', res.message, 'sukses');
        })
        .withFailureHandler(function (err) {
          tandaSinkron(false);
          AppState.riwayat.unshift(salinan);
          if (s) { s.PoinSaatIni = Number(s.PoinSaatIni) + Number(r.Poin); s.StatusZona = zonaDari(s.PoinSaatIni); }
          renderUlang();
          toast('Error', err.message, 'bahaya');
        })
        .hapusRiwayat(AppState.token, id);
    }, 'Ya, Hapus');
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 14: HALAMAN — DATA GURU
// ════════════════════════════════════════════════════════════════════

function renderDataGuru() {
  const bolehAtur = isAdmin();
  const data = AppState.guru.slice();

  const html =
  '<div class="judul-seksi">' +
    '<div><h2>Data Guru &amp; Tenaga Pendidik</h2><p><b>' + data.length + '</b> guru terdaftar • ' +
      data.filter(function (g) { return String(g.WaliKelas || '').trim(); }).length + ' menjabat sebagai wali kelas</p></div>' +
    '<div class="aksi">' +
      (bolehAtur ? '<button class="btn btn-hantu" onclick="bukaImport(\'guru\')"><i class="bi bi-upload"></i> Import Excel/CSV</button>' +
                 '<button class="btn btn-navy" onclick="bukaFormGuru()"><i class="bi bi-person-plus"></i> Tambah Guru</button>' : '') +
    '</div>' +
  '</div>' +

  (bolehAtur ? '<div class="kotak-info mb-3"><i class="bi bi-info-circle"></i><div>' +
    '<b>Penunjukan jabatan.</b> Ikon <i class="bi bi-award"></i> menjadikan guru sebagai ' +
    '<b>Kepala Sekolah</b> (hanya satu orang, hak penuh setara Admin pada data poin). ' +
    'Ikon <i class="bi bi-heart-pulse"></i> menjadikan guru sebagai <b>Guru BK</b> ' +
    '(boleh lebih dari satu; akses seluruh sekolah, namun tidak dapat menambah, mengubah, ' +
    'atau menghapus data siswa, serta tidak memiliki menu Data Guru dan Pengaturan).' +
    '</div></div>' : '') +

  '<div class="bungkus-tabel">' +
    (data.length ?
    '<table class="tabel"><thead><tr>' +
      '<th style="width:48px">NO</th><th>NAMA GURU</th><th>NOMOR IDENTITAS</th><th>WALI KELAS</th>' +
      '<th>EMAIL NOTIFIKASI</th><th>JABATAN</th>' + (bolehAtur ? '<th style="width:150px">AKSI</th>' : '') +
    '</tr></thead><tbody>' +
    data.map(function (g, i) {
      const gKepsek = String(g.KepalaSekolah).toLowerCase() === 'ya';
      const gBK     = String(g.GuruBK).toLowerCase() === 'ya';
      const gWali   = String(g.WaliKelas || '').trim() !== '';
      return '<tr>' +
        '<td class="mono">' + String(i + 1).padStart(2, '0') + '</td>' +
        '<td><div class="sel-nama"><div class="avatar-mini">' + inisial(g.Nama) + '</div>' +
          '<div style="font-weight:600">' + escHtml(g.Nama) + '</div></div></td>' +
        '<td><span class="lencana netral polos" style="font-size:10px;margin-right:6px">' +
            escHtml(labelNomorJS(g.JenisNomor)) + '</span>' +
          '<span class="mono" style="font-size:12.5px">' + escHtml(g.NUPTK) + '</span></td>' +
        '<td>' + (String(g.WaliKelas || '').trim() ? '<span class="lencana info">' + escHtml(g.WaliKelas) + '</span>' : '<span class="text-secondary-2">—</span>') + '</td>' +
        '<td style="font-size:12.5px">' + (g.Email ? escHtml(g.Email) : '<span class="text-secondary-2">belum diisi</span>') + '</td>' +
        '<td><div class="d-flex flex-wrap gap-1">' +
          (gKepsek ? '<span class="lencana emas">Kepala Sekolah</span>' : '') +
          (gBK ? '<span class="lencana info">Guru BK</span>' : '') +
          (!gKepsek && !gBK ? '<span class="lencana netral">' + (gWali ? 'Wali Kelas' : 'Guru') + '</span>' : '') +
        '</div></td>' +
        (bolehAtur ? '<td><div class="aksi-baris">' +
          (!gKepsek ? '<button class="btn btn-hantu btn-mini" title="Jadikan Kepala Sekolah" onclick="jadikanKepsek(\'' + escHtml(g.ID) + '\',\'' + escHtml(g.Nama) + '\')"><i class="bi bi-award"></i></button>' : '') +
          '<button class="btn btn-hantu btn-mini" title="' + (gBK ? 'Cabut status Guru BK' : 'Jadikan Guru BK') + '" ' +
            'style="' + (gBK ? 'color:var(--info-tx);border-color:var(--info-tx)' : '') + '" ' +
            'onclick="aturGuruBK(\'' + escHtml(g.ID) + '\',\'' + escHtml(g.Nama) + '\',' + (gBK ? 'false' : 'true') + ')">' +
            '<i class="bi bi-heart-pulse' + (gBK ? '-fill' : '') + '"></i></button>' +
          '<button class="btn btn-hantu btn-mini" title="Edit" onclick="bukaFormGuru(\'' + escHtml(g.ID) + '\')"><i class="bi bi-pencil"></i></button>' +
          '<button class="btn btn-hantu btn-mini" title="Hapus" onclick="hapusGuru(\'' + escHtml(g.ID) + '\',\'' + escHtml(g.Nama) + '\')"><i class="bi bi-trash"></i></button>' +
        '</div></td>' : '') +
      '</tr>';
    }).join('') + '</tbody></table>'
    : '<div class="kosong"><i class="bi bi-person-badge"></i><h6>Belum ada data guru</h6>' +
      '<p class="mb-0">Tambahkan guru satu per satu atau impor dari file CSV.</p></div>') +
  '</div>';

  document.getElementById('section-dataGuru').innerHTML = html;
}

function bukaFormGuru(id) {
  const g = id ? AppState.guru.filter(function (x) { return String(x.ID) === String(id); })[0] : {};
  const opsiKelas = '<option value="">— Bukan wali kelas —</option>' + AppState.kelas.map(function (k) {
    return '<option value="' + escHtml(k) + '"' + (g.WaliKelas === k ? ' selected' : '') + '>Kelas ' + escHtml(k) + '</option>';
  }).join('');

  const jenisAktif = labelNomorJS(g.JenisNomor);
  const pilihanJenis = JENIS_NOMOR.map(function (j) {
    return '<div class="form-check form-check-inline">' +
      '<input class="form-check-input" type="radio" name="fGuruJenisNomor" ' +
        'id="jn_' + j.kode + '" value="' + j.kode + '"' + (jenisAktif === j.kode ? ' checked' : '') +
        ' onchange="perbaruiContohNomor()">' +
      '<label class="form-check-label" for="jn_' + j.kode + '"><b>' + j.kode + '</b></label></div>';
  }).join('');

  bukaModalForm(id ? 'Edit Data Guru' : 'Tambah Guru Baru',
    '<div class="mb-3"><label class="form-label" for="fGuruNama">Nama Lengkap &amp; Gelar <span class="wajib">*</span></label>' +
      '<input class="form-control" id="fGuruNama" value="' + escHtml(g.Nama || '') + '" required></div>' +

    // ── Nomor identitas + jenisnya ──
    '<div class="mb-3">' +
      '<label class="form-label" for="fGuruNuptk">NIP / NUPTK / NIY / NIK <span class="wajib">*</span></label>' +
      '<input class="form-control mono" id="fGuruNuptk" inputmode="numeric" ' +
        'oninput="perbaruiContohNomor()" value="' + escHtml(g.NUPTK || '') + '" required></div>' +

    '<div class="mb-3">' +
      '<label class="form-label">Nomor di atas adalah <span class="wajib">*</span></label>' +
      '<div class="d-flex flex-wrap gap-1 mb-1">' + pilihanJenis + '</div>' +
      '<div class="form-text" id="contohNomor"></div>' +
    '</div>' +

    '<div class="mb-3"><label class="form-label" for="fGuruPass">Password ' +
      (id ? '<span class="text-secondary-2">(kosongkan bila tidak diubah)</span>' : '<span class="wajib">*</span>') + '</label>' +
      '<div class="input-group">' +
        '<input type="password" class="form-control" id="fGuruPass" autocomplete="new-password" placeholder="' +
          (id ? 'Biarkan kosong untuk mempertahankan' : 'Minimal 6 karakter') + '">' +
        '<button class="btn btn-hantu" type="button" onclick="lihatSandi(\'fGuruPass\', this)" ' +
          'title="Tampilkan password"><i class="bi bi-eye"></i></button>' +
      '</div></div>' +

    '<div class="mb-3"><label class="form-label" for="fGuruWali">Wali Kelas</label>' +
      '<select class="form-select" id="fGuruWali">' + opsiKelas + '</select>' +
      '<div class="form-text">Daftar kelas otomatis mengikuti data siswa yang sudah diinput.</div></div>' +

    '<div class="mb-3"><label class="form-label" for="fGuruEmail">Email Notifikasi</label>' +
      '<input type="email" class="form-control" id="fGuruEmail" value="' + escHtml(g.Email || '') + '" placeholder="guru@sekolah.sch.id">' +
      '<div class="form-text">Email ini menerima peringatan otomatis saat siswa kelasnya masuk zona merah.</div></div>',

    function (modal) {
      const radio = document.querySelector('input[name="fGuruJenisNomor"]:checked');
      const rec = {
        ID: id || '',
        Nama: document.getElementById('fGuruNama').value.trim(),
        NUPTK: document.getElementById('fGuruNuptk').value.trim(),
        JenisNomor: radio ? radio.value : 'NUPTK',
        Password: document.getElementById('fGuruPass').value.trim(),
        WaliKelas: document.getElementById('fGuruWali').value,
        Email: document.getElementById('fGuruEmail').value.trim()
      };
      if (!rec.Nama || !rec.NUPTK) {
        return toast('Belum lengkap', 'Nama dan nomor identitas wajib diisi.', 'peringatan');
      }
      if (!id && !rec.Password) return toast('Belum lengkap', 'Password wajib diisi untuk guru baru.', 'peringatan');
      if (!id) { rec.KepalaSekolah = 'Tidak'; rec.GuruBK = 'Tidak'; }
      simpanMasterData(SHEET.GURU, rec, modal);
    });

  perbaruiContohNomor();
}

/** Contoh tampilan pada laporan, mengikuti jenis nomor yang sedang dipilih */
function perbaruiContohNomor() {
  const el = document.getElementById('contohNomor');
  const radio = document.querySelector('input[name="fGuruJenisNomor"]:checked');
  if (!el || !radio) return;
  const j = JENIS_NOMOR.filter(function (x) { return x.kode === radio.value; })[0] || JENIS_NOMOR[1];
  const inp = document.getElementById('fGuruNuptk');
  const contoh = (inp && inp.value.trim()) ? inp.value.trim() : j.contoh;
  el.innerHTML = j.ket + ' Pada tanda tangan laporan akan tercetak: ' +
    '<b class="mono">' + escHtml(j.kode) + '. ' + escHtml(contoh) + '</b>';
}

function hapusGuru(id, nama) {
  konfirmasi('Hapus Data Guru', 'Hapus akun guru "' + nama + '"? Guru tidak akan bisa login lagi.',
    function () { hapusMasterData(SHEET.GURU, id); }, 'Ya, Hapus');
}

function jadikanKepsek(id, nama) {
  konfirmasi('Aktifkan Kepala Sekolah',
    'Jadikan "' + nama + '" sebagai Kepala Sekolah? Status guru lain akan dinonaktifkan.',
    function () {
      tandaSinkron(true);
      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          AppState.guru.forEach(function (g) { g.KepalaSekolah = String(g.ID) === String(id) ? 'Ya' : 'Tidak'; });
          AppState.kepalaSekolah = { nama: nama, nuptk: '' };
          renderUlang();
          toast('Berhasil', res.message, 'sukses');
        })
        .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
        .setKepalaSekolah(AppState.token, id);
    }, 'Ya, Aktifkan');
}

/** Tetapkan atau cabut status Guru BK — boleh lebih dari satu orang */
function aturGuruBK(id, nama, aktifkan) {
  konfirmasi(aktifkan ? 'Tetapkan sebagai Guru BK' : 'Cabut Status Guru BK',
    aktifkan
      ? 'Jadikan "' + nama + '" sebagai Guru BK? Yang bersangkutan akan dapat memantau seluruh ' +
        'siswa, mencetak laporan semua kelas, serta mengubah dan menghapus riwayat poin — namun ' +
        'tidak dapat mengubah data siswa, data guru, maupun pengaturan aplikasi.'
      : 'Cabut status Guru BK dari "' + nama + '"? Aksesnya kembali seperti guru biasa.',
    function () {
      tandaSinkron(true);
      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          const g = AppState.guru.filter(function (x) { return String(x.ID) === String(id); })[0];
          if (g) g.GuruBK = aktifkan ? 'Ya' : 'Tidak';
          renderUlang();
          toast('Berhasil', res.message, 'sukses');
        })
        .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
        .setGuruBK(AppState.token, id, aktifkan);
    }, aktifkan ? 'Ya, Tetapkan' : 'Ya, Cabut');
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 15: HALAMAN — JENIS POIN
// ════════════════════════════════════════════════════════════════════

function renderJenisPoin() {
  const html =
  '<div class="judul-seksi">' +
    '<div><h2>Jenis Pelanggaran &amp; Kebaikan</h2>' +
    '<p>Atur bobot poin dan konsekuensi untuk setiap pasal tata tertib sekolah.</p></div>' +
  '</div>' +

  '<div class="grid-2">' +
    '<div class="card">' +
      '<div class="card-header">' +
        '<div><h5><i class="bi bi-exclamation-triangle-fill" style="color:var(--merah-line)"></i> Jenis Pelanggaran</h5>' +
        '<p class="sub">' + AppState.pelanggaran.length + ' jenis terdaftar • poin minus</p></div>' +
        '<div class="kanan"><button class="btn btn-navy btn-kecil" onclick="bukaFormJenis(\'pelanggaran\')"><i class="bi bi-plus-lg"></i> Tambah</button></div>' +
      '</div>' +
      '<div class="card-body p-0">' + tabelJenis(AppState.pelanggaran, 'pelanggaran') + '</div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-header">' +
        '<div><h5><i class="bi bi-patch-check-fill" style="color:var(--hijau-line)"></i> Jenis Kebaikan</h5>' +
        '<p class="sub">' + AppState.kebaikan.length + ' jenis terdaftar • poin plus</p></div>' +
        '<div class="kanan"><button class="btn btn-navy btn-kecil" onclick="bukaFormJenis(\'kebaikan\')"><i class="bi bi-plus-lg"></i> Tambah</button></div>' +
      '</div>' +
      '<div class="card-body p-0">' + tabelJenis(AppState.kebaikan, 'kebaikan') + '</div>' +
    '</div>' +
  '</div>';

  document.getElementById('section-jenisPoin').innerHTML = html;
}

function tabelJenis(daftar, tipe) {
  const isP = tipe === 'pelanggaran';
  if (!daftar.length) return '<div class="kosong"><i class="bi bi-list-ul"></i><h6>Belum ada data</h6></div>';
  return '<div class="bungkus-tabel" style="border:0"><table class="tabel" style="min-width:420px"><thead><tr>' +
    '<th>NAMA ' + (isP ? 'PELANGGARAN' : 'KEBAIKAN') + '</th><th class="text-center" style="width:64px">POIN</th>' +
    (isP ? '<th>KONSEKUENSI</th>' : '<th>KATEGORI</th>') + '<th style="width:72px">AKSI</th>' +
  '</tr></thead><tbody>' +
  daftar.slice().sort(function (a, b) { return Math.abs(Number(b.Poin)) - Math.abs(Number(a.Poin)); })
    .map(function (j) {
      const nama = isP ? j.NamaPelanggaran : j.NamaKebaikan;
      return '<tr>' +
        '<td><div style="font-weight:600;font-size:13px">' + escHtml(nama) + '</div>' +
          (isP && j.Kategori ? '<div style="font-size:11.5px;color:var(--text-secondary)">' + escHtml(j.Kategori) + '</div>' : '') + '</td>' +
        '<td class="text-center mono ' + (isP ? 'poin-minus' : 'poin-plus') + '">' + (isP ? '-' : '+') + Math.abs(Number(j.Poin)) + '</td>' +
        '<td style="font-size:12px;color:var(--text-secondary)">' + escHtml(isP ? (j.Hukuman || '—') : (j.Kategori || '—')) + '</td>' +
        '<td><div class="aksi-baris">' +
          '<button class="btn btn-hantu btn-mini" onclick="bukaFormJenis(\'' + tipe + '\',\'' + escHtml(j.ID) + '\')"><i class="bi bi-pencil"></i></button>' +
          '<button class="btn btn-hantu btn-mini" onclick="hapusJenis(\'' + tipe + '\',\'' + escHtml(j.ID) + '\',\'' + escHtml(nama) + '\')"><i class="bi bi-trash"></i></button>' +
        '</div></td></tr>';
    }).join('') + '</tbody></table></div>';
}

function bukaFormJenis(tipe, id) {
  const isP = tipe === 'pelanggaran';
  const sumber = isP ? AppState.pelanggaran : AppState.kebaikan;
  const j = id ? sumber.filter(function (x) { return String(x.ID) === String(id); })[0] : {};
  const nama = isP ? (j.NamaPelanggaran || '') : (j.NamaKebaikan || '');

  bukaModalForm((id ? 'Edit ' : 'Tambah ') + (isP ? 'Jenis Pelanggaran' : 'Jenis Kebaikan'),
    '<div class="mb-3"><label class="form-label">Nama ' + (isP ? 'Pelanggaran' : 'Kebaikan') + ' <span class="wajib">*</span></label>' +
      '<input class="form-control" id="fJenisNama" value="' + escHtml(nama) + '" required></div>' +
    '<div class="mb-3"><label class="form-label">Bobot Poin <span class="wajib">*</span></label>' +
      '<div class="input-group"><span class="input-group-text">' + (isP ? '−' : '+') + '</span>' +
      '<input type="number" min="1" class="form-control mono" id="fJenisPoin" value="' + Math.abs(Number(j.Poin) || 5) + '" required></div>' +
      '<div class="form-text">Masukkan angka positif; tanda ' + (isP ? 'minus' : 'plus') + ' ditambahkan otomatis.</div></div>' +
    '<div class="mb-3"><label class="form-label">Kategori</label>' +
      '<input class="form-control" id="fJenisKategori" value="' + escHtml(j.Kategori || '') + '" placeholder="' +
      (isP ? 'Kedisiplinan Waktu, Adab & Akhlak…' : 'Prestasi Akademik, Kepedulian Sosial…') + '"></div>' +
    (isP ? '<div class="mb-3"><label class="form-label">Konsekuensi / Hukuman</label>' +
      '<textarea class="form-control" id="fJenisHukuman" placeholder="Tindakan pembinaan yang diberikan…">' + escHtml(j.Hukuman || '') + '</textarea></div>' : ''),
    function (modal) {
      const rec = { ID: id || '', Poin: Math.abs(Number(document.getElementById('fJenisPoin').value)),
                    Kategori: document.getElementById('fJenisKategori').value.trim() };
      const n = document.getElementById('fJenisNama').value.trim();
      if (!n || !rec.Poin) return toast('Belum lengkap', 'Nama dan bobot poin wajib diisi.', 'peringatan');
      if (isP) { rec.NamaPelanggaran = n; rec.Hukuman = document.getElementById('fJenisHukuman').value.trim(); }
      else { rec.NamaKebaikan = n; }
      simpanMasterData(isP ? SHEET.PELANGGARAN : SHEET.KEBAIKAN, rec, modal);
    });
}

function hapusJenis(tipe, id, nama) {
  konfirmasi('Hapus Jenis Poin', 'Hapus "' + nama + '" dari daftar? Riwayat lama tetap tersimpan.',
    function () { hapusMasterData(tipe === 'pelanggaran' ? SHEET.PELANGGARAN : SHEET.KEBAIKAN, id); }, 'Ya, Hapus');
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 16: CRUD MASTER — dengan Optimistic UI
// ════════════════════════════════════════════════════════════════════

function targetArray(sheet) {
  return { 'Sheet_Siswa': 'siswa', 'Sheet_Guru': 'guru',
           'Sheet_JenisPelanggaran': 'pelanggaran', 'Sheet_JenisKebaikan': 'kebaikan' }[sheet];
}

function simpanMasterData(sheet, rec, modal) {
  const kunci = targetArray(sheet);
  const btn = document.getElementById('tombolSimpanModal');
  const asli = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-inline"></span> Menyimpan…';
  btn.disabled = true;

  google.script.run
    .withSuccessHandler(function (res) {
      btn.innerHTML = asli; btn.disabled = false;
      if (!res.success) return toast('Gagal', res.message, 'bahaya');
      if (modal) modal.hide();

      const data = res.data;
      const arr = AppState[kunci];
      const idx = arr.findIndex(function (x) { return String(x.ID) === String(data.ID); });
      if (idx !== -1) Object.assign(arr[idx], data); else arr.push(data);

      // Perbarui daftar kelas bila ada kelas baru
      if (kunci === 'siswa' && data.Kelas && AppState.kelas.indexOf(data.Kelas) === -1) {
        AppState.kelas.push(data.Kelas); AppState.kelas.sort();
      }
      renderUlang();
      toast('Berhasil', res.message, 'sukses');
    })
    .withFailureHandler(function (err) {
      btn.innerHTML = asli; btn.disabled = false;
      toast('Error', err.message, 'bahaya');
    })
    .simpanMaster(AppState.token, sheet, rec);
}

function hapusMasterData(sheet, id) {
  const kunci = targetArray(sheet);
  const arr = AppState[kunci];
  const idx = arr.findIndex(function (x) { return String(x.ID) === String(id); });
  const salinan = idx !== -1 ? arr[idx] : null;

  // Optimistic: hilangkan dari layar seketika
  if (idx !== -1) arr.splice(idx, 1);
  renderUlang();
  tandaSinkron(true);

  google.script.run
    .withSuccessHandler(function (res) {
      tandaSinkron(false);
      if (!res.success) {
        if (salinan) { arr.splice(idx, 0, salinan); renderUlang(); }
        return toast('Gagal', res.message, 'bahaya');
      }
      toast('Berhasil', res.message, 'sukses');
    })
    .withFailureHandler(function (err) {
      tandaSinkron(false);
      if (salinan) { arr.splice(idx, 0, salinan); renderUlang(); }
      toast('Error', err.message, 'bahaya');
    })
    .hapusMaster(AppState.token, sheet, id);
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 17: IMPORT MASSAL (CSV)
// ════════════════════════════════════════════════════════════════════

/** Definisi kolom template import — dipakai bersama oleh pembuat & pembaca XLSX */
const KOLOM_IMPORT = {
  siswa: {
    judul: 'Data Siswa',
    kolom: ['Nama', 'NISN', 'TanggalLahir', 'Kelas', 'JenisKelamin'],
    lebar: [32, 16, 16, 10, 14],
    wajib: ['Nama', 'NISN', 'TanggalLahir', 'Kelas'],
    contoh: [
      ['Ahmad Fauzi Alamsyah', '0065849120', '12-03-2011', '7A', 'L'],
      ['Annisa Maharani',      '0067829101', '05-07-2011', '7A', 'P'],
      ['Bagas Aditya Pratama', '0064920194', '18-01-2011', '7B', 'L']
    ],
    petunjuk: [
      'Nama          : nama lengkap siswa sesuai ijazah/akta.',
      'NISN          : 10 digit angka. Kolom sudah diformat TEKS agar angka 0 di depan tidak hilang.',
      'TanggalLahir  : WAJIB format dd-mm-yyyy, contoh 17-05-2011. Ini juga menjadi password login siswa.',
      'Kelas         : contoh 7A, 8B, 9C. Daftar kelas terbentuk otomatis dari kolom ini.',
      'JenisKelamin  : isi L atau P.'
    ]
  },
  guru: {
    judul: 'Data Guru',
    kolom: ['Nama', 'NUPTK', 'JenisNomor', 'Password', 'WaliKelas', 'Email'],
    lebar: [32, 22, 14, 16, 12, 30],
    wajib: ['Nama', 'NUPTK', 'Password'],
    contoh: [
      ['Adry Runako, S.Pd',      '2234567890123456',   'NUPTK', 'guru123', '7A', 'guru1@sekolah.sch.id'],
      ['Budi Santoso, S.Pd',     '196805142019031004', 'NIP',   'guru123', '8A', 'guru2@sekolah.sch.id'],
      ['Siti Aminah, S.Pd',      '198203102021081',    'NIY',   'guru123', '9A', 'guru3@sekolah.sch.id']
    ],
    petunjuk: [
      'Nama       : nama lengkap beserta gelar.',
      'NUPTK      : isi nomor identitasnya saja. Kolom diformat TEKS agar angka panjang tidak berubah.',
      'JenisNomor : jenis nomor pada kolom sebelumnya — isi NIP, NUPTK, NIY, atau NIK.',
      '             Inilah yang tercetak di bawah nama pada tanda tangan laporan (contoh "NIP. 1968...").',
      '             Bila dikosongkan, dianggap NUPTK.',
      'Password   : password untuk login guru. Sebaiknya diganti masing-masing guru setelah login.',
      'WaliKelas  : isi kode kelas bila guru menjadi wali kelas (contoh 7A). Kosongkan bila bukan.',
      'Email      : penting! Alamat ini menerima notifikasi otomatis saat siswa di kelasnya masuk zona merah.'
    ]
  }
};

function bukaImport(jenis) {
  const def = KOLOM_IMPORT[jenis];
  bukaModalForm('Import ' + def.judul,
    '<div class="kotak-info mb-3"><i class="bi bi-info-circle"></i><div>' +
      'Unduh template <b>.xlsx</b>, isi langsung di Excel / Google Sheets / WPS, lalu unggah kembali. ' +
      'Tidak perlu lagi mengubahnya menjadi CSV.' +
    '</div></div>' +

    '<button class="btn btn-gold w-100 mb-2" onclick="unduhTemplateXlsx(\'' + jenis + '\')">' +
      '<i class="bi bi-file-earmark-excel-fill"></i> Unduh Template ' + def.judul + ' (.xlsx)</button>' +
    '<button class="btn btn-hantu w-100 btn-kecil mb-3" onclick="unduhTemplateCsv(\'' + jenis + '\',event)">' +
      '<i class="bi bi-filetype-csv"></i> Alternatif: unduh versi .csv</button>' +

    '<div class="mb-3"><label class="form-label">Kolom yang dibaca sistem</label>' +
      '<div class="d-flex flex-wrap gap-1">' +
        def.kolom.map(function (k) {
          const w = def.wajib.indexOf(k) !== -1;
          return '<span class="lencana ' + (w ? 'merah' : 'netral') + ' polos mono">' + k + (w ? ' *' : '') + '</span>';
        }).join('') +
      '</div>' +
      '<div class="form-text">Bertanda <b>*</b> wajib diisi. Urutan kolom bebas, yang dibaca adalah judul kolomnya.</div>' +
    '</div>' +

    '<div class="area-unggah" onclick="document.getElementById(\'fileImport\').click()">' +
      '<div class="ikon-besar"><i class="bi bi-file-earmark-arrow-up-fill"></i></div>' +
      '<div style="font-weight:600;color:var(--text-primary)">Klik untuk memilih berkas</div>' +
      '<div style="font-size:12px">Format .xlsx, .xls, atau .csv • maksimal 500 baris</div>' +
    '</div>' +
    '<input type="file" id="fileImport" accept=".xlsx,.xls,.csv" style="display:none" onchange="bacaFileImport(this,\'' + jenis + '\')">' +
    '<div id="hasilImport" class="mt-3"></div>',
    function (modal) { modal.hide(); }, 'Tutup');
}

/** Membuat berkas .xlsx template langsung di browser (2 sheet: Data + Petunjuk) */
function unduhTemplateXlsx(jenis) {
  if (typeof XLSX === 'undefined') {
    return toast('Pustaka belum siap', 'Periksa koneksi internet lalu muat ulang halaman.', 'bahaya');
  }
  const def = KOLOM_IMPORT[jenis];
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Data (header + 3 baris contoh) ──
  const aoa = [def.kolom].concat(def.contoh);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = def.lebar.map(function (w) { return { wch: w }; });

  // Paksa seluruh kolom teks agar NISN/NUPTK/tanggal tidak diubah Excel
  const kolomTeks = ['NISN', 'NUPTK', 'TanggalLahir', 'Password'];
  for (let r = 1; r <= 500; r++) {
    def.kolom.forEach(function (nama, c) {
      if (kolomTeks.indexOf(nama) === -1) return;
      const ref = XLSX.utils.encode_cell({ r: r, c: c });
      if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; }
    });
  }
  if (!ws['!ref']) ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: def.kolom.length - 1 } });
  XLSX.utils.book_append_sheet(wb, ws, 'Data');

  // ── Sheet 2: Petunjuk pengisian ──
  const petunjuk = [
    ['TEMPLATE IMPORT ' + def.judul.toUpperCase() + ' — SIKAP BK'],
    [AppState.konfigurasi.namaSekolah || ''],
    [],
    ['CARA PENGISIAN'],
    ['1. Buka sheet "Data".'],
    ['2. Hapus 3 baris contoh, lalu isi data Anda mulai baris ke-2.'],
    ['3. JANGAN mengubah, menghapus, atau menukar judul kolom di baris 1.'],
    ['4. Simpan berkas (tetap .xlsx), lalu unggah melalui aplikasi SIKAP BK.'],
    [],
    ['PENJELASAN KOLOM']
  ].concat(def.petunjuk.map(function (t) { return [t]; }))
   .concat([
     [],
     ['CATATAN'],
     ['• Maksimal 500 baris per unggahan. Bagi menjadi beberapa berkas bila lebih.'],
     ['• Baris yang tidak lengkap atau duplikat akan ditolak dan dilaporkan satu per satu.'],
     ['• Baris yang valid tetap diproses meski ada baris lain yang ditolak.']
   ]);
  const ws2 = XLSX.utils.aoa_to_sheet(petunjuk);
  ws2['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Petunjuk');

  const nama = 'Template_Import_' + def.judul.replace(/\s+/g, '_') + '.xlsx';
  XLSX.writeFile(wb, nama);
  toast('Template diunduh', nama + ' — isi di Excel lalu unggah kembali.', 'sukses');
}

/** Alternatif template CSV (dari server) */
function unduhTemplateCsv(jenis, ev) {
  const pulih = tombolSibuk(ev && ev.currentTarget, 'Menyiapkan…');
  tandaSinkron(true);
  google.script.run
    .withSuccessHandler(function (res) {
      pulih(); tandaSinkron(false);
      if (res.success) {
        unduhBase64(res.data.base64, res.data.nama, 'text/csv');
        toast('Template diunduh', res.data.nama, 'sukses');
      } else toast('Gagal', res.message, 'bahaya');
    })
    .withFailureHandler(function (err) {
      pulih(); tandaSinkron(false);
      toast('Error', err.message, 'bahaya');
    })
    .getTemplateImport(jenis);
}

/** Parser CSV sederhana yang menghormati tanda kutip */
function parseCSV(teks) {
  const baris = [];
  let bidang = '', row = [], dalamKutip = false;
  teks = String(teks).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (dalamKutip) {
      if (c === '"') { if (teks[i + 1] === '"') { bidang += '"'; i++; } else dalamKutip = false; }
      else bidang += c;
    } else {
      if (c === '"') dalamKutip = true;
      else if (c === ',' || c === ';') { row.push(bidang); bidang = ''; }
      else if (c === '\n') { row.push(bidang); baris.push(row); row = []; bidang = ''; }
      else bidang += c;
    }
  }
  if (bidang !== '' || row.length) { row.push(bidang); baris.push(row); }
  return baris.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); });
}

/**
 * Membaca berkas import. Mendukung .xlsx / .xls (via SheetJS) dan .csv.
 * Seluruh parsing dilakukan di browser, jadi tidak memakan kuota Apps Script.
 */
function bacaFileImport(input, jenis) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return toast('Terlalu besar', 'Ukuran berkas maksimal 10 MB.', 'peringatan');

  const isExcel = /\.(xlsx|xlsm|xls)$/i.test(file.name);
  if (isExcel && typeof XLSX === 'undefined') {
    return toast('Pustaka belum siap', 'Periksa koneksi internet lalu muat ulang halaman.', 'bahaya');
  }

  const reader = new FileReader();
  reader.onload = function () {
    let tabel;
    try {
      if (isExcel) {
        const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: false, raw: false });
        // Ambil sheet "Data" bila ada, selain itu sheet pertama
        const namaSheet = wb.SheetNames.indexOf('Data') !== -1 ? 'Data' : wb.SheetNames[0];
        tabel = XLSX.utils.sheet_to_json(wb.Sheets[namaSheet], { header: 1, defval: '', blankrows: false, raw: false });
      } else {
        tabel = parseCSV(reader.result);
      }
    } catch (e) {
      return toast('Gagal membaca', 'Berkas tidak dapat dibaca: ' + e.message, 'bahaya');
    }

    tabel = (tabel || []).filter(function (r) {
      return r && r.some(function (v) { return String(v).trim() !== ''; });
    });
    if (tabel.length < 2) return toast('Berkas kosong', 'Tidak ada baris data selain judul kolom.', 'peringatan');

    const headers = tabel[0].map(function (h) { return String(h).trim().replace(/\s+/g, ''); });
    const wajib = KOLOM_IMPORT[jenis].wajib;
    const hilang = wajib.filter(function (k) { return headers.indexOf(k) === -1; });
    if (hilang.length) {
      document.getElementById('hasilImport').innerHTML =
        '<div class="kotak-info bahaya"><i class="bi bi-x-octagon"></i><div>' +
        'Kolom wajib tidak ditemukan: <b class="mono">' + hilang.join(', ') + '</b>.<br>' +
        'Pastikan baris pertama berisi judul kolom persis seperti template.</div></div>';
      return;
    }

    const objek = tabel.slice(1).map(function (r) {
      const o = {};
      headers.forEach(function (h, i) {
        let v = r[i] === undefined || r[i] === null ? '' : r[i];
        o[h] = String(v).trim();
      });
      // Excel kadang mengubah 12-03-2011 menjadi objek tanggal atau 3/12/2011 → seragamkan
      if (h_punyaTanggal(o)) o.TanggalLahir = seragamkanTanggal(o.TanggalLahir);
      return o;
    }).filter(function (o) {
      return Object.keys(o).some(function (k) { return o[k] !== ''; });
    });

    if (!objek.length) return toast('Berkas kosong', 'Tidak ada baris data yang terbaca.', 'peringatan');
    if (objek.length > 500) return toast('Terlalu banyak', 'Maksimal 500 baris per unggahan. Bagi menjadi beberapa berkas.', 'peringatan');

    document.getElementById('hasilImport').innerHTML =
      '<div class="kotak-info"><span class="spinner-inline" style="border-color:var(--navy-soft);border-top-color:var(--navy)"></span>' +
      '<div>Memvalidasi dan mengunggah <b>' + objek.length + '</b> baris…</div></div>';

    google.script.run
      .withSuccessHandler(function (res) {
        if (!res.success) {
          document.getElementById('hasilImport').innerHTML =
            '<div class="kotak-info bahaya"><i class="bi bi-x-octagon"></i><div>' + escHtml(res.message) + '</div></div>';
          return;
        }
        const d = res.data;
        document.getElementById('hasilImport').innerHTML =
          '<div class="kotak-info ' + (d.ditolak ? 'peringatan' : '') + '">' +
            '<i class="bi bi-check-circle-fill"></i><div><b>' + d.berhasil + ' data berhasil diimpor.</b>' +
            (d.ditolak ? '<br>' + d.ditolak + ' baris ditolak:' +
              '<ul style="margin:6px 0 0;padding-left:16px;font-size:12px">' +
              d.detailGagal.map(function (g) {
                return '<li>Baris ' + g.baris + (g.nama ? ' (' + escHtml(g.nama) + ')' : '') + ' — ' + escHtml(g.alasan) + '</li>';
              }).join('') + '</ul>' : '') +
            '</div></div>';
        segarkanData();
      })
      .withFailureHandler(function (err) {
        document.getElementById('hasilImport').innerHTML =
          '<div class="kotak-info bahaya"><i class="bi bi-x-octagon"></i><div>' + escHtml(err.message) + '</div></div>';
      })
      .importMassal(AppState.token, jenis, objek);
  };

  if (isExcel) reader.readAsArrayBuffer(file); else reader.readAsText(file);
}

function h_punyaTanggal(o) { return Object.prototype.hasOwnProperty.call(o, 'TanggalLahir'); }

/**
 * Menyeragamkan apa pun yang keluar dari Excel menjadi dd-mm-yyyy.
 * Menangani: "12-03-2011", "12/03/2011", "2011-03-12", dan serial number Excel (contoh 40614).
 */
function seragamkanTanggal(nilai) {
  let t = String(nilai === null || nilai === undefined ? '' : nilai).trim();
  if (!t) return '';

  // Serial number Excel (angka murni 5 digit) → tanggal
  if (/^\d{5}$/.test(t) && typeof XLSX !== 'undefined' && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(Number(t));
    if (d && d.y) return pad2(d.d) + '-' + pad2(d.m) + '-' + d.y;
  }

  const angka = t.replace(/\D/g, '');
  if (angka.length !== 8) return t; // biarkan apa adanya, server yang menolak

  // yyyy-mm-dd → dd-mm-yyyy
  if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(t)) {
    return angka.substring(6, 8) + '-' + angka.substring(4, 6) + '-' + angka.substring(0, 4);
  }
  return angka.substring(0, 2) + '-' + angka.substring(2, 4) + '-' + angka.substring(4, 8);
}

function pad2(n) { return String(n).padStart(2, '0'); }

/** Auto-format input tanggal lahir menjadi dd-mm-yyyy saat diketik */
function formatTanggalKetik(el) {
  let v = el.value.replace(/\D/g, '').substring(0, 8);
  if (v.length > 4)      v = v.substring(0, 2) + '-' + v.substring(2, 4) + '-' + v.substring(4);
  else if (v.length > 2) v = v.substring(0, 2) + '-' + v.substring(2);
  el.value = v;
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 18: HALAMAN — TATA TERTIB
// ════════════════════════════════════════════════════════════════════

function renderTataTertib() {
  const url = AppState.konfigurasi.tatibUrl;
  const bolehAtur = isAdmin();

  const html =
  '<div class="judul-seksi">' +
    '<div><h2>Buku Tata Tertib Sekolah</h2>' +
    '<p>Referensi resmi pasal pelanggaran, bobot poin, dan konsekuensi pembinaan.</p></div>' +
    '<div class="aksi">' +
      (url ? '<button class="btn btn-navy" onclick="pratinjau(\'' + escHtml(url) + '\',\'Buku Tata Tertib Sekolah\',\'pdf\')">' +
             '<i class="bi bi-file-earmark-pdf"></i> Buka Dokumen PDF</button>' : '') +
      (bolehAtur ? '<button class="btn btn-hantu" onclick="unggahTatib()"><i class="bi bi-upload"></i> Unggah PDF</button>' : '') +
    '</div>' +
  '</div>' +

  (url ? '' : '<div class="kotak-info peringatan mb-3"><i class="bi bi-exclamation-triangle"></i><div>' +
    'Dokumen tata tertib (PDF) belum diunggah' + (bolehAtur ? '. Unggah melalui tombol di atas atau menu Pengaturan.' : '. Hubungi Administrator.') +
    '</div></div>') +

  '<div class="grid-2">' +
    '<div class="card"><div class="card-header"><div>' +
      '<h5><i class="bi bi-exclamation-triangle-fill" style="color:var(--merah-line)"></i> Daftar Pelanggaran &amp; Sanksi</h5>' +
      '<p class="sub">Diurutkan dari bobot poin terberat</p></div></div>' +
      '<div class="card-body">' +
        AppState.pelanggaran.slice().sort(function (a, b) { return Number(b.Poin) - Number(a.Poin); })
          .map(function (p, i) {
            return '<div class="ref-pasal"><div class="kepala"><strong>Pasal ' + (i + 1) + '</strong>' +
              (p.Kategori ? '<span class="lencana netral polos" style="font-size:10.5px">' + escHtml(p.Kategori) + '</span>' : '') +
              '<span class="poin-ref">-' + Math.abs(Number(p.Poin)) + ' Poin</span></div>' +
              '<p style="color:var(--text-primary);font-weight:500">' + escHtml(p.NamaPelanggaran) + '</p>' +
              '<p style="margin-top:4px"><i class="bi bi-arrow-return-right"></i> Sanksi: ' + escHtml(p.Hukuman || '—') + '</p></div>';
          }).join('') +
      '</div>' +
    '</div>' +

    '<div class="card"><div class="card-header"><div>' +
      '<h5><i class="bi bi-patch-check-fill" style="color:var(--hijau-line)"></i> Daftar Apresiasi Kebaikan</h5>' +
      '<p class="sub">Poin tambahan untuk perilaku positif</p></div></div>' +
      '<div class="card-body">' +
        AppState.kebaikan.slice().sort(function (a, b) { return Number(b.Poin) - Number(a.Poin); })
          .map(function (k, i) {
            return '<div class="ref-pasal"><div class="kepala"><strong>Apresiasi ' + (i + 1) + '</strong>' +
              (k.Kategori ? '<span class="lencana netral polos" style="font-size:10.5px">' + escHtml(k.Kategori) + '</span>' : '') +
              '<span class="poin-ref" style="color:var(--hijau-tx)">+' + Math.abs(Number(k.Poin)) + ' Poin</span></div>' +
              '<p style="color:var(--text-primary);font-weight:500">' + escHtml(k.NamaKebaikan) + '</p></div>';
          }).join('') +
      '</div>' +
    '</div>' +
  '</div>';

  document.getElementById('section-tataTertib').innerHTML = html;
}

function unggahTatib()        { pilihDanUnggah('tatib', '.pdf,application/pdf'); }
function unggahLogo()         { pilihDanUnggah('logo', 'image/*'); }
function unggahLogoInstansi() { pilihDanUnggah('logoInstansi', 'image/*'); }

function pilihDanUnggah(kategori, accept) {
  const inp = document.getElementById('inputBerkasTersembunyi');
  inp.value = ''; inp.accept = accept;
  inp.onchange = function () {
    const file = inp.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('Terlalu besar', 'Ukuran berkas maksimal 10 MB.', 'peringatan');

    const isGambar = kategori !== 'tatib';
    toast('Mengunggah', 'Berkas sedang diproses dan diunggah ke Google Drive…', 'peringatan');
    tandaSinkron(true);

    const kirim = function (base64, mime, nama) {
      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          if (kategori === 'logo') {
            AppState.konfigurasi.logoUrl = res.data.url;
            document.getElementById('logoSidebar').innerHTML = imgDrive(res.data.url, 'Logo sekolah');
          } else if (kategori === 'logoInstansi') {
            AppState.konfigurasi.logoInstansiUrl = res.data.url;
          } else {
            AppState.konfigurasi.tatibUrl = res.data.url;
          }
          renderUlang();
          toast('Berhasil', res.message, 'sukses');
        })
        .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
        .unggahBerkas(AppState.token, kategori, base64, nama, mime);
    };

    if (isGambar) {
      // Logo diperkecil maksimal 512 px — cukup tajam untuk cetak, ringan untuk dimuat
      kompresGambar(file, 512, function (hasil) {
        if (!hasil) { tandaSinkron(false); return toast('Gagal', 'Berkas gambar tidak dapat dibaca.', 'bahaya'); }
        kirim(hasil.base64, hasil.mime, hasil.nama);
      });
    } else {
      const reader = new FileReader();
      reader.onload = function () { kirim(reader.result.split(',')[1], file.type, file.name); };
      reader.readAsDataURL(file);
    }
  };
  inp.click();
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 19: HALAMAN — CETAK LAPORAN
// ════════════════════════════════════════════════════════════════════

function renderLaporan() {
  const p = AppState.profil;
  const bolehSeluruh = punyaLingkupPenuh();
  const L = AppState.laporan;
  const kini = new Date();

  // Wali kelas dikunci pada kelas perwaliannya
  if (!bolehSeluruh) {
    L.kelas = p.waliKelas || '';
    L.kelasSiswa = p.waliKelas || 'SEMUA';
  }

  // Kelas yang boleh dicetak pengguna ini
  const kelasTersedia = bolehSeluruh ? AppState.kelas.slice().sort(bandingKelas) : [p.waliKelas];

  const opsiKelas = (bolehSeluruh ? '<option value="SEMUA">Seluruh Sekolah (Semua Kelas)</option>' : '') +
    kelasTersedia.filter(Boolean).map(function (k) {
      return '<option value="' + escHtml(k) + '"' +
        (L.kelas === k || !bolehSeluruh ? ' selected' : '') + '>Kelas ' + escHtml(k) + '</option>';
    }).join('');

  const opsiTahun = [kini.getFullYear(), kini.getFullYear() - 1].map(function (t) {
    return '<option value="' + t + '"' + (L.tahun === t ? ' selected' : '') + '>' + t + '</option>';
  }).join('');

  const html =
  '<div class="judul-seksi">' +
    '<div><h2>Cetak &amp; Unduh Laporan Karakter Siswa</h2></div>' +
  '</div>' +

  // ── Pemilih jenis laporan ──
  '<div class="card mb-3"><div class="card-body">' +
    '<div class="label-kecil mb-2">Jenis Laporan</div>' +
    '<div class="segmen mb-4">' +
      '<button type="button" class="' + (L.mode === 'kelas' ? 'aktif-navy' : '') + '" ' +
        'onclick="gantiModeLaporan(\'kelas\')">' +
        '<i class="bi bi-table"></i> Rekap Per Kelas</button>' +
      '<button type="button" class="' + (L.mode === 'siswa' ? 'aktif-navy' : '') + '" ' +
        'onclick="gantiModeLaporan(\'siswa\')">' +
        '<i class="bi bi-person-lines-fill"></i> Rincian Per Siswa</button>' +
    '</div>' +

    // ── Sasaran laporan ──
    (L.mode === 'kelas'
      ? '<div class="row g-3">' +
          '<div class="col-12 col-md-6"><label class="form-label" for="lapKelas">Pilih Rombel / Kelas</label>' +
            '<select class="form-select" id="lapKelas" onchange="pilihKelasLaporan(this.value)">' + opsiKelas + '</select></div>' +
          '<div class="col-12 col-md-6 d-flex align-items-end">' +
            '<div class="kotak-info w-100"><i class="bi bi-info-circle"></i><div>' +
              'Menghasilkan <b>satu tabel rekap</b> berisi poin awal, akumulasi plus/minus, total, dan zona tiap siswa.' +
            '</div></div></div>' +
        '</div>'
      : pemilihSiswaLaporan(bolehSeluruh, kelasTersedia)) +

    '<div class="pemisah"></div>' +

    // ── Periode: bulan boleh lebih dari satu ──
    '<div class="d-flex flex-wrap align-items-center gap-2 mb-2">' +
      '<span class="label-kecil mb-0">Periode Rekapitulasi</span>' +
      '<div class="ms-auto d-flex flex-wrap gap-2">' +
        '<select class="form-select form-select-sm" style="width:auto;min-height:38px" ' +
          'id="lapTahun" onchange="pilihTahunLaporan(this.value)">' + opsiTahun + '</select>' +
        '<button type="button" class="btn btn-hantu btn-kecil" onclick="pilihSemuaBulan()">' +
          '<i class="bi bi-calendar2-check"></i> Semua Bulan</button>' +
        '<button type="button" class="btn btn-hantu btn-kecil" onclick="pilihBulanIni()">' +
          '<i class="bi bi-calendar-event"></i> Bulan Ini</button>' +
        '<button type="button" class="btn btn-hantu btn-kecil" onclick="kosongkanBulan()">' +
          '<i class="bi bi-x-lg"></i> Kosongkan</button>' +
      '</div>' +
    '</div>' +
    '<div class="grid-bulan mb-2">' +
      nomorBulan().map(function (nm, i) {
        const aktif = L.bulan.indexOf(i + 1) !== -1;
        return '<button type="button" class="chip-bulan' + (aktif ? ' aktif' : '') + '" ' +
          'onclick="alihkanBulan(' + (i + 1) + ')">' +
          '<i class="bi bi-' + (aktif ? 'check-square-fill' : 'square') + '"></i> ' + nm.substring(0, 3) +
        '</button>';
      }).join('') +
    '</div>' +
    '<div class="form-text mb-3">' + ringkasanPeriode() + '</div>' +

    '<div class="pemisah"></div>' +

    // ── Kelengkapan cetak ──
    '<div class="label-kecil mb-2">Opsi Kelengkapan Cetak</div>' +
    '<div class="d-flex flex-wrap gap-4 mb-3">' +
      '<div class="form-check"><input class="form-check-input" type="checkbox" id="lapTtd" checked ' +
        'onchange="document.getElementById(\'lapTtdBK\').disabled = !this.checked; ' +
        'document.getElementById(\'lapTtdOrtu\').disabled = !this.checked">' +
        '<label class="form-check-label" for="lapTtd">Sertakan blok tanda tangan &amp; pengesahan</label></div>' +
      '<div class="form-check"><input class="form-check-input" type="checkbox" id="lapTtdBK">' +
        '<label class="form-check-label" for="lapTtdBK">Sertakan tanda tangan mengetahui <b>Guru BK</b>' +
          (AppState.guruBKSekolah && AppState.guruBKSekolah.nama
            ? ' <span class="text-secondary-2">(' + escHtml(AppState.guruBKSekolah.nama) + ')</span>'
            : ' <span style="color:var(--kuning-tx)">— belum ditetapkan</span>') +
        '</label></div>' +
      (L.mode === 'siswa'
        ? '<div class="form-check"><input class="form-check-input" type="checkbox" id="lapTtdOrtu" checked>' +
            '<label class="form-check-label" for="lapTtdOrtu">Sertakan kolom tanda tangan <b>Orang Tua / Wali</b></label></div>'
        : '<input type="checkbox" id="lapTtdOrtu" hidden>') +
      (L.mode === 'kelas'
        ? '<div class="form-check"><input class="form-check-input" type="checkbox" id="lapZona" checked>' +
            '<label class="form-check-label" for="lapZona">Sertakan ringkasan distribusi zona</label></div>'
        : '<input type="checkbox" id="lapZona" checked hidden>') +
      '<div class="form-check"><input class="form-check-input" type="checkbox" id="lapCatatan" checked>' +
        '<label class="form-check-label" for="lapCatatan">Sertakan ' +
          (L.mode === 'siswa' ? 'rekomendasi tindak lanjut' : 'kolom rekomendasi &amp; catatan BK') + '</label></div>' +
    '</div>' +

    '<button class="btn btn-navy w-100" id="tombolCetak" onclick="cetakLaporan()">' +
      '<i class="bi bi-printer-fill"></i> Buat Dokumen PDF</button>' +
  '</div></div>' +

  '<div class="tata-utama">' +
    '<div class="card">' +
      '<div class="card-header"><div><h5>Pratinjau Dokumen</h5>' +
        '<p class="sub">Dokumen A4 potret, siap ditandatangani dan diarsipkan</p></div>' +
        '<div class="kanan" id="aksiPratinjauLaporan"></div></div>' +
      '<div class="card-body" id="wadahPratinjauLaporan">' +
        '<div class="kosong"><i class="bi bi-file-earmark-pdf"></i><h6>Belum ada dokumen</h6>' +
        '<p class="mb-0">Atur pilihan di atas, lalu klik <b>Buat Dokumen PDF</b>.</p></div>' +
      '</div>' +
    '</div>' +

    '<div class="tumpuk">' +
      '<div class="card"><div class="card-header"><div><h5>Ringkasan Data Terpilih</h5></div></div>' +
        '<div class="card-body" id="ringkasanLaporan"></div></div>' +

      '<div class="kotak-info"><i class="bi bi-patch-check"></i><div>' +
        '<b>Standarisasi Dokumen.</b> Seluruh laporan memuat kop sekolah dengan dua logo, tahun ajaran, ' +
        'periode, serta ruang tanda tangan sesuai opsi yang dipilih.</div></div>' +

      '<div class="card"><div class="card-header"><div><h5>Riwayat Unduhan Sesi Ini</h5></div></div>' +
        '<div class="card-body" id="riwayatUnduhan">' +
          '<div class="kosong" style="padding:var(--s-lg) 0"><i class="bi bi-clock-history"></i>' +
          '<p class="mb-0">Belum ada dokumen yang dibuat.</p></div>' +
        '</div></div>' +
    '</div>' +
  '</div>';

  document.getElementById('section-laporan').innerHTML = html;
  hitungRingkasanLaporan();
}

/** Blok pemilih siswa untuk laporan rincian */
function pemilihSiswaLaporan(bolehSeluruh, kelasTersedia) {
  const L = AppState.laporan;

  const opsiKelas = (bolehSeluruh ? '<option value="SEMUA">Semua kelas</option>' : '') +
    kelasTersedia.filter(Boolean).map(function (k) {
      return '<option value="' + escHtml(k) + '"' +
        (L.kelasSiswa === k || !bolehSeluruh ? ' selected' : '') + '>Kelas ' + escHtml(k) + '</option>';
    }).join('');

  return '<div class="row g-2 mb-2">' +
      '<div class="col-12 col-sm-5"><div class="kotak-cari"><i class="bi bi-search"></i>' +
        '<input class="form-control" id="lapCariSiswa" placeholder="Cari nama atau NISN…" ' +
          'value="' + escHtml(L.cari) + '" oninput="cariSiswaLaporan(this.value)"></div></div>' +
      '<div class="col-7 col-sm-4"><select class="form-select" onchange="pilihKelasSiswaLaporan(this.value)">' +
        opsiKelas + '</select></div>' +
      '<div class="col-5 col-sm-3"><div class="d-flex gap-1">' +
        '<button type="button" class="btn btn-hantu w-100 btn-kecil" onclick="pilihSemuaSiswaLaporan()" ' +
          'title="Centang semua yang tampil"><i class="bi bi-check-all"></i> Semua</button>' +
        '<button type="button" class="btn btn-hantu btn-kecil" onclick="kosongkanSiswaLaporan()" ' +
          'title="Hapus semua centang"><i class="bi bi-x-lg"></i></button>' +
      '</div></div>' +
    '</div>' +
    '<div id="daftarSiswaLaporan"></div>';
}

/** Daftar siswa bercentang, mengikuti pencarian & filter kelas */
function renderDaftarSiswaLaporan() {
  const wadah = document.getElementById('daftarSiswaLaporan');
  if (!wadah) return;

  // Simpan posisi gulir — daftar ini panjang, dan menggulirkannya kembali
  // ke atas membuat pengguna kehilangan tempatnya.
  const kotakLama = wadah.querySelector('.daftar-pilih-siswa');
  const gulir = kotakLama ? kotakLama.scrollTop : 0;

  const daftar = siswaKandidatLaporan();
  const L = AppState.laporan;

  if (!daftar.length) {
    wadah.innerHTML = '<div class="kotak-info peringatan"><i class="bi bi-search"></i><div>' +
      'Tidak ada siswa yang cocok dengan pencarian atau filter kelas.</div></div>';
    return;
  }

  wadah.innerHTML =
    '<div class="daftar-pilih-siswa">' +
      daftar.slice(0, 200).map(function (s) {
        const z = zonaDari(s.PoinSaatIni);
        const dipilih = L.nisnTerpilih.indexOf(String(s.NISN)) !== -1;
        return '<label>' +
          '<input class="form-check-input mt-0" type="checkbox"' + (dipilih ? ' checked' : '') +
            ' onchange="alihkanSiswaLaporan(\'' + escHtml(s.NISN) + '\')">' +
          '<span style="min-width:0">' +
            '<span class="nm d-block">' + escHtml(s.Nama) + '</span>' +
            '<span class="sb">' + escHtml(s.Kelas) + ' • ' + escHtml(s.NISN) + '</span>' +
          '</span>' +
          '<span class="kanan">' +
            '<span class="mono d-block" style="font-weight:700">' + escHtml(s.PoinSaatIni) + '</span>' +
            '<span class="lencana ' + kelasZona(z) + '" style="font-size:10px;padding:1px 7px">' + z + '</span>' +
          '</span>' +
        '</label>';
      }).join('') +
    '</div>' +
    '<div class="form-text mt-2" id="ringkasPilihSiswaLaporan">' +
      ringkasanPilihSiswaLaporan(daftar.length) + '</div>';

  const kotakBaru = wadah.querySelector('.daftar-pilih-siswa');
  if (kotakBaru && gulir) kotakBaru.scrollTop = gulir;
}

/** Keterangan di bawah daftar — dipisah agar dapat diperbarui sendiri */
function ringkasanPilihSiswaLaporan(jumlahKandidat) {
  const L = AppState.laporan;
  const n = typeof jumlahKandidat === 'number' ? jumlahKandidat : siswaKandidatLaporan().length;
  return (L.nisnTerpilih.length
      ? '<b>' + L.nisnTerpilih.length + ' siswa</b> terpilih — tiap siswa mendapat halamannya sendiri.'
      : 'Belum ada siswa dicentang.') +
    (n > 200 ? ' Menampilkan 200 dari ' + n + ' siswa; persempit pencarian.' : '');
}

/** Siswa dalam lingkup pengguna, tersaring pencarian & kelas */
function siswaKandidatLaporan() {
  const L = AppState.laporan;
  const q = String(L.cari || '').trim().toLowerCase();

  let daftar = punyaLingkupPenuh()
    ? AppState.siswa
    : AppState.siswa.filter(function (s) { return String(s.Kelas) === String(AppState.profil.waliKelas); });

  if (L.kelasSiswa !== 'SEMUA') {
    daftar = daftar.filter(function (s) { return String(s.Kelas) === L.kelasSiswa; });
  }
  if (q) {
    daftar = daftar.filter(function (s) {
      return String(s.Nama).toLowerCase().indexOf(q) !== -1 || String(s.NISN).indexOf(q) !== -1;
    });
  }
  return urutSiswa(daftar);
}

// ── Aksi pemilihan ────────────────────────────────────────────────────

function gantiModeLaporan(mode) { AppState.laporan.mode = mode; renderLaporan(); }
function pilihKelasLaporan(v)   { AppState.laporan.kelas = v; hitungRingkasanLaporan(); }
function pilihTahunLaporan(v)   { AppState.laporan.tahun = Number(v); renderLaporan(); }

function pilihKelasSiswaLaporan(v) {
  AppState.laporan.kelasSiswa = v;
  renderDaftarSiswaLaporan();
  hitungRingkasanLaporan();
}

let timerCariLaporan;
function cariSiswaLaporan(q) {
  clearTimeout(timerCariLaporan);
  timerCariLaporan = setTimeout(function () {
    AppState.laporan.cari = q;
    renderDaftarSiswaLaporan();          // hanya daftarnya yang dirender ulang, fokus tetap
  }, 250);
}

/**
 * Mencentang satu siswa hanya mengubah datanya, TIDAK menggambar ulang daftar.
 * Kotak centangnya sudah berubah sendiri oleh peramban, dan menggambar ulang
 * seluruh daftar akan melempar gulirannya kembali ke nama paling atas —
 * menyulitkan saat mencentang nama di bagian tengah atau bawah.
 */
function alihkanSiswaLaporan(nisn) {
  const L = AppState.laporan;
  const i = L.nisnTerpilih.indexOf(String(nisn));
  if (i === -1) L.nisnTerpilih.push(String(nisn)); else L.nisnTerpilih.splice(i, 1);

  const ringkas = document.getElementById('ringkasPilihSiswaLaporan');
  if (ringkas) ringkas.innerHTML = ringkasanPilihSiswaLaporan();
  hitungRingkasanLaporan();
}

function pilihSemuaSiswaLaporan() {
  const L = AppState.laporan;
  siswaKandidatLaporan().forEach(function (s) {
    if (L.nisnTerpilih.indexOf(String(s.NISN)) === -1) L.nisnTerpilih.push(String(s.NISN));
  });
  renderDaftarSiswaLaporan();
  hitungRingkasanLaporan();
}

function kosongkanSiswaLaporan() {
  AppState.laporan.nisnTerpilih = [];
  renderDaftarSiswaLaporan();
  hitungRingkasanLaporan();
}

// ── Pemilihan bulan ───────────────────────────────────────────────────

function alihkanBulan(b) {
  const L = AppState.laporan;
  const i = L.bulan.indexOf(b);
  if (i === -1) L.bulan.push(b); else L.bulan.splice(i, 1);
  L.bulan.sort(function (x, y) { return x - y; });
  renderLaporan();
}

function pilihSemuaBulan() {
  // Centang kedua belas bulan secara nyata. Sebelumnya di sini diisi array kosong —
  // hasil laporannya memang sudah benar (kosong diartikan "seluruh bulan" oleh server),
  // tetapi tidak ada satu pun kotak yang tercentang sehingga tampak seperti gagal.
  AppState.laporan.bulan = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  renderLaporan();
}

function pilihBulanIni() {
  AppState.laporan.bulan = [new Date().getMonth() + 1];
  AppState.laporan.tahun = new Date().getFullYear();
  renderLaporan();
}

/** Lepas semua centang. Tanpa centang, laporan tetap memuat seluruh bulan. */
function kosongkanBulan() { AppState.laporan.bulan = []; renderLaporan(); }

/** Kalimat ringkas periode yang sedang dipilih */
function ringkasanPeriode() {
  const L = AppState.laporan;
  const nb = nomorBulan();
  if (!L.bulan.length) {
    return '<i class="bi bi-info-circle"></i> Tidak ada bulan dicentang — laporan tetap memuat ' +
           '<b>seluruh bulan tahun ' + L.tahun + '</b>.';
  }
  if (L.bulan.length === 12) {
    return '<i class="bi bi-check-circle-fill" style="color:var(--hijau-line)"></i> ' +
           'Seluruh bulan tercentang: <b>Januari &ndash; Desember ' + L.tahun + '</b>';
  }
  if (L.bulan.length === 1) {
    return '<i class="bi bi-check-circle-fill" style="color:var(--hijau-line)"></i> ' +
           'Periode: <b>' + nb[L.bulan[0] - 1] + ' ' + L.tahun + '</b>';
  }
  return '<i class="bi bi-check-circle-fill" style="color:var(--hijau-line)"></i> ' +
         '<b>' + L.bulan.length + ' bulan</b> dipilih: ' +
         L.bulan.map(function (b) { return nb[b - 1]; }).join(', ') + ' ' + L.tahun;
}

// ── Ringkasan & pencetakan ────────────────────────────────────────────

function hitungRingkasanLaporan() {
  const el = document.getElementById('ringkasanLaporan');
  if (!el) return;
  const L = AppState.laporan;

  if (L.mode === 'siswa') renderDaftarSiswaLaporan();

  const data = L.mode === 'siswa'
    ? AppState.siswa.filter(function (s) { return L.nisnTerpilih.indexOf(String(s.NISN)) !== -1; })
    : (L.kelas === 'SEMUA' ? AppState.siswa : AppState.siswa.filter(function (s) { return String(s.Kelas) === L.kelas; }));

  const z = hitungZonaSiswa(data);
  const total = data.length || 1;

  let wali = AppState.guru.filter(function (g) { return String(g.WaliKelas) === L.kelas; })[0];
  if (!wali && String(AppState.profil.waliKelas) === L.kelas) wali = { Nama: AppState.profil.nama };

  // Jumlah catatan pada periode terpilih
  let jumlahCatatan = 0;
  const daftarNisn = data.map(function (s) { return String(s.NISN); });
  AppState.riwayat.forEach(function (r) {
    if (daftarNisn.indexOf(String(r.NISN)) === -1) return;
    const m = String(r.Tanggal).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m || Number(m[3]) !== L.tahun) return;
    if (L.bulan.length && L.bulan.indexOf(Number(m[2])) === -1) return;
    jumlahCatatan++;
  });

  el.innerHTML =
    '<div class="d-flex flex-column gap-2" style="font-size:13px">' +
      barisRingkas('Jenis Dokumen', L.mode === 'siswa' ? 'Rincian Per Siswa' : 'Rekap Per Kelas') +
      barisRingkas('Satuan Pendidikan', AppState.konfigurasi.namaSekolah) +
      (L.mode === 'siswa'
        ? barisRingkas('Siswa Terpilih', data.length + ' siswa • ' + data.length + ' halaman')
        : barisRingkas('Rombongan Belajar', L.kelas === 'SEMUA' ? 'Seluruh Kelas' : 'Kelas ' + L.kelas)) +
      barisRingkas('Jumlah Peserta Didik', data.length + ' Siswa') +
      barisRingkas('Catatan pada Periode', jumlahCatatan + ' kejadian') +
      (L.mode === 'kelas' ? barisRingkas('Wali Kelas', wali ? wali.Nama : (L.kelas === 'SEMUA' ? '—' : 'Belum ditetapkan')) : '') +
      barisRingkas('Kepala Sekolah', AppState.kepalaSekolah.nama || 'Belum ditetapkan') +
      barisRingkas('Guru BK', AppState.guruBKSekolah.nama || 'Belum ditetapkan') +
    '</div>' +
    '<div class="pemisah"></div>' +
    '<div class="d-flex gap-2">' +
      ['Hijau','Kuning','Merah'].map(function (nm) {
        return '<div style="flex:1;text-align:center;background:var(--' + nm.toLowerCase() + '-bg);border-radius:var(--r-md);padding:10px 6px">' +
          '<div class="mono" style="font-size:19px;font-weight:700;color:var(--' + nm.toLowerCase() + '-tx)">' + z[nm] + '</div>' +
          '<div style="font-size:10.5px;font-weight:600;color:var(--' + nm.toLowerCase() + '-tx)">' + nm.toUpperCase() + '</div>' +
          '<div style="font-size:10px;color:var(--' + nm.toLowerCase() + '-tx);opacity:.8">' + ((z[nm] / total) * 100).toFixed(1) + '%</div>' +
        '</div>';
      }).join('') +
    '</div>';
}

function barisRingkas(k, v) {
  return '<div class="d-flex gap-2"><span style="color:var(--text-secondary);min-width:140px">' + k + '</span>' +
    '<b style="text-align:right;flex:1">' + escHtml(v || '—') + '</b></div>';
}

function cetakLaporan() {
  const L = AppState.laporan;

  if (L.mode === 'siswa' && !L.nisnTerpilih.length) {
    return toast('Belum lengkap', 'Centang minimal satu siswa terlebih dahulu.', 'peringatan');
  }
  if (L.mode === 'siswa' && L.nisnTerpilih.length > 60) {
    return toast('Terlalu banyak', 'Maksimal 60 siswa per dokumen. Bagi menjadi beberapa cetakan.', 'peringatan');
  }

  const btn = document.getElementById('tombolCetak');
  const asli = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-inline"></span> Menyusun dokumen…';
  btn.disabled = true;

  document.getElementById('wadahPratinjauLaporan').innerHTML =
    '<div class="kosong"><div class="spinner-ring mx-auto mb-3"></div>' +
    '<h6>Menyusun dokumen PDF</h6><p class="mb-0">' +
    (L.mode === 'siswa' && L.nisnTerpilih.length > 10
      ? 'Menyiapkan ' + L.nisnTerpilih.length + ' halaman siswa — mohon tunggu sebentar…'
      : 'Mohon tunggu, dokumen sedang dibuat di server…') + '</p></div>';

  const opsi = {
    mode: L.mode,
    kelas: L.mode === 'kelas' ? L.kelas : '',
    daftarNisn: L.mode === 'siswa' ? L.nisnTerpilih.slice() : [],
    bulan: L.bulan.slice(),                 // array; kosong = seluruh bulan
    tahun: L.tahun,
    sertakanTtd: document.getElementById('lapTtd').checked,
    sertakanTtdBK: document.getElementById('lapTtdBK').checked,
    sertakanTtdOrtu: document.getElementById('lapTtdOrtu').checked,
    sertakanZona: document.getElementById('lapZona').checked,
    sertakanCatatan: document.getElementById('lapCatatan').checked
  };

  google.script.run
    .withSuccessHandler(function (res) {
      btn.innerHTML = asli; btn.disabled = false;
      if (!res.success) {
        document.getElementById('wadahPratinjauLaporan').innerHTML =
          '<div class="kotak-info bahaya"><i class="bi bi-x-octagon"></i><div>' + escHtml(res.message) + '</div></div>';
        return toast('Gagal', res.message, 'bahaya');
      }
      const d = res.data;
      document.getElementById('wadahPratinjauLaporan').innerHTML =
        '<iframe src="' + escHtml(d.urlPreview) + '" class="bingkai-pdf"></iframe>';
      document.getElementById('aksiPratinjauLaporan').innerHTML =
        '<button class="btn btn-gold btn-kecil" onclick="unduhBase64(\'' + d.base64 + '\',\'' + escHtml(d.nama) + '\',\'application/pdf\')">' +
        '<i class="bi bi-download"></i> Unduh PDF</button>';

      const wadah = document.getElementById('riwayatUnduhan');
      const kartu = '<div class="kartu-unduhan"><div class="ikon"><i class="bi bi-file-earmark-pdf-fill"></i></div>' +
        '<div class="teks"><strong>' + escHtml(d.nama) + '</strong>' +
        '<span>Dibuat ' + new Date().toLocaleTimeString('id-ID') + '</span></div>' +
        '<button class="btn btn-hantu btn-mini ms-auto" onclick="unduhBase64(\'' + d.base64 + '\',\'' + escHtml(d.nama) + '\',\'application/pdf\')">' +
        '<i class="bi bi-download"></i></button></div>';
      if (wadah.querySelector('.kosong')) wadah.innerHTML = kartu; else wadah.insertAdjacentHTML('afterbegin', kartu);

      toast('Dokumen siap', 'Laporan PDF berhasil dibuat.', 'sukses');
    })
    .withFailureHandler(function (err) {
      btn.innerHTML = asli; btn.disabled = false;
      document.getElementById('wadahPratinjauLaporan').innerHTML =
        '<div class="kotak-info bahaya"><i class="bi bi-x-octagon"></i><div>' + escHtml(err.message) + '</div></div>';
      toast('Error', err.message, 'bahaya');
    })
    .buatLaporanPDF(AppState.token, opsi);
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 19B: HALAMAN — TINDAK LANJUT & PEMBINAAN
// ════════════════════════════════════════════════════════════════════

/**
 * Siswa yang otomatis masuk daftar tindak lanjut:
 *   1. Pernah menerima pelanggaran tunggal −30 poin atau lebih berat
 *   2. Berada di Zona Kuning atau Zona Merah
 * Wali kelas hanya melihat kelas perwaliannya.
 */
/**
 * Apakah sebuah catatan riwayat bertipe pelanggaran?
 * Memakai kolom Jenis, bukan nilai poin — sebab pelanggaran boleh berpoin 0
 * (contoh: terlambat apel tetapi diganti tugas menyapu, tanpa pengurangan poin).
 * Catatan lama tanpa kolom Jenis dinilai dari poinnya sebagai cadangan.
 */
function catatanPelanggaran(r) {
  const j = String(r.Jenis || '').trim().toLowerCase();
  if (j === 'pelanggaran') return true;
  if (j === 'kebaikan') return false;
  return Number(r.Poin) < 0;
}

function kasusPerluTindakLanjut() {
  if (!AppState.profil || AppState.profil.peran === 'siswa') return [];

  const daftarSiswa = lingkupSatuKelas()
    ? AppState.siswa.filter(function (s) { return String(s.Kelas) === String(AppState.profil.waliKelas); })
    : AppState.siswa;

  const riwayat = riwayatDalamLingkup();
  const kasus = [];

  daftarSiswa.forEach(function (s) {
    const zona = zonaDari(s.PoinSaatIni);
    const milik = riwayat.filter(function (r) { return String(r.NISN) === String(s.NISN); });

    // Pelanggaran berat: satu kejadian dengan bobot −30 atau lebih
    const berat = milik.filter(function (r) {
      return Number(r.Poin) <= -AMBANG_SARAN_TINDAKAN;
    }).sort(function (a, b) { return Number(a.Poin) - Number(b.Poin); });

    const zonaKritis = (zona === 'Kuning' || zona === 'Merah');
    if (!berat.length && !zonaKritis) return;   // tidak perlu ditindaklanjuti

    // Alasan kemunculan
    const pemicu = [];
    if (berat.length) {
      pemicu.push('Pelanggaran berat (' + berat.length + '): ' +
        berat.slice(0, 2).map(function (r) { return r.NamaKejadian + ' ' + r.Poin; }).join('; ') +
        (berat.length > 2 ? '; dll.' : ''));
    }
    if (zonaKritis) pemicu.push('Zona ' + zona + ' — poin ' + s.PoinSaatIni);

    // Tindakan disipliner yang sudah tercatat saat input poin.
    // HANYA dari catatan pelanggaran — kolom Hukuman pada catatan KEBAIKAN berisi
    // "Bentuk Apresiasi yang Diberikan", yang tidak ada urusannya dengan pembinaan.
    const tindakan = [];
    milik.forEach(function (r) {
      if (!catatanPelanggaran(r)) return;
      if (r.Hukuman && tindakan.indexOf(r.Hukuman) === -1) tindakan.push(r.Hukuman);
    });

    const tl = AppState.tindakLanjut.filter(function (t) { return String(t.NISN) === String(s.NISN); });

    // ── Pembinaan yang sudah TUNTAS menghapus siswa dari daftar kasus ──
    // Dibandingkan dengan tanggal pelanggaran terakhir: bila siswa melanggar LAGI
    // setelah dinyatakan selesai, ia otomatis muncul kembali di daftar ini.
    // Riwayat sesinya sendiri tidak pernah dihapus — tetap tampil di bawah.
    let tglPelanggaranTerakhir = 0;
    milik.forEach(function (r) {
      if (Number(r.Poin) >= 0) return;
      const t = uraiTanggal(r.Tanggal);
      if (t > tglPelanggaranTerakhir) tglPelanggaranTerakhir = t;
    });
    // Yang menentukan adalah sesi TERBARU: bila Guru BK membuka sesi baru berstatus
    // "Proses" setelah menuntaskan yang lama, siswa kembali masuk daftar pantauan.
    let sesiTerbaru = null, tglSesiTerbaru = -1;
    tl.forEach(function (t) {
      const w = uraiTanggal(t.Tanggal);
      if (w >= tglSesiTerbaru) { tglSesiTerbaru = w; sesiTerbaru = t; }
    });

    const grupSelesai = {};
    tl.forEach(function (t) { grupSelesai[String(t.IDGrup || t.ID)] = true; });
    const jumlahSesi = Object.keys(grupSelesai).length;

    const tuntas = !!sesiTerbaru && String(sesiTerbaru.StatusTL).toLowerCase() === 'selesai';

    // ── Kapan siswa yang sudah TUNTAS muncul kembali? ──
    // Tolok ukurnya POIN yang direkam saat pembinaan dinyatakan tuntas.
    // Poin hanya turun oleh pelanggaran baru, jadi "poin sekarang < poin saat
    // tuntas" berarti siswa melanggar lagi — apa pun zonanya:
    //   Hijau→Kuning, Kuning→Kuning, Kuning→Merah, Merah→Merah, maupun
    //   Hijau yang menerima pelanggaran berat namun masih Hijau.
    // Perbandingan poin dipilih, bukan tanggal, karena pelanggaran yang terjadi
    // pada HARI YANG SAMA dengan penuntasan tetap terdeteksi.
    let pelanggaranBaru = false;
    let sudahTuntas = false;
    if (tuntas) {
      // Langkah 1 — APAKAH ADA pelanggaran baru sejak pembinaan dituntaskan?
      const cuplikan = sesiTerbaru.PoinSaatTuntas;
      const adaCuplikan = cuplikan !== '' && cuplikan !== null && cuplikan !== undefined &&
                          !isNaN(Number(cuplikan));
      let turunPoin = 0;
      if (adaCuplikan) {
        turunPoin = Number(cuplikan) - Number(s.PoinSaatIni);
        pelanggaranBaru = turunPoin > 0;
      } else {
        // ── Sesi lama, tanpa cuplikan poin ──
        // Tolok ukurnya tinggal tanggal, dan tanggal TIDAK dapat membedakan mana
        // yang lebih dulu bila pelanggaran terjadi pada hari yang sama dengan
        // penuntasan. Dipakai ">=", bukan ">": lebih baik seorang siswa tampil
        // sekali padahal tidak perlu, daripada pengulangan pelanggaran luput
        // dari pantauan. Begitu sesi berikutnya dibuat, cuplikan poin sudah
        // terekam dan penilaiannya kembali tepat.
        pelanggaranBaru = tglPelanggaranTerakhir >= tglSesiTerbaru;
      }

      // Langkah 2 — pelanggaran baru saja belum cukup. Siswa hanya masuk lagi bila:
      //   a. zonanya Kuning atau Merah, ATAU
      //   b. pelanggaran barunya berbobot −30 poin atau lebih berat,
      //      meski poinnya masih membuatnya bertahan di Zona Hijau.
      // Siswa Zona Hijau yang hanya menerima pelanggaran ringan TIDAK ditarik
      // kembali — pelanggaran berat LAMA (sebelum tuntas) juga tidak dihitung,
      // sebab kasus itu sudah selesai dibina.
      let beratBaru = false;
      if (pelanggaranBaru) {
        const sesudahTuntas = milik.filter(function (r) {
          return catatanPelanggaran(r) && uraiTanggal(r.Tanggal) >= tglSesiTerbaru;
        });
        beratBaru = sesudahTuntas.some(function (r) {
          return Number(r.Poin) <= -AMBANG_SARAN_TINDAKAN;
        });

        // Cadangan sempit: bila TIDAK ADA satu pun catatan bertanggal setelah
        // penuntasan padahal poinnya jelas turun (mis. pelanggaran dicatat
        // mundur tanggalnya), besar penurunan itulah satu-satunya petunjuk.
        if (!sesudahTuntas.length && turunPoin >= AMBANG_SARAN_TINDAKAN) beratBaru = true;
      }

      const layakMasukLagi = pelanggaranBaru && (zonaKritis || beratBaru);
      sudahTuntas = !layakMasukLagi;
      if (sudahTuntas) pelanggaranBaru = false;   // jangan tandai sebagai pengulangan
    }
    if (sudahTuntas) return;

    // Sesi yang sedang berjalan mengunci tombol aksi; bila sesi terakhir sudah
    // tuntas dan siswa melanggar lagi, ia butuh sesi BARU — tombol dibuka lagi.
    kasus.push({
      siswa: s, zona: zona,
      pelanggaranBerat: berat,
      pemicu: pemicu,
      tindakanTercatat: tindakan,
      jumlahTL: tl.length,
      jumlahSesi: jumlahSesi,
      sesiBerjalan: !!sesiTerbaru && !tuntas,
      perluSesiBaru: !sesiTerbaru || tuntas,
      pelanggaranBaru: pelanggaranBaru,
      tlTerakhir: tl.length ? tl[0] : null,
      prioritas: (zona === 'Merah' ? 0 : (berat.length ? 1 : 2))
    });
  });

  return kasus.sort(function (a, b) {
    if (a.prioritas !== b.prioritas) return a.prioritas - b.prioritas;
    return Number(a.siswa.PoinSaatIni) - Number(b.siswa.PoinSaatIni);
  });
}

/** Kelompokkan catatan tindak lanjut menjadi sesi (satu IDGrup = satu sesi) */
function sesiTindakLanjut() {
  const peta = {};
  AppState.tindakLanjut.forEach(function (t) {
    const g = String(t.IDGrup || t.ID);
    if (!peta[g]) {
      peta[g] = {
        idGrup: g, tanggal: t.Tanggal, jenis: t.JenisTindakan,
        catatan: t.CatatanTindakLanjut, evaluasiLama: t.Evaluasi,
        statusTL: t.StatusTL, petugas: t.Petugas, pemicu: t.Pemicu,
        siswa: []
      };
    }
    peta[g].siswa.push({ nisn: String(t.NISN), nama: t.NamaSiswa, kelas: t.Kelas });
  });

  // Lampirkan evaluasi berkala milik tiap sesi, urut dari yang paling lama
  Object.keys(peta).forEach(function (k) {
    peta[k].evaluasi = evaluasiSesi(k);
  });
  return Object.keys(peta).map(function (k) { return peta[k]; })
    .sort(function (a, b) { return uraiTanggal(b.tanggal) - uraiTanggal(a.tanggal); });
}

/** dd/mm/yyyy → angka untuk pengurutan */
function uraiTanggal(teks) {
  const m = String(teks || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime() : 0;
}

// ════════════════════════════════════════════════════════════════════
// PENGADUAN & KONSELING SISWA
// ════════════════════════════════════════════════════════════════════
//
// Jalur untuk siswa yang DATANG MENGADU — korban perundungan, masalah keluarga,
// kesulitan pertemanan. Siswa di sini bukan pelanggar: tidak ada poin, tidak ada
// zona, dan datanya tidak pernah bercampur dengan pembinaan disiplin.
//
// Seluruh aturan hak akses ditegakkan di server; yang di bawah ini hanya
// menyesuaikan tampilan agar tidak menampilkan tombol yang pasti ditolak.

const KATEGORI_PENGADUAN = [
  'Perundungan / Bullying',
  'Masalah Pertemanan',
  'Masalah Keluarga',
  'Kesulitan Belajar',
  'Kekerasan / Keamanan',
  'Lainnya'
];

/**
 * Boleh MEMBUAT pengaduan: Admin, Guru BK, dan Wali Kelas.
 * Kepala Sekolah yang tidak merangkap peran lain hanya boleh MEMBACA (v2.14),
 * jadi tombol "Catat Pengaduan" tidak ditampilkan untuknya. Aturan yang sama
 * ditegakkan ulang di server — ini hanya menyesuaikan tampilan.
 */
function bolehCatatPengaduan() {
  if (AppState.bolehPengaduan !== true) return false;
  if (isAdmin() || isGuruBK()) return true;
  return String(AppState.profil.waliKelas || '').trim() !== '';
}

/** Wewenang mengubah satu kasus: Admin, Guru BK, atau pencatatnya sendiri */
function bolehKelolaPengaduan(p) {
  if (isAdmin() || isGuruBK()) return true;
  if (!p) return false;
  const id = String(AppState.profil.id || '').trim();
  return id !== '' && String(p.IDPetugas || '').trim() === id;
}

/** Berpindah tab antara pembinaan disiplin dan pengaduan */
function gantiJalurTL(jalur) {
  AppState.jalurTL = jalur;
  renderTindakLanjut();
}

/** Catatan perkembangan milik satu kasus, terlama di atas */
function perkembanganPengaduan(idPengaduan) {
  return AppState.catatanPengaduan.filter(function (c) {
    return String(c.IDPengaduan) === String(idPengaduan);
  });
}

/** Seluruh kasus yang boleh dilihat pengguna ini, belum selesai di atas */
function daftarPengaduan() {
  return AppState.pengaduan.slice().sort(function (a, b) {
    const selesaiA = String(a.StatusKasus).toLowerCase() === 'selesai' ? 1 : 0;
    const selesaiB = String(b.StatusKasus).toLowerCase() === 'selesai' ? 1 : 0;
    if (selesaiA !== selesaiB) return selesaiA - selesaiB;
    return uraiTanggal(b.Tanggal) - uraiTanggal(a.Tanggal);
  });
}

function isiHalamanPengaduan() {
  const daftar  = daftarPengaduan();
  const proses  = daftar.filter(function (p) { return String(p.StatusKasus).toLowerCase() !== 'selesai'; });
  const selesai = daftar.length - proses.length;
  const buli    = proses.filter(function (p) { return /perundungan|bully/i.test(p.Kategori); }).length;

  return '<div class="kotak-rahasia"><i class="bi bi-shield-lock"></i><div>' +
      '<b>Catatan ini bersifat rahasia.</b> Guru BK, Admin, dan Kepala Sekolah melihat ' +
      'seluruh kasus — <b>Kepala Sekolah hanya dapat membaca</b>, tidak mengubah. ' +
      'Wali kelas hanya melihat kasus yang ia catat sendiri, atau kasus siswa kelasnya ' +
      'yang izinnya dinyalakan pada formulir. ' +
      '<b>Pengaduan tidak mengurangi poin siswa</b> dan tidak memengaruhi zonanya — ' +
      'siswa yang mengadu bukan pelanggar.' +
    '</div></div>' +

    '<div class="grid-zona">' +
      kartuZona('zona-merah', 'bi-shield-exclamation', 'Dugaan Perundungan', buli, proses.length || 1, 'Sedang ditangani') +
      kartuZona('zona-gold',  'bi-hourglass-split',    'Kasus Berjalan',     proses.length, daftar.length || 1, 'Masih dalam pendampingan') +
      kartuZona('zona-navy',  'bi-check2-circle',      'Kasus Selesai',      selesai, daftar.length || 1, 'Pendampingan tuntas') +
    '</div>' +

    '<div class="card">' +
      '<div class="card-header">' +
        '<div><h5>Daftar Pengaduan &amp; Pendampingan</h5>' +
        '<p class="sub">' + daftar.length + ' kasus terlihat oleh Anda • yang berjalan tampil lebih dulu</p></div>' +
      '</div>' +
      '<div class="card-body">' +
        (daftar.length
          ? daftar.map(kartuPengaduan).join('')
          : '<div class="kosong"><i class="bi bi-chat-heart"></i><h6>Belum ada pengaduan</h6>' +
            '<p class="mb-0">Catatan konseling siswa yang mengadu akan muncul di sini.</p></div>') +
      '</div>' +
    '</div>';
}

function kartuPengaduan(p) {
  const selesai = String(p.StatusKasus).toLowerCase() === 'selesai';
  const kelola  = bolehKelolaPengaduan(p);
  const catatan = perkembanganPengaduan(p.ID);
  const buli    = /perundungan|bully|kekerasan/i.test(p.Kategori);

  const tombol =
    '<button class="btn btn-hantu btn-mini" title="Cetak laporan pendampingan" ' +
      'onclick="cetakPendampingan(\'' + escHtml(p.ID) + '\',event)"><i class="bi bi-printer"></i></button>' +
    (kelola && !selesai
      ? '<button class="btn btn-hantu btn-mini" title="Tambah perkembangan" ' +
          'onclick="bukaCatatanPengaduan(\'' + escHtml(p.ID) + '\')"><i class="bi bi-journal-plus"></i></button>' +
        '<button class="btn btn-hantu btn-mini" title="Ubah" ' +
          'onclick="bukaFormPengaduan(\'' + escHtml(p.ID) + '\')"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn btn-hantu btn-mini" title="Tandai selesai" ' +
          'onclick="konfirmasiTuntasPengaduan(\'' + escHtml(p.ID) + '\')"><i class="bi bi-check2-circle"></i></button>'
      : '') +
    (kelola
      ? '<button class="btn btn-hantu btn-mini" title="Hapus" ' +
          'onclick="konfirmasiHapusPengaduan(\'' + escHtml(p.ID) + '\')"><i class="bi bi-trash"></i></button>'
      : '');

  return '<div class="kartu-pengaduan' + (selesai ? ' selesai' : '') + '">' +
    '<div class="kp-atas">' +
      '<div style="min-width:0">' +
        '<div class="kp-nama">' + escHtml(p.NamaSiswa) +
          '<span class="cap-kelas">' + escHtml(p.Kelas) + '</span></div>' +
        '<div class="kp-sub mono">' + escHtml(p.NISN) + ' • ' + escHtml(p.Tanggal) + '</div>' +
      '</div>' +
      '<div class="kp-aksi">' +
        '<span class="lencana ' + (buli ? 'merah' : 'info') + '">' + escHtml(p.Kategori) + '</span>' +
        '<span class="lencana ' + (selesai ? 'hijau' : 'kuning') + '">' +
          (selesai ? 'Selesai' : 'Dalam pendampingan') + '</span>' +
        (String(p.IzinWaliKelas).toLowerCase() === 'ya'
          ? '<span class="lencana netral polos" title="Wali kelas siswa ini dapat melihat catatan"><i class="bi bi-eye"></i> Wali kelas</span>'
          : '<span class="lencana netral polos" title="Hanya Guru BK & Admin"><i class="bi bi-eye-slash"></i> Terbatas</span>') +
        tombol +
      '</div>' +
    '</div>' +

    (p.Terlapor
      ? '<div class="kp-blok"><div class="kp-judul">Pihak Terlapor</div>' + escHtml(p.Terlapor) +
        '<div class="kp-sub" style="margin-top:2px">Belum tentu terbukti — bila terbukti, catat pelanggarannya lewat Input Poin.</div></div>'
      : '') +

    '<div class="kp-blok"><div class="kp-judul">Kronologi</div>' +
      '<div class="kp-kronologi">' + escHtml(p.Kronologi) + '</div></div>' +

    (p.Pendampingan
      ? '<div class="kp-blok"><div class="kp-judul">Langkah Pendampingan</div>' +
        '<div class="kp-kronologi">' + escHtml(p.Pendampingan) + '</div></div>'
      : '') +

    (catatan.length
      ? '<div class="kp-perkembangan"><div class="kp-judul">Perkembangan (' + catatan.length + ')</div>' +
        catatan.map(function (c) {
          return '<div class="kp-item"><span class="kp-tgl mono">' + escHtml(c.Tanggal) + '</span>' +
            '<span style="min-width:0"><span>' + escHtml(c.Catatan) + '</span>' +
            '<span class="kp-sub"> — ' + escHtml(c.Petugas) + '</span></span></div>';
        }).join('') + '</div>'
      : '') +

    '<div class="kp-sub" style="margin-top:8px">Dicatat oleh ' + escHtml(p.Petugas) + '</div>' +
  '</div>';
}

/**
 * Pilihan siswa pada formulir pengaduan, disaring menurut kelas.
 * Dipisah agar dapat digambar ulang saat filter kelas diubah tanpa
 * menutup dan membuka kembali formulirnya.
 */
function opsiSiswaPengaduan(kelas, nisnTerpilih) {
  const semua = AppState.formPengaduan.siswaLingkup || [];
  const pilih = String(kelas || 'SEMUA');
  const hasil = pilih === 'SEMUA'
    ? semua
    : semua.filter(function (s) { return String(s.Kelas || '').trim() === pilih; });

  return hasil.map(function (s) {
    return '<option value="' + escHtml(s.NISN) + '"' +
      (String(nisnTerpilih || '') === String(s.NISN) ? ' selected' : '') + '>' +
      escHtml(s.Nama) + (pilih === 'SEMUA' ? ' — ' + escHtml(s.Kelas) : '') + '</option>';
  }).join('');
}

/** Keterangan kecil di bawah daftar siswa */
function ringkasSiswaPengaduan(kelas) {
  const semua = AppState.formPengaduan.siswaLingkup || [];
  const pilih = String(kelas || 'SEMUA');
  if (pilih === 'SEMUA') {
    return semua.length + ' siswa ditampilkan. Pilih kelas di atas untuk mempersempit daftar.';
  }
  const jml = semua.filter(function (s) { return String(s.Kelas || '').trim() === pilih; }).length;
  return jml + ' siswa kelas ' + escHtml(pilih) + '.';
}

/** Dipanggil saat filter kelas diubah — daftar siswa digambar ulang seketika */
function saringKelasPengaduan(kelas) {
  AppState.formPengaduan.kelas = kelas;
  const sel = document.getElementById('pgSiswa');
  if (!sel) return;

  // Pertahankan siswa yang sudah dipilih bila ia masih ada di kelas terpilih
  const sebelumnya = sel.value;
  sel.innerHTML = opsiSiswaPengaduan(kelas, sebelumnya) || '<option value="">Tidak ada siswa</option>';
  if (sel.value !== sebelumnya) sel.selectedIndex = 0;

  const ket = document.getElementById('pgJumlahSiswa');
  if (ket) ket.innerHTML = ringkasSiswaPengaduan(kelas);
}

/** Formulir pengaduan baru, atau mengubah yang sudah ada */
function bukaFormPengaduan(id) {
  const lama = id ? AppState.pengaduan.filter(function (p) { return String(p.ID) === String(id); })[0] : null;
  if (id && !lama) return;
  if (lama && !bolehKelolaPengaduan(lama)) {
    return toast('Tidak berwenang', 'Kasus ini dicatat oleh ' + lama.Petugas + '.', 'peringatan');
  }

  // Wali kelas MURNI — bukan Admin, bukan Guru BK. Untuk mereka, centang izin
  // tidak ditampilkan: mereka hanya dapat mencatat untuk siswa kelasnya sendiri,
  // jadi "wali kelas boleh melihat" sudah pasti benar — merekalah penulisnya.
  const waliMurni = !isAdmin() && !isGuruBK();

  // Wali kelas hanya boleh memilih siswa kelasnya sendiri
  let siswa = AppState.siswa.slice();
  if (waliMurni) {
    const kelas = String(AppState.profil.waliKelas || '').trim().toLowerCase();
    siswa = siswa.filter(function (s) { return String(s.Kelas || '').trim().toLowerCase() === kelas; });
  }
  siswa.sort(function (a, b) {
    return String(a.Kelas).localeCompare(String(b.Kelas)) || String(a.Nama).localeCompare(String(b.Nama));
  });

  // Daftar kelas yang boleh dipilih pengguna ini — dipakai untuk menyaring
  // daftar siswa agar tidak perlu menggulir ratusan nama.
  const daftarKelasPgd = [];
  siswa.forEach(function (s) {
    const k = String(s.Kelas || '').trim();
    if (k && daftarKelasPgd.indexOf(k) === -1) daftarKelasPgd.push(k);
  });
  daftarKelasPgd.sort();

  // Saat mengubah kasus lama, filter langsung diarahkan ke kelas siswanya
  // supaya namanya terlihat tanpa perlu dicari ulang.
  AppState.formPengaduan.kelas = lama ? String(lama.Kelas || '').trim() : 'SEMUA';
  AppState.formPengaduan.siswaLingkup = siswa;

  const opsiKelas = '<option value="SEMUA">Semua kelas (' + siswa.length + ' siswa)</option>' +
    daftarKelasPgd.map(function (k) {
      const jml = siswa.filter(function (s) { return String(s.Kelas).trim() === k; }).length;
      return '<option value="' + escHtml(k) + '"' +
        (AppState.formPengaduan.kelas === k ? ' selected' : '') + '>' +
        escHtml(k) + ' (' + jml + ' siswa)</option>';
    }).join('');

  const opsiSiswa = opsiSiswaPengaduan(AppState.formPengaduan.kelas, lama ? lama.NISN : '');

  const opsiKategori = KATEGORI_PENGADUAN.map(function (k) {
    return '<option value="' + escHtml(k) + '"' +
      (lama && lama.Kategori === k ? ' selected' : '') + '>' + escHtml(k) + '</option>';
  }).join('');

  bukaModalForm(lama ? 'Ubah Catatan Pengaduan' : 'Catatan Pengaduan & Konseling',
    '<div class="kotak-rahasia"><i class="bi bi-shield-lock"></i><div>' +
      'Catatan ini <b>tidak mengurangi poin</b> dan tidak muncul di Laporan Per Siswa. ' +
      'Siswa yang mengadu bukan pelanggar.</div></div>' +

    '<div class="row g-2 mb-2">' +
      '<div class="col-7"><label class="form-label" for="pgKelas">Pilih Kelas</label>' +
        '<select class="form-select" id="pgKelas" onchange="saringKelasPengaduan(this.value)"' +
          (daftarKelasPgd.length < 2 ? ' disabled' : '') + '>' + opsiKelas + '</select></div>' +
      '<div class="col-5"><label class="form-label" for="pgTanggal">Tanggal</label>' +
        '<input type="date" class="form-control" id="pgTanggal" value="' +
          escHtml(lama ? isoDariTanggal(lama.Tanggal) : tanggalHariIniISO()) + '"></div>' +
    '</div>' +

    '<div class="mb-3"><label class="form-label" for="pgSiswa">Siswa <span class="wajib">*</span></label>' +
      '<select class="form-select" id="pgSiswa" size="1">' +
      (siswa.length ? opsiSiswa : '<option value="">Tidak ada siswa</option>') + '</select>' +
      '<div class="form-text" id="pgJumlahSiswa">' + ringkasSiswaPengaduan(AppState.formPengaduan.kelas) + '</div></div>' +

    '<div class="mb-3"><label class="form-label" for="pgKategori">Kategori Masalah</label>' +
      '<select class="form-select" id="pgKategori">' + opsiKategori + '</select></div>' +

    '<div class="mb-3"><label class="form-label" for="pgTerlapor">Pihak yang Dilaporkan</label>' +
      '<input class="form-control" id="pgTerlapor" placeholder="Nama atau keterangan — boleh dikosongkan" value="' +
        escHtml(lama ? lama.Terlapor : '') + '">' +
      '<div class="form-text">Ditulis sebagai teks saja dan <b>tidak ditautkan</b> ke data siswa mana pun, ' +
        'karena aduan belum tentu terbukti. Bila setelah ditelusuri memang terbukti, ' +
        'catat pelanggarannya lewat <b>Input Poin</b> seperti biasa.</div></div>' +

    '<div class="mb-3"><label class="form-label" for="pgKronologi">Kronologi / Keluhan Siswa <span class="wajib">*</span></label>' +
      '<textarea class="form-control" id="pgKronologi" style="min-height:100px" ' +
        'placeholder="Ceritakan apa yang disampaikan siswa, kapan kejadiannya, dan siapa saja yang terlibat…">' +
        escHtml(lama ? lama.Kronologi : '') + '</textarea></div>' +

    '<div class="mb-3"><label class="form-label" for="pgPendampingan">Langkah Pendampingan</label>' +
      '<textarea class="form-control" id="pgPendampingan" style="min-height:80px" ' +
        'placeholder="Tindakan yang diambil: mediasi, pemanggilan pihak terkait, rujukan, kesepakatan…">' +
        escHtml(lama ? lama.Pendampingan : '') + '</textarea></div>' +

    (waliMurni
      // Anda wali kelasnya sendiri — pertanyaan izin tidak relevan
      ? '<div class="kotak-info"><i class="bi bi-person-check"></i><div>' +
          'Catatan ini dapat dibaca oleh <b>Anda</b> sebagai wali kelas, ' +
          '<b>Guru BK</b>, dan <b>Admin</b>. Wali kelas lain tidak dapat melihatnya.' +
        '</div></div>'
      : '<div class="form-check">' +
          '<input class="form-check-input" type="checkbox" id="pgIzin"' +
            (lama && String(lama.IzinWaliKelas).toLowerCase() === 'ya' ? ' checked' : '') + '>' +
          '<label class="form-check-label" for="pgIzin">' +
            '<b>Izinkan wali kelas siswa ini melihat catatan</b>' +
            '<div class="form-text">Bila dimatikan, hanya Guru BK dan Admin yang dapat membacanya. ' +
              'Pertimbangkan perasaan dan keselamatan siswa sebelum menyalakannya — ' +
              'terutama bila kasusnya menyangkut teman sekelas.</div>' +
          '</label>' +
        '</div>'),

    function (modal) {
      const nisn = document.getElementById('pgSiswa').value;
      const kronologi = document.getElementById('pgKronologi').value.trim();
      if (!nisn) return toast('Belum lengkap', 'Pilih siswa terlebih dahulu.', 'peringatan');
      if (!kronologi) return toast('Belum lengkap', 'Kronologi wajib diisi.', 'peringatan');

      const payload = {
        id: id || null,
        nisn: nisn,
        tanggal: formatTanggalDariInput(document.getElementById('pgTanggal').value),
        kategori: document.getElementById('pgKategori').value,
        terlapor: document.getElementById('pgTerlapor').value.trim(),
        kronologi: kronologi,
        pendampingan: document.getElementById('pgPendampingan').value.trim(),
        // Wali murni: centang tidak ditampilkan, izinnya memang selalu berlaku
        izinWaliKelas: waliMurni || document.getElementById('pgIzin').checked
      };
      modal.hide();
      tandaSinkron(true);
      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          if (id) {
            const i = AppState.pengaduan.findIndex(function (p) { return String(p.ID) === String(id); });
            if (i !== -1) AppState.pengaduan[i] = res.data;
          } else {
            AppState.pengaduan.unshift(res.data);
          }
          renderUlang();
          toast('Tersimpan', res.message, 'sukses');
        })
        .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
        .simpanPengaduan(AppState.token, payload);
    }, lama ? 'Perbarui' : 'Simpan Catatan');
}

/** Tambah satu catatan perkembangan pada kasus berjalan */
function bukaCatatanPengaduan(idPengaduan) {
  const p = AppState.pengaduan.filter(function (x) { return String(x.ID) === String(idPengaduan); })[0];
  if (!p) return;

  bukaModalForm('Catatan Perkembangan',
    '<div class="kotak-info mb-3"><i class="bi bi-person-vcard"></i><div><b>' +
      escHtml(p.NamaSiswa) + '</b> — ' + escHtml(p.Kelas) + '<br>' +
      '<span style="font-size:12px">' + escHtml(p.Kategori) + '</span></div></div>' +

    '<div class="mb-3"><label class="form-label" for="pgcTanggal">Tanggal</label>' +
      '<input type="date" class="form-control" id="pgcTanggal" value="' + tanggalHariIniISO() + '"></div>' +

    '<div class="mb-3"><label class="form-label" for="pgcCatatan">Perkembangan <span class="wajib">*</span></label>' +
      '<textarea class="form-control" id="pgcCatatan" style="min-height:100px" ' +
        'placeholder="Hasil pertemuan lanjutan, perubahan yang terlihat, kesepakatan baru…"></textarea>' +
      '<div class="form-text">Setiap catatan tersimpan tersendiri beserta tanggalnya, ' +
        'sehingga riwayat pendampingan terbaca runtut.</div></div>',

    function (modal) {
      const catatan = document.getElementById('pgcCatatan').value.trim();
      if (!catatan) return toast('Belum diisi', 'Catatan perkembangan wajib diisi.', 'peringatan');

      const payload = {
        idPengaduan: idPengaduan,
        tanggal: formatTanggalDariInput(document.getElementById('pgcTanggal').value),
        catatan: catatan
      };
      modal.hide();
      tandaSinkron(true);
      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          AppState.catatanPengaduan.push(res.data);
          renderUlang();
          toast('Tersimpan', res.message, 'sukses');
        })
        .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
        .tambahCatatanPengaduan(AppState.token, payload);
    }, 'Tambah Catatan');
}

function konfirmasiTuntasPengaduan(id) {
  const p = AppState.pengaduan.filter(function (x) { return String(x.ID) === String(id); })[0];
  if (!p) return;
  konfirmasi('Tutup Kasus Pendampingan',
    'Nyatakan pendampingan ' + p.NamaSiswa + ' sudah selesai? ' +
    'Catatannya tetap tersimpan, tetapi perkembangan baru tidak dapat ditambahkan lagi.',
    function () {
      tandaSinkron(true);
      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          const i = AppState.pengaduan.findIndex(function (x) { return String(x.ID) === String(id); });
          if (i !== -1) AppState.pengaduan[i].StatusKasus = 'Selesai';
          renderUlang();
          toast('Selesai', res.message, 'sukses');
        })
        .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
        .tuntaskanPengaduan(AppState.token, id);
    });
}

function konfirmasiHapusPengaduan(id) {
  const p = AppState.pengaduan.filter(function (x) { return String(x.ID) === String(id); })[0];
  if (!p) return;
  konfirmasi('Hapus Catatan Pengaduan',
    'Hapus seluruh catatan pendampingan ' + p.NamaSiswa + ' beserta perkembangannya?',
    function () {
      tandaSinkron(true);
      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          AppState.pengaduan = AppState.pengaduan.filter(function (x) { return String(x.ID) !== String(id); });
          AppState.catatanPengaduan = AppState.catatanPengaduan.filter(function (c) {
            return String(c.IDPengaduan) !== String(id);
          });
          renderUlang();
          toast('Terhapus', res.message, 'sukses');
        })
        .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
        .hapusPengaduan(AppState.token, id);
    });
}

/** Cetak laporan pendampingan — dokumen tersendiri, tidak ikut Laporan Per Siswa */
function cetakPendampingan(id, ev) {
  const pulih = tombolSibuk(ev && ev.currentTarget, '');
  tandaSinkron(true);
  google.script.run
    .withSuccessHandler(function (res) {
      pulih(); tandaSinkron(false);
      if (!res.success) return toast('Gagal', res.message, 'bahaya');
      pratinjau(res.data.urlPreview, res.data.nama, 'pdf');
      toast('Laporan siap', res.data.nama, 'sukses');
    })
    .withFailureHandler(function (err) { pulih(); tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
    .buatLaporanPendampinganPDF(AppState.token, { id: id });
}

function renderTindakLanjut() {
  // Dua jalur dalam satu halaman: pembinaan disiplin (berbasis poin) dan
  // pengaduan/konseling (siswa yang datang mengadu). Tab hanya muncul bila
  // pengguna ini memang berhak atas jalur pengaduan.
  const adaPengaduan = AppState.bolehPengaduan === true;
  if (!adaPengaduan) AppState.jalurTL = 'disiplin';
  const jalur = AppState.jalurTL === 'pengaduan' ? 'pengaduan' : 'disiplin';

  const berjalan = AppState.pengaduan.filter(function (p) {
    return String(p.StatusKasus).toLowerCase() !== 'selesai';
  }).length;

  const tab = adaPengaduan
    ? '<div class="tab-jalur">' +
        '<button class="' + (jalur === 'disiplin' ? 'aktif' : '') + '" onclick="gantiJalurTL(\'disiplin\')">' +
          '<i class="bi bi-clipboard2-pulse"></i> Pembinaan Disiplin</button>' +
        '<button class="' + (jalur === 'pengaduan' ? 'aktif' : '') + '" onclick="gantiJalurTL(\'pengaduan\')">' +
          '<i class="bi bi-chat-heart"></i> Pengaduan &amp; Konseling' +
          (berjalan ? ' <span class="lencana">' + berjalan + '</span>' : '') + '</button>' +
      '</div>'
    : '';

  if (jalur === 'pengaduan') {
    document.getElementById('section-tindakLanjut').innerHTML =
      '<div class="judul-seksi">' +
        '<div><h2>Pengaduan &amp; Konseling Siswa</h2>' +
          '<p>Untuk siswa yang <b>datang mengadu</b> atau meminta pendampingan — ' +
          'korban perundungan, masalah keluarga, kesulitan pertemanan. ' +
          '<b>Tidak mengurangi poin.</b></p></div>' +
        '<div class="aksi">' +
          (bolehCatatPengaduan()
            ? '<button class="btn btn-gold" onclick="bukaFormPengaduan()">' +
                '<i class="bi bi-chat-heart"></i> Catat Pengaduan</button>'
            : '') +
        '</div>' +
      '</div>' + tab + isiHalamanPengaduan();
    return;
  }

  const bolehAksi = bolehAksiTindakLanjut();
  const kasus = kasusPerluTindakLanjut();
  const sesi = sesiTindakLanjut();
  const belum = kasus.filter(function (k) { return k.perluSesiBaru; });
  const merah = kasus.filter(function (k) { return k.zona === 'Merah'; });

  const html =
  '<div class="judul-seksi">' +
    '<div><h2>Tindak Lanjut &amp; Pembinaan Siswa</h2></div>' +
    '<div class="aksi">' +
      // v2.15: tombol catatan manual dikembalikan, KHUSUS Guru BK & Admin.
      // Alasannya, pelanggaran yang perlu dibina tidak selalu berbobot −30 poin
      // dan tidak selalu membuat siswa keluar dari Zona Hijau.
      (bolehAksi
        ? '<button class="btn btn-gold" onclick="bukaFormTindakLanjut(null, null, true)">' +
            '<i class="bi bi-clipboard2-plus"></i> Catatan Manual</button>'
        : '<span class="lencana netral polos"><i class="bi bi-eye"></i> Mode baca saja — ' +
          'pengisian dilakukan Guru BK</span>') +
    '</div>' +
  '</div>' + tab +

  '<div class="grid-zona">' +
    kartuZona('zona-merah', 'bi-exclamation-octagon', 'Zona Merah', merah.length, kasus.length || 1, 'Perlu penanganan segera') +
    kartuZona('zona-gold', 'bi-hourglass-split', 'Belum Ditindaklanjuti', belum.length, kasus.length || 1, 'Menunggu catatan Guru BK') +
    kartuZona('zona-navy', 'bi-clipboard2-check', 'Sesi Pembinaan', sesi.length, sesi.length || 1, 'Total sesi tercatat') +
  '</div>' +

  '<div class="card mb-3">' +
    '<div class="card-header">' +
      '<div><h5>Daftar Siswa Perlu Tindak Lanjut</h5>' +
      '<p class="sub">' + kasus.length + ' siswa terdeteksi • diurutkan dari yang paling mendesak</p></div>' +
    '</div>' +
    '<div class="card-body p-0">' + tabelKasusTindakLanjut(kasus, bolehAksi) + '</div>' +
  '</div>' +

  '<div class="card">' +
    '<div class="card-header">' +
      '<div><h5>Riwayat Sesi Tindak Lanjut</h5>' +
      '<p class="sub">' + sesi.length + ' sesi tercatat • konseling kelompok tampil sebagai satu sesi</p></div>' +
    '</div>' +
    '<div class="card-body">' + daftarSesiTindakLanjut(sesi, bolehAksi) + '</div>' +
  '</div>';

  document.getElementById('section-tindakLanjut').innerHTML = html;
}

/**
 * Isi kolom TINDAK LANJUT pada daftar kasus.
 * Membedakan tiga keadaan: belum pernah dibina, sesi sedang berjalan, dan
 * sudah tuntas namun melanggar lagi — yang terakhir butuh sesi BARU.
 */
function kolomStatusTL(k) {
  if (!k.jumlahSesi) return '<span class="lencana kuning">Belum ada</span>';

  const tanggal = '<div class="sub mono" style="font-size:11px;color:var(--text-secondary);margin-top:3px">' +
    escHtml(k.tlTerakhir ? k.tlTerakhir.Tanggal : '') + '</div>';

  if (k.pelanggaranBaru) {
    return '<span class="lencana merah"><i class="bi bi-arrow-repeat"></i> Perlu sesi ke-' +
        (k.jumlahSesi + 1) + '</span>' +
      '<div class="sub" style="font-size:11px;color:var(--text-secondary);margin-top:3px">' +
        'Sesi ke-' + k.jumlahSesi + ' sudah tuntas</div>';
  }

  if (k.sesiBerjalan) {
    return '<span class="lencana hijau">Sesi ke-' + k.jumlahSesi + ' berjalan</span>' + tanggal;
  }

  return '<span class="lencana hijau">' + k.jumlahSesi + ' sesi</span>' + tanggal;
}

function tabelKasusTindakLanjut(kasus, bolehAksi) {
  if (!kasus.length) {
    return '<div class="kosong"><i class="bi bi-emoji-smile"></i><h6>Tidak ada siswa yang perlu ditindaklanjuti</h6>' +
      '<p class="mb-0">Semua siswa berada di Zona Hijau dan tanpa pelanggaran berat.</p></div>';
  }

  // Sembilan kolom membuat tabel ini melebihi lebar layar sehingga kolom AKSI
  // terpotong. Dua pasang kolom yang saling melengkapi digabung — Kelas menyatu
  // dengan identitas siswa, Poin menyatu dengan Zona — menyisakan tujuh kolom.
  // Kolom AKSI juga dipatok di tepi kanan agar tetap terlihat pada layar sempit.
  return '<div class="bungkus-tabel" style="border:0">' +
    '<table class="tabel tabel-tl"><thead><tr>' +
      '<th style="width:40px">NO</th>' +
      '<th>SISWA</th>' +
      '<th class="text-center" style="width:74px">POIN</th>' +
      '<th>PEMICU</th>' +
      '<th>TINDAKAN DISIPLINER</th>' +
      '<th style="width:132px">TINDAK LANJUT</th>' +
      (bolehAksi ? '<th class="sel-aksi text-center" style="width:52px">AKSI</th>' : '') +
    '</tr></thead><tbody>' +
    kasus.map(function (k, i) {
      const s = k.siswa;
      return '<tr class="' + (k.zona === 'Merah' ? 'baris-merah' : '') + '">' +
        '<td class="mono">' + String(i + 1).padStart(2, '0') + '</td>' +

        // Nama, kelas, dan NISN dalam satu sel
        '<td><div class="sel-nama"><div class="avatar-mini">' + inisial(s.Nama) + '</div>' +
          '<div style="min-width:0">' +
            '<div style="font-weight:600">' + escHtml(s.Nama) + '</div>' +
            '<div class="sub"><b>' + escHtml(s.Kelas) + '</b> &bull; ' +
              '<span class="mono">' + escHtml(s.NISN) + '</span></div>' +
          '</div></div></td>' +

        // Poin dan lencana zona bertumpuk — warnanya tetap jadi penanda cepat
        '<td class="text-center">' +
          '<div class="mono" style="font-weight:700;font-size:15px;line-height:1.1">' +
            escHtml(s.PoinSaatIni) + '</div>' +
          '<span class="lencana ' + kelasZona(k.zona) + '" ' +
            'style="font-size:10px;padding:1px 7px;margin-top:3px">' + k.zona + '</span>' +
        '</td>' +

        '<td class="kolom-rincian">' +
          // Teks menjorok ke dalam: baris sambungan sejajar di bawah tulisan,
          // bukan di bawah tanda "–", sehingga tiap butir mudah dibedakan.
          k.pemicu.map(function (t) {
            return '<span style="display:block;padding-left:11px;text-indent:-11px">' +
              '&ndash; ' + escHtml(t) + '</span>';
          }).join('') + '</td>' +

        '<td class="kolom-rincian">' +
          (k.tindakanTercatat.length
            ? k.tindakanTercatat.slice(0, 2).map(function (t) { return escHtml(potong(t, 46)); }).join('<br>') +
              (k.tindakanTercatat.length > 2 ? '<br><span class="text-secondary-2">+' + (k.tindakanTercatat.length - 2) + ' lainnya</span>' : '')
            : '<span class="text-secondary-2">—</span>') + '</td>' +

        '<td>' + kolomStatusTL(k) + '</td>' +
        (bolehAksi
          ? '<td class="sel-aksi text-center">' + (k.perluSesiBaru
              ? '<button class="btn ' + (k.pelanggaranBaru ? 'btn-gold' : 'btn-hantu') + ' btn-mini" ' +
                  'title="Buat catatan tindak lanjut ke-' + (k.jumlahSesi + 1) + ' untuk siswa ini" ' +
                  'onclick="bukaFormTindakLanjut(null,\'' + escHtml(s.NISN) + '\')">' +
                  '<i class="bi bi-clipboard2-plus"></i></button>'
              : '<span class="text-secondary-2" title="Sesi masih berjalan — ubah atau evaluasi lewat Riwayat Sesi Tindak Lanjut di bawah">' +
                  '<i class="bi bi-lock"></i></span>') + '</td>'
          : '') +
      '</tr>';
    }).join('') + '</tbody></table></div>';
}

function daftarSesiTindakLanjut(sesi, bolehAksi) {
  if (!sesi.length) {
    return '<div class="kosong"><i class="bi bi-clipboard2"></i><h6>Belum ada sesi tindak lanjut</h6>' +
      '<p class="mb-0">Catatan pembinaan Guru BK akan muncul di sini.</p></div>';
  }

  return '<div class="linimasa">' + sesi.map(function (g) {
    const selesai = String(g.statusTL).toLowerCase() === 'selesai';
    return '<div class="item-linimasa ' + (selesai ? 'plus' : 'minus') + '">' +
      '<div class="tanda"><i class="bi bi-' + (selesai ? 'check2-circle' : 'hourglass-split') + '"></i></div>' +
      '<div class="isi">' +
        '<div class="kepala">' +
          '<span class="lencana info">' + escHtml(g.jenis) + '</span>' +
          '<span class="lencana ' + (selesai ? 'hijau' : 'kuning') + '">' + escHtml(g.statusTL || 'Proses') + '</span>' +
          '<span class="meta"><i class="bi bi-calendar3"></i> ' + escHtml(g.tanggal) + '</span>' +
        '</div>' +

        '<div class="d-flex flex-wrap gap-1 mb-2">' +
          g.siswa.map(function (x) {
            return '<span class="chip-siswa" style="padding:4px 10px">' +
              '<span class="kelas">' + escHtml(x.kelas) + '</span>' +
              '<span class="nama-chip">' + escHtml(x.nama) + '</span></span>';
          }).join('') +
        '</div>' +

        // Sesi manual diberi ikon tangan, bukan segitiga peringatan — pemicunya
        // memang bukan pelanggaran yang terdeteksi sistem (v2.15)
        (g.pemicu
          ? '<div class="meta mb-1"><i class="bi ' +
            (String(g.pemicu) === PEMICU_MANUAL ? 'bi-hand-index' : 'bi-exclamation-triangle') +
            '"></i> ' + escHtml(g.pemicu) + '</div>'
          : '') +

        '<div class="kotak-hukuman" style="border-left-color:var(--navy)">' +
          '<b>Catatan Tindak Lanjut:</b> ' + escHtml(g.catatan) + '</div>' +
        ringkasEvaluasiHtml(g) +

        '<div class="meta mt-2"><i class="bi bi-person-badge"></i> Petugas: ' + escHtml(g.petugas) + '</div>' +
      '</div>' +

      (bolehAksi
        ? '<div class="d-flex flex-column gap-2">' +
            '<button class="btn btn-hantu btn-mini" title="Ubah" onclick="bukaFormTindakLanjut(\'' + escHtml(g.idGrup) + '\')">' +
              '<i class="bi bi-pencil"></i></button>' +
            (selesai ? ''
              : '<button class="btn btn-hantu btn-mini" title="Isi catatan evaluasi" ' +
                  'onclick="bukaFormEvaluasi(\'' + escHtml(g.idGrup) + '\')">' +
                  '<i class="bi bi-journal-check"></i></button>') +
            '<button class="btn btn-hantu btn-mini" title="Cetak surat" onclick="bukaFormSurat(\'' + escHtml(g.idGrup) + '\')">' +
              '<i class="bi bi-printer"></i></button>' +
            '<button class="btn btn-hantu btn-mini" title="Hapus" onclick="konfirmasiHapusTindakLanjut(\'' + escHtml(g.idGrup) + '\')">' +
              '<i class="bi bi-trash"></i></button>' +
          '</div>'
        : '') +
    '</div>';
  }).join('') + '</div>';
}

// ── Formulir catatan tindak lanjut ───────────────────────────────────

const JENIS_TINDAKAN_TL = ['Konseling Pribadi', 'Konseling Kelompok', 'Pemanggilan Orang Tua',
                           'Pembinaan Wali Kelas', 'Home Visit', 'Lainnya'];

/** @param {string} idGrup Diisi bila mengubah sesi yang sudah ada */
/**
 * @param {string}  idGrup   Sesi yang diubah; kosong untuk sesi baru.
 * @param {string}  nisnAwal Siswa dari baris daftar kasus.
 * @param {boolean} manual   Dibuka lewat tombol "Catatan Manual" (Guru BK & Admin) —
 *                           pemilih siswa dibuka penuh, termasuk siswa Zona Hijau.
 */
function bukaFormTindakLanjut(idGrup, nisnAwal, manual) {
  const lama = idGrup ? sesiTindakLanjut().filter(function (g) { return g.idGrup === idGrup; })[0] : null;

  // Hanya Guru BK & Admin yang boleh membuka mode manual — diperiksa ulang di sini
  // agar tidak bergantung pada tombol mana yang kebetulan ditekan.
  const modeManual = manual === true && bolehAksiTindakLanjut();

  AppState.formTL = {
    idGrup: idGrup || null,
    nisnUtama: nisnAwal ? String(nisnAwal) : (lama && lama.siswa.length ? lama.siswa[0].nisn : ''),
    nisnTerpilih: lama ? lama.siswa.map(function (x) { return x.nisn; }) : (nisnAwal ? [String(nisnAwal)] : []),
    cari: '',
    manual: modeManual,
    kelas: 'SEMUA'
  };

  const opsiJenis = JENIS_TINDAKAN_TL.map(function (j) {
    return '<option value="' + escHtml(j) + '"' +
      (lama && lama.jenis === j ? ' selected' : '') + '>' + escHtml(j) + '</option>';
  }).join('');

  bukaModalForm(idGrup ? 'Ubah Catatan Tindak Lanjut'
                       : (modeManual ? 'Catatan Tindak Lanjut Manual' : 'Catatan Tindak Lanjut Baru'),
    (modeManual
      ? '<div class="kotak-info mb-3"><i class="bi bi-hand-index"></i><div>' +
          'Catatan manual untuk siswa yang <b>tidak muncul otomatis</b> di daftar kasus — ' +
          'misalnya pelanggaran yang perlu dibina namun poinnya belum mencapai &minus;' +
          AMBANG_SARAN_TINDAKAN + '. Poin siswa <b>tidak berubah</b> oleh catatan ini.' +
        '</div></div>'
      : '') +
    '<div class="mb-3">' +
      '<label class="form-label" for="tlTanggal">Tanggal Tindak Lanjut <span class="wajib">*</span></label>' +
      '<input type="date" class="form-control" id="tlTanggal" value="' +
        (lama ? isoDariTanggal(lama.tanggal) : tanggalHariIniISO()) + '">' +
      '<div class="form-text">Tanggal ini juga dipakai sebagai <b>tanggal surat</b> saat mencetak ' +
        'surat pernyataan atau surat peringatan.</div>' +
    '</div>' +

    '<div class="mb-3">' +
      '<label class="form-label" for="tlJenis">Jenis Tindakan <span class="wajib">*</span></label>' +
      '<select class="form-select" id="tlJenis" onchange="gantiJenisTL(this.value)">' + opsiJenis + '</select>' +
    '</div>' +

    '<div class="mb-3" id="tlBlokSiswa"></div>' +

    '<div class="mb-3">' +
      '<label class="form-label" for="tlCatatan">Catatan Tindak Lanjut <span class="wajib">*</span></label>' +
      '<textarea class="form-control" id="tlCatatan" style="min-height:90px" ' +
        'placeholder="Uraian pembinaan yang dilakukan, kesepakatan dengan siswa, atau hasil pertemuan dengan orang tua…">' +
        escHtml(lama ? lama.catatan : '') + '</textarea>' +
    '</div>' +

    '<div class="mb-3">' +
      '<label class="form-label" for="tlStatus">Status</label>' +
      '<select class="form-select" id="tlStatus">' +
        '<option value="Proses"' + (lama && lama.statusTL === 'Proses' ? ' selected' : '') + '>Proses — masih dipantau</option>' +
        '<option value="Selesai"' + (lama && lama.statusTL === 'Selesai' ? ' selected' : '') + '>Selesai — pembinaan tuntas</option>' +
      '</select>' +
      '<div class="form-text">Berstatus <b>Selesai</b>, siswa otomatis hilang dari daftar kasus di atas ' +
        '(riwayat sesinya tetap tersimpan). Ia muncul kembali bila melakukan pelanggaran baru. ' +
        'Catatan <b>Evaluasi</b> diisi lewat tombol tersendiri pada riwayat sesi.</div>' +
    '</div>',

    function (modal) {
      const F = AppState.formTL;
      if (!F.nisnTerpilih.length) return toast('Belum lengkap', 'Pilih minimal satu siswa.', 'peringatan');

      const tanggal = document.getElementById('tlTanggal').value;
      const catatan = document.getElementById('tlCatatan').value.trim();
      if (!tanggal)  return toast('Belum lengkap', 'Tentukan tanggal tindak lanjut.', 'peringatan');
      if (!catatan)  return toast('Belum lengkap', 'Catatan tindak lanjut wajib diisi.', 'peringatan');

      // Ringkas pemicu dari data kasus, agar tercatat bersama sesinya
      const semuaKasus = kasusPerluTindakLanjut();
      // Bila tak satu pun siswa terpilih terdeteksi otomatis, sesi ini dicatat
      // sebagai manual — bukan dibiarkan kosong, agar riwayatnya tetap terbaca
      // dan sesi manual dapat dibedakan dari sesi otomatis di kemudian hari.
      const pemicu = F.nisnTerpilih.map(function (n) {
        const k = semuaKasus.filter(function (x) { return String(x.siswa.NISN) === n; })[0];
        return k ? k.pemicu.join('; ') : '';
      }).filter(Boolean)[0] || PEMICU_MANUAL;

      const payload = {
        idGrup: F.idGrup,
        tanggal: formatTanggalDariInput(tanggal),
        daftarNisn: F.nisnTerpilih.slice(),
        jenisTindakan: document.getElementById('tlJenis').value,
        pemicu: pemicu,
        catatan: catatan,
        // Evaluasi tidak ada di formulir ini — nilai lamanya dibawa apa adanya
        // agar tidak terhapus saat sesi diubah. Pengisiannya lewat tombol Evaluasi.
        evaluasi: lama ? (lama.evaluasiLama || '') : '',
        statusTL: document.getElementById('tlStatus').value
      };

      const btn = document.getElementById('tombolSimpanModal');
      const asli = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-inline"></span> Menyimpan…';
      btn.disabled = true;

      google.script.run
        .withSuccessHandler(function (res) {
          btn.innerHTML = asli; btn.disabled = false;
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          modal.hide();
          segarkanData();
          toast('Berhasil', res.message, 'sukses');
        })
        .withFailureHandler(function (err) {
          btn.innerHTML = asli; btn.disabled = false;
          toast('Error', err.message, 'bahaya');
        })
        .simpanTindakLanjut(AppState.token, payload);
    });

  renderBlokSiswaTL();
}

/** Apakah jenis tindakan yang sedang dipilih membolehkan lebih dari satu siswa */
function jenisTLKelompok() {
  const el = document.getElementById('tlJenis');
  return !!el && el.value === 'Konseling Kelompok';
}

/**
 * Pemilih banyak siswa hanya muncul pada Konseling Kelompok.
 * Untuk jenis lain, siswa terkunci pada kasus yang sedang ditindaklanjuti.
 */
function gantiJenisTL(nilai) {
  const F = AppState.formTL;
  if (nilai !== 'Konseling Kelompok' && F.nisnTerpilih.length > 1) {
    const utama = (F.nisnUtama && F.nisnTerpilih.indexOf(F.nisnUtama) !== -1)
      ? F.nisnUtama : F.nisnTerpilih[0];
    F.nisnTerpilih = [utama];
  }
  renderBlokSiswaTL();
}

/** Menggambar ulang bagian "Siswa yang Ditindaklanjuti" sesuai jenis tindakan */
/**
 * Siswa yang boleh dipilih pada formulir tindak lanjut saat ini.
 *
 * Pencarian dibuka penuh pada dua keadaan (v2.15):
 *   • Konseling Kelompok — teman sebaya yang terlibat sering belum pernah melanggar;
 *   • Catatan Manual     — Guru BK & Admin memang sengaja membina siswa di luar deteksi.
 * Di luar itu, hanya siswa yang muncul otomatis di daftar kasus.
 * Lingkup wali kelas selalu dihormati pada keadaan mana pun.
 */
function siswaLingkupTL() {
  const bebasPilih = jenisTLKelompok() || AppState.formTL.manual === true;
  let nisnTerdeteksi = null;
  if (!bebasPilih) {
    nisnTerdeteksi = {};
    kasusPerluTindakLanjut().forEach(function (k) { nisnTerdeteksi[String(k.siswa.NISN)] = true; });
  }
  return AppState.siswa.filter(function (s) {
    if (nisnTerdeteksi && !nisnTerdeteksi[String(s.NISN)]) return false;
    return !lingkupSatuKelas() || String(s.Kelas) === String(AppState.profil.waliKelas);
  });
}

/** Keterangan kecil di bawah pemilih siswa */
function ringkasSiswaTL() {
  const semua = siswaLingkupTL();
  const pilih = String(AppState.formTL.kelas || 'SEMUA');
  if (pilih === 'SEMUA') {
    return semua.length + ' siswa dapat dipilih. Pilih kelas untuk mempersempit daftar.';
  }
  const jml = semua.filter(function (s) { return String(s.Kelas || '').trim() === pilih; }).length;
  return jml + ' siswa kelas ' + escHtml(pilih) + '.';
}

/** Dipanggil saat filter kelas diubah — hasil pencarian digambar ulang seketika */
function saringKelasTL(kelas) {
  AppState.formTL.kelas = kelas;
  const ket = document.getElementById('tlJumlahSiswa');
  if (ket) ket.innerHTML = ringkasSiswaTL();
  const cari = document.getElementById('tlCari');
  cariSiswaTL(cari ? cari.value : '');
}

function renderBlokSiswaTL() {
  const wadah = document.getElementById('tlBlokSiswa');
  if (!wadah) return;

  const kelompok = jenisTLKelompok();
  // Sejak v2.12 pemilih praktis hanya muncul pada Konseling Kelompok, karena
  // setiap catatan selalu dimulai dari satu siswa pada daftar kasus.
  const bolehCari = kelompok || !AppState.formTL.nisnTerpilih.length;

  wadah.innerHTML =
    '<label class="form-label">Siswa yang Ditindaklanjuti <span class="wajib">*</span></label>' +
    (bolehCari
      ? (function () {
          // Daftar kelas disusun dari siswa yang memang boleh dipilih saat ini,
          // sehingga tidak pernah menawarkan kelas yang isinya kosong.
          const semua = siswaLingkupTL();
          const kelasAda = [];
          semua.forEach(function (s) {
            const k = String(s.Kelas || '').trim();
            if (k && kelasAda.indexOf(k) === -1) kelasAda.push(k);
          });
          kelasAda.sort();
          if (kelasAda.indexOf(String(AppState.formTL.kelas || '')) === -1) {
            AppState.formTL.kelas = 'SEMUA';
          }
          const opsi = '<option value="SEMUA">Semua kelas (' + semua.length + ' siswa)</option>' +
            kelasAda.map(function (k) {
              const jml = semua.filter(function (s) { return String(s.Kelas).trim() === k; }).length;
              return '<option value="' + escHtml(k) + '"' +
                (String(AppState.formTL.kelas) === k ? ' selected' : '') + '>' +
                escHtml(k) + ' (' + jml + ' siswa)</option>';
            }).join('');

          return '<select class="form-select mb-2" id="tlKelas" aria-label="Pilih Kelas" ' +
              'onchange="saringKelasTL(this.value)"' +
              (kelasAda.length < 2 ? ' disabled' : '') + '>' + opsi + '</select>' +
            '<div class="kotak-cari mb-2"><i class="bi bi-search"></i>' +
              '<input class="form-control" id="tlCari" placeholder="Cari nama atau NISN…" ' +
                'oninput="cariSiswaTL(this.value)"></div>' +
            '<div class="form-text mb-2" id="tlJumlahSiswa">' + ringkasSiswaTL() + '</div>' +
            '<div id="tlHasilCari"></div>';
        })()
      : '') +
    '<div id="tlTerpilih"></div>' +
    '<div class="form-text">' +
      (kelompok
        ? 'Konseling kelompok: pilih beberapa siswa sekaligus — catatan dan evaluasi berlaku untuk semuanya.'
        : 'Terisi otomatis dari kasus yang sedang ditindaklanjuti dan tidak dapat ditambah. ' +
          'Untuk membina beberapa siswa sekaligus, pilih jenis tindakan <b>Konseling Kelompok</b>.') +
    '</div>';

  renderTerpilihTL();
  if (bolehCari) cariSiswaTL('');
}

/** yyyy-mm-dd dari dd/mm/yyyy, untuk mengisi input type=date */
function isoDariTanggal(teks) {
  const m = String(teks || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? (m[3] + '-' + m[2] + '-' + m[1]) : tanggalHariIniISO();
}

function cariSiswaTL(kata) {
  const wadah = document.getElementById('tlHasilCari');
  if (!wadah) return;
  const F = AppState.formTL;
  F.cari = kata;

  const q = String(kata || '').trim().toLowerCase();

  // Lingkup dihitung di satu tempat (siswaLingkupTL), lalu disaring kelasnya
  const pilihKelas = String(AppState.formTL.kelas || 'SEMUA');
  const lingkup = siswaLingkupTL().filter(function (s) {
    return pilihKelas === 'SEMUA' || String(s.Kelas || '').trim() === pilihKelas;
  });

  let hasil = lingkup.filter(function (s) {
    if (F.nisnTerpilih.indexOf(String(s.NISN)) !== -1) return false;
    if (!q) return true;
    return String(s.Nama).toLowerCase().indexOf(q) !== -1 || String(s.NISN).indexOf(q) !== -1;
  });
  hasil = urutSiswa(hasil);

  if (!hasil.length) {
    wadah.innerHTML = '<div class="hasil-cari" style="position:static;max-height:none">' +
      '<div class="kosong-hasil">Tidak ada siswa yang cocok</div></div>';
    return;
  }

  wadah.innerHTML = '<div class="hasil-cari" style="position:static;max-height:190px">' +
    hasil.slice(0, 30).map(function (s) {
      const z = zonaDari(s.PoinSaatIni);
      return '<button type="button" onclick="tambahSiswaTL(\'' + escHtml(s.NISN) + '\')">' +
        '<span class="avatar-mini">' + inisial(s.Nama) + '</span>' +
        '<span style="min-width:0"><span class="nm d-block">' + escHtml(s.Nama) + '</span>' +
        '<span class="sb">' + escHtml(s.Kelas) + ' • ' + escHtml(s.NISN) + '</span></span>' +
        '<span class="kanan"><span class="mono d-block" style="font-weight:700">' + escHtml(s.PoinSaatIni) + '</span>' +
        '<span class="lencana ' + kelasZona(z) + '" style="font-size:10px;padding:1px 7px">' + z + '</span></span>' +
      '</button>';
    }).join('') + '</div>';
}

function tambahSiswaTL(nisn) {
  const F = AppState.formTL;

  if (!jenisTLKelompok()) {
    // Selain konseling kelompok hanya satu siswa — pilihan baru menggantikan yang lama
    F.nisnTerpilih = [String(nisn)];
    F.nisnUtama = String(nisn);
    renderBlokSiswaTL();
    return;
  }

  if (F.nisnTerpilih.indexOf(String(nisn)) === -1) F.nisnTerpilih.push(String(nisn));
  const inp = document.getElementById('tlCari');
  if (inp) { inp.value = ''; inp.focus(); }
  cariSiswaTL('');
  renderTerpilihTL();
}

function hapusSiswaTL(nisn) {
  const F = AppState.formTL;
  F.nisnTerpilih = F.nisnTerpilih.filter(function (x) { return x !== String(nisn); });
  renderBlokSiswaTL();
}

function renderTerpilihTL() {
  const wadah = document.getElementById('tlTerpilih');
  if (!wadah) return;
  const F = AppState.formTL;
  const kelompok = jenisTLKelompok();

  if (!F.nisnTerpilih.length) {
    wadah.innerHTML = '<div class="kotak-info mt-2"><i class="bi bi-info-circle"></i><div>' +
      'Belum ada siswa dipilih. Klik nama pada daftar di atas.</div></div>';
    return;
  }

  const terpilih = urutSiswa(F.nisnTerpilih.map(function (n) {
    return AppState.siswa.filter(function (s) { return String(s.NISN) === n; })[0];
  }).filter(Boolean));

  wadah.innerHTML = '<div class="wadah-chip mt-2">' +
    '<div class="baris-chip-kepala">' +
      (kelompok
        ? '<span><i class="bi bi-check2-circle"></i> Terpilih <span class="jml">' + terpilih.length + '</span> siswa</span>'
        : '<span><i class="bi bi-lock-fill"></i> Siswa yang sedang ditindaklanjuti</span>') +
    '</div>' +
    terpilih.map(function (s) {
      return '<span class="chip-siswa">' +
        '<span class="kelas">' + escHtml(s.Kelas) + '</span>' +
        '<span class="nama-chip">' + escHtml(s.Nama) + '</span>' +
        (kelompok
          ? '<button type="button" onclick="hapusSiswaTL(\'' + escHtml(s.NISN) + '\')"><i class="bi bi-x-lg"></i></button>'
          : '') +
      '</span>';
    }).join('') + '</div>';
}

/** Ringkasan evaluasi pada kartu sesi — seluruhnya, bernomor menurut tanggal */
function ringkasEvaluasiHtml(g) {
  const daftar = g.evaluasi || [];
  const lama = String(g.evaluasiLama || '').trim();
  if (!daftar.length && !lama) return '';

  return '<div class="kotak-hukuman" style="border-left-color:var(--hijau-line)">' +
    '<b>Evaluasi (' + (daftar.length + (lama ? 1 : 0)) + '):</b>' +
    (lama ? '<div style="margin-top:3px">&bull; ' + escHtml(g.evaluasiLama) + '</div>' : '') +
    daftar.map(function (e, i) {
      return '<div style="margin-top:3px">' +
        '<b>' + (i + 1) + '.</b> <span class="mono" style="font-size:11.5px">' + escHtml(e.Tanggal) + '</span> — ' +
        escHtml(e.Catatan) + '</div>';
    }).join('') +
  '</div>';
}

/** Evaluasi berkala milik satu sesi, urut dari yang paling lama */
function evaluasiSesi(idGrup) {
  return AppState.evaluasi
    .filter(function (e) { return String(e.IDGrup) === String(idGrup); })
    .sort(function (a, b) { return uraiTanggal(a.Tanggal) - uraiTanggal(b.Tanggal); });
}

/**
 * Formulir evaluasi berkala.
 * Satu sesi boleh dievaluasi berkali-kali — tiap evaluasi tersimpan
 * tersendiri, tidak menimpa yang sebelumnya. Dari sini pula pembinaan
 * dinyatakan tuntas; sesudah itu evaluasi tidak dapat ditambah lagi.
 */
function bukaFormEvaluasi(idGrup) {
  const g = sesiTindakLanjut().filter(function (x) { return x.idGrup === idGrup; })[0];
  if (!g) return toast('Tidak ditemukan', 'Sesi tindak lanjut ini sudah tidak ada.', 'peringatan');
  if (String(g.statusTL).toLowerCase() === 'selesai') {
    return toast('Sudah tuntas', 'Pembinaan sesi ini sudah dinyatakan tuntas — evaluasi tidak dapat ditambah lagi.', 'peringatan');
  }

  AppState.formEvaluasi = { idGrup: idGrup };

  bukaModalForm('Evaluasi Pembinaan',
    '<div class="kotak-info mb-3"><i class="bi bi-journal-check"></i><div>' +
      '<b>' + escHtml(g.jenis) + '</b> &bull; ' + escHtml(g.tanggal) + ' &bull; ' +
      g.siswa.length + ' siswa<br>' +
      g.siswa.map(function (x) { return escHtml(x.nama) + ' (' + escHtml(x.kelas) + ')'; }).join(', ') +
    '</div></div>' +

    '<div class="kotak-hukuman mb-3" style="border-left-color:var(--navy)">' +
      '<b>Catatan Tindak Lanjut:</b> ' + escHtml(g.catatan) + '</div>' +

    '<div class="label-kecil mb-2">Riwayat Evaluasi</div>' +
    '<div id="evDaftar" class="mb-3"></div>' +

    '<div class="mb-3">' +
      '<label class="form-label" for="evCatatan">Tambah Evaluasi <span class="wajib">*</span></label>' +
      '<textarea class="form-control" id="evCatatan" style="min-height:96px" ' +
        'placeholder="Perkembangan siswa sejak pembinaan terakhir, hasil pemantauan, atau rencana berikutnya…"></textarea>' +
      '<div class="form-text">Setiap evaluasi tersimpan tersendiri beserta tanggalnya, ' +
        'sehingga perkembangan siswa terbaca berurutan. Seluruhnya ikut tercetak pada ' +
        '<b>Laporan Rincian Per Siswa</b>.</div>' +
    '</div>' +

    '<div class="pemisah"></div>' +
    '<button type="button" class="btn btn-hantu w-100" onclick="konfirmasiTuntaskan(\'' + escHtml(idGrup) + '\')">' +
      '<i class="bi bi-check2-circle"></i> Selesai — Pembinaan Tuntas</button>' +
    '<div class="form-text mt-1">Setelah tuntas, siswa keluar dari daftar Tindak Lanjut dan ' +
      'evaluasi tidak dapat ditambah lagi. Seluruh riwayatnya tetap tersimpan.</div>',

    function (modal) { simpanEvaluasiBaru(modal, idGrup); }, 'Tambah Evaluasi');

  renderDaftarEvaluasi(idGrup);
}

/** Daftar evaluasi yang sudah tercatat di dalam formulir */
function renderDaftarEvaluasi(idGrup) {
  const wadah = document.getElementById('evDaftar');
  if (!wadah) return;

  const g = sesiTindakLanjut().filter(function (x) { return x.idGrup === idGrup; })[0];
  const daftar = evaluasiSesi(idGrup);
  const lama = g && String(g.evaluasiLama || '').trim();

  if (!daftar.length && !lama) {
    wadah.innerHTML = '<div class="kotak-info"><i class="bi bi-info-circle"></i><div>' +
      'Belum ada evaluasi. Tulis evaluasi pertama pada kolom di bawah.</div></div>';
    return;
  }

  wadah.innerHTML = '<div class="linimasa">' +
    // Catatan dari versi lama (sebelum evaluasi berulang ada) tetap ditampilkan
    (lama
      ? '<div class="item-linimasa plus"><div class="tanda"><i class="bi bi-clock-history"></i></div>' +
          '<div class="isi"><div class="kepala">' +
            '<span class="lencana netral">Catatan evaluasi awal</span></div>' +
            '<div style="font-size:13px">' + escHtml(g.evaluasiLama) + '</div></div></div>'
      : '') +
    daftar.map(function (e, i) {
      return '<div class="item-linimasa plus">' +
        '<div class="tanda"><i class="bi bi-journal-check"></i></div>' +
        '<div class="isi">' +
          '<div class="kepala">' +
            '<span class="lencana info">Evaluasi ke-' + (i + 1) + '</span>' +
            '<span class="meta"><i class="bi bi-calendar3"></i> ' + escHtml(e.Tanggal) + '</span>' +
            (e.Petugas ? '<span class="meta"><i class="bi bi-person-badge"></i> ' + escHtml(e.Petugas) + '</span>' : '') +
          '</div>' +
          '<div style="font-size:13px">' + escHtml(e.Catatan) + '</div>' +
        '</div>' +
        '<div><button class="btn btn-hantu btn-mini" title="Hapus evaluasi ini" ' +
          'onclick="konfirmasiHapusEvaluasi(\'' + escHtml(e.ID) + '\',\'' + escHtml(idGrup) + '\')">' +
          '<i class="bi bi-trash"></i></button></div>' +
      '</div>';
    }).join('') + '</div>';
}

function simpanEvaluasiBaru(modal, idGrup) {
  const inp = document.getElementById('evCatatan');
  const catatan = inp ? inp.value.trim() : '';
  if (!catatan) return toast('Belum lengkap', 'Tulis catatan evaluasinya lebih dahulu.', 'peringatan');

  const btn = document.getElementById('tombolSimpanModal');
  const asli = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-inline"></span> Menyimpan…';
  btn.disabled = true;

  google.script.run
    .withSuccessHandler(function (res) {
      btn.innerHTML = asli; btn.disabled = false;
      if (!res.success) return toast('Gagal', res.message, 'bahaya');

      // Tampilan diperbarui seketika, formulir tetap terbuka untuk evaluasi berikutnya
      AppState.evaluasi.push(res.data);
      inp.value = '';
      renderDaftarEvaluasi(idGrup);
      renderUlang();
      toast('Berhasil', res.message, 'sukses');
    })
    .withFailureHandler(function (err) {
      btn.innerHTML = asli; btn.disabled = false;
      toast('Error', err.message, 'bahaya');
    })
    .tambahEvaluasi(AppState.token, { idGrup: idGrup, catatan: catatan });
}

function konfirmasiHapusEvaluasi(id, idGrup) {
  konfirmasi('Hapus Catatan Evaluasi', 'Hapus satu catatan evaluasi ini?', function () {
    tandaSinkron(true);
    google.script.run
      .withSuccessHandler(function (res) {
        tandaSinkron(false);
        if (!res.success) return toast('Gagal', res.message, 'bahaya');
        AppState.evaluasi = AppState.evaluasi.filter(function (e) { return String(e.ID) !== String(id); });
        renderDaftarEvaluasi(idGrup);
        renderUlang();
        toast('Berhasil', res.message, 'sukses');
      })
      .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
      .hapusEvaluasi(AppState.token, id);
  }, 'Ya, Hapus');
}

function konfirmasiTuntaskan(idGrup) {
  const g = sesiTindakLanjut().filter(function (x) { return x.idGrup === idGrup; })[0];
  if (!g) return;

  konfirmasi('Nyatakan Pembinaan Tuntas',
    'Tuntaskan pembinaan ' + g.jenis + ' tanggal ' + g.tanggal + ' untuk ' +
    g.siswa.map(function (x) { return x.nama; }).join(', ') + '? ' +
    'Siswa akan keluar dari daftar Tindak Lanjut dan evaluasi tidak dapat ditambah lagi. ' +
    'Seluruh riwayat dan evaluasinya tetap tersimpan serta tetap tercetak pada laporan per siswa.',
    function () {
      tandaSinkron(true);
      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) return toast('Gagal', res.message, 'bahaya');

          // Cuplikan poin ikut disalin ke data lokal. Tanpa ini, tampilan masih
          // menganggap sesi tersebut tanpa cuplikan sampai data disegarkan —
          // sehingga pelanggaran baru pada HARI YANG SAMA tidak terdeteksi dan
          // siswa gagal muncul kembali di daftar kasus.
          const cuplikan = (res.data && res.data.poinSaatTuntas) || {};
          AppState.tindakLanjut.forEach(function (t) {
            if (String(t.IDGrup) !== String(idGrup)) return;
            t.StatusTL = 'Selesai';
            if (cuplikan[String(t.NISN)] !== undefined) {
              t.PoinSaatTuntas = cuplikan[String(t.NISN)];
            } else {
              const sw = AppState.siswa.filter(function (x) {
                return String(x.NISN) === String(t.NISN);
              })[0];
              if (sw) t.PoinSaatTuntas = Number(sw.PoinSaatIni);
            }
          });
          const modal = bootstrap.Modal.getInstance(document.getElementById('modalForm'));
          if (modal) modal.hide();
          renderUlang();
          toast('Pembinaan tuntas', res.message, 'sukses');
        })
        .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
        .tuntaskanTindakLanjut(AppState.token, idGrup);
    }, 'Ya, Tuntaskan');
}

function konfirmasiHapusTindakLanjut(idGrup) {
  const g = sesiTindakLanjut().filter(function (x) { return x.idGrup === idGrup; })[0];
  if (!g) return;
  konfirmasi('Hapus Catatan Tindak Lanjut',
    'Hapus sesi ' + g.jenis + ' tanggal ' + g.tanggal + ' untuk ' + g.siswa.length + ' siswa?',
    function () {
      tandaSinkron(true);
      google.script.run
        .withSuccessHandler(function (res) {
          tandaSinkron(false);
          if (!res.success) return toast('Gagal', res.message, 'bahaya');
          AppState.tindakLanjut = AppState.tindakLanjut.filter(function (t) {
            return String(t.IDGrup) !== String(idGrup);
          });
          renderUlang();
          toast('Berhasil', res.message, 'sukses');
        })
        .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
        .hapusTindakLanjut(AppState.token, idGrup);
    }, 'Ya, Hapus');
}

// ── Formulir cetak surat ─────────────────────────────────────────────

/**
 * Formulir cetak surat pembinaan.
 * Penerima surat TIDAK diketik manual — selalu diambil dari sesi tindak lanjut,
 * sehingga nama, NISN, dan kelas dijamin sama dengan catatan pembinaannya.
 */
function bukaFormSurat(idGrup) {
  const daftarSesi = sesiTindakLanjut();
  if (!daftarSesi.length) {
    return toast('Belum ada sesi pembinaan',
      'Buat "Catatan Tindak Lanjut" lebih dahulu — penerima surat diambil dari sesi tersebut.', 'peringatan');
  }

  const sesi = (idGrup ? daftarSesi.filter(function (x) { return x.idGrup === idGrup; })[0] : null) || daftarSesi[0];

  const opsiSesi = daftarSesi.map(function (g) {
    return '<option value="' + escHtml(g.idGrup) + '"' + (g.idGrup === sesi.idGrup ? ' selected' : '') + '>' +
      escHtml(g.tanggal + ' • ' + g.jenis + ' • ' + g.siswa.length + ' siswa (' +
        g.siswa[0].nama + (g.siswa.length > 1 ? ' dkk.' : '') + ')') + '</option>';
  }).join('');

  bukaModalForm('Cetak Surat Pembinaan',
    '<div class="mb-3">' +
      '<label class="form-label" for="srtSesi">Sesi Tindak Lanjut <span class="wajib">*</span></label>' +
      '<select class="form-select" id="srtSesi" onchange="gantiSesiSurat(this.value)">' + opsiSesi + '</select>' +
      '<div class="form-text">Penerima surat, tanggal, dan pelanggaran terisi otomatis dari sesi ini.</div>' +
    '</div>' +

    '<div class="mb-3">' +
      '<label class="form-label">Jenis Surat <span class="wajib">*</span></label>' +
      '<select class="form-select" id="srtJenis" onchange="gantiJenisSurat(this.value)">' +
        '<option value="pernyataan">Surat Pernyataan Tidak Akan Mengulangi</option>' +
        '<option value="panggilan">Surat Pemanggilan Orang Tua</option>' +
        '<option value="sp1">Surat Peringatan Pertama (SP 1)</option>' +
        '<option value="sp2">Surat Peringatan Kedua (SP 2)</option>' +
        '<option value="sp3">Surat Peringatan Ketiga (SP 3)</option>' +
      '</select>' +
    '</div>' +

    '<div class="mb-3">' +
      '<label class="form-label" for="srtTanggal">Tanggal Surat <span class="wajib">*</span></label>' +
      '<input type="date" class="form-control" id="srtTanggal" value="' + AppState.formSurat.tanggal + '">' +
    '</div>' +

    '<div class="mb-3">' +
      '<label class="form-label">Siswa Penerima Surat</label>' +
      '<div id="srtPenerima"></div>' +
    '</div>' +

    '<div class="mb-3">' +
      '<label class="form-label" for="srtPelanggaran">Jenis Pelanggaran <span class="wajib">*</span></label>' +
      '<textarea class="form-control" id="srtPelanggaran" style="min-height:70px" ' +
        'placeholder="Terisi otomatis dari riwayat siswa penerima — masih dapat disunting."></textarea>' +
      '<div class="form-text">Diambil dari pelanggaran berat siswa. Silakan sunting bila perlu.</div>' +
    '</div>' +

    // ── Isian khusus per jenis surat ──
    '<div id="srtIsianPernyataan">' +
      '<div class="mb-3">' +
        '<label class="form-label" for="srtKonsekuensi">Konsekuensi Bila Mengulangi <span class="wajib">*</span></label>' +
        '<textarea class="form-control" id="srtKonsekuensi" style="min-height:80px" ' +
          'placeholder="Ketik manual. Contoh: Bersedia menerima Surat Peringatan, dipanggil orang tua kembali, ' +
          'hingga dikembalikan kepada orang tua sesuai ketentuan sekolah."></textarea>' +
      '</div>' +
      '<div class="mb-3">' +
        '<div class="label-kecil mb-2">Kelengkapan Surat Pernyataan</div>' +
        '<div class="d-flex flex-wrap gap-3">' +
          '<div class="form-check"><input class="form-check-input" type="checkbox" id="srtTtdOrtu" checked>' +
            '<label class="form-check-label" for="srtTtdOrtu">Sertakan tanda tangan orang tua / wali</label></div>' +
          '<div class="form-check"><input class="form-check-input" type="checkbox" id="srtMaterai">' +
            '<label class="form-check-label" for="srtMaterai">Sediakan kotak materai Rp10.000</label></div>' +
        '</div>' +
        '<div class="form-text">Kotak materai ditempatkan di atas nama penanda tangan siswa.</div>' +
      '</div>' +
    '</div>' +

    '<div id="srtIsianPanggilan" style="display:none">' +
      '<div class="mb-3">' +
        '<label class="form-label" for="srtNomorPanggilan">Nomor Surat</label>' +
        '<input class="form-control mono" id="srtNomorPanggilan" placeholder="Contoh: 421/PGL/SMP-BLM/IX/2026">' +
      '</div>' +
      '<div class="row g-2 mb-3">' +
        '<div class="col-7">' +
          '<label class="form-label" for="srtHadirTanggal">Tanggal Kehadiran <span class="wajib">*</span></label>' +
          '<input type="date" class="form-control" id="srtHadirTanggal" ' +
            'onchange="tampilkanHariHadir(this.value)">' +
          '<div class="form-text" id="srtHariHadir">Nama hari terisi otomatis pada surat.</div>' +
        '</div>' +
        '<div class="col-5">' +
          '<label class="form-label" for="srtHadirJam">Waktu <span class="wajib">*</span></label>' +
          '<input class="form-control" id="srtHadirJam" placeholder="09.00 WITA s.d. selesai">' +
        '</div>' +
      '</div>' +
      '<div class="mb-3">' +
        '<label class="form-label" for="srtTempat">Tempat</label>' +
        '<input class="form-control" id="srtTempat" placeholder="Ruang Bimbingan & Konseling">' +
      '</div>' +
      '<div class="mb-3">' +
        '<label class="form-label" for="srtKeperluan">Keperluan</label>' +
        '<input class="form-control" id="srtKeperluan" ' +
          'placeholder="Pembinaan dan konseling peserta didik">' +
      '</div>' +
      '<div class="mb-3">' +
        '<label class="form-label" for="srtCatatanPanggilan">Catatan Tambahan</label>' +
        '<textarea class="form-control" id="srtCatatanPanggilan" style="min-height:60px" ' +
          'placeholder="Opsional — ketik manual."></textarea>' +
      '</div>' +
      '<div class="kotak-info"><i class="bi bi-pen"></i><div>' +
        'Surat panggilan selalu ditandatangani <b>Wali Kelas</b> dan <b>Guru BK</b>. ' +
        'Centang Kepala Sekolah di bawah bila perlu kolom "mengetahui" tambahan.</div></div>' +
    '</div>' +

    '<div id="srtIsianSP" style="display:none">' +
      '<div class="mb-3">' +
        '<label class="form-label" for="srtNomor">Nomor Surat</label>' +
        '<input class="form-control mono" id="srtNomor" placeholder="Contoh: 421/SP-1/SMP-BLM/IX/2026">' +
      '</div>' +
      '<div class="mb-3">' +
        '<label class="form-label" for="srtDasar">Dasar &amp; Pertimbangan</label>' +
        '<textarea class="form-control" id="srtDasar" style="min-height:70px" ' +
          'placeholder="Ketik manual. Contoh: Buku Tata Tertib Peserta Didik Pasal 9 Ayat 1; hasil rapat pembinaan…"></textarea>' +
      '</div>' +
      '<div class="mb-3">' +
        '<label class="form-label" for="srtTindakan">Tindakan Sekolah</label>' +
        '<textarea class="form-control" id="srtTindakan" style="min-height:70px" ' +
          'placeholder="Ketik manual. Contoh: Pembinaan intensif Guru BK selama 2 pekan dan pemanggilan orang tua."></textarea>' +
      '</div>' +
      '<div class="mb-3">' +
        '<label class="form-label" for="srtCatatan">Catatan Tambahan</label>' +
        '<textarea class="form-control" id="srtCatatan" style="min-height:60px" ' +
          'placeholder="Opsional — ketik manual."></textarea>' +
      '</div>' +
    '</div>' +

    '<div class="pemisah"></div>' +
    '<div class="label-kecil mb-2">Penanda Tangan Mengetahui</div>' +
    '<div class="d-flex flex-wrap gap-3 mb-2">' +
      '<div class="form-check"><input class="form-check-input" type="checkbox" id="srtTtdKepsek" checked>' +
        '<label class="form-check-label" for="srtTtdKepsek">Kepala Sekolah' +
          (AppState.kepalaSekolah.nama ? ' <span class="text-secondary-2">(' + escHtml(AppState.kepalaSekolah.nama) + ')</span>' : '') +
        '</label></div>' +
      '<div class="form-check"><input class="form-check-input" type="checkbox" id="srtTtdWali" checked>' +
        '<label class="form-check-label" for="srtTtdWali">Wali Kelas</label></div>' +
      '<div class="form-check"><input class="form-check-input" type="checkbox" id="srtTtdBK" checked>' +
        '<label class="form-check-label" for="srtTtdBK">Guru BK' +
          (AppState.guruBKSekolah.nama ? ' <span class="text-secondary-2">(' + escHtml(AppState.guruBKSekolah.nama) + ')</span>' : '') +
        '</label></div>' +
    '</div>' +
    '<div class="kotak-info"><i class="bi bi-info-circle"></i><div>' +
      'Pada surat peringatan selalu disediakan kolom tanda terima orang tua/wali. ' +
      'Surat peringatan dan surat panggilan selalu dicetak satu surat untuk setiap siswa.</div></div>' +

    '<div id="srtHasil" class="mt-3"></div>',

    function (modal) { cetakSurat(modal); }, 'Buat Surat PDF');

  pakaiSesiSurat(sesi);
}

/** Menyalin data sesi tindak lanjut ke formulir surat */
function pakaiSesiSurat(sesi) {
  AppState.formSurat = {
    idGrup: sesi.idGrup,
    nisnTerpilih: sesi.siswa.map(function (x) { return String(x.nisn); }),
    tanggal: isoDariTanggal(sesi.tanggal),
    kelompok: sesi.jenis === 'Konseling Kelompok' && sesi.siswa.length > 1,
    perwakilan: String(sesi.siswa[0].nisn)
  };

  const inpTgl = document.getElementById('srtTanggal');
  if (inpTgl) inpTgl.value = AppState.formSurat.tanggal;

  const inpPel = document.getElementById('srtPelanggaran');
  if (inpPel) inpPel.dataset.disunting = '';     // izinkan isi ulang otomatis

  renderPenerimaSurat();
  isiPelanggaranOtomatis(sesi.pemicu);
}

function gantiSesiSurat(idGrup) {
  const sesi = sesiTindakLanjut().filter(function (x) { return x.idGrup === idGrup; })[0];
  if (sesi) pakaiSesiSurat(sesi);
}

function gantiJenisSurat(v) {
  document.getElementById('srtIsianPernyataan').style.display = v === 'pernyataan' ? '' : 'none';
  document.getElementById('srtIsianPanggilan').style.display = v === 'panggilan'  ? '' : 'none';
  document.getElementById('srtIsianSP').style.display =
    (v === 'pernyataan' || v === 'panggilan') ? 'none' : '';

  // Wali Kelas & Guru BK wajib menandatangani surat panggilan
  kunciTtdPanggilan(v === 'panggilan');
  renderPenerimaSurat();
}

/** Mengunci centang Wali Kelas & Guru BK saat jenis surat = pemanggilan orang tua */
function kunciTtdPanggilan(kunci) {
  ['srtTtdWali', 'srtTtdBK'].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (kunci) { el.checked = true; el.disabled = true; }
    else { el.disabled = false; }
  });
}

/** Menampilkan nama hari dari tanggal kehadiran yang dipilih */
function tampilkanHariHadir(nilai) {
  const info = document.getElementById('srtHariHadir');
  if (!info) return;
  const m = String(nilai || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) { info.textContent = 'Nama hari terisi otomatis pada surat.'; return; }
  const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][
    new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()];
  info.innerHTML = 'Hari <b>' + hari + '</b> — tercetak sebagai "' + hari + ', ' +
    escHtml(m[3] + '/' + m[2] + '/' + m[1]) + '".';
}

function gantiPerwakilanSurat(nisn) {
  AppState.formSurat.perwakilan = String(nisn);
  renderPenerimaSurat();
}

/** Benar bila surat dicetak KOLEKTIF: satu surat pernyataan untuk satu sesi konseling kelompok */
function suratKolektifSurat() {
  const F = AppState.formSurat;
  const jenis = (document.getElementById('srtJenis') || {}).value || 'pernyataan';
  return jenis === 'pernyataan' && F.kelompok && F.nisnTerpilih.length > 1;
}

/** Daftar penerima surat — hanya ditampilkan, tidak dapat disunting */
function renderPenerimaSurat() {
  const wadah = document.getElementById('srtPenerima');
  if (!wadah) return;
  const F = AppState.formSurat;

  const daftar = urutSiswa(F.nisnTerpilih.map(function (n) {
    return AppState.siswa.filter(function (s) { return String(s.NISN) === n; })[0];
  }).filter(Boolean));

  if (!daftar.length) {
    wadah.innerHTML = '<div class="kotak-info bahaya"><i class="bi bi-x-octagon"></i><div>' +
      'Data siswa pada sesi ini tidak ditemukan. Segarkan data lalu coba lagi.</div></div>';
    return;
  }

  const kolektif = suratKolektifSurat();
  if (kolektif && F.nisnTerpilih.indexOf(String(F.perwakilan)) === -1) {
    F.perwakilan = String(daftar[0].NISN);
  }

  const kepala = kolektif
    ? '<span><i class="bi bi-people-fill"></i> <span class="jml">1</span> surat kolektif untuk ' +
        daftar.length + ' siswa</span>'
    : '<span><i class="bi bi-file-earmark-text"></i> <span class="jml">' + daftar.length +
        '</span> surat akan dibuat</span>';

  wadah.innerHTML = '<div class="wadah-chip">' +
    '<div class="baris-chip-kepala">' + kepala + '</div>' +
    daftar.map(function (s) {
      const wakil = kolektif && String(s.NISN) === String(F.perwakilan);
      return '<span class="chip-siswa">' +
        '<span class="kelas">' + escHtml(s.Kelas) + '</span>' +
        '<span class="nama-chip">' + escHtml(s.Nama) + '</span>' +
        (wakil ? '<span class="kelas" style="background:var(--gold-soft);color:var(--gold-hover)">wakil</span>' : '') +
      '</span>';
    }).join('') + '</div>' +

    (kolektif
      ? '<div class="mt-2">' +
          '<label class="form-label" for="srtPerwakilan">Perwakilan Penanda Tangan <span class="wajib">*</span></label>' +
          '<select class="form-select" id="srtPerwakilan" onchange="gantiPerwakilanSurat(this.value)">' +
            daftar.map(function (s) {
              return '<option value="' + escHtml(s.NISN) + '"' +
                (String(s.NISN) === String(F.perwakilan) ? ' selected' : '') + '>' +
                escHtml(s.Nama + ' — ' + s.Kelas) + '</option>';
            }).join('') +
          '</select>' +
          '<div class="form-text">Hasil konseling kelompok cukup <b>satu surat</b>: siswa perwakilan yang ' +
            'menandatangani, seluruh peserta direkap dalam tabel di dalam surat.</div>' +
        '</div>'
      : '<div class="form-text mt-2">' +
          (F.kelompok
            ? 'Surat peringatan dan surat panggilan selalu dibuat terpisah untuk setiap siswa, ' +
              'karena ditujukan kepada orang tua masing-masing.'
            : 'Satu halaman surat untuk setiap siswa pada sesi ini.') +
        '</div>');
}

/** Isi kolom pelanggaran dari pemicu sesi & riwayat siswa — tetap bisa disunting guru */
function isiPelanggaranOtomatis(pemicu) {
  const inp = document.getElementById('srtPelanggaran');
  if (!inp) return;
  if (inp.dataset.disunting === '1') return;   // jangan timpa ketikan pengguna

  const F = AppState.formSurat;
  const kumpulan = [];

  String(pemicu || '').split(';').forEach(function (p) {
    const t = p.trim();
    if (t && kumpulan.indexOf(t) === -1) kumpulan.push(t);
  });

  F.nisnTerpilih.forEach(function (n) {
    AppState.riwayat
      .filter(function (r) { return String(r.NISN) === n && Number(r.Poin) < 0; })
      .sort(function (a, b) { return Number(a.Poin) - Number(b.Poin); })
      .slice(0, 3)
      .forEach(function (r) {
        const t = r.NamaKejadian + ' (' + r.Poin + ' poin, ' + String(r.Tanggal).split(' ')[0] + ')';
        if (kumpulan.indexOf(t) === -1) kumpulan.push(t);
      });
  });

  inp.value = kumpulan.length ? kumpulan.join('\n') : '';
  inp.oninput = function () { inp.dataset.disunting = '1'; };
}

function cetakSurat(modal) {
  const F = AppState.formSurat;
  if (!F.nisnTerpilih.length) {
    return toast('Belum lengkap', 'Sesi tindak lanjut ini tidak memiliki siswa.', 'peringatan');
  }

  const jenis = document.getElementById('srtJenis').value;
  const kolektif = suratKolektifSurat();
  const tanggal = document.getElementById('srtTanggal').value;
  const pelanggaran = document.getElementById('srtPelanggaran').value.trim();

  if (!tanggal)     return toast('Belum lengkap', 'Tentukan tanggal surat.', 'peringatan');
  if (!pelanggaran) return toast('Belum lengkap', 'Isi jenis pelanggarannya.', 'peringatan');

  const tglHadir = (document.getElementById('srtHadirTanggal') || {}).value || '';
  if (jenis === 'panggilan') {
    if (!tglHadir) return toast('Belum lengkap', 'Tentukan tanggal kehadiran orang tua.', 'peringatan');
    if (!String((document.getElementById('srtHadirJam') || {}).value || '').trim()) {
      return toast('Belum lengkap', 'Isi waktu kehadiran orang tua.', 'peringatan');
    }
  }

  const opsi = {
    jenisSurat: jenis,
    daftarNisn: F.nisnTerpilih.slice(),
    tanggal: formatTanggalDariInput(tanggal),
    pelanggaran: pelanggaran,
    konsekuensi: (document.getElementById('srtKonsekuensi') || {}).value || '',
    nomorSurat: jenis === 'panggilan'
      ? ((document.getElementById('srtNomorPanggilan') || {}).value || '')
      : ((document.getElementById('srtNomor') || {}).value || ''),
    dasarPertimbangan: (document.getElementById('srtDasar') || {}).value || '',
    tindakanSekolah: (document.getElementById('srtTindakan') || {}).value || '',
    catatanTambahan: jenis === 'panggilan'
      ? ((document.getElementById('srtCatatanPanggilan') || {}).value || '')
      : ((document.getElementById('srtCatatan') || {}).value || ''),
    tanggalHadir: tglHadir ? formatTanggalDariInput(tglHadir) : '',
    waktuHadir: (document.getElementById('srtHadirJam') || {}).value || '',
    tempatHadir: (document.getElementById('srtTempat') || {}).value || '',
    keperluan: (document.getElementById('srtKeperluan') || {}).value || '',
    ttdKepsek: document.getElementById('srtTtdKepsek').checked,
    ttdWali: document.getElementById('srtTtdWali').checked,
    ttdBK: document.getElementById('srtTtdBK').checked,
    ttdOrtu: !!(document.getElementById('srtTtdOrtu') || {}).checked,
    pakaiMaterai: !!(document.getElementById('srtMaterai') || {}).checked,
    kelompok: kolektif,
    perwakilanNisn: kolektif ? String(F.perwakilan) : ''
  };

  if (jenis === 'pernyataan' && !opsi.konsekuensi.trim()) {
    return toast('Belum lengkap', 'Isi konsekuensi bila siswa mengulangi pelanggaran.', 'peringatan');
  }

  const btn = document.getElementById('tombolSimpanModal');
  const asli = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-inline"></span> Menyusun surat…';
  btn.disabled = true;
  document.getElementById('srtHasil').innerHTML =
    '<div class="kotak-info"><span class="spinner-inline" style="border-color:var(--navy-soft);border-top-color:var(--navy)"></span>' +
    '<div>Menyiapkan ' + (kolektif ? '1 surat kolektif' : F.nisnTerpilih.length + ' surat') + '…</div></div>';

  google.script.run
    .withSuccessHandler(function (res) {
      btn.innerHTML = asli; btn.disabled = false;
      if (!res.success) {
        document.getElementById('srtHasil').innerHTML =
          '<div class="kotak-info bahaya"><i class="bi bi-x-octagon"></i><div>' + escHtml(res.message) + '</div></div>';
        return toast('Gagal', res.message, 'bahaya');
      }
      const d = res.data;
      document.getElementById('srtHasil').innerHTML =
        '<div class="kartu-unduhan"><div class="ikon"><i class="bi bi-file-earmark-pdf-fill"></i></div>' +
          '<div class="teks"><strong>' + escHtml(d.nama) + '</strong><span>Surat siap diunduh</span></div>' +
        '</div>' +
        '<div class="d-flex gap-2 mt-2">' +
          '<button class="btn btn-gold flex-fill" onclick="unduhBase64(\'' + d.base64 + '\',\'' + escHtml(d.nama) + '\',\'application/pdf\')">' +
            '<i class="bi bi-download"></i> Unduh PDF</button>' +
          '<button class="btn btn-hantu" onclick="pratinjau(\'' + escHtml(d.urlPreview) + '\',\'' + escHtml(d.nama) + '\',\'pdf\')">' +
            '<i class="bi bi-eye"></i> Pratinjau</button>' +
        '</div>';
      toast('Surat siap', d.nama, 'sukses');
    })
    .withFailureHandler(function (err) {
      btn.innerHTML = asli; btn.disabled = false;
      document.getElementById('srtHasil').innerHTML =
        '<div class="kotak-info bahaya"><i class="bi bi-x-octagon"></i><div>' + escHtml(err.message) + '</div></div>';
      toast('Error', err.message, 'bahaya');
    })
    .buatSuratPDF(AppState.token, opsi);
}

// ════════════════════════════════════════════════════════════════════
// BAGIAN 20: HALAMAN — PENGATURAN
// ════════════════════════════════════════════════════════════════════

function renderPengaturan() {
  const c = AppState.konfigurasi;
  const html =
  '<div class="judul-seksi">' +
    '<div><h2>Pengaturan Aplikasi</h2><p>Identitas sekolah, ambang zona, keamanan, dan notifikasi email.</p></div>' +
  '</div>' +

  '<div class="grid-2">' +

    '<div class="card"><div class="card-header"><div><h5><i class="bi bi-building"></i> Identitas Sekolah</h5>' +
      '<p class="sub">Tampil pada kop seluruh laporan</p></div></div>' +
      '<div class="card-body">' +
        input2('Nama Sekolah', 'setNamaSekolah', c.namaSekolah) +
        input2('Nama Pemkab', 'setPemkab', c.namaPemkab, 'text',
          'Contoh: Pemerintah Kabupaten Kutai Timur') +
        input2('Nama Dinas / Yayasan', 'setYayasan', c.namaYayasan) +
        input2('NPSN', 'setNpsn', c.npsn, 'text', 'Contoh: 30404123 — tampil di bawah nama sekolah pada kop') +
        input2('Alamat Sekolah', 'setAlamat', c.alamatSekolah) +
        '<div class="row g-2">' +
          '<div class="col-6">' + input2('Telepon', 'setTelepon', c.teleponSekolah) + '</div>' +
          '<div class="col-6">' + input2('Email Sekolah', 'setEmailSekolah', c.emailSekolah) + '</div>' +
        '</div>' +
        '<div class="row g-2">' +
          '<div class="col-6">' + input2('Tahun Ajaran', 'setTahunAjaran', c.tahunAjaran) + '</div>' +
          '<div class="col-6"><label class="form-label">Semester</label><select class="form-select" id="setSemester">' +
            '<option' + (c.semester === 'Ganjil' ? ' selected' : '') + '>Ganjil</option>' +
            '<option' + (c.semester === 'Genap' ? ' selected' : '') + '>Genap</option></select></div>' +
        '</div>' +
        input2('Kota Penandatanganan', 'setKota', c.kotaCetak) +

        '<div class="pemisah"></div>' +
        '<div class="label-kecil mb-2">Logo pada Kop Laporan</div>' +
        '<div class="grid-2" style="gap:var(--s-sm)">' +
          kartuLogo('logo', 'Logo Sekolah', 'Tercetak di sisi KANAN kop', c.logoUrl) +
          kartuLogo('logoInstansi', 'Logo Dinas / Yayasan', 'Tercetak di sisi KIRI kop', c.logoInstansiUrl) +
        '</div>' +
        '<div class="kotak-info mt-2 mb-3"><i class="bi bi-info-circle"></i><div>' +
          'Gunakan gambar persegi berlatar transparan (PNG) agar tajam saat dicetak. Ukuran ideal 300&times;300 px.' +
        '</div></div>' +

        '<button class="btn btn-navy w-100" onclick="simpanIdentitas()"><i class="bi bi-save"></i> Simpan Identitas</button>' +
      '</div></div>' +

    '<div class="tumpuk">' +
      '<div class="card"><div class="card-header"><div><h5><i class="bi bi-sliders"></i> Ambang Zona &amp; Poin</h5>' +
        '<p class="sub">Menentukan klasifikasi warna status siswa</p></div></div>' +
        '<div class="card-body">' +
          '<div class="row g-2">' +
            '<div class="col-4">' + input2('Poin Awal', 'setPoinAwal', c.poinAwal, 'number') + '</div>' +
            '<div class="col-4">' + input2('Batas Hijau >', 'setBatasHijau', c.batasHijau, 'number') + '</div>' +
            '<div class="col-4">' + input2('Batas Merah <', 'setBatasMerah', c.batasMerah, 'number') + '</div>' +
          '</div>' +
          '<div class="kotak-info mb-3"><i class="bi bi-info-circle"></i><div>' +
            'Hijau: poin &gt; ' + escHtml(c.batasHijau) + ' • Kuning: ' + escHtml(c.batasMerah) + '–' + escHtml(c.batasHijau) +
            ' • Merah: poin &lt; ' + escHtml(c.batasMerah) + '</div></div>' +
          '<button class="btn btn-navy w-100" onclick="simpanAmbang()"><i class="bi bi-save"></i> Simpan Ambang Zona</button>' +
        '</div></div>' +

      '<div class="card"><div class="card-header"><div><h5><i class="bi bi-envelope-at"></i> Notifikasi Email</h5>' +
        '<p class="sub">Peringatan otomatis saat siswa masuk zona merah</p></div></div>' +
        '<div class="card-body">' +
          '<div class="form-check form-switch mb-3">' +
            '<input class="form-check-input" type="checkbox" id="setNotif"' + (String(c.notifikasiEmail).toUpperCase() === 'AKTIF' ? ' checked' : '') + '>' +
            '<label class="form-check-label" for="setNotif">Aktifkan notifikasi email otomatis ke wali kelas</label></div>' +
          '<div class="mb-3"><label class="form-label">Kirim email uji ke</label>' +
            '<div class="input-group"><input class="form-control" id="setEmailUji" placeholder="alamat@email.com">' +
            '<button class="btn btn-hantu" onclick="kirimEmailUji(event)">Kirim</button></div></div>' +
          '<button class="btn btn-navy w-100" onclick="simpanNotifikasi()"><i class="bi bi-save"></i> Simpan Pengaturan Notifikasi</button>' +
          '<div class="kotak-info peringatan mt-3"><i class="bi bi-exclamation-triangle"></i><div>' +
            'Pastikan setiap wali kelas memiliki alamat email pada menu <b>Data Guru</b> agar notifikasi terkirim.</div></div>' +
        '</div></div>' +

      '<div class="card"><div class="card-header"><div><h5><i class="bi bi-shield-lock"></i> Keamanan Admin</h5>' +
        '<p class="sub">Kredensial masuk untuk peran Administrator</p></div></div>' +
        '<div class="card-body">' +
          input2('Username Admin', 'setAdminUser', c.adminUsername) +
          '<div class="mb-3"><label class="form-label" for="setAdminPass">Password Admin Baru</label>' +
            '<div class="input-group">' +
              '<input type="password" class="form-control" id="setAdminPass" autocomplete="new-password" ' +
                'placeholder="Kosongkan bila tidak diubah">' +
              '<button class="btn btn-hantu" type="button" onclick="lihatSandi(\'setAdminPass\', this)" ' +
                'title="Tampilkan password"><i class="bi bi-eye"></i></button>' +
            '</div></div>' +
          '<button class="btn btn-navy w-100" onclick="simpanKredensial()"><i class="bi bi-key"></i> Perbarui Kredensial</button>' +
          '<div class="kotak-info bahaya mt-3"><i class="bi bi-exclamation-octagon"></i><div>' +
            'Segera ganti password default <span class="mono">admin123</span> demi keamanan data siswa.</div></div>' +
        '</div></div>' +

      '<div class="card"><div class="card-header"><div><h5><i class="bi bi-file-earmark-pdf"></i> Dokumen Tata Tertib</h5></div></div>' +
        '<div class="card-body">' +
          (c.tatibUrl ?
            '<div class="kartu-unduhan"><div class="ikon"><i class="bi bi-file-earmark-pdf-fill"></i></div>' +
            '<div class="teks"><strong>Tata_Tertib_Sekolah.pdf</strong><span>Sudah terunggah</span></div>' +
            '<button class="btn btn-hantu btn-mini ms-auto" onclick="pratinjau(\'' + escHtml(c.tatibUrl) + '\',\'Tata Tertib\',\'pdf\')">' +
            '<i class="bi bi-eye"></i></button></div>'
            : '<div class="kotak-info peringatan mb-3"><i class="bi bi-exclamation-triangle"></i><div>Belum ada dokumen yang diunggah.</div></div>') +
          '<button class="btn btn-hantu w-100" onclick="unggahTatib()"><i class="bi bi-upload"></i> Unggah / Ganti PDF Tata Tertib</button>' +
        '</div></div>' +
    '</div>' +
  '</div>';

  document.getElementById('section-pengaturan').innerHTML = html + kartuPengaturanKop();
  renderPengaturanKop();
}

// ── Pengaturan Kop Surat ──────────────────────────────────────────────
// Susunan baris, ukuran huruf, dan ketebalannya diatur admin. Logika di sini
// SENGAJA dibuat sama persis dengan yang ada di Kode.gs, agar pratinjau di
// layar identik dengan hasil cetaknya.

function susunanKopDefault() {
  return [
    { id: 'pemkab',    tampil: true, ukuran: 10,  tebal: true,  kapital: true  },
    { id: 'yayasan',   tampil: true, ukuran: 10,  tebal: true,  kapital: true  },
    { id: 'sekolah',   tampil: true, ukuran: 15,  tebal: true,  kapital: true  },
    { id: 'npsn',      tampil: true, ukuran: 7.5, tebal: true,  kapital: false },
    { id: 'alamat',    tampil: true, ukuran: 7.5, tebal: false, kapital: false },
    { id: 'kontak',    tampil: true, ukuran: 7.5, tebal: false, kapital: false },
    { id: 'tambahan1', tampil: true, ukuran: 7.5, tebal: false, kapital: false, isi: '' },
    { id: 'tambahan2', tampil: true, ukuran: 7.5, tebal: false, kapital: false, isi: '' }
  ];
}

function labelBarisKop(id) {
  return {
    pemkab   : 'Nama Pemkab',
    yayasan  : 'Nama Dinas / Yayasan',
    sekolah  : 'Nama Sekolah',
    npsn     : 'NPSN',
    alamat   : 'Alamat Sekolah',
    kontak   : 'Telepon & E-mail',
    tambahan1: 'Baris Tambahan 1',
    tambahan2: 'Baris Tambahan 2'
  }[id] || id;
}

function bacaSusunanKop(cfg) {
  const baku = susunanKopDefault();
  const petaBaku = {};
  baku.forEach(function (b) { petaBaku[b.id] = b; });

  let tersimpan = [];
  try {
    const mentah = JSON.parse(String((cfg && cfg.kopSusunan) || '[]'));
    if (Object.prototype.toString.call(mentah) === '[object Array]') tersimpan = mentah;
  } catch (e) { tersimpan = []; }

  const hasil = [], sudah = {};
  tersimpan.forEach(function (t) {
    const id = String((t && t.id) || '');
    if (!petaBaku[id] || sudah[id]) return;
    sudah[id] = true;
    const d = petaBaku[id];
    const ukuran = Number(t.ukuran);
    hasil.push({
      id      : id,
      tampil  : t.tampil !== false,
      ukuran  : (!isNaN(ukuran) && ukuran >= 5 && ukuran <= 24) ? ukuran : d.ukuran,
      tebal   : t.tebal === undefined ? d.tebal : t.tebal === true,
      kapital : t.kapital === undefined ? d.kapital : t.kapital === true,
      isi     : String(t.isi || '')
    });
  });
  baku.forEach(function (d) { if (!sudah[d.id]) hasil.push(d); });
  return hasil;
}

function teksBarisKop(baris, cfg) {
  switch (baris.id) {
    case 'pemkab':  return String(cfg.namaPemkab || '').trim();
    case 'yayasan': return String(cfg.namaYayasan || '').trim();
    case 'sekolah': return String(cfg.namaSekolah || '').trim();
    case 'npsn':    return cfg.npsn ? ('NPSN: ' + String(cfg.npsn).trim()) : '';
    case 'alamat':  return String(cfg.alamatSekolah || '').trim();
    case 'kontak': {
      const kontak = [];
      if (String(cfg.teleponSekolah || '').trim()) kontak.push('Telp. ' + String(cfg.teleponSekolah).trim());
      if (String(cfg.emailSekolah || '').trim())   kontak.push(String(cfg.emailSekolah).trim());
      return kontak.join(' • ');
    }
    default:
      // Baris tambahan: apa pun yang diketik admin, dicetak apa adanya
      return String(baris.isi || '').trim();
  }
}

function gayaBarisKop(baris) {
  return 'font-size:' + baris.ukuran + 'pt;' +
    'font-weight:' + (baris.tebal ? 'bold' : 'normal') + ';' +
    (baris.kapital ? 'text-transform:uppercase;letter-spacing:.4px;' : '') +
    (baris.id === 'sekolah' ? 'margin:2px 0;' : '') +
    (baris.ukuran <= 8 ? 'color:#444;' : '');
}

/** Konfigurasi yang dipakai pratinjau: nilai tersimpan + suntingan di layar */
function cfgPratinjauKop() {
  const c = AppState.konfigurasi;
  const ambil = function (id, cadangan) {
    const el = document.getElementById(id);
    return el ? el.value : cadangan;
  };
  return {
    namaPemkab   : ambil('setPemkab',       c.namaPemkab),
    namaYayasan  : ambil('setYayasan',      c.namaYayasan),
    namaSekolah  : ambil('setNamaSekolah',  c.namaSekolah),
    npsn         : ambil('setNpsn',         c.npsn),
    alamatSekolah: ambil('setAlamat',       c.alamatSekolah),
    teleponSekolah: ambil('setTelepon',     c.teleponSekolah),
    emailSekolah : ambil('setEmailSekolah', c.emailSekolah)
  };
}

/** Kartu pengaturan kop surat — hanya untuk Admin */
function kartuPengaturanKop() {
  AppState.kopSusunan = bacaSusunanKop(AppState.konfigurasi);

  return '<div class="card mt-3"><div class="card-header">' +
      '<div><h5><i class="bi bi-layout-text-window-reverse"></i> Kop Surat</h5>' +
      '<p class="sub">Atur urutan, ukuran, dan ketebalan tiap baris kop</p></div>' +
      '<div class="kanan"><button class="btn btn-hantu btn-kecil" onclick="pulihkanSusunanKop()">' +
        '<i class="bi bi-arrow-counterclockwise"></i> Susunan Baku</button></div>' +
    '</div>' +
    '<div class="card-body">' +
      '<div class="label-kecil mb-2">Pratinjau</div>' +
      '<div id="pratinjauKop" class="pratinjau-kop mb-3"></div>' +

      '<div class="label-kecil mb-2">Baris Kop &mdash; tahan ikon ' +
        '<i class="bi bi-grip-vertical"></i> lalu geser untuk mengurutkan</div>' +
      '<div id="daftarBarisKop"></div>' +

      '<div class="kotak-info mt-3"><i class="bi bi-info-circle"></i><div>' +
        'Baris yang isinya kosong tidak akan dicetak, walaupun dicentang. ' +
        'Isi Nama Pemkab dan NPSN di kartu Identitas Sekolah di atas.<br>' +
        'Urutan dapat diubah dengan menggeser, atau dengan menekan tombol panah ' +
        'atas/bawah setelah ikon pegangannya dipilih.</div></div>' +

      '<button class="btn btn-utama w-100 mt-3" onclick="simpanSusunanKop()">' +
        '<i class="bi bi-save"></i> Simpan Pengaturan Kop</button>' +
    '</div></div>';
}

/** Gambar daftar baris + pratinjaunya */
function renderPengaturanKop() {
  const wadah = document.getElementById('daftarBarisKop');
  if (!wadah) return;
  const daftar = AppState.kopSusunan;

  wadah.innerHTML = daftar.map(function (b, i) {
    const tambahan = b.id.indexOf('tambahan') === 0;
    return '<div class="baris-kop' + (b.id === AppState.kopDigeser ? ' digeser' : '') + '" ' +
        'data-id="' + escHtml(b.id) + '">' +
      // Pegangan geser. tabindex + panah papan ketik disediakan sebagai jalan
      // lain bagi yang memakai keyboard atau kesulitan menggeser.
      '<div class="pegangan" tabindex="0" role="button" ' +
        'title="Tahan lalu geser untuk memindahkan — atau tekan panah atas/bawah" ' +
        'aria-label="Pindahkan ' + escHtml(labelBarisKop(b.id)) + '" ' +
        'onpointerdown="mulaiGeserKop(event,' + i + ')" ' +
        'onkeydown="panahGeserKop(event,' + i + ')">' +
        '<i class="bi bi-grip-vertical"></i>' +
        '<span class="nomor mono">' + (i + 1) + '</span>' +
      '</div>' +

      '<div class="isi-baris">' +
        '<div class="form-check mb-1">' +
          '<input class="form-check-input" type="checkbox" id="kopTampil' + i + '"' +
            (b.tampil ? ' checked' : '') + ' onchange="ubahBarisKop(' + i + ',\'tampil\',this.checked)">' +
          '<label class="form-check-label" for="kopTampil' + i + '"><b>' +
            escHtml(labelBarisKop(b.id)) + '</b></label>' +
        '</div>' +

        (tambahan
          ? '<input class="form-control form-control-sm mb-1" placeholder="Isi baris — ketik apa saja" ' +
              'value="' + escHtml(b.isi) + '" oninput="ubahBarisKop(' + i + ',\'isi\',this.value)">'
          : '') +

        '<div class="d-flex flex-wrap align-items-center gap-3">' +
          '<label class="atur-kecil">Ukuran' +
            '<input type="number" class="form-control form-control-sm mono" min="5" max="24" step="0.5" ' +
              'value="' + b.ukuran + '" onchange="ubahBarisKop(' + i + ',\'ukuran\',this.value)">pt</label>' +
          '<div class="form-check">' +
            '<input class="form-check-input" type="checkbox" id="kopTebal' + i + '"' +
              (b.tebal ? ' checked' : '') + ' onchange="ubahBarisKop(' + i + ',\'tebal\',this.checked)">' +
            '<label class="form-check-label" for="kopTebal' + i + '">Tebal</label></div>' +
          '<div class="form-check">' +
            '<input class="form-check-input" type="checkbox" id="kopKapital' + i + '"' +
              (b.kapital ? ' checked' : '') + ' onchange="ubahBarisKop(' + i + ',\'kapital\',this.checked)">' +
            '<label class="form-check-label" for="kopKapital' + i + '">HURUF BESAR</label></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  renderPratinjauKop();
}

/** Pratinjau kop — memakai penyusun yang sama dengan hasil cetak */
function renderPratinjauKop() {
  const wadah = document.getElementById('pratinjauKop');
  if (!wadah) return;

  const cfg = cfgPratinjauKop();
  const c = AppState.konfigurasi;
  const baris = AppState.kopSusunan.map(function (b) {
    if (!b.tampil) return '';
    const teks = teksBarisKop(b, cfg);
    if (!teks) return '';
    return '<div style="' + gayaBarisKop(b) + '">' + escHtml(teks) + '</div>';
  }).join('');

  const logo = function (url, sisi) {
    return '<div class="kop-logo ' + sisi + '">' +
      (url ? imgDrive(url, 'Logo', 'width:52px;height:52px;object-fit:contain') : '') + '</div>';
  };

  wadah.innerHTML = '<div class="kertas-kop">' +
      logo(c.logoInstansiUrl, 'kiri') +
      '<div class="teks-kop">' + (baris || '<span class="text-secondary-2">Belum ada baris yang tampil</span>') + '</div>' +
      logo(c.logoUrl, 'kanan') +
    '</div>';
}

/** Pindahkan satu baris kop dari posisi i ke posisi j */
function pindahBarisKop(i, j) {
  const d = AppState.kopSusunan;
  if (i === j || i < 0 || j < 0 || i >= d.length || j >= d.length) return false;
  d.splice(j, 0, d.splice(i, 1)[0]);
  return true;
}

function geserBarisKop(i, arah) {
  if (pindahBarisKop(i, i + arah)) renderPengaturanKop();
}

/**
 * Geser-taruh baris kop.
 *
 * Memakai Pointer Events, bukan drag-and-drop bawaan HTML, karena yang bawaan
 * tidak bekerja pada layar sentuh — sedangkan admin sekolah kerap membuka
 * aplikasi ini dari tablet atau ponsel.
 *
 * Penangkapan pointer dipasang pada WADAH daftar, bukan pada barisnya, sebab
 * daftar digambar ulang setiap kali urutan berubah; bila ditangkap pada baris,
 * gesekan akan terputus begitu barisnya diganti.
 */
function mulaiGeserKop(ev, i) {
  if (ev.button !== undefined && ev.button !== 0) return;   // abaikan klik kanan
  const wadah = document.getElementById('daftarBarisKop');
  if (!wadah) return;
  ev.preventDefault();

  AppState.kopGeser = { indeks: i, pointerId: ev.pointerId };
  AppState.kopDigeser = AppState.kopSusunan[i].id;
  try { wadah.setPointerCapture(ev.pointerId); } catch (e) {}

  wadah.onpointermove   = gerakGeserKop;
  wadah.onpointerup     = akhiriGeserKop;
  wadah.onpointercancel = akhiriGeserKop;

  tandaiBarisDigeser();
}

/** Beri tanda visual pada baris yang sedang digeser tanpa menggambar ulang */
function tandaiBarisDigeser() {
  const wadah = document.getElementById('daftarBarisKop');
  if (!wadah) return;
  [].forEach.call(wadah.querySelectorAll('.baris-kop'), function (el) {
    el.classList.toggle('digeser', el.dataset.id === AppState.kopDigeser);
  });
}

function gerakGeserKop(ev) {
  const g = AppState.kopGeser;
  if (!g) return;
  ev.preventDefault();

  const wadah = document.getElementById('daftarBarisKop');
  const baris = wadah.querySelectorAll('.baris-kop');

  // Baris mana yang sedang berada di bawah jari/kursor?
  let tujuan = -1;
  for (let k = 0; k < baris.length; k++) {
    const r = baris[k].getBoundingClientRect();
    if (ev.clientY >= r.top && ev.clientY <= r.bottom) { tujuan = k; break; }
  }
  // Di luar daftar: jatuhkan ke ujung terdekat
  if (tujuan === -1 && baris.length) {
    const atas = baris[0].getBoundingClientRect();
    const bawah = baris[baris.length - 1].getBoundingClientRect();
    if (ev.clientY < atas.top) tujuan = 0;
    else if (ev.clientY > bawah.bottom) tujuan = baris.length - 1;
  }
  if (tujuan === -1 || tujuan === g.indeks) return;

  if (pindahBarisKop(g.indeks, tujuan)) {
    g.indeks = tujuan;
    renderPengaturanKop();      // urutan berubah seketika, ikut jari
    tandaiBarisDigeser();
  }
}

function akhiriGeserKop(ev) {
  const wadah = document.getElementById('daftarBarisKop');
  if (wadah) {
    try { wadah.releasePointerCapture(AppState.kopGeser.pointerId); } catch (e) {}
    wadah.onpointermove = wadah.onpointerup = wadah.onpointercancel = null;
  }
  AppState.kopGeser = null;
  AppState.kopDigeser = '';
  renderPengaturanKop();
}

/** Panah papan ketik — jalan lain bagi yang tidak memakai tetikus */
function panahGeserKop(ev, i) {
  const arah = ev.key === 'ArrowUp' ? -1 : (ev.key === 'ArrowDown' ? 1 : 0);
  if (!arah) return;
  ev.preventDefault();
  if (!pindahBarisKop(i, i + arah)) return;
  renderPengaturanKop();

  // Kembalikan fokus ke pegangan baris yang sama, kini di posisi barunya
  const wadah = document.getElementById('daftarBarisKop');
  const baru = wadah ? wadah.querySelectorAll('.baris-kop')[i + arah] : null;
  if (baru) baru.querySelector('.pegangan').focus();
}

function ubahBarisKop(i, kunci, nilai) {
  const b = AppState.kopSusunan[i];
  if (!b) return;
  if (kunci === 'ukuran') {
    const n = Number(nilai);
    b.ukuran = (!isNaN(n) && n >= 5 && n <= 24) ? n : b.ukuran;
  } else {
    b[kunci] = nilai;
  }
  // Mengetik isi baris cukup memperbarui pratinjau — menggambar ulang seluruh
  // daftar akan membuat kursor melompat keluar dari kotak yang sedang diketik.
  if (kunci === 'isi') renderPratinjauKop();
  else renderPengaturanKop();
}

function pulihkanSusunanKop() {
  konfirmasi('Pulihkan Susunan Baku',
    'Kembalikan urutan, ukuran, dan ketebalan seluruh baris kop ke pengaturan bawaan? ' +
    'Isi baris tambahan ikut dikosongkan.',
    function () {
      AppState.kopSusunan = susunanKopDefault();
      renderPengaturanKop();
      toast('Dipulihkan', 'Tekan Simpan agar susunan baku ini berlaku.', 'peringatan');
    }, 'Ya, Pulihkan');
}

function simpanSusunanKop() {
  simpanPengaturanKe({ kopSusunan: JSON.stringify(AppState.kopSusunan) },
    'Pengaturan kop surat disimpan.');
}

/** Kartu pratinjau + tombol unggah untuk satu logo */
function kartuLogo(kategori, judul, keterangan, url) {
  return '<div style="border:1px solid var(--border);border-radius:var(--r-md);padding:12px;text-align:center">' +
    '<div style="height:74px;display:flex;align-items:center;justify-content:center;' +
      'background:var(--bg-surface-2);border-radius:var(--r);margin-bottom:8px">' +
      (url
        ? imgDrive(url, judul, 'max-height:64px;max-width:100%;object-fit:contain')
        : '<i class="bi bi-image" style="font-size:26px;color:var(--text-muted)"></i>') +
    '</div>' +
    '<div style="font-size:13px;font-weight:600">' + judul + '</div>' +
    '<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px">' + keterangan + '</div>' +
    '<button class="btn btn-hantu btn-kecil w-100" onclick="pilihDanUnggah(\'' + kategori + '\',\'image/*\')">' +
      '<i class="bi bi-upload"></i> ' + (url ? 'Ganti' : 'Unggah') + '</button>' +
    (url ? '<button class="btn btn-hantu btn-kecil w-100 mt-1" onclick="pratinjau(\'' + escHtml(url) +
      '\',\'' + escHtml(judul) + '\',\'gambar\')"><i class="bi bi-eye"></i> Lihat</button>' : '') +
  '</div>';
}

function input2(label, id, nilai, tipe, placeholder) {
  return '<div class="mb-3"><label class="form-label" for="' + id + '">' + label + '</label>' +
    '<input type="' + (tipe || 'text') + '" class="form-control' + (tipe === 'number' ? ' mono' : '') + '" id="' + id + '" ' +
    'value="' + escHtml(nilai === undefined || nilai === null ? '' : nilai) + '"' +
    (placeholder ? ' placeholder="' + escHtml(placeholder) + '"' : '') + '></div>';
}

function simpanPengaturanKe(perubahan, pesan) {
  tandaSinkron(true);
  google.script.run
    .withSuccessHandler(function (res) {
      tandaSinkron(false);
      if (!res.success) return toast('Gagal', res.message, 'bahaya');
      Object.keys(perubahan).forEach(function (k) { AppState.konfigurasi[k] = perubahan[k]; });
      document.getElementById('sekolahSidebar').textContent = AppState.konfigurasi.namaSekolah || 'Portal Sekolah';
      renderUlang();
      toast('Berhasil', pesan || res.message, 'sukses');
    })
    .withFailureHandler(function (err) { tandaSinkron(false); toast('Error', err.message, 'bahaya'); })
    .simpanKonfigurasi(AppState.token, perubahan);
}

function simpanIdentitas() {
  simpanPengaturanKe({
    namaSekolah   : document.getElementById('setNamaSekolah').value.trim(),
    namaPemkab    : document.getElementById('setPemkab').value.trim(),
    namaYayasan   : document.getElementById('setYayasan').value.trim(),
    npsn          : document.getElementById('setNpsn').value.trim(),
    alamatSekolah : document.getElementById('setAlamat').value.trim(),
    teleponSekolah: document.getElementById('setTelepon').value.trim(),
    emailSekolah  : document.getElementById('setEmailSekolah').value.trim(),
    tahunAjaran   : document.getElementById('setTahunAjaran').value.trim(),
    semester      : document.getElementById('setSemester').value,
    kotaCetak     : document.getElementById('setKota').value.trim()
  }, 'Identitas sekolah diperbarui.');
}

function simpanAmbang() {
  const awal  = Number(document.getElementById('setPoinAwal').value);
  const hijau = Number(document.getElementById('setBatasHijau').value);
  const merah = Number(document.getElementById('setBatasMerah').value);
  if (merah >= hijau) return toast('Nilai tidak valid', 'Batas merah harus lebih kecil daripada batas hijau.', 'peringatan');
  simpanPengaturanKe({ poinAwal: awal, batasHijau: hijau, batasMerah: merah }, 'Ambang zona diperbarui.');
}

function simpanNotifikasi() {
  simpanPengaturanKe({ notifikasiEmail: document.getElementById('setNotif').checked ? 'AKTIF' : 'NONAKTIF' },
    'Pengaturan notifikasi disimpan.');
}

function simpanKredensial() {
  const user = document.getElementById('setAdminUser').value.trim();
  const pass = document.getElementById('setAdminPass').value.trim();
  if (!user) return toast('Belum lengkap', 'Username admin tidak boleh kosong.', 'peringatan');
  const perubahan = { adminUsername: user };
  if (pass) {
    if (pass.length < 6) return toast('Password lemah', 'Gunakan minimal 6 karakter.', 'peringatan');
    perubahan.adminPassword = pass;
  }
  simpanPengaturanKe(perubahan, 'Kredensial admin diperbarui.');
}

function kirimEmailUji(ev) {
  const tujuan = document.getElementById('setEmailUji').value.trim();
  if (!tujuan) return toast('Belum diisi', 'Masukkan alamat email tujuan.', 'peringatan');
  // Pengiriman e-mail lewat MailApp bisa memakan beberapa detik — tombol dikunci
  const pulih = tombolSibuk(ev && ev.currentTarget, 'Mengirim…');
  tandaSinkron(true);
  google.script.run
    .withSuccessHandler(function (res) {
      pulih(); tandaSinkron(false);
      toast(res.success ? 'Terkirim' : 'Gagal', res.message, res.success ? 'sukses' : 'bahaya');
    })
    .withFailureHandler(function (err) {
      pulih(); tandaSinkron(false);
      toast('Error', err.message, 'bahaya');
    })
    .ujiNotifikasiEmail(AppState.token, tujuan);
}
