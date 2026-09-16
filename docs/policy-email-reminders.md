# Email reminder Policy Register

Restart server setelah pembaruan; tabel pengaturan dan riwayat pengiriman dibuat otomatis saat startup. Build frontend dengan `npm run build:client`.

Login sebagai admin, buka **Account > 5. Pengaturan SMTP**. Isi SMTP host, port, STARTTLS atau TLS, username/password sesuai penyedia SMTP, serta email pengirim yang diizinkan. Simpan SMTP terpusat. Tombol email percobaan di sini menguji koneksi menggunakan pesan umum, tanpa mengubah jadwal reminder.

Selanjutnya buka **Policy Register > Pengaturan email reminder** untuk mengatur status aktif, jadwal, penerima, serta subjek/isi pengingat kebijakan. Tautan pada kedua halaman memungkinkan perpindahan langsung. Pengaturan reminder tidak lagi memuat atau menyimpan host, username, password, atau email pengirim.

Masukkan pemetaan satu owner ke satu alamat email per baris, misalnya `CISO = nama@example.com`. Nama owner harus sama persis dengan Policy Register. Simpan lalu gunakan tombol email tes untuk memeriksa pengiriman menggunakan pengaturan tersimpan. Aktifkan reminder dan simpan untuk menjadwalkan pengiriman.

Server memeriksa setiap jam dan pada startup. Jatuh tempo dihitung dari Last review + Annual (12 bulan), Biannual (6 bulan), atau Quarterly (3 bulan). Tanggal akhir bulan dibatasi ke hari terakhir bulan tujuan. Ad hoc, siklus kustom, tanggal kosong, dan owner tanpa email dilewati. Pengingat dikirim ketika memasuki rentang hari sebelum jatuh tempo, termasuk yang sudah terlambat, sekali per kebijakan/tanggal jatuh tempo/penerima. Perbarui Last review setelah review selesai.

Kegagalan pengiriman dicoba kembali pada pemeriksaan berikutnya. Riwayat sukses disimpan di PostgreSQL dan kunci database mencegah beberapa instance mengirim bersamaan. Jika proses berhenti tepat setelah SMTP menerima email sebelum riwayat tersimpan, pengiriman dapat terulang. Server harus tetap berjalan agar pemeriksaan otomatis berlangsung.

Password SMTP disimpan terenkripsi di database; kunci lokal berada di `data/smtp-secret.key` dan dikecualikan dari Git. Simpan cadangan kunci secara aman bersama cadangan database, batasi akses file ke akun server, dan gunakan kunci yang sama pada semua instance. Password tidak dikembalikan ke browser. Kosongkan field password untuk mempertahankannya atau centang hapus password untuk menghapusnya.

Saat startup versi baru, koneksi SMTP lama dipindahkan ke `app_smtp_settings` dalam transaksi. Ciphertext password disalin tanpa perubahan, sedangkan jadwal, penerima, template, dan riwayat pengiriman tetap di modul kebijakan. Migrasi dapat dijalankan ulang tanpa menimpa SMTP terpusat yang telah diedit. Jalankan seluruh instance dengan versi baru agar tidak ada proses lama yang masih membaca koneksi dari tabel kebijakan.

API SMTP terpusat: `GET/PUT /api/smtp-settings`, `POST /api/smtp-settings/test` (admin). API reminder kebijakan tetap pada `/api/policy-register/reminder-settings`, tetapi menolak field koneksi SMTP. Reminder menggunakan `smtpService.createMailer()` dan layanan pengiriman bersama. Reminder otomatis yang tersedia saat ini adalah review Policy Register; kalender atau deadline modul lain belum otomatis mengirim email.
