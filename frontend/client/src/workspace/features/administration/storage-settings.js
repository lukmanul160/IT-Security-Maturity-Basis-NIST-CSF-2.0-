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
  const mode = $('fileStorageMode').value;
  const cloud = ['s3', 'gcs'].includes(mode);
  $('fileStorageCloudGroup').hidden = !cloud;
  $('fileStorageBucket').required = cloud;
  $('fileStorageRegionGroup').hidden = mode !== 's3';
  $('fileStorageRegion').required = mode === 's3';
  $('fileStorageProjectGroup').hidden = mode !== 'gcs';
  for (const [id, enabled] of [['fileStorageDirectory', shared], ['fileStorageBucket', cloud], ['fileStoragePrefix', cloud], ['fileStorageRegion', mode === 's3'], ['fileStorageProject', mode === 'gcs']]) $(id).disabled = !enabled;
}
function populateFileStorage(data) {
  $('fileStorageMode').value = data.mode;
  $('fileStorageDirectory').value = data.directory || '';
  $('fileStorageBucket').value = data.bucket || '';
  $('fileStoragePrefix').value = data.prefix || '';
  $('fileStorageRegion').value = data.region || '';
  $('fileStorageProject').value = data.projectId || '';
  $('fileStorageLocal').textContent = `Folder lokal server: ${data.localDirectory}`;
  updateFileStorageFields();
}
document.querySelector('[data-account-tab="storage"]').addEventListener('click', async () => {
  if (currentUserRole !== 'admin') return;
  $('fileStorageFields').disabled = true;
  $('fileStorageStatus').textContent = 'Memuat pengaturan...';
  try {
    populateFileStorage(await fileStorageRequest('GET'));
    $('fileStorageFields').disabled = false;
    $('fileStorageStatus').textContent = 'Pengaturan siap diedit. Simpan akan menguji akses storage terlebih dahulu.';
  } catch (error) { $('fileStorageStatus').textContent = `${error.message} Buka kembali tab Storage Setting untuk mencoba kembali.`; }
});
$('fileStorageMode').addEventListener('change', updateFileStorageFields);
async function submitFileStorage(save) {
  if (currentUserRole !== 'admin' || !$('fileStorageForm').reportValidity()) return;
  const payload = { mode: $('fileStorageMode').value, directory: $('fileStorageDirectory').value.trim(), bucket: $('fileStorageBucket').value.trim(), prefix: $('fileStoragePrefix').value.trim(), region: $('fileStorageRegion').value.trim(), projectId: $('fileStorageProject').value.trim() };
  $('fileStorageFields').disabled = true;
  $('fileStorageStatus').textContent = save ? 'Menguji storage dan menyimpan pengaturan...' : 'Menguji baca, tulis, dan hapus file sementara...';
  try {
    const data = await fileStorageRequest(save ? 'PUT' : 'POST', save ? '' : '/test', payload);
    if (save) populateFileStorage(data);
    $('fileStorageStatus').textContent = save ? 'Pengaturan tersimpan dan langsung berlaku untuk upload baru. File lama tetap pada lokasi asal.' : data.message;
  } catch (error) { $('fileStorageStatus').textContent = error.message; }
  finally { $('fileStorageFields').disabled = false; }
}
$('fileStorageForm').addEventListener('submit', event => { event.preventDefault(); submitFileStorage(true); });
$('fileStorageTest').addEventListener('click', () => submitFileStorage(false));

