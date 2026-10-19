;(() => {
  const key = 'office-design';
  const canvas = $('odCanvas'), properties = $('odProperties');
  let design = { id: null, name: 'Denah baru', version: 0, layout: { width: 1000, height: 800, nodes: [] } };
  let selected = null, dirty = false, busy = false, loading = false;
  let undo = [], redo = [], drag = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  const html = value => escapeHtml(String(value ?? ''));
  const editable = () => !busy && !loading && canPerform(key, design.id ? 'update' : 'create');
  const activeNode = () => design.layout.nodes.find(node => node.id === selected);
  function newNodeId() {
    if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    // getRandomValues also works on HTTP intranet origins.
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  const status = message => { $('odStatus').textContent = message; };
  const snap = value => $('odSnap').checked ? Math.round(value / 10) * 10 : Math.round(value);
  const clamp = (value, max) => Math.min(Math.max(0, value), max);
  function checkpoint() { undo.push(clone(design)); if (undo.length > 60) undo.shift(); redo = []; dirty = true; }
  function setDesign(value) { design = clone(value); selected = null; undo = []; redo = []; dirty = false; }
  async function request(path = '', options = {}) {
    const response = await fetch(`/api/office-design${path}`, { cache: 'no-store', ...options });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Gagal memproses denah.');
    return response.status === 204 ? null : response.json();
  }
  function renderCanvas() {
    const { width, height, nodes } = design.layout;
    canvas.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const viewport = $('odViewport');
    const scale = $('odZoom').value === 'fit'
      ? Math.max(.1, Math.min((viewport.clientWidth - 48) / width, (viewport.clientHeight - 48) / height))
      : Number($('odZoom').value);
    canvas.setAttribute('width', width * scale);
    canvas.setAttribute('height', height * scale);
    canvas.innerHTML = `<defs><pattern id="odGrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#d8d0c3" stroke-width=".5"/></pattern></defs><rect width="${width}" height="${height}" fill="#f4efe6"/><rect width="${width}" height="${height}" fill="url(#odGrid)"/>` + nodes.map(node => `<g data-od-node="${html(node.id)}">${officeShapeSvg(node, html)}</g>`).join('');
    canvas.insertAdjacentHTML('beforeend', nodes.map(node => officeCctvCoverageSvg(node, design.layout.unitsPerMeter ?? 100)).join(''));
    const node = activeNode();
    if (node) canvas.insertAdjacentHTML('beforeend', `<rect data-od-selection x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" transform="rotate(${node.rotation} ${node.x + node.width / 2} ${node.y + node.height / 2})" fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="6 3" pointer-events="none"/><rect data-od-resize x="${node.x + node.width - 5}" y="${node.y + node.height - 5}" width="10" height="10" transform="rotate(${node.rotation} ${node.x + node.width / 2} ${node.y + node.height / 2})" fill="#2563eb" stroke="white" style="cursor:nwse-resize"/>`);
    if (node && editable()) {
      const radius = 9 / scale, offset = 28 / scale;
      canvas.insertAdjacentHTML('beforeend', `<g transform="rotate(${node.rotation} ${node.x + node.width / 2} ${node.y + node.height / 2})"><line x1="${node.x + node.width / 2}" y1="${node.y}" x2="${node.x + node.width / 2}" y2="${node.y - offset}" stroke="#2563eb" stroke-width="${2 / scale}" pointer-events="none"/><circle data-od-rotate cx="${node.x + node.width / 2}" cy="${node.y - offset}" r="${radius}" fill="#fff" stroke="#2563eb" stroke-width="${2 / scale}" style="cursor:grab"><title>Tarik untuk memutar objek (Shift: kelipatan 15°)</title></circle></g>`);
    }
    $('odName').textContent = design.name + (dirty ? ' • Belum disimpan' : '');
    $('odDimensions').textContent = `${width} × ${height} satuan · ${nodes.length} objek · ${selected ? officeDesignShapes[node?.type]?.label || '' : 'Pilih objek untuk mengedit'}`;
  }
  function renderControls() {
    const node = activeNode(), canEdit = editable();
    properties.hidden = !node;
    $('odSelectionHint').hidden = Boolean(node);
    for (const field of properties.elements) field.disabled = !canEdit;
    if (node) for (const field of ['label', 'x', 'y', 'width', 'height', 'rotation']) properties.elements[field].value = node[field];
    $('odCctvProperties').hidden = node?.type !== 'cctv';
    if (node?.type === 'cctv') {
      properties.elements.coverageRange.value = node.coverageRange ?? 5;
      properties.elements.coverageAngle.value = node.coverageAngle ?? 90;
      properties.elements.showCoverage.checked = node.showCoverage !== false;
    }
    $('odSave').disabled = !canEdit || !dirty;
    $('odSettings').disabled = !canEdit;
    $('odTemplate').disabled = !canEdit;
    $('odNew').hidden = !canPerform(key, 'create');
    $('odNew').disabled = busy || loading;
    $('odDelete').hidden = !canPerform(key, 'delete');
    $('odDelete').disabled = !design.id || busy || loading;
    $('odReload').disabled = busy || loading;
    $('odLayouts').disabled = busy || loading;
    $('odUndo').disabled = !canEdit || !undo.length;
    $('odRedo').disabled = !canEdit || !redo.length;
    document.querySelectorAll('[data-od-add]').forEach(button => { button.disabled = !canEdit; });
  }
  function render() { renderCanvas(); renderControls(); }
  async function refreshList() {
    const list = await request();
    $('odLayouts').innerHTML = '<option value="">Denah belum tersimpan</option>' + list.map(row => `<option value="${html(row.id)}">${html(row.name)}</option>`).join('');
    $('odLayouts').value = design.id || '';
    return list;
  }
  async function load(id) {
    loading = true; renderControls(); status('Memuat denah...');
    try {
      if (id) setDesign(await request(`/${encodeURIComponent(id)}`));
      else setDesign({ id: null, name: 'Denah baru', version: 0, layout: { width: 1000, height: 800, nodes: [] } });
      $('odLayouts').value = design.id || '';
      status(design.id ? 'Denah dimuat.' : 'Mulai dari kanvas kosong atau gunakan Contoh denah kantor.');
    } catch (error) { status(error.message); $('odLayouts').value = design.id || ''; }
    finally { loading = false; render(); }
  }
  const mayDiscard = () => !dirty || confirm('Ada perubahan denah yang belum disimpan. Abaikan perubahan?');
  document.querySelector('[data-view="office-design"]').addEventListener('click', async () => {
    if (!canPerform(key, 'read')) return;
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active-view', view.id === 'officeDesignView'));
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === key));
    saveUiState(key); render();
    if (loading || busy) return;
    loading = true; renderControls();
    try {
      const list = await refreshList();
      if (!design.id && !dirty && !design.layout.nodes.length && list.length) {
        await load(list[0].id);
      }
    } catch (error) { status(error.message); }
    finally { loading = false; render(); }
  });
  document.addEventListener('click', event => {
    const navigation = event.target.closest('.nav-item[data-view]');
    if (!navigation || navigation.dataset.view === key || !$('officeDesignView').classList.contains('active-view')) return;
    if (busy || (dirty && !confirm('Perubahan denah belum disimpan. Pindah halaman? Perubahan tetap tersedia selama halaman ini tidak dimuat ulang.'))) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  $('odLayouts').addEventListener('change', event => {
    if (!mayDiscard()) { event.target.value = design.id || ''; return; }
    void load(event.target.value);
  });
  $('odReload').addEventListener('click', async () => {
    if (!mayDiscard()) return;
    try { await refreshList(); await load(design.id); } catch (error) { status(error.message); }
  });
  $('odNew').addEventListener('click', async () => {
    if (busy || loading || !canPerform(key, 'create')) return;
    if (dirty && !await saveCurrentDesign()) return;
    await load(null);
    // A blank canvas is a saveable document too; never replace it on re-entry.
    dirty = true; render();
    status('Kanvas baru siap. Kanvas lama tetap tersimpan. Atur Nama & ukuran, lalu Simpan kanvas.');
  });
  $('odPalette').innerHTML = Object.entries(officeDesignShapes).map(([type, spec]) => `<button class="button button-quiet" type="button" data-od-add="${type}">${html(spec.label)}</button>`).join('');
  $('odPalette').addEventListener('click', event => {
    const button = event.target.closest('[data-od-add]');
    if (!button || !editable()) return;
    if (design.layout.nodes.length >= 500) return status('Maksimum 500 objek per denah.');
    const type = button.dataset.odAdd, spec = officeDesignShapes[type];
    const width = Math.min(spec.width, design.layout.width), height = Math.min(spec.height, design.layout.height);
    checkpoint();
    const node = { id: newNodeId(), type, x: snap((design.layout.width - width) / 2), y: snap((design.layout.height - height) / 2), width, height, rotation: 0, label: ['room', 'label'].includes(type) ? spec.label : '' };
    if (type === 'cctv') Object.assign(node, { coverageRange: 5, coverageAngle: 90, showCoverage: true });
    node.x = clamp(node.x, design.layout.width - width); node.y = clamp(node.y, design.layout.height - height);
    design.layout.nodes.push(node); selected = node.id; render();
  });
  $('odTemplate').addEventListener('click', () => {
    if (!editable() || (design.layout.nodes.length && !confirm('Ganti isi kanvas dengan contoh denah kantor? Perubahan dapat dibatalkan dengan Undo.'))) return;
    checkpoint(); design.layout = officeExampleLayout(); selected = null; render(); status('Contoh denah dimuat. Semua objek dapat diedit. Klik Simpan denah untuk menyimpan.');
  });
  const point = event => {
    const value = canvas.createSVGPoint(); value.x = event.clientX; value.y = event.clientY;
    return value.matrixTransform(canvas.getScreenCTM().inverse());
  };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const resizing = event.target.closest('[data-od-resize]');
    const rotating = event.target.closest('[data-od-rotate]');
    const target = event.target.closest('[data-od-node]');
    if (!resizing && !rotating) selected = target?.dataset.odNode || null;
    const node = activeNode();
    if (node && editable()) {
      const start = point(event);
      drag = { id: event.pointerId, start, x: node.x, y: node.y, width: node.width, height: node.height, rotation: node.rotation, startAngle: Math.atan2(start.y - node.y - node.height / 2, start.x - node.x - node.width / 2), rotate: Boolean(rotating), resize: Boolean(resizing), moved: false };
      canvas.setPointerCapture(event.pointerId);
    }
    canvas.focus(); render();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id || !editable()) return;
    const node = activeNode(), current = point(event);
    if (!node) return;
    if (drag.rotate) {
      const dx = current.x - drag.x - drag.width / 2, dy = current.y - drag.y - drag.height / 2;
      if (Math.hypot(dx, dy) < 1) return;
      const degrees = drag.rotation + (Math.atan2(dy, dx) - drag.startAngle) * 180 / Math.PI;
      const step = event.shiftKey ? 15 : 1;
      const rotation = ((Math.round(degrees / step) * step) % 360 + 360) % 360;
      if (rotation === node.rotation) return;
      if (!drag.moved) { checkpoint(); drag.moved = true; }
      node.rotation = rotation; render(); return;
    }
    if (drag.resize) {
      const angle = node.rotation * Math.PI / 180, c = Math.cos(angle), sn = Math.sin(angle);
      const dx = current.x - drag.start.x, dy = current.y - drag.start.y;
      const width = Math.min(design.layout.width, Math.max(5, snap(drag.width + c * dx + sn * dy)));
      const height = Math.min(design.layout.height, Math.max(5, snap(drag.height - sn * dx + c * dy)));
      const x = clamp(drag.x + (c - 1) * (width - drag.width) / 2 - sn * (height - drag.height) / 2, design.layout.width - width);
      const y = clamp(drag.y + sn * (width - drag.width) / 2 + (c - 1) * (height - drag.height) / 2, design.layout.height - height);
      if (node.width === width && node.height === height && node.x === x && node.y === y) return;
      if (!drag.moved) { checkpoint(); drag.moved = true; }
      Object.assign(node, { x, y, width, height }); render(); return;
    }
    const x = clamp(snap(drag.x + current.x - drag.start.x), design.layout.width - node.width);
    const y = clamp(snap(drag.y + current.y - drag.start.y), design.layout.height - node.height);
    if (x === node.x && y === node.y) return;
    if (!drag.moved) { checkpoint(); drag.moved = true; }
    node.x = x; node.y = y; render();
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  properties.addEventListener('submit', event => {
    event.preventDefault();
    const node = activeNode(); if (!node || !editable()) return;
    const change = { label: properties.elements.label.value };
    for (const field of ['x', 'y', 'width', 'height', 'rotation']) change[field] = Number(properties.elements[field].value);
    if (![change.x, change.y, change.width, change.height, change.rotation].every(Number.isFinite) || change.x < 0 || change.y < 0 || change.width < 5 || change.height < 5 || change.x + change.width > design.layout.width || change.y + change.height > design.layout.height) return status('Ukuran / posisi harus berada di dalam kanvas.');
    if (node.type === 'cctv') Object.assign(change, { coverageRange: Number(properties.elements.coverageRange.value), coverageAngle: Number(properties.elements.coverageAngle.value), showCoverage: properties.elements.showCoverage.checked });
    checkpoint(); Object.assign(node, change); render(); status('Properti objek diperbarui.');
  });
  function removeNode() {
    if (!activeNode() || !editable()) return;
    checkpoint(); design.layout.nodes = design.layout.nodes.filter(node => node.id !== selected); selected = null; render();
  }
  $('odRemove').addEventListener('click', removeNode);
  let clipboard = null;
  document.addEventListener('keydown', event => {
    if (!$('officeDesignView').classList.contains('active-view') || document.querySelector('dialog[open]') || busy || loading || drag) return;
    const action = window.NistCanvasShortcut(event); if (!action) return;
    event.preventDefault();
    if (action === 'escape') { selected = null; render(); return; }
    if (action === 'copy') { if (activeNode()) clipboard = clone(activeNode()); return; }
    if (!editable()) return;
    if (action === 'save') { void saveCurrentDesign(); return; }
    if (action === 'undo' || action === 'redo') { $('od' + (action === 'undo' ? 'Undo' : 'Redo')).click(); return; }
    if (action === 'delete') { removeNode(); return; }
    if (action === 'duplicate') { $('odDuplicate').click(); return; }
    if (action === 'paste' && clipboard && design.layout.nodes.length < 500) {
      const node = clone(clipboard); if (node.width > design.layout.width || node.height > design.layout.height) return;
      checkpoint(); node.id = newNodeId(); node.x = clamp(node.x + 20, design.layout.width - node.width); node.y = clamp(node.y + 20, design.layout.height - node.height);
      design.layout.nodes.push(node); selected = node.id; render(); return;
    }
    const node = activeNode(), step = event.shiftKey ? 10 : 1;
    if (node && ['left','right','up','down'].includes(action)) {
      const x = clamp(node.x + (action === 'right' ? step : action === 'left' ? -step : 0), design.layout.width - node.width);
      const y = clamp(node.y + (action === 'down' ? step : action === 'up' ? -step : 0), design.layout.height - node.height);
      if (x !== node.x || y !== node.y) { checkpoint(); Object.assign(node, {x,y}); render(); }
    }
  });
  $('odDuplicate').addEventListener('click', () => {
    const node = activeNode(); if (!node || !editable() || design.layout.nodes.length >= 500) return;
    checkpoint(); const copy = { ...node, id: newNodeId(), x: clamp(node.x + 20, design.layout.width - node.width), y: clamp(node.y + 20, design.layout.height - node.height) };
    design.layout.nodes.push(copy); selected = copy.id; render();
  });
  for (const direction of ['Front', 'Back']) $('od' + direction).addEventListener('click', () => {
    const node = activeNode(); if (!node || !editable()) return;
    checkpoint(); design.layout.nodes = design.layout.nodes.filter(item => item.id !== node.id);
    if (direction === 'Front') design.layout.nodes.push(node); else design.layout.nodes.unshift(node);
    render();
  });
  for (const action of ['Undo', 'Redo']) $('od' + action).addEventListener('click', () => {
    const source = action === 'Undo' ? undo : redo, target = action === 'Undo' ? redo : undo;
    if (!editable() || !source.length) return;
    target.push(clone(design)); design = { ...source.pop(), id: design.id, version: design.version }; dirty = true; selected = null; render();
  });
  $('odZoom').addEventListener('change', renderCanvas);
  new ResizeObserver(() => {
    if ($('odZoom').value === 'fit' && $('officeDesignView').classList.contains('active-view')) renderCanvas();
  }).observe($('odViewport'));
  $('odSettings').addEventListener('click', () => {
    if (!editable()) return;
    const form = $('odSettingsForm');
    form.elements.name.value = design.name;
    form.elements.unitsPerMeter.value = design.layout.unitsPerMeter ?? 100;
    form.elements.width.value = design.layout.width; form.elements.height.value = design.layout.height;
    $('odSettingsStatus').textContent = ''; $('odSettingsModal').showModal();
  });
  $('odSettingsCancel').addEventListener('click', () => $('odSettingsModal').close());
  $('odSettingsForm').addEventListener('submit', event => {
    event.preventDefault(); if (!editable()) return;
    const form = event.target, width = Number(form.elements.width.value), height = Number(form.elements.height.value);
    if (design.layout.nodes.some(node => node.x + node.width > width || node.y + node.height > height)) { $('odSettingsStatus').textContent = 'Objek masih berada di luar ukuran baru. Geser / kecilkan objek terlebih dahulu.'; return; }
    checkpoint(); design.name = form.elements.name.value.trim(); design.layout.width = width; design.layout.height = height; design.layout.unitsPerMeter = Number(form.elements.unitsPerMeter.value);
    $('odSettingsModal').close(); render();
  });
  async function saveCurrentDesign() {
    if (!editable()) return false;
    if (!dirty) return true;
    busy = true; renderControls(); status('Menyimpan denah...');
    try {
      const saved = await request(design.id ? `/${encodeURIComponent(design.id)}` : '', { method: design.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(design) });
      design = clone(saved); dirty = false; status('Denah berhasil disimpan.');
      try { await refreshList(); } catch { status('Denah tersimpan. Daftar denah belum diperbarui; klik Muat ulang.'); }
      return true;
    } catch (error) { status(error.message); return false; }
    finally { busy = false; render(); }
  }
  $('odSave').addEventListener('click', () => { void saveCurrentDesign(); });
  $('odDelete').addEventListener('click', async () => {
    if (!design.id || busy || loading || !canPerform(key, 'delete') || !confirm(`Hapus denah "${design.name}" beserta seluruh objeknya?`)) return;
    busy = true; renderControls();
    try {
      await request(`/${encodeURIComponent(design.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: design.version }) });
      setDesign({ id: null, name: 'Denah baru', version: 0, layout: { width: 1000, height: 800, nodes: [] } });
      status('Denah dihapus.'); await refreshList();
    } catch (error) { status(error.message); }
    finally { busy = false; render(); }
  });
  $('odExport').addEventListener('click', () => {
    const { width, height, nodes } = design.layout;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${html(design.name)}</title><rect width="${width}" height="${height}" fill="#f4efe6"/>${nodes.map(node => officeShapeSvg(node, html)).join('')}${nodes.map(node => officeCctvCoverageSvg(node, design.layout.unitsPerMeter ?? 100)).join('')}</svg>`;
    const url = (window.NistFileLimits?.exportUrl.bind(window.NistFileLimits) || URL.createObjectURL)(new Blob([svg], { type: 'image/svg+xml' }));
    const link = document.createElement('a'); link.href = url; link.download = (design.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'office-design') + '.svg'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
