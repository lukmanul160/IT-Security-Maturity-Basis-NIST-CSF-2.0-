<script setup>
/** Reactive checklist editor. Server owns permissions, assignment and version checks. */
import ChecklistSearchSelect from './ChecklistSearchSelect.vue';
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
const records = ref([]),
  users = ref([]),
  defaults = ref([]),
  user = ref(null);
const draft = ref(null),
  busy = ref(false),
  ready = ref(false),
  error = ref(''),
  notice = ref('');
const tab = ref('dashboard');
const language = ref(window.NistI18n?.language || 'id');
function t(value) {
  language.value;
  const translate = (text) => window.NistI18n?.t(text) || text;
  const imported = String(value).match(/^(\d+) (baris diimpor sebagai draft.*)$/);
  return imported ? imported[1] + ' ' + translate(imported[2]) : translate(value);
}
function languageChanged() {
  language.value = window.NistI18n?.language || 'id';
}
function ask(value) {
  return confirm(t(value));
}
const editorDialog = ref(null),
  assignmentDialog = ref(null),
  assignmentDraft = ref(null),
  assignmentDirty = ref(false);
watch(assignmentDraft, async (value) => {
  await nextTick();
  if (value && assignmentDialog.value && !assignmentDialog.value.open) assignmentDialog.value.showModal();
});
const pendingFiles = ref([]),
  removedFiles = ref([]);
// showModal traps focus and blocks the underlying tabs while the draft is edited.
watch(draft, async (value) => {
  await nextTick();
  if (value && editorDialog.value && !editorDialog.value.open) editorDialog.value.showModal();
});
function closeEditor() {
  if (busy.value || !leave()) return;
  editorDialog.value?.close();
  draft.value = null;
  dirty.value = false;
  configure.value = false;
}
const search = ref(''),
  mine = ref(false),
  dirty = ref(false),
  configure = ref(false);
const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join('');
const clone = (value) => JSON.parse(JSON.stringify(value));
const can = (action) =>
  user.value?.role === 'admin' ||
  Boolean(
    user.value?.actions?.['compliance-security-checklist']?.read &&
      user.value?.actions?.['compliance-security-checklist']?.[action],
  );
const manages = computed(
  () =>
    draft.value &&
    draft.value.kind === 'template' &&
    (!draft.value.id || draft.value.owner === user.value?.username || user.value?.role === 'admin'),
);
const editable = computed(
  () =>
    draft.value &&
    (draft.value.id ? can('update') : can('create')) &&
    (draft.value.kind !== 'template' || manages.value),
);
const templateOptions = computed(() =>
  templates.value.map((item) => ({ value: item.id, label: item.title })),
);
const assessorOptions = computed(() => {
  const options = users.value.map((person) => ({
    value: person.username,
    label:
      (person.fullName || person.username) +
      ' (' +
      person.username +
      ')' +
      (person.username === user.value?.username ? ' - ' + t('Diri sendiri') : ''),
  }));
  if (
    assignmentDraft.value?.assessor &&
    !options.some((option) => option.value === assignmentDraft.value.assessor)
  )
    options.push({ value: assignmentDraft.value.assessor, label: assignmentDraft.value.assessor });
  return options;
});
const templates = computed(() => records.value.filter((r) => r.kind === 'template'));
const assignments = computed(() => records.value.filter((r) => r.kind !== 'template'));
const ownsRecord = (record) => record.owner === user.value?.username || user.value?.role === 'admin';
function optionText(column, value) {
  const standard = defaults.value.find((c) => c.id === 'status');
  return column.id === 'status' &&
    standard &&
    JSON.stringify(column.options) === JSON.stringify(standard.options)
    ? t(value)
    : value;
}
function canFill(column) {
  return editable.value && (manages.value ? column.phase === 'definition' : column.phase === 'assessment');
}
const filtered = computed(() =>
  (tab.value === 'create' ? templates.value : assignments.value).filter(
    (r) =>
      true &&
      (!mine.value || r.assessor === user.value?.username) &&
      [r.title, r.owner, r.assessor].join(' ').toLowerCase().includes(search.value.toLowerCase()),
  ),
);
const assigned = computed(() => assignments.value.filter((r) => r.assessor === user.value?.username));
const owned = computed(() => templates.value.filter((r) => r.owner === user.value?.username));
const itemCount = computed(() => assignments.value.reduce((n, r) => n + r.data.rows.length, 0));
const startedCount = computed(() =>
  assignments.value.reduce(
    (n, r) =>
      n +
      r.data.rows.filter((row) =>
        r.data.columns.some(
          (c) =>
            c.phase === 'assessment' &&
            (row.values[c.id]?.trim() ||
              (r.files || []).some((f) => f.row_id === row.id && f.column_id === c.id)),
        ),
      ).length,
    0,
  ),
);
function switchTab(next) {
  if (next === tab.value || !leave()) return;
  tab.value = next;
  draft.value = null;
  dirty.value = false;
  search.value = '';
  mine.value = false;
  error.value = '';
  notice.value = '';
}
async function api(path = '', method = 'GET', body) {
  const response = await fetch('/api/compliance/security-checklists' + path, {
    method,
    ...(body instanceof FormData
      ? { body }
      : { headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }),
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || 'Permintaan checklist gagal.');
  return result;
}
async function run(fn) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
function leave() {
  return !dirty.value || ask('Perubahan belum disimpan. Tinggalkan perubahan?');
}
async function load() {
  const [session, result, people] = await Promise.all([
    fetch('/api/auth/me').then(async (r) => {
      if (!r.ok) throw new Error('Sesi berakhir. Silakan login kembali.');
      return r.json();
    }),
    api(),
    api('/users'),
  ]);
  user.value = session;
  records.value = result.checklists;
  defaults.value = result.columns;
  users.value = people;
  ready.value = true;
}
function open() {
  if (draft.value && dirty.value) return;
  run(load);
}
function refresh() {
  if (!leave()) return;
  run(async () => {
    await load();
    draft.value = null;
    dirty.value = false;
  });
}
function select(record) {
  if (!leave()) return;
  draft.value = {
    kind: record.kind || 'assignment',
    id: record.id,
    owner: record.owner,
    template_title: record.template_title,
    title: record.title,
    assessor: record.assessor,
    version: record.version,
    ...clone(record.data),
    files: clone(record.files || []),
  };
  dirty.value = false;
  configure.value = false;
  error.value = '';
  notice.value = '';
  pendingFiles.value = [];
  removedFiles.value = [];
}
function create() {
  if (!leave()) return;
  tab.value = 'create';
  draft.value = { kind: 'template', title: '', version: 0, columns: clone(defaults.value), rows: [] };
  dirty.value = true;
  configure.value = false;
  pendingFiles.value = [];
  removedFiles.value = [];
  addRow();
}
function addRow() {
  draft.value.rows.push({
    id: newId(),
    values: Object.fromEntries(
      draft.value.columns.map((c) => [c.id, c.id === 'id' ? String(draft.value.rows.length + 1) : '']),
    ),
  });
  dirty.value = true;
}
function addColumn() {
  const id = newId();
  draft.value.columns.push({ id, label: 'Kolom baru', type: 'text', phase: 'definition', options: [] });
  draft.value.rows.forEach((r) => {
    r.values[id] = '';
  });
  dirty.value = true;
}
function removeColumn(index) {
  if (!ask('Hapus kolom beserta seluruh isinya dari draft ini?')) return;
  const [column] = draft.value.columns.splice(index, 1);
  draft.value.rows.forEach((r) => {
    delete r.values[column.id];
  });
  dirty.value = true;
}
function move(index, delta) {
  const columns = draft.value.columns;
  [columns[index], columns[index + delta]] = [columns[index + delta], columns[index]];
  dirty.value = true;
}
function setOptions(column, event) {
  column.options = event.target.value.split('\n');
  dirty.value = true;
}
function removeRow(index) {
  if (ask('Hapus baris ini dari draft?')) {
    draft.value.rows.splice(index, 1);
    dirty.value = true;
  }
}
function save() {
  run(async () => {
    const d = draft.value;
    const body =
      d.kind === 'template'
        ? { ...d }
        : {
            version: d.version,
            rows: d.rows.map((r) => ({
              id: r.id,
              values: Object.fromEntries(
                d.columns.filter((c) => c.phase === 'assessment').map((c) => [c.id, r.values[c.id] || '']),
              ),
            })),
          };
    body.removeFiles = removedFiles.value;
    const uploads = pendingFiles.value.filter(
      (f) =>
        d.rows.some((r) => r.id === f.rowId) &&
        d.columns.some((c) => c.id === f.columnId && c.type === 'evidence'),
    );
    let payload = body;
    if (uploads.length) {
      body.fileTargets = uploads.map(({ rowId, columnId }) => ({ rowId, columnId }));
      payload = new FormData();
      payload.append('data', JSON.stringify(body));
      uploads.forEach((f) => payload.append('files', f.file));
    }
    const saved = await api(
      d.id ? '/' + d.id + (d.kind === 'template' ? '' : '/assessment') : '',
      d.id ? (d.kind === 'template' ? 'PUT' : 'PATCH') : 'POST',
      payload,
    );
    // Update local list immediately: a failed subsequent reload must not invite a stale retry.
    records.value = [saved, ...records.value.filter((r) => r.id !== saved.id)];
    dirty.value = false;
    select(saved);
    notice.value = 'Checklist dan hasil asesmen berhasil disimpan.';
  });
}
function remove() {
  if (!ask('Hapus checklist dan seluruh hasil asesmennya?')) return;
  run(async () => {
    await api('/' + draft.value.id, 'DELETE', { version: draft.value.version });
    records.value = records.value.filter((r) => r.id !== draft.value.id);
    draft.value = null;
    dirty.value = false;
    notice.value = 'Checklist dihapus.';
  });
}
async function exportExcel(template = false) {
  run(async () => {
    const { writeChecklistWorkbook } = await import('../../services/securityChecklistWorkbook.mjs');
    const content = template
      ? { title: 'Template checklist', columns: defaults.value, rows: [] }
      : draft.value;
    const buffer = writeChecklistWorkbook(content);
    const url = URL.createObjectURL(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = template ? 'template-compliance-checklist.xlsx' : 'compliance-security-checklist.xlsx';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = template
      ? 'Template Excel diunduh.'
      : 'Excel diekspor dari isi editor saat ini, termasuk perubahan yang belum disimpan.';
  });
}
function importExcel(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !leave()) return;
  run(async () => {
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024)
      throw Error('Pilih file .xlsx, maksimum 5 MB.');
    const { readChecklistWorkbookAsync } = await import('../../services/securityChecklistWorkbookClient.mjs');
    const imported = await readChecklistWorkbookAsync(await file.arrayBuffer(), defaults.value);
    if (!draft.value) {
      draft.value = { kind: 'template', title: '', version: 0, columns: [], rows: [] };
    }
    draft.value = {
      ...draft.value,
      title: draft.value.title || imported.title || file.name.replace(/\.xlsx$/i, ''),
      columns: imported.columns,
      rows: imported.rows,
    };
    pendingFiles.value = [];
    removedFiles.value = (draft.value.files || []).map((f) => f.id);
    dirty.value = true;
    notice.value =
      imported.rows.length +
      ' baris diimpor sebagai draft template. Periksa kolom lalu Simpan checklist. Penugasan dibuat pada tab Assignment Checklist.';
  });
}
function assign(record = null) {
  assignmentDraft.value = record
    ? {
        id: record.id,
        templateId: record.template_id || '',
        title: record.title,
        assessor: record.assessor,
        version: record.version,
      }
    : { templateId: '', title: '', assessor: '', version: 0 };
  assignmentDirty.value = false;
  error.value = '';
  notice.value = '';
}
function closeAssignment() {
  if (busy.value || (assignmentDirty.value && !ask('Perubahan belum disimpan. Tinggalkan perubahan?')))
    return;
  assignmentDialog.value?.close();
  assignmentDraft.value = null;
  assignmentDirty.value = false;
}
function saveAssignment() {
  run(async () => {
    const d = assignmentDraft.value;
    const saved = await api(
      d.id ? '/' + d.id + '/assignment-info' : '/assignments',
      d.id ? 'PATCH' : 'POST',
      d,
    );
    const old = records.value.find((r) => r.id === saved.id);
    records.value = [
      { ...saved, files: saved.files || old?.files || [] },
      ...records.value.filter((r) => r.id !== saved.id),
    ];
    assignmentDirty.value = false;
    assignmentDialog.value?.close();
    assignmentDraft.value = null;
    notice.value = 'Assignment berhasil disimpan.';
  });
}
function rowFiles(rowId, columnId) {
  return (draft.value.files || []).filter(
    (f) => f.row_id === rowId && f.column_id === columnId && !removedFiles.value.includes(f.id),
  );
}
function queueFiles(event, rowId, columnId) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;
  if (
    files.some((f) => !f.size || f.size > 10 * 1024 * 1024) ||
    (draft.value.files || []).filter((f) => !removedFiles.value.includes(f.id)).length +
      pendingFiles.value.length +
      files.length >
      10
  ) {
    error.value = 'Maksimum 10 file evidence per checklist, masing-masing 10 MB dan tidak kosong.';
    return;
  }
  pendingFiles.value.push(...files.map((file) => ({ rowId, columnId, file })));
  dirty.value = true;
  error.value = '';
}
function discardFile(fileId) {
  if (ask('Hapus file evidence ini saat checklist disimpan?')) {
    removedFiles.value.push(fileId);
    dirty.value = true;
  }
}
function discardPending(file) {
  pendingFiles.value = pendingFiles.value.filter((f) => f !== file);
  dirty.value = true;
}
function markDirty(event) {
  if (event.target.type !== 'file') dirty.value = true;
}
function beforeUnload(event) {
  if (dirty.value || assignmentDirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
onMounted(() => {
  window.addEventListener('nist:language-change', languageChanged);
  window.addEventListener('security-checklist-open', open);
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener('nist:language-change', languageChanged);
  window.removeEventListener('security-checklist-open', open);
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<template>
  <section id="securityChecklistView" class="view security-checklist" data-no-translate>
    <div class="page-heading">
      <div>
        <p class="eyebrow">{{ t('COMPLIANCE') }}</p>
        <h2>{{ t('Compliance Security Checklist') }}</h2>
        <p class="lede">
          {{
            t('Buat template checklist yang dapat digunakan berulang untuk berbagai aplikasi dan assessor.')
          }}
        </p>
      </div>
      <button type="button" class="button button-quiet" :disabled="busy" @click="refresh">
        {{ t('Muat ulang') }}
      </button>
    </div>
    <p v-if="error" role="alert" class="checklist-error">
      {{ t(error) }}
      {{ t('Muat ulang untuk mengambil data terbaru; salin perubahan penting terlebih dahulu.') }}
    </p>
    <p role="status" aria-live="polite">{{ t(busy ? 'Memproses checklist...' : notice) }}</p>
    <div class="toolbar" role="tablist" :aria-label="t('Compliance Security Checklist')">
      <button
        id="checklistDashboardTab"
        type="button"
        class="button button-quiet"
        role="tab"
        :aria-selected="tab === 'dashboard'"
        aria-controls="checklistDashboardPanel"
        :disabled="busy"
        @click="switchTab('dashboard')"
      >
        {{ t('1. Dashboard') }}
      </button>
      <button
        id="checklistAssignmentTab"
        type="button"
        class="button button-quiet"
        role="tab"
        :aria-selected="tab === 'assignment'"
        aria-controls="checklistAssignmentPanel"
        :disabled="busy"
        @click="switchTab('assignment')"
      >
        {{ t('2. Assignment Checklist') }}
      </button>
      <button
        id="checklistCreateTab"
        type="button"
        class="button button-quiet"
        role="tab"
        :aria-selected="tab === 'create'"
        aria-controls="checklistCreatePanel"
        :disabled="busy"
        @click="switchTab('create')"
      >
        {{ t('3. Buat Checklist') }}
      </button>
    </div>
    <div
      v-if="tab === 'dashboard'"
      id="checklistDashboardPanel"
      role="tabpanel"
      aria-labelledby="checklistDashboardTab"
    >
      <p v-if="!ready">{{ t('Dashboard belum tersedia. Muat ulang untuk mengambil data.') }}</p>
      <template v-else>
        <div class="checklist-kpis">
          <article class="insight-panel">
            <p>{{ t('Ditugaskan kepada saya') }}</p>
            <strong>{{ assigned.length }}</strong
            ><button
              type="button"
              class="button button-quiet"
              :disabled="busy"
              @click="
                switchTab('assignment');
                mine = true;
              "
            >
              {{ t('Lihat assignment saya') }}
            </button>
          </article>
          <article class="insight-panel">
            <p>{{ t('Checklist yang saya buat') }}</p>
            <strong>{{ owned.length }}</strong
            ><button type="button" class="button button-quiet" :disabled="busy" @click="switchTab('create')">
              {{ t('Kelola checklist') }}
            </button>
          </article>
          <article class="insight-panel">
            <p>{{ t('Total item checklist') }}</p>
            <strong>{{ itemCount }}</strong>
            <p>{{ t('Dari') }} {{ assignments.length }} {{ t('checklist yang dapat Anda akses.') }}</p>
          </article>
          <article class="insight-panel">
            <p>{{ t('Item mulai diasesmen') }}</p>
            <strong>{{ startedCount }} / {{ itemCount }}</strong
            ><progress
              :value="startedCount"
              :max="itemCount || 1"
              :aria-label="t('Item yang memiliki isian asesmen')"
            ></progress>
            <p>
              {{
                t('Memiliki setidaknya satu isian atau file pada kolom asesmen; bukan penilaian kepatuhan.')
              }}
            </p>
          </article>
        </div>
        <article class="insight-panel">
          <h3>{{ t('Alur penggunaan') }}</h3>
          <p>
            {{
              t(
                'Tab 3 menyimpan template tanpa assessor. Pada tab 2, pilih Tambah assignment, pilih template, isi judul aplikasi dan assessor. Setiap assignment menyimpan hasil dan evidence terpisah.',
              )
            }}
          </p>
        </article>
      </template>
    </div>
    <div
      v-show="tab !== 'dashboard'"
      :id="tab === 'create' ? 'checklistCreatePanel' : 'checklistAssignmentPanel'"
      role="tabpanel"
      :aria-labelledby="tab === 'create' ? 'checklistCreateTab' : 'checklistAssignmentTab'"
    >
      <div class="page-heading">
        <div>
          <h3>{{ t(tab === 'create' ? 'Buat dan kelola checklist' : 'Checklist yang ditugaskan') }}</h3>
          <p>
            {{
              t(
                tab === 'create'
                  ? 'Atur kolom dan item template. Penugasan dibuat terpisah pada tab Assignment Checklist.'
                  : 'Isi hasil asesmen checklist yang ditugaskan kepada Anda, atau pantau penugasan checklist yang Anda buat.',
              )
            }}
          </p>
        </div>
        <button
          v-if="tab === 'create' && can('create')"
          type="button"
          class="button button-accent"
          :disabled="busy || !ready"
          @click="create"
        >
          {{ t('Buat checklist baru') }}</button
        ><button
          v-if="tab === 'assignment' && can('create')"
          type="button"
          class="button button-accent"
          :disabled="busy || !ready || !templates.length"
          id="checklistNewAssignment"
          @click="assign()"
        >
          {{ t('Tambah assignment') }}
        </button>
      </div>
      <div v-if="tab === 'create'" class="toolbar">
        <button
          type="button"
          class="button button-quiet"
          :disabled="busy || !ready"
          @click="exportExcel(true)"
        >
          {{ t('Unduh template Excel') }}
        </button>
        <button
          v-if="can('create')"
          type="button"
          class="button button-quiet"
          :disabled="busy || !ready"
          @click="create"
        >
          {{ t('Impor dari Excel') }}
        </button>
        <p>
          {{
            t(
              'Impor .xlsx mengganti kolom dan baris draft template, maksimum 5 MB / 500 baris. Ekspor mempertahankan kolom kustom.',
            )
          }}
        </p>
      </div>
      <p v-if="tab === 'assignment' && ready && !templates.length">
        {{ t('Buat template terlebih dahulu pada tab Buat Checklist.') }}
      </p>
      <div class="toolbar">
        <label
          >{{ t('Cari checklist')
          }}<input v-model="search" type="search" :placeholder="t('Judul, pembuat, assessor')" /></label
        ><label v-if="tab === 'assignment'"
          ><input v-model="mine" type="checkbox" /> {{ t('Ditugaskan kepada saya') }}</label
        ><button type="button" class="button button-quiet" :disabled="busy" @click="refresh">
          {{ t('Muat ulang') }}
        </button>
      </div>
      <div class="excel-wrap checklist-list">
        <table class="excel-table" data-table-resize="off">
          <thead>
            <tr>
              <th>{{ t('Checklist') }}</th>
              <th>{{ t('Pembuat') }}</th>
              <th v-if="tab !== 'create'">{{ t('Assessor') }}</th>
              <th v-if="tab !== 'create'">{{ t('Template checklist') }}</th>
              <th>{{ t('Item') }}</th>
              <th>{{ t('Aksi') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filtered" :key="r.id">
              <td>{{ r.title }}</td>
              <td>{{ r.owner }}</td>
              <td v-if="tab !== 'create'">{{ r.assessor }}</td>
              <td v-if="tab !== 'create'">{{ r.template_title || t('Checklist lama') }}</td>
              <td>{{ r.data.rows.length }}</td>
              <td>
                <button
                  type="button"
                  class="button button-quiet"
                  :disabled="busy"
                  :data-checklist-open="r.id"
                  @click="select(r)"
                >
                  {{ t('Buka checklist') }}</button
                ><button
                  v-if="tab === 'assignment' && ownsRecord(r) && can('update')"
                  type="button"
                  class="button button-quiet"
                  :disabled="busy"
                  :data-assignment-edit="r.id"
                  @click="assign(r)"
                >
                  {{ t('Ubah assignment') }}
                </button>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td :colspan="tab === 'create' ? 4 : 6">
                {{
                  t(
                    ready
                      ? 'Belum ada checklist yang sesuai. Checklist yang Anda buat atau ditugaskan kepada Anda akan tampil di sini.'
                      : 'Klik Muat ulang bila data belum tampil.',
                  )
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <dialog
        v-if="draft"
        ref="editorDialog"
        class="checklist-dialog"
        aria-labelledby="checklistEditorTitle"
        @cancel.prevent="closeEditor"
      >
        <form
          class="insight-panel risk-register-form checklist-editor"
          @submit.prevent="save"
          @input="markDirty"
          @change="markDirty"
        >
          <div class="page-heading">
            <h3 id="checklistEditorTitle">{{ draft.id ? draft.title : t('Checklist baru') }}</h3>
            <button
              type="button"
              class="button button-quiet"
              :disabled="busy"
              @click="closeEditor"
              :aria-label="t('Tutup modal checklist')"
            >
              {{ t('Tutup') }}
            </button>
          </div>
          <p v-if="error" role="alert" class="checklist-error">
            {{ t(error) }} {{ t('Salin perubahan penting sebelum menutup atau memuat ulang.') }}
          </p>
          <p role="status" aria-live="polite">{{ t(busy ? 'Memproses checklist...' : notice) }}</p>
          <div v-if="tab === 'create'" class="toolbar">
            <label v-if="manages && editable"
              >{{ t('Impor Excel')
              }}<input type="file" accept=".xlsx" :disabled="busy" @change="importExcel" /></label
            ><button type="button" class="button button-quiet" :disabled="busy" @click="exportExcel(false)">
              {{ t('Ekspor Excel') }}
            </button>
          </div>
          <p role="status">
            {{ t(dirty ? 'Ada perubahan belum disimpan.' : 'Semua perubahan tersimpan.') }} {{ t('Versi') }}
            {{ draft.version }}.
          </p>
          <p v-if="draft.kind === 'template'">
            {{
              t(
                'Kolom hasil pada template hanya menentukan struktur. Isian asesmen dan unggahan evidence dilakukan pada assignment.',
              )
            }}
          </p>
          <p v-else>
            {{
              t(
                'Kolom definisi disiapkan pembuat. Kolom asesmen diisi assessor yang ditugaskan atau pembuat/admin. Evidence / temuan mendukung teks, referensi bukti, dan unggahan file.',
              )
            }}
          </p>
          <p v-if="!editable" class="muted">
            {{ t('Akses baca: Anda tidak memiliki izin mengubah checklist ini.') }}
          </p>
          <fieldset :disabled="busy || !editable">
            <div class="risk-register-text-grid">
              <label
                >{{ t(draft.kind === 'template' ? 'Judul template' : 'Judul asesmen / aplikasi')
                }}<input v-model="draft.title" maxlength="200" required :readonly="!manages" /></label
              ><label v-if="draft.kind !== 'template'"
                >{{ t('Assessor')
                }}<select name="assessor" v-model="draft.assessor" required :disabled="true">
                  <option value="">{{ t('Pilih assessor') }}</option>
                  <option
                    v-if="draft.assessor && !users.some((u) => u.username === draft.assessor)"
                    :value="draft.assessor"
                  >
                    {{ draft.assessor }} ({{ t('izin tidak tersedia') }})
                  </option>
                  <option v-for="u in users" :key="u.username" :value="u.username">
                    {{ u.fullName || u.username }} ({{ u.username }}){{
                      u.username === user?.username ? ' - ' + t('Diri sendiri') : ''
                    }}
                  </option>
                </select></label
              >
            </div>
            <template v-if="manages">
              <button
                type="button"
                class="button button-quiet"
                :aria-expanded="configure"
                @click="configure = !configure"
              >
                {{ t('Kustomisasi kolom') }}
              </button>
              <div v-if="configure" class="checklist-columns">
                <p>
                  {{
                    t(
                      'Ubah label, tipe, urutan dan siapa yang mengisi. Menghapus kolom menghapus nilainya setelah disimpan. Kolom pilihan yang berubah harus disesuaikan dengan nilai baris.',
                    )
                  }}
                </p>
                <article v-for="(c, i) in draft.columns" :key="c.id" class="checklist-column">
                  <label>{{ t('Nama kolom') }}<input v-model="c.label" required maxlength="100" /></label
                  ><label
                    >{{ t('Tipe')
                    }}<select v-model="c.type">
                      <option value="text">{{ t('Teks') }}</option>
                      <option value="select">{{ t('Pilihan') }}</option>
                      <option value="evidence">{{ t('Evidence / file') }}</option>
                    </select></label
                  ><label
                    >{{ t('Diisi oleh')
                    }}<select v-model="c.phase">
                      <option value="definition">{{ t('Pembuat (definisi)') }}</option>
                      <option value="assessment">{{ t('Assessor (hasil)') }}</option>
                    </select></label
                  ><label v-if="c.type === 'select'"
                    >{{ t('Pilihan (satu per baris)')
                    }}<textarea
                      :value="c.options.join('\n')"
                      required
                      rows="3"
                      @input="setOptions(c, $event)"
                    ></textarea>
                  </label>
                  <div class="csf-form-actions">
                    <button
                      type="button"
                      class="button button-quiet"
                      :disabled="i === 0"
                      @click="move(i, -1)"
                      :aria-label="t('Naikkan') + ' ' + c.label"
                    >
                      ↑</button
                    ><button
                      type="button"
                      class="button button-quiet"
                      :disabled="i === draft.columns.length - 1"
                      @click="move(i, 1)"
                      :aria-label="t('Turunkan') + ' ' + c.label"
                    >
                      ↓</button
                    ><button
                      type="button"
                      class="button button-danger"
                      :disabled="draft.columns.length === 1"
                      @click="removeColumn(i)"
                    >
                      {{ t('Hapus kolom') }}
                    </button>
                  </div>
                </article>
                <button
                  type="button"
                  class="button button-quiet"
                  :disabled="draft.columns.length >= 30"
                  @click="addColumn"
                >
                  {{ t('Tambah kolom') }}
                </button>
              </div>
            </template>
            <div class="excel-wrap checklist-grid">
              <table
                class="excel-table"
                data-table-resize="off"
                :style="{ minWidth: (draft.columns.length + (manages ? 1 : 0)) * 140 + 'px' }"
              >
                <thead>
                  <tr>
                    <th v-for="c in draft.columns" :key="c.id">
                      {{ c.label }}<small>{{ t(c.phase === 'assessment' ? 'Asesmen' : 'Definisi') }}</small>
                    </th>
                    <th v-if="manages">{{ t('Aksi') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, index) in draft.rows" :key="r.id">
                    <td v-for="c in draft.columns" :key="c.id">
                      <select
                        v-if="c.type === 'select'"
                        v-model="r.values[c.id]"
                        :aria-label="c.label + ' ' + t('baris') + ' ' + (index + 1)"
                        :disabled="!canFill(c)"
                      >
                        <option value="">{{ t('Belum diisi') }}</option>
                        <option
                          v-if="r.values[c.id] && !c.options.includes(r.values[c.id])"
                          :value="r.values[c.id]"
                        >
                          {{ r.values[c.id] }} ({{ t('sesuaikan pilihan') }})
                        </option>
                        <option v-for="option in c.options" :key="option" :value="option">
                          {{ optionText(c, option) }}
                        </option></select
                      ><textarea
                        v-else
                        v-model="r.values[c.id]"
                        maxlength="4000"
                        rows="3"
                        :aria-label="c.label + ' ' + t('baris') + ' ' + (index + 1)"
                        :readonly="!canFill(c)"
                      ></textarea>
                      <div v-if="c.type === 'evidence'" class="checklist-evidence">
                        <p>
                          {{
                            t(
                              'Maksimum 10 file per checklist, masing-masing 10 MB. PDF, dokumen Office, dan gambar.',
                            )
                          }}
                        </p>
                        <label v-if="canFill(c)"
                          >{{ t('Unggah evidence')
                          }}<input
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp"
                            :aria-label="t('Unggah evidence') + ' ' + (index + 1)"
                            @change="queueFiles($event, r.id, c.id)"
                        /></label>
                        <div v-for="f in rowFiles(r.id, c.id)" :key="f.id">
                          <a
                            :href="'/api/compliance/security-checklists/' + draft.id + '/files/' + f.id"
                            data-no-translate
                            >{{ f.name }}</a
                          ><button
                            v-if="canFill(c)"
                            type="button"
                            class="button button-quiet"
                            @click="discardFile(f.id)"
                          >
                            {{ t('Hapus file') }}
                          </button>
                        </div>
                        <div
                          v-for="f in pendingFiles.filter((f) => f.rowId === r.id && f.columnId === c.id)"
                          :key="f.file"
                        >
                          <span data-no-translate>{{ f.file.name }}</span>
                          <span>{{ t('Belum diunggah') }}</span
                          ><button type="button" class="button button-quiet" @click="discardPending(f)">
                            {{ t('Batalkan file') }}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td v-if="manages">
                      <button type="button" class="button button-danger" @click="removeRow(index)">
                        {{ t('Hapus baris') }} {{ index + 1 }}
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!draft.rows.length">
                    <td :colspan="draft.columns.length + (manages ? 1 : 0)">
                      {{ t('Belum ada item checklist.') }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button
              v-if="manages"
              type="button"
              class="button button-quiet"
              :disabled="draft.rows.length >= 500"
              @click="addRow"
            >
              {{ t('Tambah baris') }}
            </button>
          </fieldset>
          <div class="csf-form-actions">
            <button v-if="editable" type="submit" class="button button-accent" :disabled="busy || !dirty">
              {{ t(manages ? 'Simpan checklist' : 'Simpan hasil asesmen') }}</button
            ><button
              v-if="draft.id && ownsRecord(draft) && can('delete')"
              type="button"
              class="button button-danger"
              :disabled="busy"
              @click="remove"
            >
              {{ t('Hapus checklist') }}</button
            ><button type="button" class="button button-quiet" :disabled="busy" @click="closeEditor">
              {{ t('Tutup editor') }}
            </button>
          </div>
        </form>
      </dialog>
    </div>
    <dialog
      v-if="assignmentDraft"
      ref="assignmentDialog"
      class="checklist-dialog checklist-assignment-dialog"
      aria-labelledby="checklistAssignmentTitle"
      @cancel.prevent="closeAssignment"
    >
      <form
        class="risk-register-form checklist-editor"
        @submit.prevent="saveAssignment"
        @input="assignmentDirty = true"
        @change="assignmentDirty = true"
      >
        <h3 id="checklistAssignmentTitle">
          {{ t(assignmentDraft.id ? 'Ubah assignment' : 'Tambah assignment') }}
        </h3>
        <p v-if="error" role="alert" class="checklist-error">{{ t(error) }}</p>
        <p role="status">{{ busy ? t('Memproses checklist...') : '' }}</p>
        <fieldset :disabled="busy">
          <ChecklistSearchSelect
            v-if="!assignmentDraft.id"
            v-model="assignmentDraft.templateId"
            @update:model-value="assignmentDirty = true"
            input-id="checklistAssignmentTemplate"
            name="templateId"
            :options="templateOptions"
            :label="t('Template checklist')"
            :placeholder="t('Cari dan pilih template checklist')"
            :empty-text="t('Tidak ada pilihan yang sesuai.')"
            :disabled="busy"
          />
          <label class="checklist-assignment-field"
            >{{ t('Judul asesmen / aplikasi')
            }}<input
              name="title"
              v-model="assignmentDraft.title"
              required
              maxlength="200"
              :placeholder="t('Contoh: Aplikasi 1 - Review keamanan')"
          /></label>
          <ChecklistSearchSelect
            v-model="assignmentDraft.assessor"
            @update:model-value="assignmentDirty = true"
            input-id="checklistAssignmentAssessor"
            name="assessor"
            :options="assessorOptions"
            :label="t('Assessor')"
            :placeholder="t('Cari nama atau username assessor')"
            :empty-text="t('Tidak ada pilihan yang sesuai.')"
            :disabled="busy"
          />
          <p>
            {{
              t(
                'Satu template dapat dipakai untuk banyak assignment. Setiap judul memiliki hasil dan evidence sendiri; perubahan template tidak menimpa assignment yang sudah dibuat.',
              )
            }}
          </p>
        </fieldset>
        <div class="csf-form-actions">
          <button type="submit" class="button button-accent" :disabled="busy">
            {{ t('Simpan assignment') }}</button
          ><button type="button" class="button button-quiet" :disabled="busy" @click="closeAssignment">
            {{ t('Batal') }}
          </button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.checklist-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
  margin: 20px 0;
}
.checklist-kpis article {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
}
.checklist-kpis strong {
  font-size: 28px;
}
.checklist-kpis progress {
  width: 100%;
  accent-color: var(--green);
}
[role='tab'][aria-selected='true'] {
  background: var(--navy);
  color: var(--surface, #fff);
}
.checklist-dialog {
  width: min(1440px, 96vw);
  max-width: 96vw;
  max-height: 90vh;
  overflow: auto;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface, #fff);
  color: var(--navy);
  box-sizing: border-box;
}
.checklist-dialog.checklist-assignment-dialog {
  width: min(680px, calc(100vw - 32px));
  padding: 0;
}
.checklist-assignment-dialog > .checklist-editor {
  display: grid;
  gap: 24px;
  margin: 0;
  padding: 28px;
  max-width: 100%;
  box-sizing: border-box;
}
.checklist-assignment-dialog h3 {
  margin: 0;
  font-size: 20px;
  line-height: 1.4;
}
.checklist-assignment-dialog .checklist-editor > p:empty {
  display: none;
}
.checklist-assignment-dialog .checklist-editor > fieldset {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  margin: 0;
  padding: 0;
}
.checklist-assignment-field {
  display: grid;
  gap: 8px;
  margin: 0;
  font-weight: 600;
  line-height: 1.5;
}
.checklist-assignment-field input {
  width: 100%;
  min-width: 0;
}
.checklist-assignment-dialog fieldset > p {
  margin: 0;
  line-height: 1.7;
  color: var(--muted);
  font-size: 13px;
}
.checklist-assignment-dialog .csf-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
  padding: 20px 0 0;
  border-top: 1px solid var(--line);
}
@media (max-width: 600px) {
  .checklist-assignment-dialog > .checklist-editor {
    padding: 20px;
    gap: 20px;
  }
}
.checklist-dialog::backdrop {
  background: rgb(0 0 0 / 50%);
}
.checklist-editor {
  margin: 0;
  padding: 24px;
  box-shadow: none;
}
.checklist-editor .page-heading {
  gap: 16px;
}
.checklist-editor .page-heading h3 {
  overflow-wrap: anywhere;
}
@media (max-width: 700px) {
  .checklist-editor {
    padding: 16px;
  }
  .checklist-dialog {
    max-height: 94vh;
  }
}
.checklist-editor fieldset {
  border: 0;
  padding: 0;
  min-width: 0;
}
.checklist-grid {
  margin: 20px 0;
}
.security-checklist .excel-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: auto;
}
.security-checklist .excel-table {
  width: 100%;
  min-width: 0;
  table-layout: fixed;
  border-collapse: collapse;
}
.security-checklist .excel-table th,
.security-checklist .excel-table td {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}
.checklist-list th:last-child {
  width: 24%;
}
.checklist-list td button {
  max-width: 100%;
  white-space: normal;
  margin: 2px;
}
.checklist-grid td {
  vertical-align: top;
}
.checklist-grid textarea,
.checklist-grid select {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.checklist-grid th small {
  display: block;
  font-weight: 400;
  color: var(--muted);
}
.checklist-evidence {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  overflow-wrap: anywhere;
}
.checklist-evidence input {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.checklist-evidence p {
  font-size: 12px;
}
.checklist-columns {
  margin: 16px 0;
}
.checklist-column {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}
.checklist-column label {
  flex: 1;
  min-width: 150px;
}
.checklist-error {
  color: var(--danger, #b42318);
}
.checklist-grid textarea[readonly] {
  background: var(--surface);
  color: var(--muted);
}
</style>
