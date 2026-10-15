<template>
<div v-pre>
  <section id="reportingRegulatorView" class="view">
    <div class="page-heading"><div><p class="eyebrow">COMPLIANCE</p><h2>Reporting Regulator</h2><p class="lede">Kelola tenggat pelaporan ke regulator, induk perusahaan, dan perusahaan lain.</p></div><button id="complianceReportNew" class="button button-accent" type="button">Tambah pelaporan</button></div>
    <div class="csf-tabs" role="tablist" aria-label="Reporting Regulator" style="margin-bottom:16px">
      <button id="crReportsTab" class="button button-accent" type="button" role="tab" data-cr-tab="reports" aria-controls="crReportsPanel" aria-selected="true">Daftar pelaporan</button>
      <button id="crSmtpTab" class="button button-quiet" type="button" role="tab" data-cr-tab="smtp" aria-controls="crSmtpPanel" aria-selected="false" tabindex="-1">Pengaturan SMTP</button>
    </div>
    <div id="crReportsPanel" role="tabpanel" aria-labelledby="crReportsTab">
    <div class="toolbar"><p id="complianceReportReminderContext" class="muted" role="status">Memuat hubungan pengaturan reminder...</p><button id="complianceReportSettingsLink" class="button button-quiet" type="button">Lihat pengaturan SMTP / reminder</button></div>
    <div class="toolbar"><label class="search-box">Cari <input id="complianceReportSearch" type="search" placeholder="Judul, instansi, atau PIC" aria-label="Cari pelaporan"></label><select id="complianceReportFilter" aria-label="Filter status pelaporan"><option value="">Semua status</option><option>Belum dilaporkan</option><option>Dalam proses</option><option>Sudah dilaporkan</option><option value="overdue">Lewat tenggat</option></select><button id="complianceReportRefresh" class="button button-quiet" type="button">Muat ulang</button></div>
    <p id="complianceReportStatus" class="muted" role="status"></p>
    <div class="excel-wrap"><table class="excel-table"><thead><tr><th>Laporan</th><th>Tujuan</th><th>PIC</th><th>Tenggat</th><th>Status</th><th>Reminder</th><th>Aksi</th></tr></thead><tbody id="complianceReportBody"></tbody></table></div>
    </div>
    <div id="crSmtpPanel" role="tabpanel" aria-labelledby="crSmtpTab" hidden>
      <p id="crSmtpAccess" class="muted" hidden>Pengaturan koneksi SMTP hanya dapat dikelola administrator. Pilihan akun SMTP dan jadwal reminder tersedia pada form pelaporan.</p>
      <div id="crSmtpAdmin" hidden>
  <section id="crReminderPanel" class="insight-panel"><h3>Reminder Reporting Regulator</h3>
    <p id="crReminderLoadStatus" class="muted" role="status" aria-live="polite"></p>
    <button id="crReminderRetry" class="button button-quiet" type="button" hidden>Coba muat pengaturan lagi</button>
    <p id="crReminderConnection" class="muted" role="status"></p>
    <button id="crReminderSmtp" class="button button-quiet" type="button">Kelola koneksi SMTP</button>
    <form id="crReminderForm" class="risk-register-form smtp-settings"><label>Akun SMTP<select id="crReminderAccount"></select></label><div class="smtp-card-heading"><span class="smtp-step">1</span><div><h4>Jadwal &amp; penerima</h4><p>Tentukan kapan dan kepada siapa pengingat dikirim.</p></div></div><div class="risk-register-grid">
      <label><input id="crReminderEnabled" type="checkbox"> Aktifkan reminder pelaporan otomatis</label>
      <label>Ingatkan mulai H-<input id="crReminderDays" type="number" min="0" max="365" value="7" required></label>
      <label>Satuan waktu mulai<select id="crReminderStartUnit"><option value="days">Hari</option><option value="months">Bulan</option></select></label>
      <label><input id="crReminderRepeatDaily" type="checkbox"> Aktifkan pengulangan reminder</label>
      <label><input id="crReminderContinueOverdue" type="checkbox" checked> Terus ulangi setelah tenggat sampai Sudah dilaporkan</label><label><input id="crReminderUnlimited" type="checkbox" checked> Tanpa batas jumlah pengiriman</label><div class="smtp-wide"><button type="button" class="button button-quiet" id="crReminderPreset30">Gunakan H-30 / setiap 5 hari</button><p id="crReminderSchedulePreview" role="status" aria-live="polite"></p></div><label>Ulangi setiap<input id="crReminderRepeatEvery" type="number" min="1" max="365" value="1" required></label>
      <label>Satuan interval<select id="crReminderRepeatUnit"><option value="days">Hari</option><option value="months">Bulan</option></select></label>
      <label>Maksimum jumlah pengiriman<input id="crReminderMaxDeliveries" type="number" min="1" max="366" value="366" required aria-describedby="crReminderMaxHint"><small id="crReminderMaxHint" class="muted">Termasuk pengiriman pertama, per pelaporan dan penerima. Contoh: 3 berarti maksimal 3 kali sesuai interval yang dipilih. Tanpa pengulangan, hanya dikirim sekali.</small></label>
    </div><div class="risk-register-text-grid"><label>Mode penerima<select id="crReminderRecipientMode"><option value="owners">Owner masing-masing pelaporan</option><option value="broadcast">Daftar penerima bersama (konfigurasi lama)</option></select></label><label>Pemetaan PIC = email (satu per baris)<textarea id="crReminderOwners" rows="4" placeholder="PIC IT = pic.it@example.com"></textarea><small class="muted">Email pada pelaporan diprioritaskan. Finding tanpa email atau pemetaan PIC dilewati dalam mode owner.</small></label><label id="crReminderBroadcastField">Email penerima (satu per baris)<textarea id="crReminderRecipients" rows="4" placeholder="auditor@example.com&#10;pic.it@example.com&#10;manager@example.com" aria-describedby="crReminderRecipientsHint"></textarea><small id="crReminderRecipientsHint" class="muted">Contoh: masukkan auditor@example.com pada baris pertama, lalu tekan Enter untuk menambahkan pic.it@example.com pada baris berikutnya. Isi alamat email saja, tanpa nama, tanda koma, titik koma, atau format PIC = email. Ganti alamat contoh dengan email penerima sebenarnya.</small></label></div>
    <p class="muted">Pengaturan ini berlaku untuk pelaporan yang memilih Gunakan pengaturan reminder tab SMTP. Jadwal mengikuti tenggat masing-masing laporan. Pilih interval hari atau bulan; aktifkan Tanpa batas untuk pengulangan tanpa batas jumlah. Reminder berhenti saat laporan Sudah dilaporkan atau pengaturan dinonaktifkan. Email langsung pada laporan diprioritaskan, lalu register penerima dan pemetaan PIC.</p>
    <section class="smtp-card" aria-labelledby="crReminderContentTitle">
      <div class="smtp-card-heading"><span class="smtp-step">2</span><div><h4 id="crReminderContentTitle">Konten email reminder</h4><p>Edit subjek dan isi email yang akan diterima penerima reminder. Pesan dikirim sebagai teks biasa.</p></div></div>
      <div class="smtp-fields">
        <div class="smtp-wide"><button id="crReminderUseTemplate" class="button button-quiet" type="button">Gunakan template standar</button><p>Template berisi ringkasan pelaporan, PIC, tujuan, dan tenggat. Tombol ini mengganti subjek dan isi pada formulir. Anda dapat mengeditnya sebelum menekan Simpan reminder.</p></div>
        <label class="smtp-wide">Subjek email<input id="crReminderSubject" required maxlength="200" aria-describedby="crReminderVariables"></label>
        <label class="smtp-wide">Isi email<textarea id="crReminderBody" required maxlength="10000" rows="10" aria-describedby="crReminderVariables"></textarea></label>
        <div class="smtp-wide" id="crReminderVariables"><p>Teks di dalam {{...}} akan diganti otomatis dengan data pelaporan saat email dikirim. Biarkan nama variabel tetap seperti contoh; kalimat lainnya bebas diedit.</p>
          <div class="excel-wrap"><table class="excel-table"><thead><tr><th>Variabel</th><th>Diisi otomatis dengan</th><th>Contoh</th></tr></thead><tbody>
            <tr><td><code>{{recipient}}</code></td><td data-translate-ui>Jenis / judul audit</td><td data-translate-ui>Audit Keamanan Informasi</td></tr>
            <tr><td><code>{{reportTitle}}</code></td><td data-translate-ui>Judul laporan</td><td data-translate-ui>Laporan berkala belum dikirim</td></tr>
            <tr><td><code>{{owner}}</code></td><td data-translate-ui>PIC pelaporan</td><td data-translate-ui>PIC Compliance</td></tr>
            <tr><td><code>{{status}}</code></td><td data-translate-ui>Status pelaporan</td><td data-translate-ui>Open</td></tr>
            <tr><td><code>{{dueDate}}</code></td><td data-translate-ui>Tanggal tenggat (tahun-bulan-tanggal)</td><td>2026-12-31</td></tr>
            <tr><td><code>{{description}}</code></td><td data-translate-ui>Deskripsi / rekomendasi pelaporan</td><td data-translate-ui>Siapkan laporan dan perbarui status setelah dikirim.</td></tr>
          </tbody></table></div><p>Contoh: "Mohon {{owner}} menyelesaikan temuan sebelum {{dueDate}}." menjadi "Mohon PIC Compliance menyelesaikan temuan sebelum 2026-12-31." PIC yang disebut dalam isi tidak mengubah daftar email penerima.</p>
        </div>
        <div class="smtp-wide"><h4>Pratinjau dengan data contoh</h4><strong id="crReminderPreviewSubject"></strong><pre id="crReminderPreviewBody" style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.7;background:#f3f8f5;padding:16px;border-radius:8px"></pre></div>
      </div>
    </section>
    <div class="csf-form-actions"><button id="crReminderSave" class="button button-accent" type="submit">Simpan reminder</button><button id="crReminderReload" class="button button-quiet" type="button">Muat ulang pengaturan</button></div></form>
    <div class="toolbar"><label>Email tujuan percobaan<input id="crReminderTestTo" type="email" placeholder="nama.anda@example.com" aria-describedby="crReminderTestHint"><small id="crReminderTestHint" class="muted">Simpan perubahan terlebih dahulu. Email percobaan menggunakan konten tersimpan dengan data contoh pada pratinjau. Isi satu alamat email Anda untuk menerima email contoh melalui SMTP Admin. Tombol ini langsung mengirim email percobaan; penerima reminder otomatis tidak berubah.</small></label><button id="crReminderTest" class="button button-quiet" type="button">Kirim email percobaan</button></div>
    <p id="crReminderStatus" class="save-state" role="status" aria-live="polite"></p>
  </section>

        <div class="toolbar"><label>Akun SMTP <select id="crSmtpAccount" aria-label="Pilih akun SMTP"></select></label><button id="crSmtpReload" class="button button-quiet" type="button">Muat ulang akun</button><button id="crSmtpAdd" class="button button-quiet" type="button">Tambah akun SMTP</button></div>
        <form id="crSmtpForm" class="risk-register-form">
          <h3>Koneksi email reminder pelaporan</h3>
          <p class="muted">Akun SMTP tersimpan terpusat. Perubahan akun yang sama juga berlaku untuk modul lain yang menggunakannya. Pilih akun ini pada form pelaporan.</p>
          <div class="risk-register-text-grid">
            <label>Nama akun<input name="name" maxlength="100" required></label>
            <label>Host SMTP<input name="host" maxlength="254" required autocomplete="off"></label>
            <label>Port<input name="port" type="number" min="1" max="65535" value="587" required></label>
            <label>Keamanan<select name="security"><option value="starttls">STARTTLS</option><option value="tls">TLS</option></select></label>
            <label>Username<input name="username" maxlength="254" autocomplete="off"></label>
            <label>Password<input name="password" type="password" maxlength="4096" autocomplete="new-password"></label>
            <label>Email pengirim<input name="from" type="email" maxlength="254" required></label>
          </div>
          <label class="compliance-checkbox"><input name="clearPassword" type="checkbox"> Hapus password tersimpan</label>
          <div class="csf-form-actions"><button class="button button-accent" type="submit">Simpan akun SMTP</button></div>
        </form>
        <div class="toolbar"><label>Email tujuan percobaan <input id="crSmtpTestTo" type="email" maxlength="254" placeholder="Email penerima tes"></label><button id="crSmtpTest" class="button button-quiet" type="button">Kirim email percobaan</button></div>
        <p id="crSmtpStatus" class="muted" role="status"></p>
      </div>
    </div>
    <dialog id="complianceReportModal"><form id="complianceReportForm" class="risk-register-form">
      <h3 id="complianceReportFormTitle">Tambah pelaporan</h3><input name="id" type="hidden">
      <div class="risk-register-text-grid">
        <label>Judul laporan<input name="title" required maxlength="200"></label>
        <label>Jenis tujuan<select name="recipientType"><option>Regulator</option><option>Induk perusahaan</option><option>Perusahaan lain</option></select></label>
        <label>Instansi / perusahaan tujuan<input name="recipient" required maxlength="200"></label>
        <label>PIC penanggung jawab<input name="owner" required maxlength="160"></label>
        <div id="complianceReportOwnerPicker" class="smtp-wide"></div>
        <label>Tenggat pelaporan<input name="dueDate" type="date" required></label>
        <label>Status<select name="status"><option>Belum dilaporkan</option><option>Dalam proses</option><option>Sudah dilaporkan</option></select></label>
      </div>
      <label>Catatan / detail pelaporan<textarea name="notes" rows="3" maxlength="4000"></textarea></label>
      <fieldset><legend>Bukti pelaporan</legend>
        <label>Upload bukti setelah pelaporan selesai<input id="complianceReportFiles" name="files" type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp"></label>
        <p id="complianceReportFilesHint" class="muted">Pilih status Sudah dilaporkan untuk mengunggah bukti. Maksimum 10 file per pelaporan, masing-masing 10 MB.</p>
        <div id="complianceReportExistingFiles"></div>
      </fieldset>
      <fieldset><legend>Reminder email</legend>
        <label class="compliance-checkbox"><input name="useGlobalReminder" type="checkbox" checked> Ikuti pengaturan SMTP / reminder bersama</label>
        <p id="complianceReportReminderSummary" class="muted" role="status"></p>
        <label>Email penerima pengganti (opsional)<input name="reminderEmail" type="email" maxlength="254" placeholder="Kosongkan untuk memakai email PIC dari register SMTP"></label>
        <div id="complianceReportLocalReminder" hidden>
          <p class="muted">Pengaturan khusus ini berlaku jika pilihan Ikuti pengaturan SMTP / reminder bersama dimatikan.</p>
          <label class="compliance-checkbox"><input name="reminderEnabled" type="checkbox"> Aktifkan reminder khusus laporan ini</label>
          <div class="risk-register-text-grid">
            <label>Mulai H- (hari)<input name="daysBefore" type="number" min="0" max="365" value="7" required></label>
            <label>Akun SMTP<select name="smtpAccountId"><option value="default">SMTP bawaan</option></select></label>
          </div>
          <label class="compliance-checkbox"><input name="repeatDaily" type="checkbox"> Ulangi setiap hari</label>
          <label class="compliance-checkbox"><input name="continueOverdue" type="checkbox"> Terus ulangi setelah tenggat sampai Sudah dilaporkan</label>
          <p id="complianceSmtpStatus" class="muted" role="status"></p>
        </div>
      </fieldset>
      <p id="complianceReportFormStatus" class="muted" role="status"></p>
      <div class="csf-form-actions"><button class="button button-accent" type="submit">Simpan</button><button id="complianceReportCancel" class="button button-quiet" type="button">Batal</button></div>
    </form></dialog>
  </section>
  <section id="narahubungView" class="view">
    <div class="page-heading"><div><p class="eyebrow">COMPLIANCE</p><h2>Narahubung</h2><p class="lede">Daftar nomor penting dan kontak instansi, layanan darurat, serta mitra perusahaan.</p></div><button id="complianceContactNew" class="button button-accent" type="button">Tambah narahubung</button></div>
    <div class="toolbar"><label class="search-box">Cari <input id="complianceContactSearch" type="search" placeholder="Contoh: damkar, rumah sakit, regulator" aria-label="Cari narahubung"></label><button id="complianceContactRefresh" class="button button-quiet" type="button">Muat ulang</button></div>
    <p id="complianceContactStatus" class="muted" role="status"></p>
    <div class="excel-wrap"><table class="excel-table"><thead><tr><th>Instansi / layanan</th><th>Kategori</th><th>Narahubung</th><th>Telepon</th><th>Email</th><th>Catatan</th><th>Aksi</th></tr></thead><tbody id="complianceContactBody"></tbody></table></div>
    <dialog id="complianceContactModal"><form id="complianceContactForm" class="risk-register-form">
      <h3 id="complianceContactFormTitle">Tambah narahubung</h3><input name="id" type="hidden">
      <div class="risk-register-text-grid">
        <label>Nama instansi / layanan<input name="name" required maxlength="200" placeholder="Contoh: Damkar setempat"></label>
        <label>Kategori<input name="category" maxlength="100" placeholder="Layanan darurat, regulator, vendor, ..."></label>
        <label>Nama narahubung<input name="person" maxlength="160"></label>
        <label>Nomor telepon<input name="phone" type="tel" required maxlength="60" placeholder="Nomor telepon instansi / layanan"></label>
        <label>Email<input name="email" type="email" maxlength="254"></label>
      </div>
      <label>Alamat / wilayah / jam layanan / catatan<textarea name="notes" rows="3" maxlength="4000"></textarea></label>
      <p id="complianceContactFormStatus" class="muted" role="status"></p>
      <div class="csf-form-actions"><button class="button button-accent" type="submit">Simpan</button><button id="complianceContactCancel" class="button button-quiet" type="button">Batal</button></div>
    </form></dialog>
  </section>
</div>
</template>
