/** Shared reminder polling: no overlapping runs; retry infrastructure failures in five minutes.
 * Callers retain advisory locks and delivery history; SMTP success is recorded by each service.
 * Only fixed error categories are logged so connection strings and credentials stay private.
 */
function startReminderScheduler(run, label) {
  const retryMs = 5 * 60 * 1000;
  const normalMs = 60 * 60 * 1000;
  let running = false, nextRun = 0;
  const tick = async () => {
    if (running || Date.now() < nextRun) return;
    running = true;
    try {
      await run();
      nextRun = Date.now() + normalMs;
    } catch (error) {
      nextRun = Date.now() + retryMs;
      const reason = /timeout|ECONN|connection terminated/i.test(String(error?.code || '') + ' ' + String(error?.message || ''))
        ? 'Koneksi database/SMTP gagal atau timeout.' : 'Pemeriksaan reminder gagal.';
      console.error(`[${label}] ${reason} Otomatis dicoba kembali dalam 5 menit; periksa koneksi database dan pengaturan SMTP.`);
    } finally { running = false; }
  };
  const timer = setInterval(tick, retryMs);
  timer.unref();
  void tick();
  return timer;
}
module.exports = { startReminderScheduler };
