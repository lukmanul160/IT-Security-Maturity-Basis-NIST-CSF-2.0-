# Penyimpanan upload

Gunakan Node.js 20.19+ (atau 22.12+) untuk SDK cloud dan build frontend.

Admin: buka **Account → Setting Storage**. Pilih Lokal,
folder jaringan/NAS, AWS S3, atau Google Cloud Storage. Klik **Tes akses storage**
untuk menguji tulis, baca, dan hapus objek sementara; **Simpan pengaturan** juga
menjalankan tes sebelum mengaktifkan konfigurasi untuk upload baru.

Bucket harus sudah dibuat. Isi nama bucket tanpa `s3://`, `gs://`, atau URL.
Prefix opsional, misalnya `nist/production`. Untuk AWS isi region bucket;
untuk Google Cloud project ID bersifat opsional.

## AWS S3

Server memakai credential chain AWS SDK. Di production gunakan IAM role.
Alternatif: set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, dan bila diperlukan
`AWS_SESSION_TOKEN` pada environment server. Kredensial tidak dimasukkan ke UI
dan tidak disimpan di database. Akun memerlukan `s3:PutObject`, `s3:GetObject`,
dan `s3:DeleteObject` untuk objek di prefix bucket yang dipilih.

Referensi: [AWS SDK S3 examples](https://docs.aws.amazon.com/en_kr/code-library/latest/ug/javascript_3_s3_code_examples.html).

## Google Cloud Storage

Server memakai Application Default Credentials. Gunakan service account yang
terpasang pada runtime Google Cloud, atau set `GOOGLE_APPLICATION_CREDENTIALS`
ke path absolut file JSON service account di server. Untuk pengembangan dapat
menggunakan `gcloud auth application-default login`.
Berikan akses baca, buat, dan hapus objek, misalnya role
`roles/storage.objectUser` pada bucket yang dituju.

Referensi: [Application Default Credentials](https://docs.cloud.google.com/docs/authentication/application-default-credentials).

## Perubahan lokasi dan backup

File lama dan penggantinya tetap memakai lokasi asal, termasuk bucket, prefix,
dan region/project yang dicatat saat upload. Pertahankan kredensial server yang
dapat mengakses semua lokasi tersebut. Pengaturan ini tidak memigrasikan file lama.
Saat storage gagal, upload gagal tanpa dialihkan otomatis ke lokal.

Download tetap melalui aplikasi dan pemeriksaan akses yang sudah ada; bucket
tidak perlu dibuat publik. Metadata tetap berada di PostgreSQL. Sertakan metadata
database serta isi folder/bucket yang digunakan pada prosedur backup. File backup
melalui aplikasi membaca objek lewat storage service yang sama.
