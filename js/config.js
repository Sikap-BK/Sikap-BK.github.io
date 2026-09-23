/**
 * config.js — satu-satunya berkas yang perlu Anda ubah
 * SIKAP BK — frontend GitHub Pages
 */

/**
 * Alamat /exec dari deployment Apps Script Anda.
 *
 * ⚠️ HARUS berakhiran /exec, bukan /dev.
 *    /dev hanya bisa dibuka oleh pemilik akun yang sedang login — aplikasinya
 *    akan jalan mulus di komputer Anda lalu gagal total di komputer guru dan
 *    siswa. Kegagalan yang sulit ditebak sebabnya, karena di sisi Anda
 *    semuanya terlihat baik-baik saja.
 *
 * ⚠️ Alamat ini BERUBAH setiap kali Anda memakai "Deployment baru" di Apps
 *    Script. Untuk memperbarui aplikasi, gunakan:
 *        Terapkan ▾ → Kelola deployment → ikon pensil → Versi: Versi baru
 *    Dengan cara itu alamatnya tetap, hanya isinya yang diperbarui — dan
 *    berkas ini tidak perlu disentuh lagi.
 *
 *    Kalau alamatnya terlanjur berubah, ganti nilainya di bawah, lalu:
 *        git add . && git commit -m "perbarui alamat API" && git push
 */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxaoZbWX6an5nJ-F_HpUQV-_LNUgsSZsIhW0F4Nf8eqcNJvkPKoblt2pcpFnNGAr556tw/exec';
