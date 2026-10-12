# Kantor virtual publik

Buka `/virtual-office` pada alamat deployment NIST Basis. Halaman dan aset 3D dapat diakses tanpa login; API publik berada di `/api/public/virtual-office`. Tautan halaman tersedia pada landing page.

Data akun dibaca dari `app_users` yang dikelola ADMINISTRATION, diurutkan berdasarkan ID. Publik menerima ID, role, nama tampilan pengguna, status sesi dan label modul. Nama di atas avatar memakai `full_name`, dengan fallback username jika nama lengkap kosong, sesuai permintaan untuk menampilkan nama pengguna. Password, token, isi dashboard dan izin akun tidak dipublikasikan. Perubahan nama ADMINISTRATION ikut diperbarui pada label avatar saat sinkronisasi berikutnya.

Sesi valid membuat avatar duduk bekerja. Workspace melaporkan modul yang sedang terlihat melalui endpoint terautentikasi `/api/office-presence` setiap perubahan terdeteksi (interval 5 detik). Bila belum ada laporan, labelnya Account Management. Untuk beberapa tab, laporan terakhir dari tab terlihat menjadi aktivitas akun. Logout, pergantian sesi, perubahan keamanan akun dan kedaluwarsa sesi mengikuti sistem autentikasi yang sudah ada. Menutup browser tidak otomatis menghapus sesi; sesi tetap aktif hingga logout atau kedaluwarsa 8 jam.

Tanpa sesi, avatar memiliki 17 aktivitas simulasi: minum kopi, makan, istirahat/tidur sambil duduk tegak, toilet, berkeliling, membaca buku, mengecek ponsel, peregangan, mengobrol, makan camilan, minum air dan merawat tanaman. Buku, ponsel, botol dan camilan tampil sesuai aktivitas. Jadwal berbeda berdasarkan ID akun dan mengikuti fase 32 detik waktu animasi; perjalanan diselesaikan dan aktivitas berlangsung minimal 12 detik sebelum berganti. Simulasi tidak menunjukkan aktivitas nyata orang tersebut. Pose meja/sofa memakai torso tegak, paha horizontal dan lutut tertekuk; rotasi miring dari pose sebelumnya selalu direset. Avatar toilet disembunyikan di balik partisi. Tombol Jeda menghentikan animasi, tetapi pembaruan data tetap berjalan. Preferensi reduced-motion memulai animasi dalam keadaan jeda.

Reservasi eksklusif melindungi 4 kursi kafetaria, 4 tempat sofa, 2 toilet dan 3 posisi merawat tanaman. Tempat dipesan sejak avatar menuju lokasi sampai aktivitas selesai, login, atau akun dihapus. Bila penuh, avatar menunggu di posisi berbeda. Jalur berjalan memakai dua lajur dan grid jarak minimum 0,85 unit agar avatar tidak berjalan menimpa avatar lain. Setiap pengguna aktif mendapat satu meja kerja eksklusif yang dipilih secara acak.

Jumlah meja awal 30; kapasitas dan kedalaman ruangan bertambah otomatis bila akun melebihi 30. Kapasitas meja mencukupi seluruh akun; pengguna aktif menempati meja yang direservasi secara acak. Data disinkronkan setiap 10 detik ketika halaman terlihat. Bila koneksi gagal, data terakhir dipertahankan disertai indikator kegagalan, tanpa menggantinya dengan data contoh.

Avatar memiliki variasi visual perempuan/laki-laki, warna kulit, gaya rambut (pendek, bob, panjang, bun), dan outfit (blazer, kemeja, atasan kasual, celana, rok). Variasi dibuat secara deterministik dari ID akun sehingga tetap konsisten ketika daftar akun berubah. Ini adalah karakter visual, bukan data gender pengguna. Warna label nama mengikuti role, sedangkan warna outfit bervariasi.

Three.js disajikan lokal, tanpa CDN. `npm run prepare:client` menyalin modul Three.js beserta lisensinya melalui `scripts/prepare-virtual-office.js`; `npm run build` sudah menjalankan langkah tersebut. Browser harus mendukung WebGL 2 untuk gambar 3D; apabila tidak tersedia, daftar role dan aktivitas tetap ditampilkan.

Kamera: pilih **Geser** (default) atau **Putar**, kemudian drag mouse/satu jari. Tombol mouse kanan memakai mode kebalikannya. Scroll, pinch dua jari, atau tombol +/− mengatur zoom. Tombol arah di dalam kanvas bisa ditekan/ditahan untuk menggerakkan kamera. Setelah kanvas mendapat fokus, WASD atau tombol panah juga menggeser kamera di bidang lantai. Kamera tetap bisa digerakkan ketika animasi dijeda.

Tema: tombol Dark mode/Light mode memakai pengaturan bersama `nist-basis-theme`. Pilihan bertahan setelah reload dan mengikuti perubahan dari tab aplikasi lain. Warna latar, panel, input, tombol, label avatar dan pencahayaan 3D menyesuaikan tema tanpa mengubah posisi kamera.

Performa: maksimum 30 FPS desktop atau 20 FPS untuk pointer sentuh/perangkat dengan ≤4 logical CPU. Pixel ratio dibatasi 1,25 desktop dan 1 untuk perangkat hemat daya. Furniture statis digabung menggunakan InstancedMesh; geometry/material dipakai bersama. Shadow map 512×512 dihitung ulang hanya saat tata ruang berubah; avatar memakai bayangan oval sederhana. Render berhenti ketika tab tersembunyi dan ketika animasi dijeda tanpa perubahan kamera/data. Daftar anggota dirender ulang hanya jika isinya berubah. Tidak ada video, model eksternal besar atau unduhan CDN.

Halaman ini mengikuti hosting aplikasi Node/PostgreSQL yang sudah ada. Untuk akses dari internet, gunakan alamat deployment NIST Basis yang telah dipublikasikan; perubahan kode lokal tidak membuat deployment internet baru. Sesi disimpan pada proses aplikasi sesuai arsitektur autentikasi saat ini, sehingga replica tanpa penyimpanan sesi bersama akan memiliki status sesi berbeda.

Validasi: `node --test test/virtualOffice.test.js test/publicPagePerformance.test.js` dan `npm run build`.

Active avatars show an English speech bubble describing the latest audit event recorded during their current session. The public response exposes only the friendly activity and its timestamp, never raw paths, payloads, IP addresses or account identifiers. Background presence, current-user, health and reminder polling are excluded. With no recorded event, the bubble says that no activity has been recorded yet. This describes the latest recorded action, rather than inferring activity from the selected module.

The public header keeps branding at the left and language/theme preferences before navigation. Login preferences also put the theme button immediately to the right of the language selector.

Recreation wing: area PlayStation dengan controller, command center dengan layar monitoring dekoratif (simulasi, bukan data monitoring langsung), dan meja pingpong dengan dua slot pemain serta bola bergerak saat keduanya tiba. Aktivitas idle kini 17, termasuk membuat kopi dan ngobrol sambil minum dengan gelembung percakapan. Kamera memiliki pilihan khusus untuk ketiga area baru. Jalur toilet melalui sisi kiri/kanan partisi, dengan pemeriksaan tabrakan dinding pada gerak normal dan menghindar; avatar disembunyikan hanya setelah tiba.

Tombol Fullscreen di header kanvas membuka panel kantor memenuhi layar, termasuk kontrol kamera dan aktivitas. Keluar melalui tombol Keluar fullscreen atau Escape. Browser mobile tanpa Fullscreen API menggunakan tampilan panel memenuhi viewport.

Layar PlayStation menampilkan ilustrasi balapan bergerak saat avatar sudah duduk bermain, dan gambar standby saat kosong. Tekstur canvas lokal diperbarui maksimum 8 FPS hanya selama permainan. Pengguna dengan sesi aktif mendapat meja kerja acak yang dipesan eksklusif; posisi tetap sepanjang sesi aktif dan pemilihan berikutnya mengutamakan meja berbeda setelah logout/login.
