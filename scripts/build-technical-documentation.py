"""Build offline technical documentation and vector/raster diagrams from local source.
Run node scripts/document-api-catalog.js first. Does not read .env or application records.
"""
from pathlib import Path
import json, re, html, math, zipfile
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/technical-documentation'
IMAGES = OUT / 'images'
IMAGES.mkdir(parents=True, exist_ok=True)
DATE = '9 Oktober 2026'
catalog = json.loads((OUT / 'api-catalog.json').read_text(encoding='utf-8'))
pkg = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))

def save(name, content):
    (OUT / name).write_text(content.strip() + '\n', encoding='utf-8')

def table(headers, rows):
    clean = lambda v: str(v).replace('|', '\\|').replace('\n', ' ')
    return '\n'.join(['| ' + ' | '.join(headers) + ' |', '| ' + ' | '.join(['---'] * len(headers)) + ' |'] + ['| ' + ' | '.join(map(clean, row)) + ' |' for row in rows])

class Diagram:
    """One layout rendered as scalable SVG and 2x PNG with identical labels."""
    def __init__(self, name, title, subtitle, width=1400, height=850):
        self.name, self.w, self.h = name, width, height
        self.im = Image.new('RGB', (width * 2, height * 2), '#f4f7fb')
        self.draw = ImageDraw.Draw(self.im)
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img"><title>{html.escape(title)}</title><rect width="100%" height="100%" fill="#f4f7fb"/>']
        self.text(40, 28, title, 30, '#102d4c', True)
        self.text(40, 72, subtitle, 16, '#536b83')
    def font(self, size, bold=False):
        filename = 'arialbd.ttf' if bold else 'arial.ttf'
        return ImageFont.truetype(str(Path('C:/Windows/Fonts') / filename), size * 2)
    def text(self, x, y, text, size=17, color='#243f61', bold=False):
        self.draw.text((x * 2, y * 2), text, fill=color, font=self.font(size, bold))
        self.svg.append(f'<text x="{x}" y="{y+size}" font-family="Arial,sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{html.escape(text)}</text>')
    def box(self, x, y, w, h, title, lines=(), accent='#1c6da1'):
        self.draw.rounded_rectangle((x*2,y*2,(x+w)*2,(y+h)*2),radius=20,fill='white',outline='#c8d6e5',width=2)
        self.draw.rounded_rectangle((x*2,y*2,(x+w)*2,(y+7)*2),radius=6,fill=accent)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="white" stroke="#c8d6e5"/><path d="M{x+10},{y+4} H{x+w-10}" stroke="{accent}" stroke-width="7"/>')
        self.text(x+16,y+17,title,19,accent,True)
        for i, line in enumerate(lines): self.text(x+16,y+49+i*26,line,15)
    def arrow(self, points, label='', lx=None, ly=None):
        self.draw.line([(x*2,y*2) for x,y in points],fill='#5d7d9b',width=4)
        x,y=points[-1]; px,py=points[-2]; angle=math.atan2(y-py,x-px)
        tip=[(x,y),(x-12*math.cos(angle-.4),y-12*math.sin(angle-.4)),(x-12*math.cos(angle+.4),y-12*math.sin(angle+.4))]
        self.draw.polygon([(a*2,b*2) for a,b in tip],fill='#5d7d9b')
        self.svg.append('<polyline points="'+' '.join(f'{a},{b}' for a,b in points)+'" fill="none" stroke="#5d7d9b" stroke-width="2"/><polygon points="'+' '.join(f'{a},{b}' for a,b in tip)+'" fill="#5d7d9b"/>')
        if label: self.text(lx if lx is not None else (points[0][0]+x)/2+8,ly if ly is not None else (points[0][1]+y)/2-22,label,14,'#536b83')
    def finish(self):
        self.text(40,self.h-35,'NIST Basis / BLACKOWL | Source workspace | 09-10-2026 | Tidak memuat data atau kredensial produksi',13,'#617b93')
        self.svg.append('</svg>')
        (IMAGES/(self.name+'.svg')).write_text('\n'.join(self.svg),encoding='utf-8')
        self.im.save(IMAGES/(self.name+'.png'),optimize=True)

d=Diagram('01-architecture','Arsitektur aplikasi dan integrasi','Implementasi saat ini: modular monolith; frontend dan API pada origin yang sama.')
d.box(40,145,285,145,'Browser / pengguna',['Vue 3 + workspace runtime','Assessment, risiko, aset, vault','Bahasa Indonesia / English'])
d.box(420,145,480,160,'Node.js / Express 5',['Autentikasi cookie + izin per aksi','Routes -> controllers -> services','Validasi, transaksi, audit, upload'])
d.box(1010,145,345,145,'PostgreSQL',['Register dan relasi + JSONB','Evidence metadata + byte foto','Permission, audit, konfigurasi'])
d.arrow([(325,217),(420,217)],'HTTP / API',330,185)
d.arrow([(900,217),(1010,217)],'SQL',922,185)
d.box(420,425,290,170,'Penyimpanan file',['Lokal / folder NAS','AWS S3 / Google Cloud','Lokasi asal per file dipertahankan'])
d.box(765,425,260,170,'Scheduler internal',['Renewal aset','Review kebijakan','Audit finding reminder'])
d.box(1090,425,260,170,'SMTP terpusat',['TLS / STARTTLS','Akun email terpilih','Template pesan per modul'])
d.arrow([(535,305),(535,425)],'file',549,347)
d.arrow([(820,305),(820,425)],'pengingat',834,347)
d.arrow([(1025,505),(1090,505)],'email',1030,471)
d.box(40,425,290,170,'File operasional',['upload/ + backup/','data/smtp-secret.key','data/audit-pending/'])
d.arrow([(420,512),(330,512)])
d.box(420,660,605,100,'Backup / restore',['Database dump + ZIP file + salinan konfigurasi dan kunci'])
d.arrow([(540,595),(540,660)])
d.finish()

d=Diagram('02-deployment','Deployment Docker dan jaringan','Konfigurasi Compose aktual; reverse proxy HTTPS adalah rancangan produksi opsional.')
d.box(40,155,300,145,'Client browser',['Jaringan pengguna','HTTP lokal / HTTPS produksi'])
d.box(440,155,340,145,'Host / reverse proxy',['Default: 127.0.0.1:5000','Opsional proxy TLS :443','Proxy harus menjaga Host'])
d.box(890,155,420,145,'Container app',['IT_Governance_BLACKOWL','Node 24 / port internal 8000','Runtime non-root: node'])
d.arrow([(340,227),(440,227)],'HTTP(S)',347,191)
d.arrow([(780,227),(890,227)],'5000 -> 8000',783,191)
d.box(890,415,420,160,'Container database',['BlackOwl_DB_Gov','postgres:17-bookworm / 5432','Internal network; port tidak dipublikasi'])
d.arrow([(1100,300),(1100,415)],'SQL internal',1115,340)
d.box(40,415,690,165,'Named volumes persisten',['postgres_data -> /var/lib/postgresql/data','app_data -> /app/data; uploads -> /app/upload','backups -> /app/backup; down -v menghapus volume'])
d.arrow([(890,488),(730,488)],'persistensi',742,454)
d.box(40,660,570,90,'Eksternal opsional',['SMTP / NAS / S3 / GCS sesuai konfigurasi'])
d.box(745,660,565,90,'Healthcheck',['App: GET /login; DB: pg_isready'])
d.finish()

d=Diagram('03-api-flow','Alur API, autentikasi, dan otorisasi','Pipeline aktual: API diaudit; sesi dan pembatas permintaan berada dalam proses aplikasi.')
boxes=[(40,150,'1. Request',['JSON / multipart','Cookie nist_session']), (385,150,'2. Middleware global',['Header keamanan + audit','JSON 10 MB + origin']), (730,150,'3. Autentikasi',['Session aktif / 8 jam','Login via bcrypt'])]
for x,y,title,lines in boxes:d.box(x,y,285,135,title,lines)
d.arrow([(325,217),(385,217)]);d.arrow([(670,217),(730,217)])
d.box(730,390,285,145,'4. Izin dan upload',['Read / Create / Update / Delete','Kepemilikan evidence','4 upload aktif / 2 per akun'])
d.arrow([(873,285),(873,390)])
d.box(385,390,285,145,'5. Domain service',['Validasi payload / referensi','SQL parameterized','BEGIN / COMMIT / ROLLBACK'])
d.arrow([(730,465),(670,465)])
d.box(40,390,285,145,'6. Penyimpanan',['PostgreSQL / file storage','Konflik versi -> 409','Batas ukuran -> 413'])
d.arrow([(385,465),(325,465)])
d.box(40,650,975,100,'7. Response dan audit',['JSON / stream file / 204; requestId pada error global; recovery audit ketika database gagal'])
d.arrow([(180,535),(180,650)])
d.finish()

d=Diagram('04-data-relations','Relasi data inti','Garis menunjukkan relasi inti; seluruh tabel dan migrasi dijelaskan di kamus data.',1500,960)
d.box(40,140,355,145,'TPRM vendor',['tprm_risk_register','questionnaire_id -> vendor assessment','asset FK: delete RESTRICT'])
d.box(565,140,365,145,'Asset register',['managed_assets: UUID + data JSONB','managed_vendor_id: generated FK','tag UNIQUE; CIA dalam data'])
d.box(1100,140,350,145,'Risk register',['risk_register: risk_id TEXT','asset_related_risks','tprm_related_risks'])
d.arrow([(565,210),(395,210)],'vendor',425,175)
d.arrow([(930,210),(1100,210)],'many-to-many',947,175)
d.box(40,410,355,150,'Rak dan posisi',['asset_racks: 1-60 U','asset_rack_devices: asset_id PK','FK asset/rack: RESTRICT'])
d.box(565,410,365,150,'Relasi / layout / foto',['asset_relations: FK source / target','asset_diagram_layout: nodes + version','managed_asset_photos / rack photos'])
d.arrow([(640,285),(640,410)],'asset',655,329)
d.arrow([(565,235),(480,235),(480,480),(395,480)])
d.box(1100,410,350,150,'Library evidence',['evidence_files: path PK','uploaded_by -> app_users','file_storage_locations: path'])
d.arrow([(930,480),(1100,480)],'evidence_path',944,444)
d.box(40,690,355,145,'Policy register',['policy_register + items','related_note_ids JSONB','Referensi note diperiksa aplikasi'])
d.box(565,690,365,145,'Knowledge Vault',['knowledge_notes: folder/title UNIQUE','knowledge_note_folders','knowledge_note_images + evidence_path'])
d.box(1100,690,350,145,'Identitas dan audit',['app_users + role_permissions','audit_events; scheduler deliveries','Personel -> certifications'])
d.arrow([(395,760),(565,760)],'link logis',433,725)
d.arrow([(930,760),(1040,760),(1040,520),(1100,520)])
d.finish()

d=Diagram('05-asset-lifecycle','Siklus hidup aset, penempatan, dan risiko','Proses mengikuti prinsip ITSM; referensi change/tiket opsional, tanpa approval engine eksternal.')
for x,title,lines in [(40,'Registrasi',['Tag unik / owner / vendor','CIA + tanggal renewal','Foto depan / belakang']), (480,'Operasional',['planned -> in-stock -> in-use','maintenance bila perlu','Pasang / pindah melalui modal']), (950,'Retirement',['Lepaskan posisi dan relasi','retired / disposed','Hapus sesuai izin'])]:d.box(x,155,370,165,title,lines)
d.arrow([(410,235),(480,235)]);d.arrow([(850,235),(950,235)])
d.box(40,450,370,160,'Penempatan rak',['1 perangkat = 1 posisi','Start U + tinggi + orientasi','Overlap dicegah; full / single side'])
d.box(480,450,370,160,'Penilaian CIA otomatis',['Dampak = max(C, I, A)','Skor = dampak x kemungkinan','1-4 Low; 5-12 Medium; 15-25 High'])
d.box(950,450,370,160,'Renewal dan dependensi',['Scheduler tiap jam','Email sesuai SMTP/template','Relasi diagram dari asset register'])
d.arrow([(220,320),(220,450)]);d.arrow([(665,320),(665,450)]);d.arrow([(1135,320),(1135,450)])
d.text(40,700,'Semua perubahan register melalui modal; backend tetap memvalidasi ulang data dan hak akses.',19,'#102d4c',True)
d.finish()

d=Diagram('06-backup-recovery','Cakupan backup dan urutan pemulihan','Database, file, dan konfigurasi adalah artefak yang berbeda dan perlu dipulihkan bersama.')
d.box(40,150,390,165,'A. Database dump',['pg_dump --format=custom','Seluruh tabel / sequence / trigger','Termasuk byte asli foto aset/vault'])
d.box(505,150,390,165,'B. File Backup ZIP',['evidence_files + manifest','Lokal / NAS / S3 / GCS','Seluruh folder atau subtree'])
d.box(970,150,390,165,'C. Konfigurasi / kunci',['Environment server secara terpisah','data/smtp-secret.key','Kredensial cloud / koneksi storage'])
d.box(40,455,390,145,'1. Siapkan target',['Versi PostgreSQL kompatibel','Storage dan akses tersedia','Hentikan aktivitas mutasi'])
d.box(505,455,390,145,'2. Restore database',['Admin; seluruh sesi dicabut','Data dan referensi kembali','Login dengan akun hasil restore'])
d.box(970,455,390,145,'3. Restore file + validasi',['File ZIP ke storage aktif','Pulihkan kunci / konfigurasi','Cek foto, evidence, izin, SMTP'])
d.arrow([(235,315),(235,455)]);d.arrow([(430,527),(505,527)]);d.arrow([(895,527),(970,527)])
d.arrow([(700,315),(700,365),(1165,365),(1165,455)])
d.text(40,700,'ZIP file tidak memulihkan record bisnis. Dump database tidak mencakup seluruh file eksternal atau kunci SMTP.',18,'#102d4c',True)
d.finish()

save('00-README.md', f'''# Dokumentasi teknis NIST Basis / BLACKOWL

Tanggal pemeriksaan: **{DATE}**, zona waktu Asia/Bangkok. Basis: source workspace saat ini, termasuk perubahan lokal. Dokumentasi berbahasa Indonesia; nama field, enum, dan endpoint dipertahankan sesuai kode.

## Isi paket

- [Infrastruktur](01-INFRASTRUCTURE.md): runtime, Docker, jaringan, volume, environment, integrasi, dan operasional.
- [Aplikasi](02-APPLICATION.md): modul, struktur kode, alur bisnis, lifecycle, hak akses, dan frontend.
- [API](03-API.md): seluruh **{catalog['endpointCount']} endpoint HTTP API** dari 24 kelompok, autentikasi, input, response, dan contoh.
- [Database dan relasi](04-DATABASE.md): tabel, kolom, foreign key, constraint, JSONB, serta migrasi.
- [Keamanan dan praktik rekayasa](05-SECURITY.md): temuan, perbaikan, kontrol yang ada, dan batas verifikasi.
- [Operasi dan pengujian](06-OPERATIONS.md): instalasi, rilis, backup, restore, troubleshooting, dan quality gate.
- [Lampiran implementasi API](07-API-IMPLEMENTATION.md): deklarasi route dan kontrak handler dari source untuk setiap endpoint.
- [Katalog API JSON](api-catalog.json): inventaris yang dapat diproses alat lain; bukan spesifikasi OpenAPI hasil validasi schema.
- [Paket dokumentasi ZIP](NIST-Basis-Documentation-2026-10-09.zip): seluruh dokumen dan diagram.
- [Dokumen PDF](NIST-Basis-Dokumentasi-Teknis.pdf): siap dibaca dan dicetak.
- [Dokumen HTML lengkap](NIST-Basis-Dokumentasi-Teknis.html): dapat dibuka offline dan dicetak.

Folder `images/` menyediakan enam diagram dalam **SVG** untuk kualitas vektor dan **PNG resolusi 2x** untuk presentasi. Diagram menampilkan arsitektur aktual, bukan data perangkat atau topologi produksi pengguna.

## Cakupan dan cara memperbarui

Inventaris API dibaca dari router Express yang terdaftar, termasuk route aset yang dibentuk dengan loop. Kamus database berasal dari DDL dan migrasi source; bukan dump database produksi. Kredensial, isi `.env`, record bisnis, dan upload pengguna tidak disertakan.

Jalankan dari root proyek:

```powershell
node scripts/document-api-catalog.js
python scripts/build-technical-documentation.py
```

Generator gambar membutuhkan Pillow dan font Arial pada Windows. PDF dibuat dari HTML melalui browser. Perubahan setelah tanggal pemeriksaan perlu regenerasi dan review. Rancangan produksi/peningkatan diberi label **rekomendasi**, sehingga tidak dianggap sudah terpasang.
''')

save('01-INFRASTRUCTURE.md', '''# Detail infrastruktur

![Arsitektur](images/01-architecture.svg)

## Topologi aktual

Aplikasi adalah modular monolith. Satu proses Express menyajikan halaman publik, workspace Vue hasil build, REST API, dan scheduler. PostgreSQL menyimpan data operasional. Penyimpanan file dapat lokal, folder shared/NAS, S3, atau GCS; SMTP bersifat opsional. Tidak terdapat Redis, message broker, service mesh, Kubernetes, atau load balancer bawaan dalam konfigurasi repository.

| Komponen | Implementasi | Lokasi konfigurasi |
| --- | --- | --- |
| Backend | Node.js; Express 5; pool `pg` | `src/server.js`, `src/app.js` |
| Frontend | Vue 3, Vite, Tailwind, Tiptap, DOMPurify | `frontend/client/`, `package.json` |
| Database | PostgreSQL; Docker major 17 | `compose.yaml`, `src/config/database.js` |
| Build Docker | Node 24 trixie slim, multi-stage | `Dockerfile` |
| Runtime Docker | Non-root `node`, client PostgreSQL 17 | `Dockerfile` |
| SMTP | Nodemailer, TLS/STARTTLS, akun terpusat | `src/services/smtpService.js` |
| Backup database | `pg_dump`, `pg_restore`; custom dump | `src/services/backupService.js` |
| Backup file | ZIP + manifest; baca storage sesuai asal file | `src/services/fileBackupService.js` |

## Docker, port, dan volume

![Deployment](images/02-deployment.svg)

Project Compose bernama `it_governance_blackowl`. Container app `IT_Governance_BLACKOWL`, container DB `BlackOwl_DB_Gov`. Aplikasi menunggu healthcheck database sebelum dijalankan; restart policy `unless-stopped`, app `init: true`, grace period 30 detik.

| Koneksi | Default | Keterangan |
| --- | --- | --- |
| Browser -> host | `127.0.0.1:5000` | `BLACKOWL_BIND_IP`, `BLACKOWL_PORT` dapat diubah |
| Host -> app | Host 5000 -> container 8000 | Server Express `PORT=8000` |
| App -> DB | `db:5432` | Port DB tidak dipublikasikan ke host |
| Dev frontend | 5173 -> backend 8000 | Proxy Vite untuk API dan aset terkait |
| SMTP | 587 default | Port akun dapat dikonfigurasi; STARTTLS default |

| Named volume | Mount | Isi yang harus persisten |
| --- | --- | --- |
| `postgres_data` | `/var/lib/postgresql/data` | Cluster PostgreSQL |
| `app_data` | `/app/data` | Seed, kunci SMTP, antrean audit |
| `uploads` | `/app/upload` | File lokal dan staging `.incoming` |
| `backups` | `/app/backup` | Dump database; ZIP pada `backup/files` |

`docker compose down` mempertahankan named volume. `down -v` menghapusnya. Folder NAS dan credential cloud harus dipasang/disediakan pada runtime jika digunakan; Compose saat ini belum memasangnya otomatis.

## Environment dan konfigurasi

Nilai berikut berasal dari konfigurasi kode atau contoh Docker; nilai rahasia deployment tidak dibaca atau dicantumkan.

| Variable | Default / fungsi |
| --- | --- |
| `NODE_ENV` | `development`; Docker `production` |
| `PORT` | 8000 |
| `DATABASE_URL` | Alternatif connection string pada pool utama |
| `DB_HOST`, `DB_PORT` | localhost, 5432; Compose host `db` |
| `DB_NAME`, `DB_USER` | Native `nist_basis`, `postgres`; Compose `BlackOwl_DB_Gov`, `blackowl` |
| `DB_PASSWORD` | Tidak ada password bawaan pada env config; wajib isi sesuai DB |
| `DB_SSL` | `true` untuk TLS; default false |
| `DB_SSL_REJECT_UNAUTHORIZED` | Verifikasi sertifikat aktif kecuali diset false |
| `DB_SSL_CA` | CA tambahan bila diperlukan |
| `SESSION_COOKIE_SECURE` | Production true kecuali eksplisit false; dev false kecuali true |
| `LOG_HTTP_REQUESTS` | true mengaktifkan log request; gunakan saat troubleshooting |
| `PG_DUMP_PATH`, `PG_RESTORE_PATH` | Override executable client PostgreSQL |
| `BLACKOWL_DB_PASSWORD` | Wajib untuk Compose |
| `BLACKOWL_PORT`, `BLACKOWL_BIND_IP` | 5000, 127.0.0.1 |
| `BLACKOWL_COOKIE_SECURE` | false untuk HTTP lokal; true untuk HTTPS |
| `TZ` | Compose Asia/Bangkok; reminder aset juga eksplisit menggunakan zona ini |
| AWS credential chain | Diberikan ke runtime server, tidak melalui UI |
| GCS Application Default Credentials | Diberikan ke runtime server, tidak melalui UI |

Pool database: maksimum 10 koneksi, idle timeout 30 detik, connection timeout 5 detik. Provisioning script masih membaca `DB_*`; ketika memilih `DATABASE_URL`, pastikan `DB_*` provisioning menunjuk database yang sama. Jangan mengasumsikan kedua mekanisme otomatis identik.

## Penyimpanan dan integrasi

Setelan aktif di `file_storage_settings`; setiap file menyimpan lokasi asal melalui `file_storage_locations`. Pergantian mode hanya menentukan lokasi upload baru, tidak memigrasikan file lama. Penggantian/download file lama tetap memakai lokasi asal. Kegagalan cloud tidak dialihkan diam-diam ke lokal.

SMTP menyimpan ciphertext AES-256-GCM di database; kunci berada di `data/smtp-secret.key`. Salinan database saja tidak cukup untuk mendekripsi password setelah pindah host. Pertahankan kunci yang sesuai dan ACL hanya untuk akun server.

## Kapasitas dan observabilitas

Healthcheck container app: `GET /login`, interval 30 detik, timeout 5 detik, start period 120 detik. Ini mengecek respons HTTP, bukan seluruh kesiapan DB. Database: `pg_isready` interval 5 detik. `/api/health` dan `/api/health/db` membutuhkan login.

Log tersedia pada stdout/stderr; audit di `audit_events`, fallback pada `data/audit-pending`. Scheduler aset memeriksa startup dan tiap jam; recovery audit mencoba ulang tiap 30 detik. Antrean audit maksimum 1000 file, 128 KiB per event; 100 event per putaran recovery.

**Rekomendasi produksi:** HTTPS melalui reverse proxy, database dan storage di jaringan terbatas, satu instance app sampai sesi/limiter menjadi shared, backup off-host, monitoring error dan kapasitas disk, serta proses restore rehearsal. Ukuran CPU/RAM/disk harus ditentukan lewat uji beban jumlah aset, catatan, upload, dan concurrency; repository tidak menetapkan sizing teruji atau target RTO/RPO.

Sumber: `compose.yaml`, `Dockerfile`, `docker.env.example`, `src/config/`, `src/services/storageService.js`, `cloudStorageService.js`, `smtpService.js`, `auditRecoveryService.js`.
''')

save('02-APPLICATION.md', '''# Detail aplikasi dan struktur kode

## Lapisan dan tanggung jawab

| Lapisan | Path | Tanggung jawab |
| --- | --- | --- |
| Bootstrap | `src/server.js` | Provision DB, DDL/seed, folder, listen, scheduler |
| HTTP | `src/app.js` | Header, audit, parser, origin, session, routing, static, errors |
| Routes | `src/routes/` | Method/path, izin, parameter, multipart |
| Controllers | `src/controllers/` | Konversi request/response; sebagian modul memakai handler inline |
| Domain services | `src/services/` | Validasi bisnis, SQL, transaksi, storage, SMTP, backup |
| Shared contracts | `src/shared/` | Skor CIA, stencil diagram, aturan bersama |
| SQL | `database/` | Schema dasar, akun, ownership, migrasi relasi |
| Vue UI | `frontend/client/src/workspace/components/` | Tampilan fitur dan modal |
| Runtime fitur | `frontend/client/src/workspace/features/` | Logika DOM untuk fitur kompatibilitas |
| Runtime loader | `frontend/client/src/workspace/runtime.js` | Import raw JS berurutan dan shared scope |
| Generated assets | `frontend/public/vue/` | Hasil build; jangan diedit langsung |
| Quality tools | `test/`, `scripts/` | Unit, integrasi, browser, provisioning dan generator |

Frontend memakai dua pola: komponen Vue reaktif (antara lain Asset Management, Knowledge Notes, Threat Modelling) dan komponen DOM statis yang dikelola runtime lama. Urutan loader dan ID DOM merupakan kontrak kompatibilitas. Shared scope belum memberikan isolasi state per modul seperti modul Vue murni; refaktor bertahap memerlukan pengujian regresi.

## Inventaris fitur

| Modul | Kapabilitas dan hubungan |
| --- | --- |
| NIST CSF 2.0 | Kontrol, policy/practice score, catatan, attachment, ringkasan fungsi |
| NIST Privacy | Kontrol privasi dan assessment state tersendiri |
| Framework / ISO 27001 | Framework, kontrol, target kategori, security objectives |
| SOA | Applicability dan evidence kontrol ISO |
| Risk Management | Risk register, CIA 5x5, inherent/residual risk, treatment, dropdown, indikator |
| Risk Acceptance | Form keputusan, mitigasi, tanggal, bidang tanda tangan, export PDF |
| Asset Register | Identitas, lifecycle, owner, CIA, vendor pengelola opsional, related risk, renewal, foto |
| Rak Server | Rak 1-60 U, front/rear, full/single depth, install/move, drag/drop, daftar perangkat |
| Modelling Asset Register | Kanvas relasi berarah, palette register, multi-edge, zoom, versi layout |
| Knowledge Vault | Folder/subfolder, Markdown/editor, wiki-link/search, gambar, import/export ZIP/JSON |
| Policy Register | Kebijakan, item isi, lampiran, related notes, review, kalender, reminder |
| TPRM | Vendor assessment, risk register vendor, tiering, linked risks, status hubungan |
| Due Diligence / Templates | Respons kuesioner dan template sections/questions |
| Audit Finding Tracker | Hierarki audit -> finding -> followup/evidence, lampiran dan reminder |
| Personel / Sertifikasi | Pegawai terdaftar, supervisor, sertifikasi, roadmap dan layout |
| Uploaded Files | Daftar pusat semua modul, owner, pencarian, download, replacement, delete referensi |
| Administrasi | Akun, izin per aksi, SMTP, storage, audit, DB/file backup |

## Startup dan data sharing

Startup memprovision DB, menyiapkan schema/seed, memigrasikan store modul, membuat folder dan memulai scheduler. Startup melakukan penulisan database, sehingga tidak dipakai sebagai healthcheck dokumentasi. Assessment CSF ber-ID `default`; Privacy `privacy`. Keduanya merupakan dokumen bersama, bukan partition per pengguna. Aplikasi belum menyediakan tenancy/organisasi terisolasi secara menyeluruh.

## Autentikasi dan hak akses

Login memvalidasi bcrypt, membuat token acak 32 byte, dan menyimpan session di Map. Cookie `nist_session`: HttpOnly, SameSite=Lax, Secure sesuai konfigurasi; usia 8 jam. Login baru mengganti sesi sebelumnya untuk username sama. Restart, pengubahan password/role, penghapusan akun, dan restore DB mencabut sesi terkait sesuai service aplikasi.

Role: admin, approver, editor, viewer, user. Izin efektif memerlukan page allowed + Read + aksi Read/Create/Update/Delete. Admin bypass izin per halaman. Akun administratif, SMTP, storage, dan backup dibatasi admin. Evidence menambahkan ownership. Jangan menentukan hak akses hanya dari label role atau tombol yang terlihat.

## Asset Management / ITSM

![Lifecycle aset](images/05-asset-lifecycle.svg)

Tag aset unik; status `planned`, `in-stock`, `in-use`, `maintenance`, `retired`, `disposed`. Referensi change/tiket opsional. Lepaskan posisi dan relasi sebelum retirement. Aset operasional harus dipensiunkan sebelum dihapus; status planned dapat dihapus untuk koreksi pencatatan.

Satu perangkat punya satu posisi fisik. `startUnit` dihitung dari bawah; rentang berakhir `startUnit + height - 1`. Kedalaman penuh memakai kedua sisi; perangkat satu sisi pada orientasi berbeda boleh memakai U sama. Backend menolak overlap, over-capacity, nonfisik (Software/License/Cloud), aset retired/disposed, serta pemasangan ulang tanpa konteks pemindahan. Drag/drop mengisi modal; DB baru berubah setelah Simpan.

Foto PNG/JPEG/WebP max 5 MiB per sisi. Byte asli tersimpan tanpa kompresi ulang; `object-fit: scale-down` menghindari pembesaran melampaui resolusi sumber. Foto panel ditampilkan sesuai orientasi dan tinggi U; foto rak keseluruhan adalah referensi terpisah. File tercatat di Uploaded Files; foto history tetap tersedia ketika foto aktif diganti lewat modul.

Relasi: `connects-to`, `depends-on`, `protects`, `balances`, `hosts`, `backs-up`. Tidak boleh self-link atau duplikat source/target/type. Multi-edge dan arah sebaliknya diperbolehkan; kurva diagram dibedakan. `depends-on` berarti sumber bergantung pada tujuan; `hosts` berarti sumber berjalan pada host tujuan. Analisis hanya menelusuri dependensi yang dicatat, bukan discovery jaringan atau simulasi gangguan.

Layout disimpan dengan version untuk mencegah overwrite edit bersamaan. Foto, aset, dan import disimpan atomik pada jalur terkait. Export JSON format `nist-basis-asset-management` versi 1: aset, rak, posisi, relasi, node, foto base64, dan template email. Import merge berdasarkan tag/nama; ID dipetakan ulang; konflik membatalkan transaksi. Vendor/risk eksternal harus sudah tersedia. Kredensial SMTP tidak dipindahkan oleh export ini.

Daftar aset newest-to-oldest menurut created_at; data lama menggunakan updated_at sebagai fallback migrasi. Daftar rak diurutkan nama; posisi berdasarkan U; relasi berdasarkan tipe. Filter hanya mengubah tampilan, bukan okupansi atau relasi tersimpan.

## Penilaian CIA 5x5

C, I, A dan likelihood berada pada skala 1-5. Impact = max(C,I,A); score = impact x likelihood. Score 1-4 Low, 5-12 Medium, 15-25 High. Tidak ada score 13/14 dari perkalian integer 1-5. Backend menghitung ulang; nilai impact/rating kiriman client tidak dipercaya untuk CIA lengkap. Risk Management menghitung residual rating dari residual likelihood x residual impact dengan batas yang sama. Data legacy tanpa CIA lengkap dapat memerlukan pengisian ulang; bukan dianggap sudah dinilai.

Related risk adalah tautan ke Risk Register, berbeda dari hasil CIA aset. Vendor pengelola mengacu TPRM dan opsional; vendor perangkat/manufacturer merupakan field informasi terpisah.

## Knowledge, policy, evidence, dan backup

Knowledge mempunyai title/folder unik tanpa mengubah isi Markdown. Update membutuhkan version. Import baru menyimpan file MD/TXT/JSON asli dan gambar ke evidence library bersama hasil parsing. Import historis yang tidak menyimpan original bytes tidak dapat direkonstruksi persis.

Policy dapat memilih note individual atau semua note di folder/subfolder. Subfolder tertutup default; pencarian membuka folder hasil. Pemilihan folder mencakup seluruh descendants, termasuk hasil yang tersembunyi oleh filter. Isi note terkait ikut pencarian policy. Link policy-note disimpan sebagai array JSONB, bukan FK individual.

Semua modul menggunakan library evidence terpusat. Admin dapat mengelola seluruh file; pengguna mengikuti ownership dan izin aksi. Hapus file di library dapat melepaskan referensi lintas modul; melepas satu attachment dilakukan melalui modul asal. File Backup tidak memulihkan record bisnis; Database Backup dan File Backup diperlukan bersama.

## Bahasa, UI, dan proses development

`frontend/public/i18n.js` menyimpan kamus ID/EN, dynamic patterns, pilihan `nist-basis-language`, dan event pergantian bahasa. Enum/value form harus eksplisit agar label terjemahan tidak mengubah data API. Konten pengguna menggunakan batas no-translate bila sesuai. Tambah/ubah fitur aset memakai modal, konfirmasi mutasi, busy lock dan pesan error.

Edit source, jalankan build, verifikasi unit dan browser, lalu restart backend bila ada perubahan server/migrasi. Lihat runbook untuk perintah. Prinsip industri yang dipakai: separation of concerns, validasi server, parameterized SQL, transaksi satu koneksi, least privilege, optimistic concurrency, audit, dan backup terpisah. Status approval pada register bukan workflow bertingkat atau tanda tangan digital kriptografis.
''')

api_intro = '''# Detail dan katalog API

![Alur API](images/03-api-flow.svg)

## Kontrak umum

Base URL native `http://localhost:8000/api`, Compose `http://localhost:5000/api`. Gunakan origin deployment aktual dan HTTPS pada produksi. API belum memakai prefix versi `/v1`, bearer token/OAuth, atau kontrak OpenAPI tervalidasi bawaan.

Seluruh endpoint selain login/logout auth melewati sesi. Browser same-origin otomatis menyertakan cookie. Integrasi CLI menyimpan cookie jar dari login; jangan menaruh password atau cookie produksi di dokumentasi/log. Request JSON memakai `Content-Type: application/json`; upload memakai multipart dan boundary otomatis. Parser JSON dibatasi 10 MiB. Origin mutasi diperiksa ketika header Origin tersedia; cookie SameSite=Lax adalah kontrol tambahan, bukan token CSRF khusus.

Format response bervariasi per endpoint: array list, object record, `{ok:true}`, stream file/ZIP/PDF, atau 204 tanpa body. API menggunakan camelCase pada banyak register, tetapi rack placements/relations dan beberapa indikator masih mengembalikan snake_case. ID BIGSERIAL dapat berupa string dari `pg`; jangan mengasumsikan seluruh ID aman dikonversi ke Number. Asset/rack/relasi memakai UUID; Risk Register memakai string seperti `CSR - 001`.

| Status | Pemakaian |
| --- | --- |
| 200 | Baca, update, action sukses |
| 201 | Pembuatan resource pada handler yang menetapkannya |
| 204 | Hapus/logout/reset tertentu; jangan parse JSON |
| 400 | Payload, path, enum, referensi/form/upload tidak valid |
| 401 | Kredensial salah atau session tidak aktif |
| 403 | Izin, ownership, origin atau admin-only ditolak |
| 404 | Record/file/route tidak ditemukan |
| 409 | Constraint, record digunakan, collision atau konflik versi |
| 413 | Batas upload/body terlampaui |
| 429 | Rate limit atau kapasitas upload; dapat memuat Retry-After |
| 500 | Error global yang tidak diekspos rinci kepada client |
| 502/503 | Beberapa handler khusus dapat melaporkan kegagalan integrasi/restore; error global hanya meneruskan status 4xx |

Error global berbentuk `{"error":"...","requestId":"..."}`; handler lokal dapat hanya mengembalikan `error`. Jangan mengandalkan adanya requestId pada seluruh respons. Jangan melakukan retry mutasi secara buta setelah timeout; pastikan hasil sudah/belum tersimpan, terutama upload/import/email.

## Upload dan tipe konten

| Jalur | Multipart / batas aktual |
| --- | --- |
| `/files` | `file`; functionName, kind policy/practice, rejectDuplicate opsional; 100 MiB/file |
| `/files/batch` | `files`; efektif maksimum 20 file dari Multer walaupun route array cap 50; total 200 MiB selama streaming |
| `/files/*path` PUT | `file`, 100 MiB; ownership diperiksa sebelum parsing dan penulisan |
| Aset/foto rak | `front`, `rear`; 5 MiB/sisi, max 2 file; `data` JSON pada registrasi multipart, removeFront/removeRear boolean string |
| `/asset-management/import` | `file` JSON; maksimum 100 MiB |
| `/knowledge-notes/images` | `images` satu gambar; paths JSON array; 10 MiB/file |
| `/knowledge-notes/import-with-images` | images max100, documents max200; payload, paths, documentPaths; 10 MiB/file dan total stream 100 MiB |
| Audit finding | `file` max10, 10 MiB/file; data dan parent sesuai kind |
| DB/file restore | `backup`; 500 MiB/file; dump/JSON untuk DB, ZIP untuk file |

Semua multipart API dibatasi 4 request aktif per proses dan 2 per akun. Evidence umum menerima PDF/DOC/DOCX/PPT/PPTX/PNG/JPG/GIF/WebP sesuai MIME+extension. Foto aset memeriksa bytes gambar; validasi seluruh dokumen belum merupakan antivirus/malware scanning.

## Payload domain dan validasi

Field di bawah mencakup kontrak bisnis utama. Detail endpoint dan observed fields terdapat pada katalog/lampiran source; field bertanda derived dihitung backend. PUT pada beberapa register membutuhkan formulir lengkap, bukan PATCH universal.

| Resource | Field dan batas |
| --- | --- |
| Login | username 3-50 karakter `[A-Za-z0-9._-]`, password max72 byte UTF-8 |
| Profil | fullName; admin dapat mengubah security fields sesuai service; password memakai currentPassword/newPassword/confirmPassword |
| Izin | permissions array key dikenal; actions map boolean read/create/update/delete; write memerlukan read |
| Assessment | scores, policyScores, practiceScores, notes, attachments; state bersama default/privacy; attachments harus mereferensikan file yang boleh digunakan |
| Asset | tag/name/owner wajib max150; type/status/criticality enum; serial/vendor/model/location/service/changeReference max250; description max2000; ownerEmail max254; dates YYYY-MM-DD; reminderEnabled boolean, reminderDays integer0-365; managedVendorId string ID TPRM atau null; assetAssessment C/I/A/likelihood integer1-5 |
| Rack | name wajib max150, location wajib max250, units integer1-60 |
| Placement | assetId/rackId UUID, startUnit/height integer>=1, facing front/rear, fullDepth boolean; previousRackId harus cocok untuk pindah existing; changeReference opsional |
| Asset relation | sourceId/targetId UUID berbeda, type enum enam relasi, notes max1000, changeReference max250 |
| Asset diagram | nodes max500, setiap id UUID unik, x/y finite0-20000, version integer>=0; response version dinaikkan |
| Related risk | riskRegisterIds array unik max500; setiap riskId string nonkosong max150 dan benar-benar terdaftar |
| Risk Register | riskCategory/effectedAsset/deviceName/identificationRisk/likelihood/impact wajib sesuai validator; C/I/A1-5; impact/value/rating derived bila CIA lengkap; riskId dibuat backend; riskOwner/treatment/deadline/residual fields/comment/ref opsional sesuai service |
| Risk dropdown | fieldName dari kategori/asset/device/owner/treatment, optionValue, sortOrder; nama/type yang sudah dipakai tidak dapat diubah/hapus |
| Risk indicator | indicatorType, label wajib; score, description, sortOrder |
| Risk acceptance | requestorName, assetName, department, riskDescription, benefitJustification, mitigationPlan; businessOwnerDecision temporary/one_year/denied; cisDecision approved/denied/conditional; dates dan signature fields |
| TPRM questionnaire | vendorName wajib; status Draft/In progress/Complete/Expired/Final; result Pending/Approved/Approved with Conditions/Rejected; reviewDate, reviewer, notes, responses JSON |
| TPRM register | thirdParty/serviceDependency wajib; questionnaireId harus terdaftar dan nama vendor cocok; riskLevel tiga tier; assessmentStatus Not started/In progress/Complete/Accepted; relationshipStatus Active/Offboarded/Expired/Terminated; riskRegisterIds, dueDiligenceAssessment, nextReview, notes |
| Questionnaire template | name dan sections; sections berupa pasangan `[judul, [pertanyaan...]]`; judul dan minimal satu pertanyaan tiap section |
| Policy | title/category/owner/reviewCycle/approvalStatus wajib saat create; lastReview, attachmentName/Path/Type, notes, items subtitle/content; relatedNoteIds max10000 positive IDs |
| Knowledge note | title wajib max200 tanpa karakter filename/wiki-link khusus; content max1.000.000 byte; folder max500 path valid; update version integer>=1 |
| Knowledge folder | path, atau source/destination untuk move; delete mode empty/all; root tidak boleh dihapus, self-descendant move ditolak |
| Threat model | name max200; diagram nodes max500/edges max1000; node finite coordinates, width>=60,height>=40; IDs unik; edges referensi node berbeda; threats STRIDE dengan severity/status/mitigation; update version |
| Audit finding | kind audit/finding/followup/evidence; parentId mengikuti hierarki; title max200 wajib, reference max100, owner max160, description max10000; status Open/In progress/Closed; severity Low/Medium/High/Critical; dueDate valid |
| Certification | personnelId pegawai terdaftar wajib, certificationName wajib; issuer/referenceUrl HTTP(S), certificationLevel, status, dates, notes, layout fields |
| SMTP | host/username/from max254 tanpa CRLF; port1-65535; security tls/starttls; password opsional max4096; clearPassword; akun UUID/default; test to/smtpAccountId |
| Storage | mode local/shared/s3/gcs; shared directory absolut khusus di luar project/root; cloud bucket/prefix, region S3 wajib, projectId GCS opsional; credentials dari runtime |

## Contoh integrasi

Gunakan akun pengujian berizin. Contoh berikut bersifat dokumentasi dan tidak dijalankan terhadap data produksi.

```bash
curl -c cookies.txt -H 'Content-Type: application/json' \\
  -d '{"username":"test.user","password":"REPLACE_WITH_TEST_PASSWORD"}' \\
  http://localhost:8000/api/auth/login
curl -b cookies.txt http://localhost:8000/api/auth/me
curl -b cookies.txt http://localhost:8000/api/asset-management/assets
curl -b cookies.txt 'http://localhost:8000/api/files?details=true'
```

Contoh create aset (JSON; bila foto disertakan kirim payload ini sebagai multipart field `data`):

```json
{"tag":"SRV-DEMO-001","name":"Server Demo","type":"Server","status":"planned","owner":"IT Operations","ownerEmail":"owner@example.com","criticality":"medium","reminderEnabled":false,"reminderDays":30,"managedVendorId":null,"assetAssessment":{"confidentiality":3,"integrity":4,"availability":4,"likelihood":3}}
```

Response assetAssessment dihitung ulang: impact4, score12, level medium. Jangan mengirim terjemahan enum seperti Direncanakan sebagai status API; gunakan `planned`.

Contoh posisi baru; ganti ID dengan record yang sudah dibuat:

```json
{"assetId":"00000000-0000-4000-8000-000000000001","rackId":"00000000-0000-4000-8000-000000000002","startUnit":20,"height":2,"facing":"front","fullDepth":true,"changeReference":""}
```

Saat pindah aset existing, tambahkan previousRackId dari posisi terbaru. Konflik memberi 409, lalu muat ulang posisi. Diagram dan catatan membutuhkan version terbaru sebelum update. File path wildcard bisa memiliki beberapa segmen; encode tiap segmen URL dan jangan menerima path absolut atau `..`.

## Seluruh endpoint terdaftar

Kolom izin mencantumkan guard route yang terbaca. Guard dinamis, ownership, dan validasi service tetap berlaku. Observed fields hanyalah pembacaan request eksplisit, bukan daftar field wajib/schema lengkap; gunakan tabel domain dan lampiran implementasi.
'''
groups=defaultdict(list)
for endpoint in catalog['endpoints']: groups[endpoint['module']].append(endpoint)
api=api_intro
for module,endpoints in groups.items():
    api+='\n\n### '+module+'\n\n'
    rows=[]
    for e in endpoints:
        inputs=[]
        if e['bodyFieldsObserved']: inputs.append('body: '+', '.join(e['bodyFieldsObserved']))
        if e['queryFieldsObserved']: inputs.append('query: '+', '.join(e['queryFieldsObserved']))
        parameters=re.findall(r'[:*](\w+)',e['path'])
        if parameters: inputs.append('path: '+', '.join(parameters))
        rows.append([e['method'], '`'+e['path']+'`',e['permission'],'; '.join(inputs) or 'Kontrak domain / handler',e['source']+':'+str(e['line'])])
    api+=table(['Method','Endpoint','Izin','Input terbaca','Source'],rows)
save('03-API.md',api)

# Extract every static CREATE TABLE and retain source ALTER statements separately.
tables=defaultdict(list)
sources=list((ROOT/'database').glob('*.sql'))+list((ROOT/'src/services').glob('*.js'))
def balanced_end(text,start):
    depth=1;quote='';escape=False;i=start
    while i<len(text) and depth:
        c=text[i]
        if quote:
            if escape:escape=False
            elif c=='\\':escape=True
            elif c==quote:quote=''
        elif c in "'\"":quote=c
        elif c=='(':depth+=1
        elif c==')':depth-=1
        i+=1
    return i
for path in sources:
    text=path.read_text(encoding='utf-8')
    # Resolve known table-name constants before interpreting SQL templates.
    constants=dict(re.findall(r"const (\w+) = '([a-z_]+)'",text))
    for key,value in constants.items(): text=text.replace('${'+key+'}',value)
    for match in re.finditer(r'CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+)\s*\(',text,re.I):
        end=balanced_end(text,match.end())
        ddl=text[match.start():end]
        source=path.relative_to(ROOT).as_posix()
        tables[match[1]].append((source,text[:match.start()].count('\n')+1,ddl))
schema='''# Database, relasi, dan struktur data

![Relasi inti](images/04-data-relations.svg)

## Model dan aturan integritas

PostgreSQL menjadi sumber data utama. Schema dasar berada di database/schema.sql; banyak modul menjalankan additive migrations dalam ensureStore. Inventaris di bawah berasal dari source, bukan koneksi schema produksi. DDL CREATE menunjukkan bentuk awal; ALTER dan trigger dalam source dapat menambahkan atau mengubah kolom/constraint.

| Hubungan | Enforcement / penghapusan |
| --- | --- |
| framework -> controls/targets | Foreign key; lihat DDL untuk aksi cascade |
| organization_personnel -> personnel_certifications | FK dari migrasi; identitas sertifikasi berasal pegawai terdaftar |
| policy -> items / deliveries | FK pada store terkait |
| vendor questionnaire -> TPRM register | questionnaire_id FK ON DELETE SET NULL; create/update memvalidasi vendor cocok |
| TPRM -> risks | Join table tprm_related_risks, FK cascade kedua sisi; JSON legacy tetap ada |
| asset -> vendor TPRM | managed_vendor_id GENERATED STORED dari JSONB, FK DELETE RESTRICT; opsional null |
| asset -> racks | asset_id PK memastikan satu posisi; FK asset/rack DELETE RESTRICT |
| asset -> related risks | Join table FK CASCADE kedua sisi |
| asset relations | source/target FK RESTRICT, CHECK source!=target, UNIQUE source/target/type |
| asset/rack -> photos | FK CASCADE; original bytes dan evidence_path |
| evidence -> uploader | uploaded_by mengacu akun sesuai ownership migration; file legacy tanpa owner admin-only |
| audit hierarchy | self-FK parent_id RESTRICT; audit root tanpa parent, record anak punya parent |
| policy -> knowledge notes | related_note_ids JSONB; link logis, bukan FK individual |
| diagram -> assets | node IDs dalam JSONB; validasi service, bukan FK per node |
| evidence -> module attachments | Path di JSONB/record; diperiksa service dan cleanup/trigger, bukan seluruhnya FK |

## Normalisasi, JSONB, dan concurrency

Identitas core memakai PK UUID/BIGSERIAL/TEXT yang sesuai domain. Relasi penting memakai join table/FK; data formulir fleksibel memakai JSONB. `managed_vendor_id` mengubah referensi vendor dalam JSON aset menjadi kolom generated dengan FK, sehingga update/import JSON yang tidak valid ditolak database dan vendor yang masih dipakai tidak bisa dihapus. Index membantu lookup.

Rack occupancy divalidasi server di bawah advisory transaction lock. CHECK dasar/PK tidak sendirian membuktikan semua rentang U bebas overlap; operasi tulis aplikasi wajib melewati service. Asset diagram dan knowledge/threat model memakai optimistic versioning; mismatch mendapat 409.

Reset Risk Register sekarang memakai satu client pool dari BEGIN sampai COMMIT/ROLLBACK. Koneksi harus selalu release dalam finally. Mengirim BEGIN melalui pool.query lalu operasi melalui pool.query berbeda tidak menjamin transaksi satu koneksi.

Reference path foto/knowledge disinkronkan terhadap evidence_files lewat trigger penggantian/penghapusan. Content asli foto dan gambar knowledge tetap tersedia sebagai BYTEA; evidence umum di storage eksternal tidak selalu mempunyai salinan BYTEA. Kebijakan retensi library terpisah dari foto aktif.

## Inventaris semua tabel dari source

'''
schema+=table(['Tabel','Definisi source'],[[name,'; '.join(sorted(set(source+':'+str(line) for source,line,_ in definitions)))] for name,definitions in sorted(tables.items())])
schema+='\n\n## Kolom, constraint, dan migrasi per tabel\n\nDefinisi berikut adalah kutipan DDL source untuk audit dan pemahaman, **bukan script migrasi yang boleh langsung dieksekusi**. Untuk instalasi gunakan provisioning/startup resmi.\n'
for name,definitions in sorted(tables.items()):
    schema+='\n\n### '+name+'\n'
    seen=set()
    for source,line,ddl in definitions:
        normalized=re.sub(r'\s+',' ',ddl)
        if normalized in seen:continue
        seen.add(normalized)
        schema+='\nSource: `'+source+':'+str(line)+'`.\n\n```sql\n'+ddl+';\n```\n'
    alters=[]
    for path in sources:
        text=path.read_text(encoding='utf-8')
        constants=dict(re.findall(r"const (\w+) = '([a-z_]+)'",text))
        for key,value in constants.items():text=text.replace('${'+key+'}',value)
        for line in text.splitlines():
            for match in re.finditer(r'ALTER TABLE\s+'+re.escape(name)+r'\b[^\n;`]*',line):
                value=match.group().split('"')[0]
                # JS single-quote wrappers delimit complete SQL literals; keep escaped quotes.
                value=re.split(r"(?<!\\)'\s*\)",value)[0]
                if len(value)>650:value=value[:650]+' [lihat source lengkap]'
                entry=path.relative_to(ROOT).as_posix()+': '+value
                if entry not in alters:alters.append(entry)
    if alters:schema+='\nMigrasi source terkait:\n\n'+'\n'.join('- `'+value.replace('`','')+'`' for value in alters)+'\n'
schema+='\n## Batas dan pengembangan relasi\n\nPolicy-note, node diagram, dan beberapa attachment masih memakai link logis/JSONB. Rekomendasi berikutnya adalah normalisasi link yang membutuhkan jaminan database, disertai backfill dan tes orphan/cascade. Jangan menerapkan FK terhadap data legacy tanpa pemeriksaan referensi. Tenancy dan isolasi per organisasi belum tersedia; RLS tenant bukan kontrol yang sudah aktif.\n'
save('04-DATABASE.md',schema)

save('05-SECURITY.md', '''# Review keamanan dan praktik industri

Tanggal: 9 Oktober 2026. Scope: source aplikasi, dependency audit npm, relasi vendor aset, transaksi reset risiko, konfigurasi build, dan pengujian regresi. Ini bukan sertifikat kepatuhan, pentest deployment, atau jaminan bebas semua kerentanan.

## Temuan dan perubahan pada pemeriksaan ini

| Temuan | Penanganan | Bukti |
| --- | --- | --- |
| Advisory Vue/server-renderer, proxy-addr, source-map-js | npm audit fix kompatibel; minimum Vue dinaikkan ^3.5.42; lockfile diperbarui | output/security-audit-2026-10-09-before.json dan after.json |
| Penyimpanan vendor dan linked risks belum atomik | Create/update TPRM memakai satu client dan transaksi; kegagalan relasi membatalkan perubahan vendor | test/databaseIntegrityHardening.test.js |
| Reset register memakai pool.query BEGIN terpisah | Satu client checkout dipakai untuk seluruh transaksi; rollback/release | test/databaseIntegrityHardening.test.js |
| Vendor pengelola aset hanya ID di JSONB | Kolom generated managed_vendor_id dengan FK RESTRICT dan index; vendor opsional tetap null | src/services/assetManagementService.js |
| Delete vendor ber-FK dapat memberi error internal | Constraint conflict menjadi 409 dengan instruksi lepaskan relasi | src/services/tprmService.js |
| Potensi injeksi atribut class dari status sertifikasi legacy | Token class dibatasi a-z/0-9/underscore/hyphen; berlaku juga pada rating risiko dan vendor | test/databaseIntegrityHardening.test.js |
| Source map frontend tersedia pada build | sourcemap false; generated build tidak menerbitkan .map | frontend/client/vite.config.js |

Audit dependency setelah update melaporkan **0 advisory npm** pada lockfile saat pemeriksaan. Status ini hanya cakupan advisory yang dilaporkan npm, bukan bukti seluruh kode aman. Vue SSR tidak digunakan sebagai arsitektur runtime aplikasi ini; patch tetap diterapkan terhadap paket terpasang. Proxy trust pada app belum diaktifkan, tetapi paket rentan tetap diperbarui.

Referensi advisory: [Vue](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6), [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Detail applicability perlu dibedakan dari severity paket; tidak diklaim terjadi eksploit pada deployment pengguna.

## Kontrol keamanan yang sudah ada

| Area | Implementasi | Batas |
| --- | --- | --- |
| Authentication | Bcrypt, token random32 byte, cookie HttpOnly/SameSite, lifetime8 jam, invalidasi sesi | In-memory per proses; belum SSO/MFA |
| Authorization | Guard backend Read/Create/Update/Delete, admin-only, ownership evidence | Belum tenant partition/RLS organisasi |
| Login abuse | Limit per IP dan username; blokir setelah kegagalan; shared budget password endpoints | Per proses; shared limiter diperlukan untuk scale-out |
| SQL | Values parameterized; dynamic identifier hanya map/whitelist domain | DDL dan custom schema perlu review setiap perubahan |
| Data integrity | PK/FK/UNIQUE/CHECK, transaksi, advisory lock, optimistic version | Beberapa relasi JSONB tetap logical references |
| HTTP | nosniff, DENY frame, no-referrer, permissions policy; HSTS production + Secure | HTTPS bergantung deployment; bukan TLS terminator bawaan |
| Origin/CSRF | Mutasi dengan Origin beda host ditolak; SameSite cookie | Tidak ada token CSRF khusus; missing-Origin diterima saat ini |
| File access | Auth/owner, path normalization, upload constraints, CSP sandbox file responses | Generic office/PDF belum malware scan |
| Upload abuse | 4 active/process, 2/account, stream aggregate cap, temporary cleanup | Kapasitas disk/timeout deployment tetap perlu diuji |
| Content rendering | Vue interpolation, escapeHtml, DOMPurify pada rendering rich content terkait | Review seluruh innerHTML bukan pembuktian formal semua sink |
| Secrets | SMTP AES-256-GCM dengan key di data; cloud credentials runtime | Key/env perlu ACL dan salinan recovery terpisah |
| Audit | Request events, requestId, credential redaction, durable fallback queue | At-least-once; crash window dan duplikasi masih mungkin |
| Recovery | Dump semua tabel, ZIP metadata+file, restore invalidasi sesi | Restore file dapat parsial jika storage gagal; perlu retry terukur |

## Acuan praktik industri

Review menggunakan [OWASP ASVS](https://owasp.org/projects/asvs) sebagai acuan ruang lingkup kontrol aplikasi, [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) untuk least privilege dan pemeriksaan izin per request, serta [node-postgres Transactions](https://node-postgres.com/features/transactions) untuk transaksi satu client. Pemetaan ini adalah acuan review, bukan penilaian lengkap atau klaim memenuhi seluruh requirement ASVS.

## Praktik coding dan review

Boundary HTTP harus memvalidasi input, parameter ID, ukuran dan tipe; domain service menghitung ulang nilai turunan serta memeriksa referensi. SQL values selalu parameterized. Setiap transaksi memakai satu client dan finally release. Mutasi multientitas harus atomik atau jelas melaporkan partial result. Server permission wajib, UI permission hanya membantu UX. Jangan interpolate konten pengguna ke HTML/CSS/URL tanpa encoding sesuai konteks.

Perubahan DB menggunakan additive migration dan backfill tervalidasi; perubahan destructive membutuhkan rencana recovery. File source frontend diedit, hasil build digenerasi. Lockfile di-review, minimum versi aman dipertahankan, audit diulang saat rilis. Jangan commit secret, cookie, dump bisnis, atau log sensitif.

## Pekerjaan keamanan yang belum terverifikasi / rekomendasi

- Pentest terhadap deployment HTTPS/proxy aktual, session/cookie, IDOR, CSRF, injection, XSS, dan file preview.
- Uji S3/GCS/NAS/SMTP nyata dengan least-privilege runtime credentials, timeout dan failure behavior.
- Content Security Policy workspace yang kompatibel dengan runtime lama dan rich editor; CSP ketat belum dipaksakan untuk seluruh workspace.
- Pemeriksaan magic bytes semua dokumen, antivirus/quarantine, quota disk, dan uji upload paralel/beberapa akun.
- Shared session/limiter dan revocation lintas instance sebelum menjalankan multi-worker/replica.
- Normalisasi relasi logical JSONB bila perlu; formal tenant isolation bila aplikasi dipakai banyak organisasi.
- Infrastruktur DB role provisioning vs runtime least privilege. Role runtime startup sekarang membutuhkan hak DDL; Compose belum memisahkannya.
- Validasi backup/restore rehearsal, enkripsi arsip dan retensi off-host, serta monitoring antrean audit.

Daftar ini merupakan pekerjaan yang nyata belum dibuktikan dalam audit, sehingga laporan tidak menyatakan aplikasi "tanpa celah". Lihat dokumen keamanan historis di parent docs untuk perubahan sebelumnya; status terkini di bab ini dan bukti test yang dihasilkan.
''')

save('06-OPERATIONS.md', '''# Operasional, deployment, dan pengujian

## Instalasi native

Siapkan Node sesuai engines package.json (^20.19 atau >=22.12), PostgreSQL kompatibel, client pg_dump/pg_restore, konfigurasi DB, folder persisten dan akun administrator. Perintah contoh dijalankan dari root proyek; environment contoh tidak berisi kredensial siap pakai.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run db:setup
npm.cmd run admin:create
npm.cmd start
```

Provisioning/startup menulis DDL/seed. Pastikan DB_HOST/PORT/NAME/USER provisioning dan pool mengacu instalasi yang sama. Detail akun administrator lihat scripts/create-admin.js dan dokumentasi instalasi; jangan menyisipkan password melalui source atau log.

## Instalasi Docker

```powershell
Copy-Item docker.env.example .env.docker
# Isi BLACKOWL_DB_PASSWORD dan sesuaikan bind/HTTPS pada .env.docker.
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail 100 app
```

Default akses http://localhost:5000. Untuk jaringan pengguna set bind sesuai target; untuk produksi siapkan HTTPS/proxy dan Secure cookie. Jangan publikasikan DB port. Perintah tersebut adalah panduan, bukan deployment yang dijalankan saat pembuatan dokumen.

## Rilis dan perubahan database

1. Simpan backup DB, file, konfigurasi dan kunci yang sudah diuji recovery-nya.
2. Review source diff, migrasi dan dependency lock; jalankan quality gate.
3. Build client/CSS; deploy runtime dan migrasi pada maintenance window.
4. Restart backend; session in-memory berakhir, pengguna login kembali.
5. Verifikasi login/permission, API read, contoh record, foto/evidence, versi diagram dan scheduler.
6. Monitor error startup, constraint, SMTP, audit recovery dan kapasitas storage.

FK vendor baru mempertahankan API managedVendorId, tetapi kini penghapusan vendor yang masih dipakai memberikan 409. Lepaskan vendor pengelola dari aset terlebih dahulu. Tidak menghapus data bisnis secara otomatis. Source map production tidak lagi dihasilkan. Session/limiter masih single-process.

## Backup dan restore

![Backup/recovery](images/06-backup-recovery.svg)

DB Backup memakai PostgreSQL custom dump dan mencakup struktur/data satu database aplikasi, seluruh modul dan byte foto dalam DB. Tidak mencakup seluruh role cluster atau semua file luar DB. File Backup ZIP berisi file terdaftar dan metadata manifest, dapat memilih folder/subtree, membaca lokasi asal termasuk cloud.

Batas ZIP upload/hasil arsip500 MiB; hasil ekstraksi2 GiB; masing-masing file500 MiB; max49.999 file dan manifest10 MiB. File restore mempertahankan path; file matching diganti, file lain tetap. Storage failure dapat menyisakan partial restore dan jumlah hasil harus diperiksa. Arsip sumber tidak boleh dipercaya sebelum validasi path/manifest/size.

Urutan recovery: hentikan mutasi, siapkan DB/storage kompatibel, restore database, pulihkan kunci/env/akses storage, restore file ZIP, login akun hasil restore, lalu cek referensi/foto/izin/email. Restore DB mencabut sesi pada awal/akhir termasuk gagal. Maintenance diperlukan karena request yang sudah lolos autentikasi tidak otomatis dibatalkan.

## Pengujian dan quality gate

```powershell
npm.cmd audit
npm.cmd test
npm.cmd run test:security
npm.cmd run test:i18n
npm.cmd run test:notes
npm.cmd run build
npm.cmd run test:asset-rack-browser
node scripts/test-asset-transfer.js
node scripts/test-uploaded-images-backup.js
```

Suite utama dapat melewati tes integrasi DB sesuai flag konfigurasi; skipped test tidak dianggap lulus integrasi. Script transfer memakai schema terisolasi; script foto/backup melakukan rollback fixture. Jangan menjalankan test mutasi terhadap database produksi tanpa membaca isolation/cleanup script. Test browser mock tidak membuktikan koneksi SMTP/cloud nyata atau pentest.

Bukti hasil pemeriksaan terbaru dirangkum dalam VALIDATION.md. Tidak menjalankan restore database produksi saat pemeriksaan dokumentasi. Build menghasilkan bundle cukup besar; peringatan bundle bukan kegagalan keamanan tetapi kandidat pemecahan modul untuk kinerja.

## Troubleshooting

| Gejala | Pemeriksaan |
| --- | --- |
| API401 setelah restart/password/restore | Login ulang; cookie/HTTPS configuration |
| API403 | Page read + action, role admin-only, ownership, Origin/Host |
| API409 perangkat | Aset sudah dipasang, stale previousRackId, overlap atau kapasitas |
| API409 diagram/note | Muat version terbaru; jangan overwrite otomatis |
| API409 hapus vendor | Lepaskan managing vendor asset / relasi lebih dahulu |
| API413/429 upload | Ukuran per file/total, jumlah file, concurrency; retry setelah request selesai |
| DB connection/startup | Env, host/port, role DDL, DB health, migration referensi |
| Foto/evidence hilang | evidence_path, owner, lokasi asal storage, original DB bytes; status migration |
| SMTP gagal | Akun terpilih, host/port/TLS, from, relay permission dan key sesuai ciphertext |
| Backup dump gagal | pg_dump compatible major/server dan executable path |
| ZIP restore parsial | Storage connection/permission, count restored, retry setelah penyebab diperbaiki |
| UI versi lama | Build client; Ctrl+F5; pastikan server menyajikan generated index terbaru |
| audit-recovery berulang | DB outage, ACL data/audit-pending, queue/disk capacity |
''')

implementation='# Lampiran implementasi API\n\nSnapshot deklarasi dan handler dari kode lokal. Daftar field atau response yang hanya didelegasikan ke service harus dibaca bersama kontrak domain di bab API dan source service. Tidak memuat credential atau record pengguna. Wrapper async dapat menyembunyikan inner function; deklarasi route dan controller/service tetap sumber otoritatif.\n'
for e in catalog['endpoints']:
    implementation+='\n\n## '+e['method']+' '+e['path']+'\n\nSource: `'+e['source']+':'+str(e['line'])+'`; izin: '+e['permission']+'.\n\n```javascript\n'+e['sourceDeclaration']+'\n```\n'
    if e['handler'] not in ['inline',''] and e['handlerSource'] not in e['sourceDeclaration']:
        implementation+='\nHandler `'+e['handler']+'`:\n\n```javascript\n'+e['handlerSource']+'\n```\n'
save('07-API-IMPLEMENTATION.md',implementation)

# Portable HTML rendering for the constrained Markdown used by these documents.
def inline(value):
    value=html.escape(value)
    value=re.sub(r'`([^`]+)`',r'<code>\1</code>',value)
    value=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',value)
    def link(m):
        url=html.unescape(m[2]);label=m[1]
        if url.endswith('.md') and (OUT/url).exists():url='#'+Path(url).stem
        return '<a href="'+html.escape(url,quote=True)+'">'+label+'</a>'
    return re.sub(r'\[([^\]]+)\]\(([^)]+)\)',link,value)
def render(text):
    lines=text.splitlines();out=[];i=0
    while i<len(lines):
        line=lines[i]
        if not line.strip():i+=1;continue
        if line.startswith('```'):
            i+=1;code=[]
            while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
            out.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>');i+=1;continue
        image=re.match(r'!\[([^\]]*)\]\(([^)]+)\)',line)
        if image:
            svg=(OUT/image[2]).read_text(encoding='utf-8');out.append('<figure>'+svg+'<figcaption>'+html.escape(image[1])+'</figcaption></figure>');i+=1;continue
        heading=re.match(r'^(#{1,6}) (.*)',line)
        if heading:level=min(len(heading[1])+1,6);out.append(f'<h{level}>'+inline(heading[2])+f'</h{level}>');i+=1;continue
        if line.startswith('|') and i+1<len(lines) and re.match(r'\|\s*[-:]',lines[i+1]):
            cells=lambda row:re.split(r'(?<!\\)\|',row.strip().strip('|'))
            out.append('<div class="table-wrap"><table><thead><tr>'+''.join('<th>'+inline(c.strip())+'</th>' for c in cells(line))+'</tr></thead><tbody>');i+=2
            while i<len(lines) and lines[i].startswith('|'):
                out.append('<tr>'+''.join('<td>'+inline(c.strip().replace('\\|','|'))+'</td>' for c in cells(lines[i]))+'</tr>');i+=1
            out.append('</tbody></table></div>');continue
        if line.startswith('- ') or re.match(r'^\d+\. ',line):
            ordered=not line.startswith('- ');tag='ol' if ordered else 'ul';out.append('<'+tag+'>')
            while i<len(lines) and (lines[i].startswith('- ') if not ordered else bool(re.match(r'^\d+\. ',lines[i]))):
                out.append('<li>'+inline(re.sub(r'^(?:- |\d+\. )','',lines[i]))+'</li>');i+=1
            out.append('</'+tag+'>');continue
        paragraph=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|!\[|- |\d+\. )',lines[i]):paragraph.append(lines[i]);i+=1
        out.append('<p>'+inline(' '.join(paragraph))+'</p>')
    return '\n'.join(out)

documents=sorted(OUT.glob('0[0-6]-*.md'))
if (OUT/'VALIDATION.md').exists(): documents.append(OUT/'VALIDATION.md')
body=''
for path in documents:body+='<article id="'+path.stem+'">'+render(path.read_text(encoding='utf-8'))+'</article>'
nav=''.join('<a href="#'+p.stem+'">'+html.escape(p.stem.replace('-', ' ',1))+'</a>' for p in documents)
css='''*{box-sizing:border-box}body{margin:0;font:15px/1.65 Arial,sans-serif;color:#23354b;background:#eef3f8}header{background:#102d4c;color:white;padding:40px max(24px,calc((100vw - 1180px)/2))}header h1{margin:0;font-size:32px}header p{color:#d5e5f1}nav{display:flex;flex-wrap:wrap;gap:10px}nav a{color:#fff;border:1px solid #56748c;border-radius:7px;padding:5px 10px;font-size:12px}main{max-width:1240px;margin:28px auto;padding:0 20px}article{background:white;border:1px solid #dbe4ed;border-radius:12px;padding:30px;margin-bottom:25px}h2{font-size:27px;color:#102d4c;border-bottom:2px solid #dce6ef;padding-bottom:12px}h3{font-size:21px;color:#17628c;margin-top:30px}h4{font-size:17px}a{color:#0969ad}code{font:12px/1.5 Consolas,monospace;background:#eff4f8;padding:2px 4px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6fa;border:1px solid #dfe7ef;border-radius:8px;padding:15px;font-size:11px}pre code{padding:0;background:transparent}table{border-collapse:collapse;width:100%;font-size:12px}th,td{text-align:left;vertical-align:top;padding:9px;border:1px solid #dce6ef;overflow-wrap:anywhere}th{background:#eaf2f8;color:#173d5e}tr:nth-child(even){background:#f8fafc}.table-wrap{overflow:auto}figure{margin:22px 0}figure svg{width:100%;height:auto}figcaption{font-size:12px;color:#647a8d}li{margin:5px 0}@media print{@page{size:A4 landscape;margin:14mm}body{background:white;font-size:10px}header{padding:20px}nav{display:none}main{margin:0;padding:0;max-width:none}article{border:0;padding:0;page-break-before:always}article:first-child{page-break-before:auto}h2{font-size:23px}h3{font-size:16px;page-break-after:avoid}table{font-size:9px;table-layout:fixed}th,td{padding:5px}thead{display:table-header-group}tr{break-inside:avoid}figure{break-inside:avoid}pre{font-size:9px}a{color:#23354b;text-decoration:none}.table-wrap{overflow:visible}}'''
report='<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dokumentasi Teknis NIST Basis / BLACKOWL</title><style>'+css+'</style></head><body><header><h1>NIST Basis / BLACKOWL</h1><p>Dokumentasi infrastruktur, aplikasi, API, database dan keamanan | '+DATE+'</p><nav>'+nav+'</nav></header><main>'+body+'</main></body></html>'
save('NIST-Basis-Dokumentasi-Teknis.html',report)
print(json.dumps({'endpoints':catalog['endpointCount'],'tables':len(tables),'diagrams':6,'output':str(OUT)},ensure_ascii=False))
