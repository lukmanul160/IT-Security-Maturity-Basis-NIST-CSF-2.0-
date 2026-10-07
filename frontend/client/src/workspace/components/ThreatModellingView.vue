<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import stencils from '../../../../../src/shared/threatStencils.json';

const palette = [
  { type: 'actor', title: 'External entity', icon: '◯', color: '#dbeafe' },
  { type: 'process', title: 'Process', icon: '▢', color: '#e0e7ff' },
  { type: 'service', title: 'Service / API', icon: '◇', color: '#dcfce7' },
  { type: 'datastore', title: 'Data store', icon: '▤', color: '#fef3c7' },
  { type: 'boundary', title: 'Trust boundary', icon: '⬚', color: '#fff7ed' },
  { type: 'note', title: 'Note', icon: '▧', color: '#fef9c3' }
];
const stride = ['Spoofing', 'Tampering', 'Repudiation', 'Information disclosure', 'Denial of service', 'Elevation of privilege'];
const stencilSearch = ref(''), flowStencil = ref('GE.DF');
const stencilGroups = computed(() => stencils.filter(item => item.id === item.group).map(group => ({ ...group, items: stencils.filter(item => item.group === group.id && item.title.toLowerCase().includes(stencilSearch.value.toLowerCase())) })).filter(group => group.items.length));
const genericStencil = type => stencils.find(stencil => stencil.id === (type === 'boundary' ? 'GE.TB.B' : type === 'service' ? 'SE.P.TMCore.WebSvc' : '') || stencil.id === stencil.group && stencil.type === type && type !== 'boundary');
const stencilFor = item => stencils.find(stencil => stencil.id === item?.stencilId) || genericStencil(item && 'source' in item ? 'flow' : item?.type);
const elementProperties = computed(() => stencilFor(selected.value)?.properties || []);
const defaults = stencil => Object.fromEntries(stencil.properties.map(property => [property.key, property.default]));
function selectStencil(id, point) {
  const stencil = stencils.find(item => item.id === id); if (!stencil || !editable.value) return;
  if (stencil.type === 'flow') { flowStencil.value = id; mode.value = 'connect'; source.value = null; status.value = `${stencil.title}: pilih komponen sumber, lalu tujuan.`; return; }
  addNode(stencil.type, point, stencil);
}
function setElementProperty(key, value) {
  if (!editable.value || !selected.value) return;
  const stencil = stencilFor(selected.value); if (!stencil) return;
  checkpoint(); selected.value.stencilId = stencil.id; if (!isEdge.value) selected.value.type = stencil.type;
  selected.value.properties = { ...defaults(stencil), ...selected.value.properties, [key]: value };
}
const model = ref({ name: 'Untitled threat model', diagram: { nodes: [], edges: [] } });
const models = ref([]), selection = ref(null), mode = ref('select'), source = ref(null), zoom = ref(1);
const status = ref('Pilih komponen dari panel Shapes untuk mulai.'), dirty = ref(false), busy = ref(false), loaded = ref(false);
const access = ref({ read: false, create: false, update: false, delete: false });
const loadError = ref(''), loading = ref(false);
const canvas = ref(null), viewport = ref(null), importInput = ref(null);
const editorPage = ref(null), fullscreen = ref(false), editorHeight = ref(620);
// Navigation manages active-view directly; keep its class when fullscreen changes.
watch(fullscreen, value => editorPage.value?.classList.toggle('tm-fullscreen', value));
const camera = ref({ x: 0, y: 0 });
const viewSize = ref({ width: 900, height: 620 });
const viewBox = computed(() => ({ x: camera.value.x, y: camera.value.y, width: viewSize.value.width / zoom.value, height: viewSize.value.height / zoom.value }));
let viewportObserver;
function panStart(event) {
  if (event.button !== 0 && event.button !== 1) return;
  event.preventDefault(); selection.value = null;
  drag = { pan: true, clientX: event.clientX, clientY: event.clientY, x: camera.value.x, y: camera.value.y };
  canvas.value.setPointerCapture(event.pointerId);
}
function wheel(event) {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    const point = position(event);
    const oldZoom = zoom.value;
    setZoom(zoom.value * Math.exp(-event.deltaY * .002));
    camera.value.x = point.x - (point.x - camera.value.x) * oldZoom / zoom.value;
    camera.value.y = point.y - (point.y - camera.value.y) * oldZoom / zoom.value;
  } else {
    camera.value.x += (event.shiftKey ? event.deltaY : event.deltaX) / zoom.value;
    camera.value.y += (event.shiftKey ? event.deltaX : event.deltaY) / zoom.value;
  }
}
async function toggleFullscreen() {
  if (fullscreen.value) {
    if (document.fullscreenElement === editorPage.value) await document.exitFullscreen();
    fullscreen.value = false;
  } else {
    fullscreen.value = true;
    try { await editorPage.value.requestFullscreen?.(); } catch { /* Keep the expanded editor when browser fullscreen is unavailable. */ }
  }
}
function fullscreenChanged() { fullscreen.value = document.fullscreenElement === editorPage.value; }
function fullscreenEscape(event) { if (event.key === 'Escape' && fullscreen.value && !document.fullscreenElement) fullscreen.value = false; }
const history = ref([]), future = ref([]);
const clone = value => JSON.parse(JSON.stringify(value));
const uid = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const selected = computed(() => [...model.value.diagram.nodes, ...model.value.diagram.edges].find(item => item.id === selection.value));
const isEdge = computed(() => selected.value && 'source' in selected.value);
const editable = computed(() => !busy.value && loaded.value && (model.value.id ? access.value.update : access.value.create));
const threats = computed(() => [...model.value.diagram.nodes, ...model.value.diagram.edges].flatMap(item => item.threats.map(threat => ({ ...threat, component: item.label, targetId: item.id }))));
const sortedNodes = computed(() => [...model.value.diagram.nodes].sort((a, b) => Number(b.type === 'boundary') - Number(a.type === 'boundary')));
const snapshot = () => JSON.stringify(model.value);
function checkpoint() { history.value.push(snapshot()); if (history.value.length > 50) history.value.shift(); future.value = []; dirty.value = true; }
function undo() { if (!editable.value || !history.value.length) return; future.value.push(snapshot()); model.value = JSON.parse(history.value.pop()); selection.value = null; dirty.value = true; }
function redo() { if (!editable.value || !future.value.length) return; history.value.push(snapshot()); model.value = JSON.parse(future.value.pop()); selection.value = null; dirty.value = true; }
async function request(url, method = 'GET', body) {
  const response = await fetch(url, { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Request gagal');
  return response.status === 204 ? null : response.json();
}
async function load() {
  if (loading.value) return;
  loading.value = true; loadError.value = ''; status.value = 'Memuat diagram dan izin akses…';
  try {
    const user = await request('/api/auth/me');
    access.value = user.role === 'admin' ? { read: true, create: true, update: true, delete: true } : user.actions?.['threat-modelling'] || { read: false };
    const nav = document.querySelector('[data-view="threat-modelling"]'); if (nav) nav.hidden = !access.value.read;
    if (!access.value.read) { status.value = 'Anda tidak memiliki akses Threat Modelling.'; return; }
    models.value = await request('/api/threat-modelling');
    if (!dirty.value) {
      const current = models.value.find(item => String(item.id) === String(model.value.id));
      if (current) model.value = clone(current);
      else if (!model.value.id && !model.value.diagram.nodes.length && models.value.length) model.value = clone(models.value[0]);
    }
    loaded.value = true; status.value = models.value.length ? 'Diagram dimuat. Pilih komponen untuk melihat properti dan ancaman.' : 'Kanvas siap. Tambahkan komponen atau gunakan Example diagram.';
    nextTick(() => { if (document.getElementById('threatModellingView')?.classList.contains('active-view')) fit(); });
  } catch (error) { loadError.value = `Diagram belum berhasil dimuat: ${error.message}. Pastikan backend menggunakan versi terbaru, lalu pilih Coba lagi.`; status.value = loadError.value; }
  finally { loading.value = false; }
}
function reset(next) {
  if (dirty.value && !confirm('Perubahan belum disimpan. Ganti diagram?')) return false;
  model.value = clone(next); selection.value = null; source.value = null; history.value = []; future.value = []; dirty.value = false; mode.value = 'select'; nextTick(fit); return true;
}
function newModel() { if (access.value.create) reset({ name: 'Untitled threat model', diagram: { nodes: [], edges: [] } }); }
function choose(event) { const found = models.value.find(item => String(item.id) === event.target.value); if (found) reset(found); event.target.value = model.value.id || ''; }
async function save() {
  if (!editable.value) return; busy.value = true; status.value = 'Menyimpan diagram…';
  try {
    const saved = await request(`/api/threat-modelling${model.value.id ? `/${model.value.id}` : ''}`, model.value.id ? 'PUT' : 'POST', model.value);
    model.value = saved; history.value = []; future.value = []; dirty.value = false;
    models.value = await request('/api/threat-modelling'); status.value = 'Diagram dan ancaman tersimpan di database.';
  } catch (error) { status.value = error.message; } finally { busy.value = false; }
}
async function removeModel() {
  if (!access.value.delete || !model.value.id || !confirm(`Hapus diagram "${model.value.name}" dari database?`)) return;
  busy.value = true;
  try { await request(`/api/threat-modelling/${model.value.id}`, 'DELETE'); dirty.value = false; reset({ name: 'Untitled threat model', diagram: { nodes: [], edges: [] } }); await load(); status.value = 'Diagram dihapus.'; }
  catch (error) { status.value = error.message; } finally { busy.value = false; }
}
function position(event) {
  const matrix = canvas.value.getScreenCTM();
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}
const snap = value => Math.round(value / 20) * 20;
function addNode(type, point = { x: camera.value.x + 100 / zoom.value + model.value.diagram.nodes.length % 5 * 40, y: camera.value.y + 100 / zoom.value + model.value.diagram.nodes.length % 5 * 40 }, stencil = genericStencil(type)) {
  if (!editable.value) return;
  const item = palette.find(item => item.type === type); if (!item) return;
  const width = type === 'boundary' ? 400 : 160, height = type === 'boundary' ? 300 : 80;
  const node = { id: uid(), type, label: item.title, color: item.color, x: snap(point.x), y: snap(point.y), width, height, description: '', threats: [] };
  if (stencil) { node.type = stencil.type; node.stencilId = stencil.id; node.label = stencil.title; node.properties = defaults(stencil); node.outOfScope = false; node.reasonOutOfScope = ''; }
  checkpoint();
  model.value.diagram.nodes.push(node); selection.value = node.id;
}
function drop(event) { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); if (stencils.some(item => item.id === id)) selectStencil(id, position(event)); else addNode(id, position(event)); }
let drag = null;
function pointerDown(event, node, resize = false) {
  event.stopPropagation(); if (event.button === 1) { panStart(event); return; } selection.value = node.id;
  if (!editable.value || event.button !== 0) return;
  if (mode.value === 'connect') {
    if (!source.value) { source.value = node.id; status.value = 'Pilih komponen tujuan untuk membuat aliran data.'; }
    else if (source.value !== node.id) {
      const stencil = stencils.find(item => item.id === flowStencil.value);
      checkpoint(); const edge = { id: uid(), source: source.value, target: node.id, label: stencil.title, stencilId: stencil.id, properties: defaults(stencil), outOfScope: false, reasonOutOfScope: '', description: '', threats: [] };
      model.value.diagram.edges.push(edge); source.value = null; selection.value = edge.id; status.value = 'Aliran data dibuat. Edit label pada panel Properties.';
    }
    return;
  }
  drag = { node, point: position(event), x: node.x, y: node.y, width: node.width, height: node.height, resize, changed: false };
  canvas.value.setPointerCapture(event.pointerId);
}
function pointerMove(event) {
  if (!drag) return;
  if (drag.pan) { camera.value.x = drag.x - (event.clientX - drag.clientX) / zoom.value; camera.value.y = drag.y - (event.clientY - drag.clientY) / zoom.value; return; }
  const p = position(event); const dx = p.x - drag.point.x, dy = p.y - drag.point.y;
  if (!drag.changed && Math.abs(dx) + Math.abs(dy) > 3) { checkpoint(); drag.changed = true; }
  if (!drag.changed) return;
  if (drag.resize) { drag.node.width = Math.max(60, snap(drag.width + dx)); drag.node.height = Math.max(40, snap(drag.height + dy)); }
  else { drag.node.x = snap(drag.x + dx); drag.node.y = snap(drag.y + dy); }
}
function pointerUp() { drag = null; }
function deleteSelected() {
  if (!editable.value || !selection.value) return; checkpoint();
  const id = selection.value; model.value.diagram.nodes = model.value.diagram.nodes.filter(node => node.id !== id);
  model.value.diagram.edges = model.value.diagram.edges.filter(edge => edge.id !== id && edge.source !== id && edge.target !== id);
  selection.value = null; if (source.value === id) source.value = null;
}
function setProperty(field, value) {
  if (!editable.value || !selected.value) return;
  if (['width', 'height', 'x', 'y'].includes(field)) {
    value = Number(value); if (!Number.isFinite(value)) return;
    if (field === 'width') value = Math.max(60, value);
    if (field === 'height') value = Math.max(40, value);
  }
  checkpoint(); selected.value[field] = value;
}
function edgePoints(edge) {
  const a = model.value.diagram.nodes.find(node => node.id === edge.source), b = model.value.diagram.nodes.find(node => node.id === edge.target);
  if (!a || !b) return { path: '', x: 0, y: 0 };
  const center = node => ({ x: node.x + node.width / 2, y: node.y + node.height / 2 });
  const ac = center(a), bc = center(b), dx = bc.x - ac.x, dy = bc.y - ac.y;
  const intersect = (node, c, direction) => { const scale = 1 / Math.max(Math.abs(dx) / (node.width / 2), Math.abs(dy) / (node.height / 2), 0.001); return { x: c.x + direction * dx * scale, y: c.y + direction * dy * scale }; };
  const start = intersect(a, ac, 1), end = intersect(b, bc, -1), mid = (start.x + end.x) / 2;
  return { path: `M${start.x},${start.y} H${mid} V${end.y} H${end.x}`, x: mid, y: (start.y + end.y) / 2 - 8 };
}
function addThreat() { if (!editable.value || !selected.value) return; checkpoint(); selected.value.threats.push({ id: uid(), title: 'New threat', category: 'Spoofing', severity: 'Medium', status: 'Open', mitigation: '' }); }
function threatChange(threat, field, value) { if (!editable.value) return; checkpoint(); threat[field] = value; }
function deleteThreat(id) { if (!editable.value) return; checkpoint(); selected.value.threats = selected.value.threats.filter(item => item.id !== id); }
function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
const fileName = () => model.value.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 100) || 'threat-model';
function exportJson() { download(`${fileName()}.json`, JSON.stringify({ format: 'nist-basis-threat-model', version: 1, exportedAt: new Date().toISOString(), name: model.value.name, diagram: model.value.diagram }, null, 2), 'application/json'); }
async function importJson(event) {
  const file = event.target.files[0]; event.target.value = ''; if (!file || !access.value.create) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Ukuran file maksimal 10 MB.');
    const data = JSON.parse(await file.text());
    if (data.format !== 'nist-basis-threat-model' || data.version !== 1 || typeof data.name !== 'string' || !data.diagram || !Array.isArray(data.diagram.nodes) || !Array.isArray(data.diagram.edges) || data.diagram.nodes.length > 500 || data.diagram.edges.length > 1000) throw new Error('Gunakan file Export JSON Threat Modelling.');
    // Server validates the graph before any database write. Never insert imported HTML.
    const items = [...data.diagram.nodes, ...data.diagram.edges];
    if (items.some(item => !item || typeof item.id !== 'string' || typeof item.label !== 'string' || !Array.isArray(item.threats)) || data.diagram.nodes.some(node => !palette.some(item => item.type === node.type) || ![node.x, node.y, node.width, node.height].every(Number.isFinite))) throw new Error('Komponen diagram tidak valid.');
    await request('/api/threat-modelling/validate', 'POST', { name: data.name, diagram: data.diagram });
    if (reset({ name: data.name, diagram: data.diagram })) { dirty.value = true; status.value = 'JSON diimport sebagai diagram baru. Pilih Save untuk menyimpan ke database.'; }
  } catch (error) { status.value = error.message; }
}
function svgContent() {
  const copy = canvas.value.cloneNode(true);
  copy.querySelectorAll('[data-editor-only]').forEach(element => element.remove());
  const nodes = model.value.diagram.nodes;
  const x = nodes.length ? Math.min(...nodes.map(node => node.x)) - 40 : 0, y = nodes.length ? Math.min(...nodes.map(node => node.y)) - 40 : 0;
  const width = Math.max(800, ...nodes.map(node => node.x + node.width + 60 - x)), height = Math.max(500, ...nodes.map(node => node.y + node.height + 60 - y));
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); copy.setAttribute('viewBox', `${x} ${y} ${width} ${height}`); copy.setAttribute('width', width); copy.setAttribute('height', height); copy.removeAttribute('style');
  return new XMLSerializer().serializeToString(copy);
}
function exportSvg() { download(`${fileName()}.svg`, svgContent(), 'image/svg+xml'); }
const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function report() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(model.value.name)}</title><style>body{font:13px Arial;padding:24px;color:#172335}svg{width:100%;height:auto;max-height:70vh}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;text-align:left;white-space:pre-wrap}thead{display:table-header-group}@page{size:A4 landscape}@media print{button{display:none}body{padding:0}}</style></head><body><button onclick="window.print()">Cetak / Simpan PDF</button><h1>${escape(model.value.name)}</h1><p>Threat Modelling · ${new Date().toLocaleString('id-ID')}</p>${svgContent()}<h2>Threat register (${threats.value.length})</h2><table><thead><tr><th>Component / flow</th><th>Threat</th><th>STRIDE</th><th>Severity</th><th>Status</th><th>Mitigation</th></tr></thead><tbody>${threats.value.map(threat => `<tr>${[threat.component, threat.title, threat.category, threat.severity, threat.status, threat.mitigation].map(value => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  download(`${fileName()}-report.html`, html, 'text/html'); status.value = 'Buka report HTML lalu pilih Cetak / Simpan PDF.';
}
function example() {
  if (!access.value.create || !reset({ name: 'Web application — data flow', diagram: { nodes: [], edges: [] } })) return;
  const nodes = [
    { type: 'boundary', label: 'Application trust boundary', x: 360, y: 100, width: 720, height: 440 },
    { type: 'actor', label: 'User / Browser', x: 100, y: 280, width: 160, height: 80 },
    { type: 'service', label: 'Web application', x: 440, y: 280, width: 180, height: 80 },
    { type: 'datastore', label: 'Database', x: 840, y: 280, width: 160, height: 80 }
  ].map(node => ({ ...node, id: uid(), color: palette.find(item => item.type === node.type).color, description: '', threats: [] }));
  model.value.diagram.nodes = nodes;
  model.value.diagram.edges = [{ source: nodes[1].id, target: nodes[2].id, label: 'HTTPS request' }, { source: nodes[2].id, target: nodes[3].id, label: 'Database query' }].map(edge => ({ ...edge, id: uid(), description: '', threats: [] }));
  dirty.value = true; status.value = 'Contoh diagram dimuat. Sesuaikan desain dan tambahkan ancaman STRIDE.'; nextTick(fit);
}
function setZoom(value) { zoom.value = Math.max(0.01, Math.min(4, value)); }
function fit() {
  if (!viewport.value) return;
  const bounds = viewport.value.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  viewSize.value = { width: bounds.width, height: bounds.height };
  const nodes = model.value.diagram.nodes;
  const x = nodes.length ? Math.min(...nodes.map(node => node.x)) - 60 : 0;
  const y = nodes.length ? Math.min(...nodes.map(node => node.y)) - 60 : 0;
  const width = Math.max(300, ...nodes.map(node => node.x + node.width + 60 - x));
  const height = Math.max(200, ...nodes.map(node => node.y + node.height + 60 - y));
  setZoom(Math.min(viewSize.value.width / width, viewSize.value.height / height, 1));
  camera.value = { x, y };
}
function keyboard(event) {
  if (!document.getElementById('threatModellingView')?.classList.contains('active-view')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.target.blur?.(); nextTick(save); return; }
  if (event.target.closest('input,textarea,select,[contenteditable]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
  if (event.key === 'Escape') { mode.value = 'select'; source.value = null; selection.value = null; }
}
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = ''; } }
function open() { load(); nextTick(() => { if (viewport.value) fit(); }); }
onMounted(() => { viewportObserver = new ResizeObserver(([entry]) => { if (entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return; const wasHidden = viewSize.value.width <= 1 || viewSize.value.height <= 1; viewSize.value = { width: entry.contentRect.width, height: entry.contentRect.height }; if (wasHidden) fit(); }); viewportObserver.observe(viewport.value); document.addEventListener('fullscreenchange', fullscreenChanged); document.addEventListener('keydown', fullscreenEscape); window.addEventListener('threat-modelling-open', open); document.addEventListener('keydown', keyboard); window.addEventListener('beforeunload', beforeUnload); load(); });
onBeforeUnmount(() => { viewportObserver?.disconnect(); document.removeEventListener('fullscreenchange', fullscreenChanged); document.removeEventListener('keydown', fullscreenEscape); window.removeEventListener('threat-modelling-open', open); document.removeEventListener('keydown', keyboard); window.removeEventListener('beforeunload', beforeUnload); });
</script>

<template>
  <section ref="editorPage" id="threatModellingView" class="view tm-page">
    <div class="tm-heading"><div><p class="eyebrow">SECURITY DESIGN WORKSPACE</p><h2>Threat Modelling</h2><p>Map your system. Trace data flows. Identify threats.</p></div><span class="tm-state" :class="{ unsaved: dirty }">{{ dirty ? '● Unsaved changes' : '● Saved / ready' }}</span></div>
    <div v-if="loadError" role="alert" class="tm-load-error"><span>{{ loadError }}</span><button :disabled="loading" @click="load">Coba lagi</button></div>
    <p v-else-if="loading" role="status">Memuat diagram dan izin akses…</p>
    <div class="tm-menubar">
      <select name="saved-diagram" aria-label="Saved diagrams" :value="model.id || ''" @change="choose"><option value="">New diagram</option><option v-for="item in models" :key="item.id" :value="item.id">{{ item.name }}</option></select>
      <button :disabled="!access.create || busy" @click="newModel">＋ New</button><button :disabled="!editable" @click="save" class="tm-save">Save diagram</button>
      <button :disabled="!access.create || busy" @click="importInput.click()">Import JSON</button><input name="diagram-import" ref="importInput" type="file" accept=".json,application/json" hidden @change="importJson">
      <button :disabled="!loaded" @click="exportJson">Export JSON</button><button :disabled="!loaded" @click="exportSvg">Export SVG</button><button :disabled="!loaded" @click="report">Report / PDF</button>
      <button :disabled="!access.delete || !model.id || busy" @click="removeModel" class="tm-danger">Delete diagram</button>
    </div>
    <div class="tm-tools">
      <button :class="{ active: mode === 'select' }" @click="mode = 'select'; source = null">↖ Select</button><button :disabled="!editable" :class="{ active: mode === 'connect' }" @click="mode = 'connect'; source = null">↗ Connect</button>
      <span class="tm-divider"></span><button :disabled="!editable || !history.length" @click="undo">↶ Undo</button><button :disabled="!editable || !future.length" @click="redo">↷ Redo</button><button :disabled="!editable || !selected" @click="deleteSelected">Delete selection</button>
      <span class="tm-divider"></span><button aria-label="Zoom out" @click="setZoom(zoom - .1)">−</button><span>{{ Math.round(zoom * 100) }}%</span><button aria-label="Zoom in" @click="setZoom(zoom + .1)">＋</button><button name="canvas-fit" @click="fit">Fit</button><span class="tm-grid-label">Grid · 20 px</span>
    </div>
    <div class="tm-canvas-settings"><span>Canvas tanpa batas ? Drag area kosong untuk geser ? Scroll untuk geser ? Ctrl+scroll untuk zoom</span><label v-if="!fullscreen">Editor height<input name="editor-height" type="range" min="300" max="1600" step="20" v-model.number="editorHeight"><span>{{ editorHeight }} px</span></label><button name="toggle-fullscreen" :aria-pressed="fullscreen" @click="toggleFullscreen">{{ fullscreen ? 'Exit full screen' : 'Full screen' }}</button></div>
    <div class="tm-editor" :style="fullscreen ? undefined : { height: editorHeight + 'px' }">
      <aside class="tm-palette"><h3>Shapes</h3><p>Click or drag onto canvas</p><button v-for="item in palette" :key="item.type" :disabled="!editable" :draggable="editable" @dragstart="$event.dataTransfer.setData('text/plain', item.type)" @click="addNode(item.type)"><span :style="{ background: item.color }">{{ item.icon }}</span>{{ item.title }}</button><label class="tm-stencil-search">Stencils<input name="stencil-search" v-model="stencilSearch" placeholder="Search stencils"></label><details v-for="group in stencilGroups" :key="group.id" class="tm-stencil-group" open><summary>{{ group.title }}</summary><button v-for="item in group.items" :key="item.id" :data-tm-stencil="item.id" :disabled="!editable" :draggable="editable" :class="{ active: item.type === 'flow' && mode === 'connect' && flowStencil === item.id }" @dragstart="$event.dataTransfer.setData('text/plain', item.id)" @click="selectStencil(item.id)"><span :style="{ background: item.color }">{{ item.type === 'flow' ? '→' : item.type === 'boundary' ? '▧' : item.type === 'datastore' ? '▤' : item.type === 'actor' ? '◯' : '▣' }}</span>{{ item.title }}</button></details><p class="tm-help">Data flow: pilih stencil, klik sumber lalu tujuan.</p><div class="tm-palette-help"><h4>Data flow diagram</h4><p>Use Connect, then click a source and destination.</p><p>Dashed boundaries show where trust changes.</p><button :disabled="!access.create || busy" @click="example">Example diagram</button></div></aside>
      <div ref="viewport" class="tm-viewport" @dragover.prevent @drop="drop" @wheel="wheel">
        <svg ref="canvas" class="tm-canvas" width="100%" height="100%" :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`" tabindex="0" aria-label="Threat modelling diagram canvas" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @pointerdown.self="panStart">
          <defs><pattern id="tm-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#cbd5e1"/></pattern><marker id="tm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#475569"/></marker></defs>
          <rect data-editor-only :x="viewBox.x" :y="viewBox.y" :width="viewBox.width" :height="viewBox.height" fill="url(#tm-grid)" @pointerdown="panStart"/>
          <g v-for="node in sortedNodes" :key="node.id" :transform="`translate(${node.x},${node.y})`" :data-tm-node="node.id" class="tm-node" :style="{ cursor: mode === 'connect' ? 'crosshair' : editable ? 'move' : 'pointer' }" @pointerdown="pointerDown($event, node)">
            <path v-if="node.type === 'boundary' && stencilFor(node)?.group === 'GE.TB.L'" :d="`M0 0 L${node.width} ${node.height}`" fill="none" :stroke="selection === node.id ? '#2563eb' : '#c77c39'" stroke-width="3" stroke-dasharray="8 5"/>
            <rect v-else-if="node.type === 'boundary'" :width="node.width" :height="node.height" rx="12" :fill="node.color" fill-opacity=".35" :stroke="selection === node.id || source === node.id ? '#2563eb' : '#c77c39'" stroke-width="2" stroke-dasharray="8 5"/>
            <ellipse v-else-if="node.type === 'actor'" :cx="node.width/2" :cy="node.height/2" :rx="node.width/2" :ry="node.height/2" :fill="node.color" :stroke="selection === node.id || source === node.id ? '#2563eb' : '#64748b'" stroke-width="2"/>
            <g v-else-if="node.type === 'datastore'"><path :d="`M0 14 C0 -4 ${node.width} -4 ${node.width} 14 V${node.height-14} C${node.width} ${node.height+4} 0 ${node.height+4} 0 ${node.height-14} Z`" :fill="node.color" :stroke="selection === node.id || source === node.id ? '#2563eb' : '#64748b'" stroke-width="2"/><path :d="`M0 14 C0 32 ${node.width} 32 ${node.width} 14`" fill="none" stroke="#64748b"/></g>
            <rect v-else :width="node.width" :height="node.height" :rx="node.type === 'process' ? 24 : 4" :fill="node.color" :stroke="selection === node.id || source === node.id ? '#2563eb' : '#64748b'" stroke-width="2"/>
            <text :x="node.type === 'boundary' ? 14 : node.width/2" :y="node.type === 'boundary' ? 25 : node.height/2 + 5" :text-anchor="node.type === 'boundary' ? 'start' : 'middle'" font-family="Arial,sans-serif" font-size="14" fill="#1e293b" :textLength="node.label.length * 7 > node.width - 20 ? node.width - 20 : undefined" lengthAdjust="spacingAndGlyphs">{{ node.label }}</text>
            <g v-if="node.threats.length"><circle :cx="node.width-8" cy="4" r="12" fill="#dc2626"/><text :x="node.width-8" y="9" text-anchor="middle" fill="white" font-family="Arial" font-size="12">{{ node.threats.length }}</text></g>
            <rect v-if="selection === node.id && editable" data-editor-only :x="node.width-6" :y="node.height-6" width="12" height="12" fill="#2563eb" stroke="white" style="cursor:nwse-resize" @pointerdown.stop="pointerDown($event, node, true)"/>
          </g>
          <g v-for="edge in model.diagram.edges" :key="edge.id" :data-tm-edge="edge.id" style="cursor:pointer" @pointerdown.stop="selection = edge.id">
            <path :d="edgePoints(edge).path" stroke="transparent" stroke-width="16" fill="none" data-editor-only/><path :d="edgePoints(edge).path" :stroke="selection === edge.id ? '#2563eb' : '#475569'" stroke-width="2" fill="none" marker-end="url(#tm-arrow)"/>
            <text :x="edgePoints(edge).x" :y="edgePoints(edge).y" text-anchor="middle" font-size="12" font-family="Arial,sans-serif" fill="#334155" stroke="white" stroke-width="5" paint-order="stroke">{{ edge.label }}{{ edge.threats.length ? ` ⚠ ${edge.threats.length}` : '' }}</text>
          </g>
          <g v-if="!model.diagram.nodes.length" data-editor-only transform="translate(260,180)"><text font-size="25" font-family="Arial" fill="#94a3b8">Start with your system architecture</text><text y="35" font-size="15" font-family="Arial" fill="#94a3b8">Drag a shape here or open an example diagram.</text></g>
        </svg>
      </div>
      <aside class="tm-inspector"><h3>{{ selected ? 'Properties' : 'Diagram' }}</h3>
        <template v-if="!selected"><label>Diagram name<input name="diagram-name" :value="model.name" maxlength="200" :disabled="!editable" @change="checkpoint(); model.name = $event.target.value"></label><div class="tm-counts"><span>{{ model.diagram.nodes.length }} components</span><span>{{ model.diagram.edges.length }} data flows</span><span>{{ threats.length }} threats</span></div><h4>STRIDE checklist</h4><ul><li v-for="category in stride" :key="category">{{ category }}</li></ul><p class="tm-help">Select a component or data flow to document threats and mitigations.</p><p class="tm-help">Shortcuts: Ctrl+S save · Ctrl+Z undo · Delete remove · Esc select.</p></template>
        <template v-else><span class="tm-type">{{ isEdge ? 'Data flow' : selected.type }}</span><label>Label<input name="diagram-component-label" :value="selected.label" maxlength="500" :disabled="!editable" @change="setProperty('label', $event.target.value)"></label><label>Description<textarea name="diagram-component-description" :value="selected.description" maxlength="10000" :disabled="!editable" @change="setProperty('description', $event.target.value)"></textarea></label>
          <template v-if="!isEdge"><label>Fill color<input name="diagram-component-color" type="color" :value="selected.color" :disabled="!editable" @change="setProperty('color', $event.target.value)"></label><div class="tm-dimensions"><label v-for="field in ['x','y','width','height']" :key="field">{{ field }}<input :name="'diagram-component-' + field" type="number" :value="selected[field]" :disabled="!editable" @change="setProperty(field, $event.target.value)"></label></div></template>
          <div class="tm-element-properties"><h4>Element properties</h4><label>Stencil<input name="element-stencil" :value="stencilFor(selected)?.title || selected.type" readonly></label><label>Out of scope<select name="element-out-of-scope" :value="selected.outOfScope ? 'Yes' : 'No'" :disabled="!editable" @change="setProperty('outOfScope', $event.target.value === 'Yes')"><option>No</option><option>Yes</option></select></label><label>Reason for out of scope<textarea name="element-scope-reason" :value="selected.reasonOutOfScope || ''" :disabled="!editable" maxlength="10000" @change="setProperty('reasonOutOfScope', $event.target.value)"></textarea></label><label v-for="property in elementProperties" :key="property.key">{{ property.label }}<select v-if="property.options.length" :name="'element-property-' + property.key" :value="selected.properties?.[property.key] ?? property.default" :disabled="!editable || property.readonly" @change="setElementProperty(property.key, $event.target.value)"><option v-for="value in property.options" :key="value" :value="value">{{ value }}</option></select><input v-else :name="'element-property-' + property.key" :value="selected.properties?.[property.key] ?? property.default" :disabled="!editable || property.readonly" maxlength="1000" @change="setElementProperty(property.key, $event.target.value)"></label></div>
          <div class="tm-threat-heading"><h4>Threats · {{ selected.threats.length }}</h4><button :disabled="!editable" @click="addThreat">＋ Add</button></div>
          <div v-for="threat in selected.threats" :key="threat.id" class="tm-threat-card"><label>Threat<input :name="'threat-' + threat.id + '-title'" :value="threat.title" :disabled="!editable" maxlength="500" @change="threatChange(threat, 'title', $event.target.value)"></label><label>STRIDE<select :name="'threat-' + threat.id + '-category'" :value="threat.category" :disabled="!editable" @change="threatChange(threat, 'category', $event.target.value)"><option v-for="category in stride" :key="category">{{ category }}</option></select></label><div class="tm-dimensions"><label>Severity<select :name="'threat-' + threat.id + '-severity'" :value="threat.severity" :disabled="!editable" @change="threatChange(threat, 'severity', $event.target.value)"><option v-for="value in ['Low','Medium','High','Critical']" :key="value">{{ value }}</option></select></label><label>Status<select :name="'threat-' + threat.id + '-status'" :value="threat.status" :disabled="!editable" @change="threatChange(threat, 'status', $event.target.value)"><option v-for="value in ['Open','Mitigated','Accepted']" :key="value">{{ value }}</option></select></label></div><label>Mitigation<textarea :name="'threat-' + threat.id + '-mitigation'" :value="threat.mitigation" :disabled="!editable" maxlength="10000" @change="threatChange(threat, 'mitigation', $event.target.value)"></textarea></label><button :disabled="!editable" class="tm-danger" @click="deleteThreat(threat.id)">Remove threat</button></div>
        </template>
      </aside>
    </div>
    <div class="tm-status" role="status" aria-live="polite"><span>{{ status }}</span><span>{{ mode === 'connect' ? 'CONNECT MODE' : 'SELECT MODE' }} · {{ model.diagram.nodes.length }} components / {{ model.diagram.edges.length }} flows</span></div>
    <details class="tm-register"><summary>Threat register · {{ threats.length }} threats</summary><div class="excel-wrap"><table class="excel-table"><thead><tr><th>Component / flow</th><th>Threat</th><th>STRIDE</th><th>Severity</th><th>Status</th><th>Mitigation</th></tr></thead><tbody><tr v-for="threat in threats" :key="`${threat.targetId}-${threat.id}`" @click="selection = threat.targetId"><td>{{ threat.component }}</td><td>{{ threat.title }}</td><td>{{ threat.category }}</td><td>{{ threat.severity }}</td><td>{{ threat.status }}</td><td>{{ threat.mitigation }}</td></tr><tr v-if="!threats.length"><td colspan="6" data-translate-ui>Belum ada ancaman. Pilih komponen atau aliran data, lalu Add pada panel Threats.</td></tr></tbody></table></div></details>
  </section>
</template>

<style scoped>
.tm-page{padding:0!important;color:#253449}.tm-heading{display:flex;justify-content:space-between;align-items:center;margin:0 0 20px;gap:16px}.tm-heading h2{margin:4px 0;font-size:28px}.tm-heading p{margin:5px 0;color:#64748b}.tm-state{font-size:12px;background:#eaf5ef;padding:8px 12px;border-radius:20px;color:#23704b}.tm-state.unsaved{background:#fff4dc;color:#9a6215}.tm-menubar,.tm-tools{display:flex;align-items:center;flex-wrap:wrap;gap:6px;border:1px solid #d9e0e8;padding:10px;background:white}.tm-menubar{border-radius:10px 10px 0 0}.tm-tools{background:#f8fafc;border-top:0}.tm-page button{font:inherit;font-size:12px;cursor:pointer;border:1px solid #d9e0e8;background:white;color:#334155;border-radius:5px;padding:7px 10px}.tm-page button:hover{background:#eff6ff;border-color:#93b5e6}.tm-page button:disabled{opacity:.45;cursor:default}.tm-page button.active{background:#dbeafe;color:#1d4ed8;border-color:#93c5fd}.tm-page .tm-save{background:#2563eb;color:white;border-color:#2563eb}.tm-page .tm-danger{color:#b91c1c}.tm-menubar select{max-width:230px;margin-right:6px}.tm-divider{height:22px;border-left:1px solid #d9e0e8;margin:0 5px}.tm-tools span{font-size:12px}.tm-grid-label{margin-left:auto;color:#64748b}.tm-editor{display:grid;grid-template-columns:185px minmax(0,1fr) 260px;height:620px;border:1px solid #d9e0e8;border-top:0;background:white}.tm-palette,.tm-inspector{padding:16px 12px;overflow:auto;background:#fafbfd}.tm-palette{border-right:1px solid #d9e0e8}.tm-inspector{border-left:1px solid #d9e0e8}.tm-editor h3{margin:0 0 7px;font-size:14px}.tm-editor h4{font-size:12px;margin:20px 0 8px}.tm-palette p,.tm-help{font-size:11px;color:#64748b;line-height:1.6}.tm-palette>button{display:flex;width:100%;align-items:center;gap:10px;margin:8px 0;text-align:left;padding:10px 8px}.tm-palette>button span{height:32px;width:32px;display:grid;place-items:center;border-radius:5px;font-size:22px;color:#475569;flex-shrink:0}.tm-palette-help{border-top:1px solid #e2e8f0;margin-top:25px}.tm-viewport{overflow:hidden;background:#fff;overscroll-behavior:contain}.tm-canvas{display:block;touch-action:none;user-select:none}.tm-inspector label{display:block;font-size:11px;color:#64748b;margin:12px 0 0}.tm-page input,.tm-page textarea,.tm-page select{font:inherit;font-size:12px;padding:7px 8px;border:1px solid #d9e0e8;border-radius:5px;background:white;color:#253449;box-sizing:border-box}.tm-inspector input,.tm-inspector textarea,.tm-inspector select{width:100%;margin-top:5px;min-width:0}.tm-inspector textarea{height:65px;resize:vertical}.tm-inspector input[type=color]{height:32px;padding:3px}.tm-dimensions{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.tm-counts{display:flex;flex-direction:column;gap:9px;font-size:12px;margin:20px 0;padding:12px;background:#eff3f8;border-radius:6px}.tm-inspector ul{padding-left:18px;font-size:12px;line-height:2;color:#475569}.tm-type{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#2563eb}.tm-threat-heading{display:flex;align-items:center;justify-content:space-between;margin-top:20px}.tm-threat-heading h4{margin:0}.tm-threat-card{border:1px solid #d9e0e8;background:white;padding:10px;margin-top:12px;border-radius:6px}.tm-threat-card>button{margin-top:10px}.tm-status{display:flex;justify-content:space-between;gap:10px;font-size:11px;padding:10px 14px;background:#f8fafc;border:1px solid #d9e0e8;border-top:0;border-radius:0 0 10px 10px;color:#64748b}.tm-register{margin-top:20px;border:1px solid #d9e0e8;border-radius:8px;background:white}.tm-register summary{padding:14px;cursor:pointer;font-size:13px;font-weight:600}.tm-register tbody tr{cursor:pointer}@media(max-width:1100px){.tm-editor{grid-template-columns:145px minmax(0,1fr) 220px}.tm-palette{padding:12px 8px}}@media(max-width:760px){.tm-editor{grid-template-columns:120px minmax(0,1fr);height:auto}.tm-viewport{height:460px}.tm-inspector{grid-column:1/-1;max-height:350px;border-top:1px solid #d9e0e8}.tm-heading,.tm-status{align-items:flex-start;flex-direction:column}.tm-palette>button{font-size:10px;gap:4px}.tm-palette>button span{width:24px;font-size:17px}.tm-menubar select{max-width:160px}}
</style>

<style scoped>
.tm-stencil-search{display:block;font-size:12px;font-weight:600;margin-top:18px}.tm-stencil-search input{width:100%;margin-top:8px}.tm-stencil-group{margin-top:12px;border-top:1px solid #d9e0e8;padding-top:10px}.tm-stencil-group summary{font-size:12px;font-weight:600;cursor:pointer}.tm-stencil-group button{display:flex;align-items:center;gap:6px;width:100%;text-align:left;margin:5px 0;font-size:11px;overflow-wrap:anywhere}.tm-stencil-group button span{padding:4px;border-radius:4px;flex-shrink:0}.tm-element-properties{border-top:1px solid #d9e0e8;margin-top:16px}
</style>

<style scoped>
.tm-canvas-settings{display:flex;flex-wrap:wrap;align-items:center;gap:16px;padding:10px;border:1px solid #d9e0e8;border-top:0;background:#f8fafc}.tm-canvas-settings label{display:flex;align-items:center;gap:8px;font-size:12px}.tm-canvas-settings input[type=number]{width:95px}.tm-canvas-settings button{margin-left:auto}.tm-fullscreen{position:fixed!important;inset:0;z-index:10000;background:#f1f5f9;box-sizing:border-box;padding:16px!important;display:flex!important;flex-direction:column;overflow:auto}.tm-fullscreen .tm-heading{margin-bottom:10px}.tm-fullscreen .tm-editor{flex:1;min-height:0;height:auto}.tm-fullscreen .tm-viewport{min-height:0;height:auto}.tm-fullscreen .tm-register{display:none}.tm-fullscreen .tm-menubar,.tm-fullscreen .tm-tools,.tm-fullscreen .tm-canvas-settings,.tm-fullscreen .tm-status{flex-shrink:0}
</style>
