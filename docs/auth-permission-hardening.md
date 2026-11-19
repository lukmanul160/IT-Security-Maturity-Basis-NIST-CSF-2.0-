# Pengamanan izin modul (19 November 2026)

Identitas pemanggil berasal dari cookie sesi acak `nist_session` yang HttpOnly,
bukan role, actions, atau permissions dalam body/query/header. Pada deployment
sebenarnya, sesi diverifikasi terhadap akun PostgreSQL beserta role dan hash
kredensial. Middleware modul mengambil izin role dari database setiap request.
Endpoint pengelolaan akun dan izin tetap membutuhkan administrator.

`permissionService.effectiveActions` kini hanya menerima boolean literal `true`
untuk allowed, read, dan aksi terkait; string `"false"`, `"true"`, angka, serta
objek tidak memberikan izin. Role/modul tidak dikenal ditolak. Penolakan read
menolak seluruh aksi modul. Perubahan izin berlaku pada request berikutnya.

Frontend memakai actions eksplisit dengan boolean literal. `canPerform` tidak
lagi memberikan bypass karena role admin, navigasi tidak memakai fallback daftar
modul berdasarkan role, dan Policy Register tidak memakai fallback aksi role.
Role pada profil masih diperlukan oleh tampilan dan workflow; mengetahui namanya
bukan kredensial. Request operasional tidak perlu mengirim role pemanggil.
Pengelolaan akun oleh admin tetap mengirim role akun tujuan yang sedang diedit.

Browser dikuasai penggunanya: respons `/api/auth/me`, JavaScript dan DOM dapat
diubah untuk menampilkan menu/tombol. Ini tidak dapat dicegah oleh frontend.
Keamanan data dan operasi wajib tetap ditegakkan oleh API meski seluruh UI dipalsukan.
Perubahan ini tidak menyatakan payload profil contoh membuktikan bypass API;
contoh tersebut berisi profil administrator.

## Verifikasi dan batas

Regresi `test/roleActionPermissions.test.js` mencakup boolean ketat, kontrol
frontend tanpa izin meski role dipalsukan, pemalsuan role/read lewat HTTP pada
endpoint modul, penolakan perubahan akun/izin, sesi hilang, dan pencabutan izin.
Tes HTTP memakai router asli, sesi fixture user biasa dan query database mock;
tidak mengakses data operasional. Tes tidak membuktikan kondisi server produksi,
integrasi PostgreSQL nyata, Docker, atau browser interaktif.

Perintah pada Windows dengan sandbox pembatasan spawn:

```powershell
node --require ./scripts/security-test-isolation.cjs --test --test-isolation=none test/roleActionPermissions.test.js test/userModuleAccess.test.js
npm.cmd run build
npm.cmd run knowledge:build
npm.cmd run knowledge:check
```

Regresi terarah: 9 lulus, 1 tes integrasi PostgreSQL dilewati karena tidak diaktifkan.
Regresi tambahan dijalankan per file: securityHardening 11, owaspRemediation 5,
dan runtimeManifest 5 tes lulus. Menjalankan ketiganya dalam satu proses sempat
gagal pada teardown karena pool ditutup dua kali; eksekusi terpisah lulus.
Build frontend lulus setelah izin spawn esbuild diberikan; peringatan legacy
script, font yang diresolve saat runtime dan chunk besar tetap ada.
Knowledge graph dibangun ulang dan check lulus.
Restart backend dan distribusikan hasil build frontend untuk menerapkan perubahan.
