# Frontend sumber

Vue 3/Vite. Peta lengkap: `../../../docs/CODE_STRUCTURE.md`.
`main.js` memasang Vue, menunggu markup, lalu menjalankan runtime workspace.

- `workspace/components/`: markup Vue; banyak `v-pre` dengan kontrak ID DOM.
- `workspace/features/`: behavior per modul; baca features/README.md.
- `workspace/runtime.js`: import raw dan urutan classic-script.
- `workspace/source.html`: layout marker dan elemen legacy bersama.
- `workspace/generated/`: output prepare; jangan edit manual.
- `services/`: utilitas dan adapter ES module yang sudah mandiri.
- `styles/`: CSS sumber.

Edit sumber lalu jalankan `npm run build` dari root. Build menulis output public;
sebagian file langsung di frontend/public juga masih merupakan sumber statis.
Jangan melakukan penggantian massal pada seluruh public atau aset hash.
