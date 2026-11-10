# Akses jaringan Docker HTTPS melalui IP VM

Panduan Docker saat ini: [Nginx HTTPS, IP ke domain, dan arsitektur](DOCKER_HTTPS.md).

Set BLACKOWL_ADDRESS ke IP VM (sertifikat lokal default) pada .env.docker.
Hanya Nginx membuka TCP 80/443; backend 8000, port lama 5000 dan PostgreSQL
5432 tidak dipublikasikan. Buka https://IP-VM/login setelah memasang root CA
Nginx pada setiap perangkat pengguna. HTTP port 80 hanya redirect ke HTTPS.

Periksa NIC/VLAN/routing VM, firewall dan ACL jaringan. Contoh dari Windows:

```powershell
Test-NetConnection 192.168.130.12 -Port 443
```

Gunakan IP aktual; 0.0.0.0 adalah binding interface, bukan alamat browser.
Pada Docker Linux, publikasi port dapat melewati aturan UFW biasa; batasi
akses lewat firewall yang sesuai backend Docker atau ACL jaringan.

Untuk instalasi Node langsung yang sudah ada, lihat [INSTALLATION.md](INSTALLATION.md).
Petunjuk HTTP :5000 sebelumnya tidak berlaku bagi deployment Docker sekarang.
Konektivitas VM belum diuji dari sesi ini.
