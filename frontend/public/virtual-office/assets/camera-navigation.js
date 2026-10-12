import * as THREE from 'three';

export function installCameraNavigation(camera, controls, canvas, root) {
  const held = new Set();
  const right = new THREE.Vector3(), forward = new THREE.Vector3(), delta = new THREE.Vector3();
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Kamera kantor 3D. Gunakan WASD atau tombol panah untuk bergerak.');
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  function setMode(mode) {
    const pan = mode === 'pan';
    controls.mouseButtons.LEFT = pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = pan ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    controls.touches.ONE = pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    canvas.style.cursor = pan ? 'grab' : 'move';
    root.querySelectorAll('[data-camera-mode]').forEach(button => {
      const active = button.dataset.cameraMode === mode;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function move(direction, seconds) {
    if (direction === 'in' || direction === 'out') {
      delta.copy(camera.position).sub(controls.target);
      const distance = delta.length();
      const next = THREE.MathUtils.clamp(distance * Math.exp((direction === 'in' ? -1 : 1) * seconds * 1.5), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(delta.setLength(next));
    } else {
      camera.updateMatrixWorld();
      right.setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0; right.normalize();
      forward.copy(controls.target).sub(camera.position); forward.y = 0; forward.normalize();
      const speed = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * .35, 3, 25);
      delta.copy(direction === 'left' || direction === 'right' ? right : forward);
      delta.multiplyScalar(speed * seconds * (direction === 'left' || direction === 'down' ? -1 : 1));
      camera.position.add(delta); controls.target.add(delta);
    }
    controls.update();
  }
  root.querySelectorAll('[data-camera-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.cameraMode)));
  root.querySelectorAll('[data-camera-move]').forEach(button => {
    const direction = button.dataset.cameraMove;
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); button.focus(); button.setPointerCapture(event.pointerId);
      held.add(direction); move(direction, .12);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(event, () => held.delete(direction));
    button.addEventListener('click', event => { if (event.detail === 0) move(direction, .18); });
  });
  const keys = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Equal: 'in', NumpadAdd: 'in', Minus: 'out', NumpadSubtract: 'out' };
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
  canvas.addEventListener('keydown', event => { const direction = keys[event.code]; if (!direction) return; event.preventDefault(); if (!held.has(direction)) move(direction, .08); held.add(direction); });
  canvas.addEventListener('keyup', event => { const direction = keys[event.code]; if (direction) { event.preventDefault(); held.delete(direction); } });
  canvas.addEventListener('blur', () => held.clear());
  window.addEventListener('blur', () => held.clear());
  document.addEventListener('visibilitychange', () => held.clear());
  setMode('pan');
  return { get active() { return held.size > 0; }, update(seconds) { held.forEach(direction => move(direction, seconds)); } };
}
