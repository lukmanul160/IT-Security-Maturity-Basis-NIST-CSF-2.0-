# Panduan agen AI ? NIST Basis

Baca README.md bagian "Memori proyek untuk AI", lalu docs/KNOWLEDGE_GRAPH.md.
Jalankan `npm run knowledge:query -- <topik>` untuk memilih dokumentasi dan sumber.
Baca bagian docs/AI_HANDOFF.md yang relevan dengan topik, lalu dokumentasi modul yang diubah;
tidak perlu memuat seluruh handoff/katalog/graph JSON pada setiap sesi.
Jika graph kedaluwarsa, jalankan `npm run knowledge:build` sebelum query.
Setelah mengubah sumber/dokumentasi, perbarui graph dan jalankan `npm run knowledge:check`.

- Pertahankan perubahan pengguna yang sudah ada; periksa git status sebelum mengedit.
- Backend CommonJS Express 5 ada di src/. PostgreSQL adalah database wajib.
- Frontend Vue 3 di frontend/client/. Banyak komponen memakai v-pre dan runtime DOM lama: pertahankan ID DOM dan ikuti features/ terkait.
- Edit sumber frontend, lalu npm run build. Jangan mengedit aset hash hasil build secara manual.
- Jangan membaca/menampilkan kredensial .env, mengubah data operasional, atau restore database produksi untuk pengujian.
- Gunakan test dengan fixture atau database sementara untuk backup/restore.
- Node.js yang dianjurkan: 24; gunakan npm ci sesuai package-lock.json.
- Jangan menyatakan Docker atau cloud sudah diuji langsung jika hanya mock/config yang diperiksa.
- Dokumentasikan perubahan perilaku dan keterbatasan verifikasi.
