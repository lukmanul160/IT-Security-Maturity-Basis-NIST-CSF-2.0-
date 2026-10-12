const panel = document.querySelector('.scene-panel');
const button = document.getElementById('fullscreen');

function updateFullscreen() {
  const active = document.fullscreenElement === panel || panel.classList.contains('office-expanded');
  button.textContent = active ? 'Keluar fullscreen' : 'Fullscreen';
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Keluar dari layar penuh kantor virtual' : 'Buka kantor virtual dalam layar penuh');
}

function closeExpanded() {
  panel.classList.remove('office-expanded');
  document.body.classList.remove('office-fullscreen-open');
  updateFullscreen();
}

button.addEventListener('click', async () => {
  if (document.fullscreenElement === panel) {
    await document.exitFullscreen();
  } else if (panel.classList.contains('office-expanded')) {
    closeExpanded();
  } else {
    try {
      if (!panel.requestFullscreen) throw new Error('Fullscreen unavailable');
      await panel.requestFullscreen();
    } catch {
      // Mobile browsers without the Fullscreen API can still fill the viewport.
      panel.classList.add('office-expanded');
      document.body.classList.add('office-fullscreen-open');
    }
  }
  updateFullscreen();
});
document.addEventListener('fullscreenchange', updateFullscreen);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && panel.classList.contains('office-expanded')) closeExpanded();
});
updateFullscreen();
