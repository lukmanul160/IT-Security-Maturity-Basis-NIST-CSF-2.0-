# Akses aplikasi melalui jaringan: 192.168.130.12:5000

Panduan ini menggunakan contoh IP server **192.168.130.12** dan port **5000**.
Sesuaikan IP, port, dan subnet dengan jaringan sebenarnya. Perintah konfigurasi
dijalankan di server, dari folder yang berisi `compose.yaml`/`package.json`.
Perintah pemeriksaan dari komputer pengguna ditandai secara terpisah.

## 1. Pastikan IP dan aplikasi server

Windows:

```powershell
ipconfig
```

Linux:

```bash
ip -br addr
```

Pastikan `192.168.130.12` benar-benar IP host yang menjalankan aplikasi, bukan IP
container atau alamat host virtualisasi ketika aplikasi berada di VM. Jika di
VM, periksa juga pengaturan NIC, VLAN, dan routing VM.

Untuk Docker, periksa:

```text
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail 100 app db
```

Database harus healthy dan aplikasi selesai startup. Jika container gagal,
selesaikan error log terlebih dahulu.

## 2. Docker: ubah binding port agar dapat diakses dari LAN

Konfigurasi awal `BLACKOWL_BIND_IP=127.0.0.1` membatasi akses ke komputer server
sendiri. Binding ini menjelaskan mengapa localhost bisa dibuka tetapi IP LAN
tidak. Lihat [penjelasan port publishing Docker](https://docs.docker.com/engine/network/port-publishing/).

Buka konfigurasi yang sudah ada; jangan menyalin ulang template atau mengganti
password database.

Windows:

```powershell
notepad .env.docker
```

Linux:

```bash
nano .env.docker
```

Untuk pengujian HTTP di jaringan internal, ubah tiga nilai berikut:

```dotenv
BLACKOWL_BIND_IP=0.0.0.0
BLACKOWL_PORT=5000
BLACKOWL_COOKIE_SECURE=false
```

`0.0.0.0` menerima koneksi pada seluruh interface host. Jika ingin memakai
hanya IP LAN tertentu, isi `BLACKOWL_BIND_IP=192.168.130.12` dan pastikan IP
tersebut tersedia pada host. URL browser tetap memakai IP server, bukan `0.0.0.0`.

Simpan, kemudian terapkan:

```text
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d
docker compose --env-file .env.docker ps
```

Kolom Ports aplikasi harus menampilkan `0.0.0.0:5000->8000/tcp` (atau IP khusus
yang Anda pilih). `up -d` menerapkan perubahan konfigurasi dengan recreate bila
diperlukan; **`restart app` saja tidak menerapkan perubahan port/environment**.
Build ulang tidak diperlukan jika hanya mengubah nilai ini.

Buka dari server dan komputer pengguna:

**http://192.168.130.12:5000/login**

Jika memakai `0.0.0.0`, `http://localhost:5000/login` juga dapat diuji dari server.
Jika binding memakai IP khusus, uji IP tersebut karena localhost tidak ikut
dipublikasikan. Tidak perlu membuka port database 5432 ke LAN.

## 3. Manual tanpa Docker: gunakan port 5000

Bagian ini hanya untuk instalasi Node.js langsung. Edit `.env`, pertahankan
konfigurasi database, lalu atur:

```dotenv
PORT=5000
SESSION_COOKIE_SECURE=false
```

Nilai cookie `false` digunakan untuk pengujian HTTP internal. Restart proses
Node.js, systemd, atau task yang menjalankan aplikasi. Contoh foreground:

Windows:

```powershell
npm.cmd start
```

Linux:

```bash
npm start
```

Hentikan proses lama terlebih dahulu agar tidak menjalankan instance ganda.
Server memakai `app.listen(port)` tanpa pembatasan host, sehingga menerima
koneksi pada interface host. `BLACKOWL_BIND_IP` hanya berlaku untuk Docker.
Buka **http://192.168.130.12:5000/login** setelah startup selesai.

## 4. Periksa firewall host dan jaringan

Izinkan TCP **5000** dari jaringan pengguna yang diperlukan. Contoh berikut
mengasumsikan subnet pengguna `192.168.130.0/24`; ganti jika berbeda.

### Windows Firewall

Buka PowerShell sebagai Administrator pada server:

```powershell
New-NetFirewallRule -DisplayName 'NIST Basis TCP 5000 LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5000 -RemoteAddress 192.168.130.0/24 -Profile Any
```

Jalankan sekali jika aturan belum ada. Periksa:

```powershell
Get-NetFirewallRule -DisplayName 'NIST Basis TCP 5000 LAN'
```

Jika pengguna berasal dari subnet lain, tambahkan rentang yang sesuai kebijakan
jaringan. Kebijakan firewall organisasi dapat mengesampingkan aturan lokal.

### Ubuntu dengan UFW

Periksa status dan, jika UFW memang digunakan, tambahkan aturan:

```bash
sudo ufw status
sudo ufw allow from 192.168.130.0/24 to any port 5000 proto tcp
```

Jangan mengaktifkan/reset firewall hanya untuk mengikuti panduan ini. Untuk
aplikasi Node.js langsung, aturan tersebut membuka akses sesuai subnet.
Pada Docker Linux, published ports dapat melewati aturan UFW; pembatasan subnet
memerlukan aturan firewall yang sesuai backend Docker atau ACL firewall jaringan.
Jangan menganggap aturan UFW di atas membatasi akses container. Lihat
[firewall Docker](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

Jika server berada di VLAN/subnet berbeda, pastikan router/firewall antarjaringan
mengizinkan TCP 5000 menuju `192.168.130.12`. IP ini merupakan alamat internal;
akses dari luar jaringan memerlukan jalur seperti VPN.

## 5. Uji dari komputer pengguna

Windows PowerShell, **di komputer pengguna**:

```powershell
Test-NetConnection 192.168.130.12 -Port 5000
```

Hasil yang diharapkan: `TcpTestSucceeded : True`.

Linux, **di komputer pengguna**:

```bash
curl -I --connect-timeout 5 http://192.168.130.12:5000/login
```

Respons halaman login yang normal adalah HTTP 200. Ping gagal belum membuktikan
aplikasi mati karena ICMP dapat diblokir; periksa TCP dan HTTP secara langsung.

| Hasil | Pemeriksaan berikutnya |
| --- | --- |
| Lokal/IP server gagal dari server sendiri | Periksa startup, port, dan log aplikasi; pada Docker periksa Ports di `compose ps`. |
| Lokal berhasil, akses LAN gagal | Periksa binding `127.0.0.1`, firewall host, ACL jaringan, dan routing. |
| TCP dari pengguna gagal | Periksa IP tujuan, subnet/VPN, firewall, NIC VM, dan apakah port dipublikasikan. |
| TCP berhasil, HTTP gagal | Periksa log aplikasi, pastikan URL memakai `http://`, dan pastikan port 5000 milik aplikasi ini. |
| Halaman terbuka tetapi login kembali terus | Untuk HTTP pengujian, cookie Secure harus false; terapkan konfigurasi dan coba login kembali. |
| `port is already allocated` / `EADDRINUSE` | Ada layanan lain memakai 5000; hentikan instance duplikat atau pilih port lain. |

## 6. Login awal dan HTTPS produksi

Untuk akun yang baru dibuat seed:

| Username | Password awal |
| --- | --- |
| `admin` | `AdminInitial123!` |
| `user` | `UserInitial123!` |

Segera ubah kedua password melalui **Account → Account Management → Save
profile**. Akun yang sudah ada tetap menggunakan password lamanya.

Untuk operasional produksi, gunakan reverse proxy HTTPS dan cookie Secure:
Docker `BLACKOWL_COOKIE_SECURE=true`; manual `SESSION_COOKIE_SECURE=true`
dengan `NODE_ENV=production`. Proxy harus mempertahankan header Host asli.
Jika proxy berada di host yang sama, backend dapat kembali memakai binding
loopback. Lihat [HTTPS instalasi manual](INSTALLATION.md#7-deployment-https)
dan [konfigurasi Docker](DOCKER.md#konfigurasi-dan-penyimpanan).

Panduan dicocokkan dengan konfigurasi proyek; konektivitas server
`192.168.130.12` belum diuji dari sesi ini.
