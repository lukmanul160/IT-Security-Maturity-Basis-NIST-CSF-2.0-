const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'frontend/public/virtual-office/assets');
fs.mkdirSync(target, { recursive: true });
for (const name of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(root, 'node_modules/three/build', name), path.join(target, name));
fs.copyFileSync(path.join(root, 'node_modules/three/examples/jsm/controls/OrbitControls.js'), path.join(target, 'OrbitControls.js'));
fs.copyFileSync(path.join(root, 'node_modules/three/LICENSE'), path.join(target, 'THREE-LICENSE.txt'));
