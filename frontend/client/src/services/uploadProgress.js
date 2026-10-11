// One multipart transport for classic features and Vue components.
// Percentages describe network upload only; server work stays indeterminate.
function bytes(value) {
  const size = Number(value) || 0;
  return size >= 1024 ** 3 ? `${(size / 1024 ** 3).toFixed(2)} GB` : size >= 1024 ** 2 ? `${(size / 1024 ** 2).toFixed(1)} MB` : size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
}
function element(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className;
  if (text != null) node.textContent = text; return node;
}
export function setOperationProgress(prefix, { phase = 'processing', label, detail = '', percent = null } = {}) {
  const panel = document.getElementById(`${prefix}ProgressPanel`); if (!panel) return;
  panel.hidden = false; panel.dataset.phase = phase;
  panel.setAttribute('aria-busy', String(['uploading', 'processing', 'reading'].includes(phase)));
  panel.querySelector('[data-progress-label]').textContent = label || 'Memproses...';
  panel.querySelector('[data-progress-detail]').textContent = detail;
  const bar = panel.querySelector('progress');
  if (phase === 'error') bar.value = 0;
  else if (percent == null) bar.removeAttribute('value'); else bar.value = Math.max(0, Math.min(100, percent));
  bar.setAttribute('aria-label', label || 'Progres');
  panel.querySelector('[data-progress-percent]').textContent = percent == null ? (phase === 'error' ? 'Gagal' : 'Diproses') : `${Math.round(percent)}%`;
}
export function showOperationFiles(prefix, files, status = 'Dipilih') {
  const list = document.getElementById(`${prefix}SelectedFiles`); if (!list) return;
  list.replaceChildren(); list.hidden = !files.length;
  for (const file of files) {
    const item = element('li', 'upload-file-item');
    const name = element('strong', '', file.name); name.title = file.name;
    item.append(name, element('span', 'upload-file-size', bytes(file.size)), element('span', 'upload-file-state', status));
    list.append(item);
  }
}
function createTask(files, options) {
  if (options.uploadProgressTarget && document.getElementById(`${options.uploadProgressTarget}ProgressPanel`)) {
    const prefix = options.uploadProgressTarget;
    showOperationFiles(prefix, files);
    return { update(info) {
      setOperationProgress(prefix, info);
      showOperationFiles(prefix, files, ({ uploading: 'Dalam batch unggahan', processing: 'Menunggu hasil server', success: 'Selesai', error: 'Proses gagal' })[info.phase] || 'Dipilih');
    } };
  }
  const modal = [...document.querySelectorAll('dialog[open]')].at(-1);
  const host = modal || document.fullscreenElement;
  let center = host?.querySelector(':scope > .app-upload-center') || (!host && document.getElementById('appUploadCenter'));
  if (!center) {
    center = element('section', `app-upload-center${host ? ' app-upload-center-inline' : ''}`);
    center.setAttribute('aria-label', 'Progres unggahan');
    if (!host) center.id = 'appUploadCenter';
    center.append(element('h3', '', 'Progres unggahan'));
    (host || document.body).append(center);
    if (modal) modal.addEventListener('close', () => {
      if (!center.querySelector('.app-upload-task')) return;
      const destination = document.getElementById('appUploadCenter');
      if (destination) { for (const card of center.querySelectorAll('.app-upload-task')) destination.append(card); center.remove(); }
      else { center.id = 'appUploadCenter'; center.classList.remove('app-upload-center-inline'); document.body.append(center); }
    }, { once: true });
  }
  // Keep all active uploads, with bounded history of finished requests.
  const completed = [...center.querySelectorAll('.app-upload-task[data-finished="true"]')];
  while (completed.length >= 4) completed.shift().remove();
  const card = element('div', 'app-upload-task');
  const heading = element('div', 'upload-task-heading');
  const label = element('strong', '', 'Menyiapkan unggahan...');
  const close = element('button', 'upload-task-close', 'Tutup'); close.type = 'button'; close.hidden = true;
  close.onclick = () => { const current = card.closest('.app-upload-center'); card.remove(); if (current && !current.querySelector('.app-upload-task')) current.remove(); };
  heading.append(label, close);
  const bar = element('progress'); bar.max = 100; bar.value = 0;
  const detail = element('p', 'upload-progress-detail'); detail.setAttribute('role', 'status');
  const list = element('ul', 'upload-selected-files');
  for (const file of files) {
    const item = element('li', 'upload-file-item'); const name = element('strong', '', file.name); name.title = file.name;
    item.append(name, element('span', 'upload-file-size', bytes(file.size))); list.append(item);
  }
  card.append(heading, bar, detail, list); center.append(card);
  return { update(info) {
    card.dataset.phase = info.phase; label.textContent = info.label;
    if (info.phase === 'error') bar.value = 0;
    else if (info.percent == null) bar.removeAttribute('value'); else bar.value = info.percent;
    bar.setAttribute('aria-label', info.label); detail.textContent = info.detail || '';
    const finished = ['success', 'error'].includes(info.phase); card.dataset.finished = String(finished);
    card.setAttribute('aria-busy', String(!finished)); close.hidden = !finished;
  } };
}
export function uploadRequest(input, options = {}) {
  const files = [...options.body.values()].filter(value => value instanceof Blob && value.name);
  const task = options.uploadTask || createTask(files, options);
  const notify = info => {
    task.update(info);
    // UI observers must never interrupt the request or change its result.
    try { options.onUploadProgress?.(info); } catch (error) { console.error('[upload progress]', error); }
  };
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); let processing = false, settled = false;
    const clean = () => options.signal?.removeEventListener('abort', abort);
    const fail = (error, label = 'Unggahan gagal') => {
      if (settled) return; settled = true; clean();
      notify({ phase: 'error', label, detail: error.message, percent: null }); reject(error);
    };
    const abort = () => { xhr.abort(); fail(new DOMException('Unggahan dibatalkan.', 'AbortError'), 'Unggahan dibatalkan'); };
    const server = () => {
      if (processing || settled) return; processing = true;
      notify({ phase: 'processing', label: 'Unggahan terkirim; server sedang memproses', detail: 'Persentase pengiriman selesai. Tunggu hasil validasi dan penyimpanan server.', percent: null });
    };
    try {
      if (options.signal?.aborted) return abort();
      xhr.open(options.method || 'POST', input instanceof Request ? input.url : String(input));
      xhr.responseType = 'arraybuffer'; xhr.withCredentials = options.credentials === 'include';
      for (const [key, value] of new Headers(options.headers)) xhr.setRequestHeader(key, value);
      options.signal?.addEventListener('abort', abort, { once: true });
      xhr.upload.onprogress = event => {
        if (processing || settled) return;
        const percent = event.lengthComputable && event.total > 0 ? Math.min(100, event.loaded / event.total * 100) : null;
        notify({ phase: 'uploading', label: percent == null ? 'Mengunggah file...' : `Mengunggah file: ${Math.round(percent)}%`, detail: `${bytes(event.loaded)}${event.lengthComputable ? ` / ${bytes(event.total)}` : ''} · ${files.length} file`, percent });
      };
      xhr.upload.onload = server;
      xhr.onerror = () => fail(new TypeError('Koneksi terputus. Periksa hasil di aplikasi sebelum mencoba kembali.'));
      xhr.ontimeout = () => fail(new TypeError('Waktu unggahan habis.'));
      xhr.onabort = () => fail(new DOMException('Unggahan dibatalkan.', 'AbortError'), 'Unggahan dibatalkan');
      xhr.onload = () => {
        if (settled) return;
        try {
          if (!xhr.status) return fail(new TypeError('Respons server tidak tersedia.'));
          const headers = new Headers();
          for (const line of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
            const separator = line.indexOf(':'); if (separator > 0) headers.append(line.slice(0, separator), line.slice(separator + 1).trim());
          }
          const response = new Response([204, 205, 304].includes(xhr.status) ? null : xhr.response, { status: xhr.status, statusText: xhr.statusText, headers });
          Object.defineProperty(response, 'url', { value: xhr.responseURL });
          let message = '';
          if (!response.ok) { try { message = JSON.parse(new TextDecoder().decode(xhr.response)).error || ''; } catch {} }
          settled = true; clean();
          notify({ phase: response.ok ? 'success' : 'error', label: response.ok ? 'Unggahan selesai' : 'Unggahan gagal', detail: response.ok ? `${files.length} file selesai dikirim dan respons server diterima.` : message || `Server menolak unggahan (HTTP ${xhr.status}).`, percent: response.ok ? 100 : null });
          resolve(response);
        } catch (error) { fail(error); }
      };
      notify({ phase: 'uploading', label: 'Menyiapkan unggahan...', detail: `${files.length} file · ${bytes(files.reduce((sum, file) => sum + file.size, 0))}`, percent: 0 });
      xhr.send(options.body);
    } catch (error) { fail(error); }
  });
}
export function installUploadProgress() {
  if (window.NistUploadProgress) return;
  const original = window.fetch.bind(window);
  window.fetch = (input, options = {}) => {
    let url; try { url = new URL(input instanceof Request ? input.url : String(input), window.location.href); } catch { return original(input, options); }
    const multipart = options.body instanceof FormData && [...options.body.values()].some(value => value instanceof Blob && value.name);
    const method = (options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!multipart || ['GET', 'HEAD'].includes(method) || url.origin !== window.location.origin || !url.pathname.startsWith('/api/') || options.credentials === 'omit' || input instanceof Request) return original(input, options);
    return uploadRequest(input, options);
  };
  window.NistUploadProgress = { setProgress: setOperationProgress, showFiles: showOperationFiles, begin(files, label = 'Menyiapkan file...') {
    const task = createTask(files, {});
    task.update({ phase: 'reading', label, detail: `${files.length} file`, percent: null });
    return task;
  } };
}
