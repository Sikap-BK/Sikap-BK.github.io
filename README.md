# SIKAP BK — Frontend

**Sistem Informasi Karakter dan Poin, Bimbingan & Konseling**
SMP Budi Luhur Mandiri — Sangatta Utara, Kutai Timur

Situs: **https://sikap-bk.github.io/**

---

## Isi repositori ini

```
index.html          ← halaman aplikasi (HARUS di akar repositori)
css/
  style.css         ← seluruh gaya tampilan
js/
  config.js         ← alamat backend  ← satu-satunya yang perlu diubah
  api.js            ← penyambung ke Apps Script
  app.js            ← logika aplikasi
```

**Tidak ada berkas `.gs` di sini, dan memang tidak boleh ada.** `Kode.gs`
tinggal di Google Apps Script, bukan di repositori ini.

---

## Bagaimana ini bekerja

```
Peramban guru/siswa
   │
   ├─ membuka  https://sikap-bk.github.io/
   │           (halaman statis dari GitHub Pages — cepat, tanpa iframe)
   │
   └─ fetch()  ──→ https://script.google.com/.../exec
                      │
                      ├─ Kode.gs memeriksa token & hak akses
                      ├─ membaca/menulis Google Sheets
                      └─ menjawab dengan JSON
```

Data sekolah **tidak pernah tersimpan di GitHub**. Repositori ini hanya berisi
tampilan. Seluruh data siswa, guru, riwayat poin, dan catatan pengaduan tetap
berada di Google Sheets pada akun Google sekolah.

---

## Kalau ada yang tidak beres

| Gejala | Penyebab paling mungkin |
|---|---|
| Halaman terbuka tapi daftar guru kosong | `GAS_URL` di `js/config.js` salah, atau deployment Apps Script belum diperbarui |
| Tampilan polos tanpa warna | `css/style.css` tidak ikut ter-push — periksa apakah folder `css/` ada di GitHub |
| Semua tombol tidak bereaksi | Salah satu berkas di `js/` tidak ikut ter-push, atau urutan `<script>` di `index.html` tertukar |
| Berhasil di komputer sendiri, gagal di komputer lain | `GAS_URL` masih memakai alamat `/dev`. Harus `/exec` |
| Perubahan kode Apps Script seolah tidak berefek | Deployment memakai "Deployment baru" sehingga alamatnya berganti; `config.js` masih menunjuk yang lama |

Untuk melihat galat sebenarnya: tekan **F12** di peramban → tab **Console**.

---

## Memperbarui situs

Dari folder ini, di terminal:

```bash
git add .
git commit -m "keterangan singkat perubahan"
git push
```

GitHub Pages membangun ulang dalam 1–2 menit. Kalau halaman masih versi lama,
tekan **Ctrl+Shift+R** (muat ulang paksa) atau buka di jendela penyamaran.

---

## Memperbarui backend

Backend tidak ada di sini. Perubahan `Kode.gs` dilakukan di
[script.google.com](https://script.google.com), lalu:

**Terapkan ▾ → Kelola deployment → ikon pensil ✏️ → Versi: Versi baru → Terapkan**

> Jangan memakai **"Deployment baru"** untuk pembaruan. Itu membuat alamat
> `/exec` yang berbeda, sementara `js/config.js` di sini masih menunjuk alamat
> lama — aplikasinya akan terbuka normal tetapi menjalankan kode lama, dan
> gejalanya sulit ditebak.

---

## Catatan keamanan

Repositori ini **publik** — itu syarat GitHub Pages gratis. Yang berada di sini
hanya kode tampilan; tidak ada kata sandi maupun kunci apa pun.

Namun berarti **alamat backend dapat ditemukan siapa saja**. Karena itu
seluruh hak akses ditegakkan di sisi server, bukan dengan menyembunyikan
tombol: setiap operasi memeriksa token sesi, dan hanya 30 aksi yang masuk
daftar putih yang dapat dipanggil.

Dua hal yang harus dijaga di sisi Google, bukan di sini:

1. **Kata sandi Admin jangan dibiarkan `admin123`.** Akun Admin dapat membaca
   seluruh catatan Pengaduan & Konseling.
2. **Hapus atau ganti kata sandi akun guru contoh** yang dibuat otomatis saat
   pemasangan (`guru123`, `kepsek123`).

Sejak v2.20 kata sandi disimpan sebagai hash bergaram dan percobaan login
dibatasi 5 kali per 10 menit — tetapi itu tidak menolong bila kata sandinya
adalah tebakan pertama yang akan dicoba siapa pun.

---

*SIKAP BK v2.21 · frontend statis + Apps Script sebagai REST API*
