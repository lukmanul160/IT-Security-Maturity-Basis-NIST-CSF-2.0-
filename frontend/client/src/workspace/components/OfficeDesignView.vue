<template>
<section v-pre id="officeDesignView" class="view office-design">
  <div class="page-heading"><div><p class="eyebrow">ASSET MANAGEMENT</p><h2>Office Design</h2><p class="lede">Susun denah kantor, ruang kerja, dan fasilitas dengan editor 2D.</p></div><button id="odNew" class="button button-accent" type="button">Kanvas baru</button></div>
  <div class="toolbar od-toolbar">
    <label>Kanvas tersimpan <select id="odLayouts" aria-label="Pilih denah"><option value="">Denah belum tersimpan</option></select></label>
    <button id="odReload" class="button button-quiet" type="button">Muat ulang</button>
    <button id="odSettings" class="button button-quiet" type="button">Nama &amp; ukuran</button>
    <button id="odTemplate" class="button button-quiet" type="button">Contoh denah kantor</button>
    <button id="odUndo" class="button button-quiet" type="button">Undo</button>
    <button id="odRedo" class="button button-quiet" type="button">Redo</button>
    <button id="odSave" class="button button-accent" type="button">Simpan kanvas</button>
    <button id="odExport" class="button button-quiet" type="button">Ekspor SVG</button>
    <button id="odDelete" class="button button-danger" type="button">Hapus denah</button>
  </div>
  <p class="muted">Kanvas baru menyimpan perubahan kanvas lama terlebih dahulu. Buka kembali melalui Kanvas tersimpan.</p>
  <p class="muted">Ctrl/Cmd+Z: Undo ? Ctrl+Y / Ctrl/Cmd+Shift+Z: Redo ? Ctrl/Cmd+S: Simpan ? Delete: Hapus objek ? Panah: Geser (Shift: 10 satuan). Tarik pegangan biru di sudut untuk resize, atau lingkaran di atas objek untuk memutar (Shift: 15 derajat).</p>
  <p id="odStatus" class="muted" role="status"></p>
  <div class="od-editor">
    <aside class="od-palette"><h3>Objek denah</h3><p class="muted">Klik untuk menambah.</p><div id="odPalette"></div><label class="od-grid-label"><input id="odSnap" type="checkbox" checked> Snap grid 10</label><p class="muted">Pilih objek lalu geser. Tarik pegangan biru di sudut untuk mengubah ukuran. Tarik lingkaran di atas objek untuk memutar dengan kursor. Tahan Shift untuk kelipatan 15 derajat.</p></aside>
    <div class="od-center"><div class="od-canvas-tools"><strong id="odName">Denah baru</strong><label>Zoom <select id="odZoom"><option value="fit" selected>Pas kanvas</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.5">150%</option></select></label></div><div id="odViewport" class="od-viewport"><svg id="odCanvas" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kanvas denah kantor" tabindex="0"></svg></div><p id="odDimensions" class="muted"></p></div>
    <aside class="od-inspector"><h3>Properti objek</h3><p id="odSelectionHint" class="muted">Pilih objek pada kanvas.</p><form id="odProperties" hidden>
      <label>Label<input name="label" maxlength="120"></label>
      <div class="od-property-grid"><label>X<input name="x" type="number" min="0" required></label><label>Y<input name="y" type="number" min="0" required></label><label>Lebar<input name="width" type="number" min="5" required></label><label>Tinggi<input name="height" type="number" min="5" required></label></div>
      <fieldset id="odCctvProperties" hidden><legend>Pantauan CCTV</legend><label>Jarak pantauan (meter)<input name="coverageRange" type="number" min="0.1" max="100" step="0.1"></label><label>Sudut pantauan (derajat)<input name="coverageAngle" type="number" min="10" max="180"></label><label><input name="showCoverage" type="checkbox"> Tampilkan area pantauan</label><p class="muted">Arah mengikuti rotasi CCTV. Area berupa perkiraan denah; tidak menghitung penghalang atau kualitas gambar kamera.</p></fieldset>
      <label>Rotasi<input name="rotation" type="number" min="0" max="359" step="1" required></label>
      <button class="button button-accent" type="submit">Terapkan</button>
      <div class="od-object-actions"><button id="odDuplicate" class="button button-quiet" type="button">Duplikat</button><button id="odFront" class="button button-quiet" type="button">Ke depan</button><button id="odBack" class="button button-quiet" type="button">Ke belakang</button><button id="odRemove" class="button button-danger" type="button">Hapus objek</button></div>
    </form></aside>
  </div>
  <dialog id="odSettingsModal"><form id="odSettingsForm" class="risk-register-form"><h3>Pengaturan denah</h3><label>Nama denah<input name="name" required maxlength="150"></label><div class="risk-register-text-grid"><label>Lebar kanvas<input name="width" type="number" min="200" max="4000" required></label><label>Tinggi kanvas<input name="height" type="number" min="200" max="4000" required></label></div><label>Skala (satuan kanvas per meter)<input name="unitsPerMeter" type="number" min="1" max="1000" step="0.1" required></label><p class="muted">Default 100 satuan = 1 meter. Sesuaikan skala dengan ukuran denah untuk area pantauan CCTV. Ukuran memakai satuan kanvas. Objek harus berada di dalam batas kanvas.</p><p id="odSettingsStatus" class="muted" role="status"></p><div class="csf-form-actions"><button class="button button-accent" type="submit">Terapkan</button><button id="odSettingsCancel" class="button button-quiet" type="button">Batal</button></div></form></dialog>
</section>
</template>
