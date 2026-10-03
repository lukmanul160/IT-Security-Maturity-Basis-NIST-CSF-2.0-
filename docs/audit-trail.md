# Audit trail akun

Transfer modul mencatat `initiated` sebelum operasi dan `success`/`failed` setelah operasi. Detail berisi nama file, pesan hasil, error, serta jumlah record yang tersimpan jika import gagal sebagian. Success export/template/report berarti dokumen dibuat dan unduhan dimulai. Endpoint aktivitas menunggu INSERT selesai; kegagalan database menghasilkan HTTP 503. HTTP 404 meminta restart backend dan HTTP 401 meminta login ulang.

Administrator membuka Account ? AUDIT TRAIL. Filter tersedia untuk username persis, jenis aktivitas, dan rentang tanggal (zona waktu perangkat). Tabel memuat waktu, akun/role, aktivitas, method/path, status HTTP, IP, durasi, request ID dan detail yang dapat dibuka.

API mencatat tambah, ubah, hapus, baca, upload (nama, ukuran, MIME), download, login/logout dan kegagalan termasuk akses ditolak. Detail memuat target, parameter, input dan hasil mutation yang dibatasi ukurannya; password, token, secret, kredensial dan isi binary disamarkan. Username login yang gagal adalah klaim percobaan, bukan akun terautentikasi. File inline juga dihitung sebagai transfer download server.

Import/export/report dari toolbar transfer modul serta import/export assessment mengirim deklarasi browser ke `/api/audit/activity`. `source: browser-declared` dan `outcome: initiated` membedakannya dari keberhasilan operasi server; server tidak memastikan file disimpan atau PDF dicetak. Perubahan setiap record selama import tetap dicatat terpisah. Event API juga mencatat upload yang terjadi saat menambah/mengubah evidence.

Log lama tetap tersedia; detail baru hanya tersedia untuk aktivitas setelah pembaruan. Log tidak menyimpan snapshot database sebelum perubahan dan tidak dapat merekonstruksi isi record yang dihapus sebelumnya. Tidak ada endpoint edit/hapus log. Log bukan penyimpanan tahan manipulasi oleh administrator database. Penulisan log berlangsung setelah respons; kegagalan database dilaporkan ke stderr dan tidak membatalkan operasi pengguna. Monitoring dan backup audit_events diperlukan untuk kebutuhan kepatuhan.
