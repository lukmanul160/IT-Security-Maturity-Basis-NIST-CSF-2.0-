export function drawGameDisplay(canvas, playing, time = 0) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#101d39'; ctx.fillRect(0, 0, w, h);
  if (!playing) {
    ctx.fillStyle = '#759cfb'; ctx.font = 'bold 32px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('GAME LOUNGE', w / 2, h * .42);
    ctx.fillStyle = '#edf4ff'; ctx.font = '18px system-ui';
    ctx.fillText('Siap bermain', w / 2, h * .62);
    return;
  }
  // A lightweight racing illustration, animated directly on the TV texture.
  ctx.fillStyle = '#80caff'; ctx.fillRect(0, 0, w, h * .45);
  ctx.fillStyle = '#ffe4a0'; ctx.beginPath(); ctx.arc(w * .78, h * .18, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4c9d78'; ctx.beginPath(); ctx.moveTo(0, h * .45);
  for (let x = 0; x <= w; x += 64) ctx.lineTo(x, h * (.25 + (x % 128 ? .12 : 0)));
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  ctx.fillStyle = '#354457'; ctx.beginPath(); ctx.moveTo(w * .43, h * .43);
  ctx.lineTo(w * .57, h * .43); ctx.lineTo(w * .9, h); ctx.lineTo(w * .1, h); ctx.fill();
  for (let i = 0; i < 7; i++) {
    const progress = ((i / 7 + time * .55) % 1), y = h * (.44 + progress * .56);
    ctx.fillStyle = '#f8f0be'; ctx.fillRect(w / 2 - 2 - progress * 3, y, 4 + progress * 6, 3 + progress * 15);
  }
  const carX = w / 2 + Math.sin(time * 1.5) * w * .14, carY = h * .78;
  ctx.fillStyle = '#111b2c'; ctx.fillRect(carX - 31, carY + 2, 62, 41);
  ctx.fillStyle = '#f16d65'; ctx.fillRect(carX - 25, carY - 8, 50, 53);
  ctx.fillStyle = '#bde9fa'; ctx.fillRect(carX - 18, carY, 36, 16);
  ctx.fillStyle = '#fff0bd'; ctx.fillRect(carX - 21, carY + 35, 10, 5); ctx.fillRect(carX + 11, carY + 35, 10, 5);
  ctx.fillStyle = '#101d39dd'; ctx.fillRect(0, 0, w, 34);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 17px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('COMMONS RACING', 16, 23); ctx.textAlign = 'right';
  ctx.fillText('LAP 1/3', w - 16, 23);
}
