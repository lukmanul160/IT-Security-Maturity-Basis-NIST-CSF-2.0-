# Virtual office: sumber dan vendor

Kode aplikasi: `office.js`, `office-fullscreen.js`, `office-activities.js`,
`camera-navigation.js`, `game-display.js` dan `avatar-pose.js`.
Katalog AST global mencakup sumber aplikasi tersebut. Pertahankan kontrak pesan,
input dan koordinat antarfile ketika memindahkan fungsi.

`three.module.js`, `three.core.js`, `OrbitControls.js` dan `THREE-LICENSE.txt`
adalah salinan dependency yang dibuat oleh `scripts/prepare-virtual-office.js`.
Jangan mengedit salinan vendor tersebut; perbarui dependency/build yang sesuai.
Katalog sengaja mengecualikan kode vendor dan aset hash hasil build.
