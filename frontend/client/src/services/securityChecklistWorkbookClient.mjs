/** Transfer the input, cap parsing time, and always release the dedicated worker. */
export function readChecklistWorkbookAsync(buffer, defaults) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./securityChecklistWorkbook.worker.mjs', import.meta.url), {
      type: 'module',
    });
    const finish = (error, result) => {
      clearTimeout(timer);
      worker.terminate();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(
      () => finish(Error('Pemrosesan Excel melewati batas waktu. Kurangi ukuran file.')),
      15000,
    );
    worker.onmessage = ({ data }) => finish(data.error ? Error(data.error) : null, data.result);
    worker.onerror = () => finish(Error('File Excel tidak dapat dibaca. Gunakan format .xlsx.'));
    worker.postMessage({ buffer, defaults: JSON.parse(JSON.stringify(defaults)) }, [buffer]);
  });
}
