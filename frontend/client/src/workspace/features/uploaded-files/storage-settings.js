async function fileStorageRequest(method, suffix = '', payload) {
  const response = await fetch(`/api/storage-settings${suffix}`, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Pengaturan storage gagal diproses.');
  return data;
}
function updateFileStorageFields() {
  const shared = $('fileStorageMode').value === 'shared';
  $('fileStorageDirectoryGroup').hidden = !shared;
  $('fileStorageDirectory').required = shared;
}
function populateFileStorage(data) {
  $('fileStorageMode').value = data.mode;
  $('fileStorageDirectory').value = data.directory || '';
  $('fileStorageLocal').textContent = `Folder lokal server: ${data.localDirectory}`;
  updateFileStorageFields();
}
$('fileStorageSettings').addEventListener('toggle', async () => {
  if (!$('fileStorageSettings').open || currentUserRole !== 'admin') return;
  $('fileStorageFields').disabled = true;
  $('fileStorageStatus').textContent = 'Memuat pengaturan...';
  try {
    populateFileStorage(await fileStorageRequest('GET'));
    $('fileStorageFields').disabled = false;
    $('fileStorageStatus').textContent = 'Pengaturan siap diedit. Simpan akan menguji akses folder terlebih dahulu.';
  } catch (error) { $('fileStorageStatus').textContent = `${error.message} Tutup dan buka pengaturan untuk mencoba kembali.`; }
});
$('fileStorageMode').addEventListener('change', updateFileStorageFields);
async function submitFileStorage(save) {
  if (currentUserRole !== 'admin' || !$('fileStorageForm').reportValidity()) return;
  const payload = { mode: $('fileStorageMode').value, directory: $('fileStorageDirectory').value.trim() };
  $('fileStorageFields').disabled = true;
  $('fileStorageStatus').textContent = save ? 'Menguji folder dan menyimpan pengaturan...' : 'Menguji baca, tulis, dan hapus file sementara...';
  try {
    const data = await fileStorageRequest(save ? 'PUT' : 'POST', save ? '' : '/test', payload);
    if (save) populateFileStorage(data);
    $('fileStorageStatus').textContent = save ? 'Pengaturan tersimpan dan langsung berlaku untuk upload baru. File lama tetap pada lokasi asal.' : data.message;
  } catch (error) { $('fileStorageStatus').textContent = error.message; }
  finally { $('fileStorageFields').disabled = false; }
}
$('fileStorageForm').addEventListener('submit', event => { event.preventDefault(); submitFileStorage(true); });
$('fileStorageTest').addEventListener('click', () => submitFileStorage(false));

