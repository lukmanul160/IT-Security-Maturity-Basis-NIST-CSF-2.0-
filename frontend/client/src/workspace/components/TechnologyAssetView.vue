<script setup>
/** Technology inventory UI. Header scans propose draft entries; only explicit Save persists changes. */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
  technologyMap,
  versionComparison,
  radarPoints,
  technologyKey,
  rings,
  quadrants,
} from '../../services/technologyAssetModel.mjs';
import { compareNumericVersions, searchTechnologyAssets } from '../../services/technologyAssetSearch.mjs';
import KnowledgeGraph from './KnowledgeGraph.vue';
import { requestTechnologyScan } from '../../services/technologyScanProgress.mjs';
const scanProgress = ref(null);
const scanStages = {
  validating: 'Memeriksa URL dan DNS',
  starting: 'Menjalankan browser',
  navigation: 'Membuka halaman',
  resources: 'Membaca resource website',
  runtime: 'Membaca runtime JavaScript',
  dom: 'Memeriksa DOM halaman',
  signatures: 'Mencocokkan signature teknologi',
  complete: 'Scan selesai',
  partial: 'Scan selesai dengan hasil parsial',
};
import TechnologyTablePager from './TechnologyTablePager.vue';
import { technologyTablePage } from '../../services/technologyTablePage.mjs';
const registerPage = ref(1),
  comparisonPage = ref(1),
  resultPage = ref(1),
  technologyList = ref(null),
  technologyListDialog = ref(null);
watch(technologyList, async (value) => {
  await nextTick();
  if (value) technologyListDialog.value?.showModal();
});
function openTechnologyList(record, technologies) {
  technologyList.value = { name: record.data.name, technologies };
}
function closeTechnologyList() {
  technologyListDialog.value?.close();
  technologyList.value = null;
}
function filteredTechnologies(record) {
  return record.data.technologies.filter(
    (technology) =>
      (!quadrantFilter.value || technology.quadrant === quadrantFilter.value) &&
      (!ringFilter.value || technology.ring === ringFilter.value) &&
      (!versionFilter.value || (technology.version || '__unknown') === versionFilter.value),
  );
}
const records = ref([]),
  user = ref(null),
  ready = ref(false),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  tab = ref('dashboard');
const search = ref(''),
  ringFilter = ref(''),
  quadrantFilter = ref(''),
  versionFilter = ref(''),
  selected = ref('');
const draft = ref(null),
  dialog = ref(null),
  dirty = ref(false),
  scanResult = ref(null);
const searchRules = ref([]),
  searchMode = ref('AND'),
  rulesDraft = ref(null),
  rulesDialog = ref(null),
  ruleError = ref('');
const technologyNames = computed(() =>
  [...new Set(records.value.flatMap((row) => row.data.technologies.map((item) => item.name)))].sort(),
);
const ruleResults = computed(() =>
  searchTechnologyAssets(records.value, searchRules.value, searchMode.value),
);
const pagedRegister = computed(() => technologyTablePage(filtered.value, registerPage.value));
const comparisonRows = computed(() =>
  comparisons.value.flatMap((group) =>
    group.versions.map((row) => ({ ...row, name: group.name, different: group.different })),
  ),
);
const pagedComparisons = computed(() => technologyTablePage(comparisonRows.value, comparisonPage.value));
const pagedResults = computed(() => technologyTablePage(ruleResults.value, resultPage.value));
watch(
  () => [search.value, quadrantFilter.value, ringFilter.value, versionFilter.value, records.value],
  () => {
    registerPage.value = 1;
    comparisonPage.value = 1;
  },
);
watch([searchRules, searchMode], () => {
  resultPage.value = 1;
});
function editRules() {
  rulesDraft.value = {
    mode: searchMode.value,
    rules: searchRules.value.length
      ? structuredClone(searchRules.value.map((rule) => ({ ...rule })))
      : [{ name: '', operator: '<', version: '' }],
  };
  ruleError.value = '';
  nextTick(() => rulesDialog.value?.showModal());
}
function applyRules() {
  const rules = rulesDraft.value.rules.map((rule) => ({
    ...rule,
    name: rule.name.trim(),
    version: rule.version.trim(),
  }));
  if (
    !rules.length ||
    rules.some(
      (rule) =>
        !rule.name ||
        rule.name.length > 100 ||
        rule.version.length > 100 ||
        !['=', 'contains', '<', '<=', '>', '>='].includes(rule.operator) ||
        (['<', '<=', '>', '>='].includes(rule.operator) &&
          rule.version &&
          compareNumericVersions(rule.version, rule.version) === null),
    )
  ) {
    ruleError.value = 'Isi nama teknologi dan versi numerik bertitik untuk perbandingan.';
    return;
  }
  searchRules.value = rules;
  searchMode.value = rulesDraft.value.mode;
  rulesDialog.value?.close();
  rulesDraft.value = null;
}
function closeRules() {
  rulesDialog.value?.close();
  rulesDraft.value = null;
}
const vulnerability = ref(null),
  vulnerabilityDialog = ref(null),
  vulnerabilityResult = ref(null),
  vulnerabilityError = ref(''),
  vulnerabilityBusy = ref(false);
watch(vulnerability, async (value) => {
  await nextTick();
  if (value && vulnerabilityDialog.value && !vulnerabilityDialog.value.open)
    vulnerabilityDialog.value.showModal();
});
function findVulnerabilities(technology) {
  vulnerability.value = { name: technology.name, version: technology.version, recent: true, startIndex: 0 };
  vulnerabilityResult.value = null;
  vulnerabilityError.value = '';
  lookupVulnerabilities();
}
async function lookupVulnerabilities(startIndex = 0) {
  if (vulnerabilityBusy.value) return;
  vulnerabilityBusy.value = true;
  vulnerabilityError.value = '';
  vulnerabilityResult.value = null;
  try {
    const query = new URLSearchParams({ ...vulnerability.value, startIndex: String(startIndex) });
    vulnerabilityResult.value = await api('/vulnerabilities?' + query);
  } catch (e) {
    vulnerabilityError.value = e.message;
  } finally {
    vulnerabilityBusy.value = false;
  }
}
function closeVulnerabilities() {
  if (!vulnerabilityBusy.value) {
    vulnerabilityDialog.value?.close();
    vulnerability.value = null;
  }
}
const language = ref(window.NistI18n?.language || 'id');
function t(value) {
  language.value;
  return window.NistI18n?.t(value) || value;
}
function languageChanged() {
  language.value = window.NistI18n?.language || 'id';
}
const can = (action) =>
  user.value?.role === 'admin' ||
  Boolean(
    user.value?.actions?.['technology-asset']?.read && user.value?.actions?.['technology-asset']?.[action],
  );
const editable = computed(() => draft.value && (draft.value.id ? can('update') : can('create')));
const categoryLabels = {
  framework: 'Bahasa & Framework',
  platform: 'Platform & Infrastruktur',
  data: 'Data & Penyimpanan',
  tool: 'Tools & Praktik',
};
const ringDescriptions = {
  adopt: 'Disetujui untuk digunakan dalam operasional.',
  trial: 'Sedang diuji coba sebelum adopsi lebih luas.',
  assess: 'Sedang dievaluasi; belum diputuskan untuk digunakan.',
  hold: 'Hindari adopsi baru; tinjau penggunaan yang sudah ada.',
};
const ringLabels = { adopt: 'Adopt', trial: 'Trial', assess: 'Assess', hold: 'Hold' };
const colors = { adopt: '#1c9b79', trial: '#287bcc', assess: '#b47712', hold: '#c45066' };
const filtered = computed(() =>
  records.value.filter((row) =>
    [
      row.data.name,
      row.data.owner,
      row.data.url,
      ...row.data.technologies.map((tech) => tech.name + ' ' + tech.version),
    ]
      .join(' ')
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  ),
);
const allNodes = computed(() => technologyMap(filtered.value));
const nodes = computed(() =>
  allNodes.value.filter(
    (node) =>
      (!ringFilter.value || node.ring === ringFilter.value) &&
      (!quadrantFilter.value || node.quadrant === quadrantFilter.value) &&
      (!versionFilter.value || (node.version || '__unknown') === versionFilter.value),
  ),
);
const versions = computed(() =>
  [...new Set(allNodes.value.map((node) => node.version))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  ),
);
const comparisons = computed(() => versionComparison(allNodes.value));
const points = computed(() => radarPoints(nodes.value));
watch([nodes, filtered], () => {
  if (
    (selected.value.startsWith('t:') && !nodes.value.some((node) => 't:' + node.key === selected.value)) ||
    (selected.value.startsWith('a:') && !filtered.value.some((row) => 'a:' + row.id === selected.value))
  )
    selected.value = '';
});
const selectedNode = computed(() => nodes.value.find((node) => 't:' + node.key === selected.value));
const selectedApplication = computed(() => filtered.value.find((row) => 'a:' + row.id === selected.value));
const graph = computed(() => {
  const left = filtered.value.slice(0, 30);
  const right = nodes.value
    .filter((node) => node.applications.some((app) => left.some((row) => row.id === app.id)))
    .slice(0, 60);
  const links = right.flatMap((node) =>
    node.applications
      .map((app) => ({ node, app: left.find((row) => row.id === app.id) }))
      .filter((link) => link.app),
  );
  return { left, right, links };
});
const relationshipNodes = computed(() => [
  ...graph.value.left.map((app) => ({
    id: 'a:' + app.id,
    title: app.data.name,
    folder: t('Aplikasi'),
    content: [app.data.owner, app.data.url].join(' '),
  })),
  ...graph.value.right.map((node) => ({
    id: 't:' + node.key,
    title: node.name + ' ' + (node.version || t('Belum diketahui')),
    folder: t('Teknologi'),
    content: node.ring,
  })),
]);
const relationshipEdges = computed(() =>
  graph.value.links.map((link) => ({ source: 'a:' + link.app.id, target: 't:' + link.node.key })),
);
const graphLabels = computed(() => ({
  search: t('Cari dalam graph'),
  placeholder: t('Cari aplikasi, teknologi atau versi'),
  local: t('Hubungan terpilih'),
  orphans: t('Tanpa hubungan'),
  labels: t('Label'),
  empty: t('Belum ada aplikasi yang sesuai.'),
  zoomOut: t('Zoom keluar'),
  zoomIn: t('Zoom masuk'),
  pause: t('Jeda'),
  resume: t('Lanjutkan'),
  nodes: t('simpul'),
  edges: t('hubungan'),
  drag: t('Geser simpul atau latar'),
  scroll: t('Scroll untuk zoom'),
  click: t('Klik untuk detail'),
  open: t('Lihat daftar simpul'),
  canvas: t('Graph relasi interaktif. Geser simpul atau latar; scroll untuk zoom. Enter memilih simpul.'),
  filename: 'technology-relationship-graph.png',
}));
function sourceRemark(technology) {
  return t(technology.source === 'scan' || technology.source === 'header' ? 'Hasil scan' : 'Input manual');
}
function resetFilters() {
  search.value = '';
  ringFilter.value = '';
  quadrantFilter.value = '';
  versionFilter.value = '';
  selected.value = '';
}
async function api(path = '', method = 'GET', body) {
  const response = await fetch('/api/technology-assets' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw Error(result?.error || t('Permintaan gagal.'));
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
function load() {
  return run(async () => {
    const session = await fetch('/api/auth/me');
    if (!session.ok) throw Error('Sesi berakhir. Silakan login kembali.');
    const [profile, rows] = await Promise.all([session.json(), api()]);
    user.value = profile;
    records.value = rows;
    ready.value = true;
  });
}
watch(draft, async (value) => {
  await nextTick();
  if (value && dialog.value && !dialog.value.open) dialog.value.showModal();
});
function edit(record = null) {
  draft.value = record
    ? { id: record.id, version: record.version, ...JSON.parse(JSON.stringify(record.data)) }
    : { name: '', owner: '', url: '', description: '', version: 0, technologies: [] };
  dirty.value = false;
  scanResult.value = null;
  scanProgress.value = null;
  error.value = '';
  notice.value = '';
}
function close() {
  if (busy.value || (dirty.value && !confirm(t('Perubahan belum disimpan. Tinggalkan perubahan?')))) return;
  dialog.value?.close();
  draft.value = null;
  dirty.value = false;
}
function addTechnology() {
  draft.value.technologies.push({
    name: '',
    version: '',
    quadrant: 'framework',
    ring: 'assess',
    source: 'manual',
    evidence: '',
    notes: '',
  });
  dirty.value = true;
}
function removeTechnology(index) {
  draft.value.technologies.splice(index, 1);
  dirty.value = true;
}
function save() {
  run(async () => {
    const d = draft.value;
    const row = await api(d.id ? '/' + d.id : '', d.id ? 'PUT' : 'POST', d);
    records.value = [row, ...records.value.filter((item) => item.id !== row.id)];
    dirty.value = false;
    dialog.value?.close();
    draft.value = null;
    notice.value = 'Technology Asset berhasil disimpan.';
  });
}
function remove(record) {
  if (!confirm(t('Hapus aplikasi dan mapping teknologinya?'))) return;
  run(async () => {
    await api('/' + record.id, 'DELETE', { version: record.version });
    records.value = records.value.filter((row) => row.id !== record.id);
    notice.value = 'Technology Asset dihapus.';
  });
}
function scan(mode = 'standard') {
  run(async () => {
    scanProgress.value = { percent: 0, stage: 'validating', failed: false };
    let result;
    try {
      result = await requestTechnologyScan(draft.value.url, mode, (event) => {
        scanProgress.value = { ...event, failed: false };
      });
    } catch (error) {
      scanProgress.value.failed = true;
      throw error;
    }
    scanProgress.value = { percent: 100, stage: result.partial ? 'partial' : 'complete', failed: false };
    scanResult.value = result;
    for (const found of result.technologies) {
      const same = draft.value.technologies.find((item) => technologyKey(item) === technologyKey(found));
      if (!same && draft.value.technologies.length < 100) draft.value.technologies.push(found);
    }
    dirty.value = true;
    notice.value = 'Scan selesai. Periksa petunjuk teknologi dan versi sebelum menyimpan.';
  });
}
function beforeUnload(event) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
function graphKey(event, value) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selected.value = value;
  }
}
onMounted(() => {
  window.addEventListener('technology-asset-open', load);
  window.addEventListener('nist:language-change', languageChanged);
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener('technology-asset-open', load);
  window.removeEventListener('nist:language-change', languageChanged);
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<template>
  <section id="technologyAssetView" class="view technology-asset" data-no-translate>
    <div class="page-heading">
      <div>
        <p class="eyebrow">ASSET MANAGEMENT</p>
        <h2>Technology Asset</h2>
        <p class="lede">{{ t('Petakan teknologi dan versi yang digunakan setiap aplikasi.') }}</p>
      </div>
      <button type="button" class="button button-quiet" :disabled="busy" @click="load">
        {{ t('Muat ulang') }}
      </button>
    </div>
    <p v-if="error" role="alert" class="ta-error">{{ t(error) }}</p>
    <p role="status" aria-live="polite">{{ busy ? t('Memproses...') : t(notice) }}</p>
    <div class="toolbar" role="tablist" aria-label="Technology Asset">
      <button
        v-for="(key, index) in ['dashboard', 'radar', 'register', 'search', 'graph']"
        :id="'ta-tab-' + key"
        :key="key"
        type="button"
        class="button button-quiet"
        role="tab"
        :aria-selected="tab === key"
        :aria-controls="'ta-panel-' + key"
        @click="tab = key"
      >
        {{ index + 1 }}.
        {{
          key === 'dashboard'
            ? 'Dashboard'
            : key === 'radar'
              ? 'Technology Radar'
              : key === 'search'
                ? t('Pencarian teknologi')
                : key === 'graph'
                  ? t('Graph aplikasi dan teknologi')
                  : t('Register Asset')
        }}
      </button>
    </div>
    <div v-if="tab !== 'search'" class="toolbar ta-filters">
      <label
        >{{ t('Cari aplikasi atau teknologi')
        }}<input
          v-model="search"
          type="search"
          :placeholder="t('Nama, pemilik, teknologi atau versi')" /></label
      ><label
        >{{ t('Kategori')
        }}<select v-model="quadrantFilter">
          <option value="">{{ t('Semua kategori') }}</option>
          <option v-for="q in quadrants" :key="q" :value="q">{{ t(categoryLabels[q]) }}</option>
        </select></label
      ><label
        >Ring<select v-model="ringFilter">
          <option value="">{{ t('Semua ring') }}</option>
          <option v-for="ring in rings" :key="ring" :value="ring">{{ ringLabels[ring] }}</option>
        </select></label
      ><label
        >{{ t('Versi')
        }}<select v-model="versionFilter">
          <option value="">{{ t('Semua versi') }}</option>
          <option v-for="version in versions" :key="version" :value="version || '__unknown'">
            {{ version || t('Belum diketahui') }}
          </option>
        </select></label
      ><button type="button" class="button button-quiet" @click="resetFilters">
        {{ t('Reset filter') }}
      </button>
    </div>
    <p v-if="!ready">{{ t('Data belum tersedia. Muat ulang untuk mencoba kembali.') }}</p>
    <div
      v-if="tab === 'dashboard' && ready"
      id="ta-panel-dashboard"
      role="tabpanel"
      aria-labelledby="ta-tab-dashboard"
    >
      <div class="ta-kpis">
        <article class="insight-panel">
          <span>{{ t('Aplikasi terdaftar') }}</span
          ><strong>{{ filtered.length }}</strong>
        </article>
        <article class="insight-panel">
          <span>{{ t('Teknologi / versi') }}</span
          ><strong>{{ allNodes.length }}</strong>
        </article>
        <article class="insight-panel">
          <span>{{ t('Teknologi dipakai bersama') }}</span
          ><strong>{{ allNodes.filter((node) => node.applications.length > 1).length }}</strong>
        </article>
        <article class="insight-panel">
          <span>{{ t('Teknologi dengan perbedaan versi') }}</span
          ><strong>{{ comparisons.filter((group) => group.different).length }}</strong>
        </article>
      </div>
      <article class="insight-panel">
        <h3>{{ t('Perbandingan versi antar-aplikasi') }}</h3>
        <p>
          {{
            t(
              'Versi berbeda dipetakan terpisah. Versi kosong berarti belum diketahui, bukan versi terbaru atau aman.',
            )
          }}
        </p>
        <div class="excel-wrap">
          <table class="excel-table" data-table-resize="off">
            <thead>
              <tr>
                <th>{{ t('Teknologi') }}</th>
                <th>{{ t('Versi') }}</th>
                <th>{{ t('Aplikasi') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in pagedComparisons.rows" :key="row.name + row.version"
                ><tr>
                  <td>
                    {{ row.name }}
                    <span v-if="row.different" class="ta-badge">{{ t('Berbeda versi') }}</span>
                  </td>
                  <td>
                    {{ row.version || t('Belum diketahui') }}
                    <button
                      type="button"
                      class="button button-quiet"
                      :disabled="!row.version"
                      @click="findVulnerabilities({ name: row.name, version: row.version })"
                    >
                      {{ t('Cari CVE versi ini') }}
                    </button>
                  </td>
                  <td>{{ row.applications.map((app) => app.name).join(', ') }}</td>
                </tr></template
              >
              <tr v-if="!comparisons.length">
                <td colspan="3">{{ t('Belum ada mapping teknologi.') }}</td>
              </tr>
            </tbody>
          </table>
          <TechnologyTablePager
            :page="pagedComparisons.page"
            :pages="pagedComparisons.pages"
            :total="pagedComparisons.total"
            :translate="t"
            @update:page="comparisonPage = $event"
          />
        </div>
      </article>
    </div>
    <div v-if="tab === 'radar' && ready" id="ta-panel-radar" role="tabpanel" aria-labelledby="ta-tab-radar">
      <article class="insight-panel">
        <h3>Technology Radar</h3>
        <p>
          {{
            t(
              'Adopt: digunakan; Trial: uji coba; Assess: evaluasi; Hold: hindari adopsi baru. Ring adalah keputusan organisasi, bukan skor keamanan otomatis.',
            )
          }}
        </p>
        <p>
          {{
            t(
              'Jika keputusan antar-aplikasi berbeda, radar menampilkan ring paling berhati-hati: Hold, Assess, Trial, Adopt.',
            )
          }}
        </p>
        <div class="ta-radar-layout">
          <svg viewBox="0 0 660 660" class="ta-radar" role="img" :aria-label="t('Radar teknologi dan versi')">
            <circle
              v-for="(ring, index) in [...rings].reverse()"
              :key="ring"
              cx="330"
              cy="330"
              :r="(4 - index) * 66"
              :fill="colors[ring]"
              fill-opacity="0.09"
              :stroke="colors[ring]"
              stroke-opacity="0.4"
            />
            <path d="M66 330H594M330 66V594" stroke="currentColor" opacity="0.25" />
            <text
              v-for="(q, index) in quadrants"
              :key="q"
              :x="index === 0 || index === 3 ? 170 : 490"
              :y="index < 2 ? 32 : 635"
              text-anchor="middle"
              class="ta-svg-label"
            >
              {{ t(categoryLabels[q]) }}
            </text>
            <g
              v-for="node in points"
              :key="node.key"
              role="button"
              tabindex="0"
              :aria-label="node.name + ' ' + (node.version || t('Belum diketahui'))"
              @keydown="graphKey($event, 't:' + node.key)"
              @click="selected = 't:' + node.key"
            >
              <title>
                {{ node.name }} {{ node.version || t('Belum diketahui') }} · {{ node.ring }} ·
                {{ node.applications.map((app) => app.name).join(', ') }}
              </title>
              <circle
                :cx="node.x"
                :cy="node.y"
                :r="selected === 't:' + node.key ? 9 : 6"
                :fill="colors[node.ring]"
                stroke="var(--paper,#fff)"
                stroke-width="2"
              />
            </g>
          </svg>
          <div class="ta-radar-list">
            <p>
              {{
                t(
                  'Angka menunjukkan jumlah teknologi/versi pada ring ini. Nilai 0 berarti belum ada teknologi pada ring tersebut.',
                )
              }}
            </p>
            <p v-for="ring in rings" :key="ring">
              <span class="ta-dot" :style="{ background: colors[ring] }"></span>
              <strong>{{ ringLabels[ring] }}: {{ nodes.filter((node) => node.ring === ring).length }}</strong
              ><small class="ta-ring-description">{{ t(ringDescriptions[ring]) }}</small>
            </p>
            <button
              v-for="node in nodes"
              :key="node.key"
              type="button"
              class="button button-quiet"
              @click="selected = 't:' + node.key"
            >
              {{ node.name }} {{ node.version || t('Belum diketahui') }} · {{ node.applications.length }}
            </button>
            <p v-if="!nodes.length">{{ t('Belum ada mapping teknologi.') }}</p>
          </div>
        </div>
      </article>
    </div>
    <div
      v-if="tab === 'register' && ready"
      id="ta-panel-register"
      role="tabpanel"
      aria-labelledby="ta-tab-register"
    >
      <div class="page-heading">
        <h3>{{ t('Register aplikasi dan teknologi') }}</h3>
        <button
          v-if="can('create')"
          id="ta-create"
          type="button"
          class="button button-accent"
          :disabled="busy"
          @click="edit()"
        >
          {{ t('Tambah aplikasi') }}
        </button>
      </div>
      <div class="excel-wrap">
        <table class="excel-table" data-table-resize="off">
          <thead>
            <tr>
              <th>{{ t('Aplikasi') }}</th>
              <th>URL / {{ t('Pemilik') }}</th>
              <th>{{ t('Teknologi & versi') }}</th>
              <th>{{ t('Aksi') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pagedRegister.rows" :key="row.id">
              <td>
                {{ row.data.name }}<small>{{ row.data.description }}</small>
              </td>
              <td>
                {{ row.data.url }}<small>{{ row.data.owner }}</small>
              </td>
              <td>
                <div
                  v-for="technology in filteredTechnologies(row).slice(0, 5)"
                  :key="technologyKey(technology)"
                >
                  {{ technology.name }} <strong>{{ technology.version || t('Belum diketahui') }}</strong>
                  <span class="ta-badge">{{ technology.ring }}</span>
                  <span class="ta-badge ta-source-remark">{{ sourceRemark(technology) }}</span>
                </div>
                <button
                  v-if="filteredTechnologies(row).length > 5"
                  type="button"
                  class="button button-quiet ta-see-more"
                  @click="openTechnologyList(row, filteredTechnologies(row))"
                >
                  {{ t('Lihat selengkapnya') }} (+{{ filteredTechnologies(row).length - 5 }})</button
                ><span v-if="!filteredTechnologies(row).length">{{ t('Belum ada mapping teknologi.') }}</span>
              </td>
              <td>
                <button
                  type="button"
                  class="button button-quiet"
                  :data-ta-edit="row.id"
                  :disabled="busy"
                  @click="edit(row)"
                >
                  {{ t(can('update') ? 'Ubah' : 'Lihat') }}</button
                ><button
                  v-if="can('delete')"
                  type="button"
                  class="button button-danger"
                  :disabled="busy"
                  @click="remove(row)"
                >
                  {{ t('Hapus') }}
                </button>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="4">{{ t('Belum ada aplikasi yang sesuai.') }}</td>
            </tr>
          </tbody>
        </table>
        <TechnologyTablePager
          :page="pagedRegister.page"
          :pages="pagedRegister.pages"
          :total="pagedRegister.total"
          :translate="t"
          @update:page="registerPage = $event"
        />
      </div>
    </div>
    <article
      v-if="ready && tab === 'graph'"
      id="ta-panel-graph"
      role="tabpanel"
      aria-labelledby="ta-tab-graph"
      class="insight-panel ta-graph-panel"
    >
      <div class="page-heading">
        <div>
          <h3>{{ t('Graph aplikasi dan teknologi') }}</h3>
          <p>{{ t('Klik simpul untuk melihat aplikasi yang memakai teknologi dan versi tersebut.') }}</p>
        </div>
      </div>
      <p>
        {{
          t(
            'Graph dibatasi 30 aplikasi dan 60 teknologi per tampilan; gunakan pencarian dan filter untuk mempersempit mapping.',
          )
        }}
      </p>
      <div class="ta-graph-scroll">
        <KnowledgeGraph
          :notes="relationshipNodes"
          :relationships="relationshipEdges"
          :selected-id="selected"
          :terminology="graphLabels"
          search-neighbors
          @open="(node) => (selected = node.id)"
        />
      </div>
      <div v-if="selectedNode" class="ta-selection">
        <strong
          >{{ selectedNode.name }} {{ selectedNode.version || t('Belum diketahui') }} ·
          {{ selectedNode.ring }}</strong
        >
        <p>{{ selectedNode.applications.map((app) => app.name).join(', ') }}</p>
      </div>
      <div v-if="selectedApplication" class="ta-selection">
        <strong>{{ selectedApplication.data.name }}</strong>
        <p>
          {{
            selectedApplication.data.technologies
              .map((technology) => technology.name + ' ' + (technology.version || t('Belum diketahui')))
              .join(', ')
          }}
        </p>
      </div>
    </article>
    <div
      v-if="tab === 'search' && ready"
      id="ta-panel-search"
      role="tabpanel"
      aria-labelledby="ta-tab-search"
    >
      <div class="page-heading">
        <h3>{{ t('Cari aplikasi berdasarkan teknologi dan versi') }}</h3>
        <button type="button" id="ta-search-rules" class="button button-accent" @click="editRules">
          {{ t('Atur filter teknologi') }}
        </button>
      </div>
      <p>
        {{
          t(
            'Batas versi ditentukan oleh Anda, bukan penetapan otomatis bahwa produk sudah usang. AND: semua kriteria harus ditemukan pada aplikasi yang sama. OR: cukup salah satu kriteria.',
          )
        }}
      </p>
      <div class="toolbar">
        <span class="ta-badge">{{ searchMode }}</span
        ><span v-for="(rule, index) in searchRules" :key="index" class="ta-badge"
          >{{ rule.name }} {{ rule.version ? rule.operator : '' }} {{ rule.version }}</span
        >
      </div>
      <p>{{ t('Aplikasi cocok') }}: {{ ruleResults.length }}</p>
      <p>
        {{
          t(
            'Versi numerik dibandingkan per bagian, misalnya 6.1.1.1 < 7.1.1. Versi kosong atau nonnumerik tidak cocok dengan filter perbandingan.',
          )
        }}
      </p>
      <div class="excel-wrap">
        <table class="excel-table" data-table-resize="off">
          <thead>
            <tr>
              <th>{{ t('Aplikasi') }}</th>
              <th>URL / {{ t('Pemilik') }}</th>
              <th>{{ t('Teknologi & versi') }}</th>
              <th>{{ t('Aksi') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="match in pagedResults.rows" :key="match.record.id">
              <td>{{ match.record.data.name }}</td>
              <td>
                {{ match.record.data.url }}<small>{{ match.record.data.owner }}</small>
              </td>
              <td>
                <div v-for="technology in match.technologies.slice(0, 5)" :key="technologyKey(technology)">
                  {{ technology.name }} <strong>{{ technology.version || t('Belum diketahui') }}</strong
                  ><span class="ta-badge">{{ sourceRemark(technology) }}</span>
                </div>
                <button
                  v-if="match.technologies.length > 5"
                  type="button"
                  class="button button-quiet ta-see-more"
                  @click="openTechnologyList(match.record, match.technologies)"
                >
                  {{ t('Lihat selengkapnya') }} (+{{ match.technologies.length - 5 }})
                </button>
              </td>
              <td>
                <button type="button" class="button button-quiet" @click="edit(match.record)">
                  {{ t(can('update') ? 'Ubah' : 'Lihat') }}
                </button>
              </td>
            </tr>
            <tr v-if="!ruleResults.length">
              <td colspan="4">
                {{
                  t(
                    searchRules.length
                      ? 'Belum ada aplikasi yang sesuai.'
                      : 'Atur filter untuk mencari teknologi dan versi pada seluruh register.',
                  )
                }}
              </td>
            </tr>
          </tbody>
        </table>
        <TechnologyTablePager
          :page="pagedResults.page"
          :pages="pagedResults.pages"
          :total="pagedResults.total"
          :translate="t"
          @update:page="resultPage = $event"
        />
      </div>
    </div>
    <dialog
      v-if="technologyList"
      ref="technologyListDialog"
      class="ta-dialog ta-technology-list-dialog"
      aria-labelledby="ta-technology-list-title"
      @cancel.prevent="closeTechnologyList"
    >
      <div class="ta-form">
        <h3 id="ta-technology-list-title">{{ technologyList.name }} ? {{ t('Teknologi & versi') }}</h3>
        <ul class="ta-scan-technologies">
          <li v-for="technology in technologyList.technologies" :key="technologyKey(technology)">
            <strong>{{ technology.name }}</strong
            ><span>{{ technology.version || t('Belum diketahui') }}</span
            ><span class="ta-badge">{{ sourceRemark(technology) }}</span
            ><span class="ta-badge">{{ technology.ring }}</span>
          </li>
        </ul>
        <button type="button" class="button button-quiet" @click="closeTechnologyList">
          {{ t('Tutup') }}
        </button>
      </div>
    </dialog>
    <dialog
      v-if="rulesDraft"
      ref="rulesDialog"
      class="ta-dialog"
      aria-labelledby="ta-rules-title"
      @cancel.prevent="closeRules"
    >
      <form class="ta-form" @submit.prevent="applyRules">
        <h3 id="ta-rules-title">{{ t('Atur filter teknologi') }}</h3>
        <p v-if="ruleError" class="ta-error" role="alert">{{ t(ruleError) }}</p>
        <label
          >{{ t('Gabungkan kriteria')
          }}<select v-model="rulesDraft.mode">
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select></label
        ><datalist id="ta-technology-names">
          <option v-for="name in technologyNames" :key="name" :value="name" />
        </datalist>
        <div v-for="(rule, index) in rulesDraft.rules" :key="index" class="ta-rule-row">
          <label
            >{{ t('Teknologi')
            }}<input v-model="rule.name" list="ta-technology-names" required maxlength="100" /></label
          ><label
            >{{ t('Operator versi')
            }}<select v-model="rule.operator">
              <option
                v-for="operator in ['<', '<=', '=', '>=', '>', 'contains']"
                :key="operator"
                :value="operator"
              >
                {{ operator === 'contains' ? t('Mengandung') : operator }}
              </option>
            </select></label
          ><label
            >{{ t('Versi')
            }}<input v-model="rule.version" maxlength="100" :placeholder="t('Kosong = semua versi')" /></label
          ><button
            type="button"
            class="button button-danger"
            :disabled="rulesDraft.rules.length === 1"
            @click="rulesDraft.rules.splice(index, 1)"
          >
            {{ t('Hapus') }}
          </button>
        </div>
        <div class="toolbar">
          <button
            type="button"
            class="button button-quiet"
            :disabled="rulesDraft.rules.length >= 20"
            @click="rulesDraft.rules.push({ name: '', operator: '<', version: '' })"
          >
            {{ t('Tambah kriteria') }}</button
          ><button type="submit" class="button button-accent ta-apply-filter">
            {{ t('Terapkan filter') }}</button
          ><button type="button" class="button button-quiet" @click="closeRules">{{ t('Tutup') }}</button>
        </div>
      </form>
    </dialog>
    <dialog
      v-if="draft"
      ref="dialog"
      class="ta-dialog"
      aria-labelledby="ta-editor-title"
      @cancel.prevent="close"
    >
      <form class="ta-form" @submit.prevent="save" @input="dirty = true" @change="dirty = true">
        <h3 id="ta-editor-title">{{ t(draft.id ? 'Ubah aplikasi' : 'Tambah aplikasi') }}</h3>
        <p v-if="error" role="alert" class="ta-error">{{ t(error) }}</p>
        <p role="status" aria-live="polite">{{ busy ? t('Memproses...') : t(notice) }}</p>
        <div v-if="scanProgress" class="ta-scan-progress" aria-live="polite">
          <div>
            <strong>{{ scanProgress.percent }}%</strong> ?
            {{ t(scanProgress.failed ? 'Scan gagal' : scanStages[scanProgress.stage] || 'Memproses...') }}
          </div>
          <progress
            max="100"
            :value="scanProgress.percent"
            :aria-label="t('Progres scan website')"
          /><small>{{
            t('Persentase menunjukkan tahap pemindaian, bukan jumlah seluruh teknologi yang sudah ditemukan.')
          }}</small>
        </div>
        <fieldset :disabled="busy || !editable">
          <div class="ta-fields">
            <label
              >{{ t('Nama aplikasi')
              }}<input v-model="draft.name" name="name" required maxlength="200" /></label
            ><label>{{ t('Pemilik / tim') }}<input v-model="draft.owner" maxlength="200" /></label
            ><label class="ta-wide"
              >{{ t('URL website')
              }}<input
                v-model="draft.url"
                name="url"
                type="url"
                maxlength="2048"
                placeholder="https://example.com" /></label
            ><label class="ta-wide"
              >{{ t('Deskripsi') }}<textarea v-model="draft.description" maxlength="4000" rows="2"></textarea>
            </label>
          </div>
          <div class="toolbar">
            <button
              type="button"
              id="ta-scan"
              class="button button-quiet"
              :disabled="!draft.url"
              @click="scan('standard')"
            >
              {{ t('Scan teknologi website') }}</button
            ><button
              type="button"
              id="ta-browser-scan"
              class="button button-quiet"
              :disabled="!draft.url"
              @click="scan('browser')"
            >
              {{ t('Scan browser (lebih lengkap)') }}</button
            ><button
              type="button"
              class="button button-quiet"
              :disabled="draft.technologies.length >= 100"
              @click="addTechnology"
            >
              {{ t('Tambah teknologi manual') }}
            </button>
          </div>
          <p>
            {{
              t(
                'Scan internal/publik membaca header dan HTML, tag generator, script/style dan nama cookie. Membaca hingga 12 aset JS/CSS satu origin tanpa mengeksekusinya. Tanpa login atau crawling halaman lain. Periksa hasil dan versi sebelum menyimpan.',
              )
            }}
          </p>
          <p>
            {{
              t(
                'Mode browser menjalankan JavaScript dalam sesi terisolasi tanpa login. Memerlukan Chrome/Chromium pada server; beberapa resource dibatasi sehingga hasil dapat parsial.',
              )
            }}
          </p>
          <div v-if="scanResult" class="ta-scan-result">
            <p v-if="scanResult.mode === 'browser'">
              {{ t('Hasil scan browser')
              }}<span v-if="scanResult.partial">
                ? {{ t('Sebagian resource dibatasi; hasil mungkin belum lengkap.') }}</span
              >
            </p>
            <p v-if="scanResult.timeoutStage">
              {{ t('Sebagian tahap melewati batas waktu; hasil yang sudah terbaca tetap ditampilkan.') }}
              {{ t(scanStages[scanResult.timeoutStage] || 'Memproses...') }}
            </p>
            <p v-if="scanResult.engine">
              {{ scanResult.engine.name }} ? {{ scanResult.engine.signatures }} {{ t('signature teknologi') }}
            </p>
            <p v-if="scanResult.accessRestricted" class="ta-error">
              {{
                t(
                  'Website menolak akses scanner atau mengembalikan halaman error. Hasil hanya petunjuk header, bukan inventaris aplikasi. Periksa kebijakan akses atau WAF server tujuan.',
                )
              }}
            </p>
            <p>{{ scanResult.url }} · HTTP {{ scanResult.status }} · {{ scanResult.scannedAt }}</p>
            <p>
              {{ t('Teknologi terdeteksi') }}: <strong>{{ scanResult.technologies.length }}</strong>
            </p>
            <ul class="ta-scan-technologies" :aria-label="t('Teknologi terdeteksi')">
              <li v-for="technology in scanResult.technologies" :key="technologyKey(technology)">
                <strong>{{ technology.name }}</strong> {{ technology.version || t('Belum diketahui') }}
                <span class="ta-badge">{{ sourceRemark(technology) }}</span>
                <span
                  v-for="category in technology.detection?.categories || []"
                  :key="category"
                  class="ta-badge"
                  >{{ category }}</span
                >
                <details class="ta-detection-detail">
                  <summary>{{ t('Detail deteksi') }}</summary>
                  <p v-if="technology.detection?.description">{{ technology.detection.description }}</p>
                  <p v-if="technology.detection">
                    {{ technology.detection.engine }} ? {{ t('Skor kecocokan signature') }}:
                    {{ technology.detection.confidence }}% ?
                    {{ t(technology.detection.inferred ? 'Deteksi tidak langsung' : 'Deteksi langsung') }}
                  </p>
                  <p>{{ technology.evidence }}</p>
                </details>
              </li>
            </ul>
            <p>
              {{
                t(
                  'Scanner mengumpulkan semua kecocokan yang ditemukan, bukan hanya satu teknologi. Teknologi tersembunyi tidak dapat dipastikan dari scan pasif.',
                )
              }}
            </p>
            <p v-if="scanResult.truncated">{{ t('Analisis dibatasi 512 KiB HTML pertama.') }}</p>
            <p v-if="!scanResult.technologies.length">
              {{
                t(
                  'Tidak ada teknologi yang dikenali. Website dapat menyembunyikan teknologinya; tambahkan secara manual.',
                )
              }}
            </p>
            <p v-for="(value, key) in scanResult.headers" :key="key">
              <code>{{ key }}</code
              >: {{ value }}
            </p>
          </div>
          <div class="ta-technology-list">
            <details
              v-for="(technology, index) in draft.technologies"
              :key="index"
              class="ta-technology-editor"
              :open="technology.source === 'manual'"
            >
              <summary>
                <strong>{{ technology.name || t('Teknologi') }}</strong
                ><span>{{ technology.version || t('Belum diketahui') }}</span
                ><span class="ta-badge">{{ sourceRemark(technology) }}</span>
              </summary>
              <div v-if="technology.detection" class="ta-detection-detail">
                <p>{{ technology.detection.description }}</p>
                <span v-for="category in technology.detection.categories" :key="category" class="ta-badge">{{
                  category
                }}</span>
                <p>
                  {{ t('Skor kecocokan signature') }}: {{ technology.detection.confidence }}% ?
                  {{ t(technology.detection.inferred ? 'Deteksi tidak langsung' : 'Deteksi langsung') }}
                </p>
              </div>
              <div class="ta-fields">
                <label>{{ t('Teknologi') }}<input v-model="technology.name" required maxlength="100" /></label
                ><label
                  >{{ t('Versi')
                  }}<input
                    v-model="technology.version"
                    maxlength="100"
                    :placeholder="t('Kosongkan bila belum diketahui')" /></label
                ><label
                  >{{ t('Kategori')
                  }}<select v-model="technology.quadrant">
                    <option v-for="q in quadrants" :key="q" :value="q">{{ t(categoryLabels[q]) }}</option>
                  </select></label
                ><label
                  >Ring<select v-model="technology.ring">
                    <option v-for="ring in rings" :key="ring" :value="ring">{{ ringLabels[ring] }}</option>
                  </select></label
                ><label
                  >{{ t('Sumber') }} / Remark
                  <span class="ta-source-remark">{{ sourceRemark(technology) }}</span
                  ><select v-model="technology.source">
                    <option value="manual">Manual</option>
                    <option value="header">{{ t('Petunjuk header') }}</option>
                    <option value="scan">{{ t('Scan website') }}</option>
                  </select></label
                ><label
                  >{{ t('Evidence / header')
                  }}<textarea v-model="technology.evidence" maxlength="1000" rows="2"></textarea></label
                ><label class="ta-wide"
                  >{{ t('Catatan keputusan')
                  }}<textarea v-model="technology.notes" maxlength="2000" rows="2"></textarea>
                </label>
              </div>
              <button
                type="button"
                class="button button-quiet"
                :disabled="!technology.name || !technology.version"
                @click="findVulnerabilities(technology)"
              >
                {{ t('Cari CVE versi ini') }}</button
              ><button type="button" class="button button-danger" @click="removeTechnology(index)">
                {{ t('Hapus teknologi') }}
              </button>
            </details>
          </div>
        </fieldset>
        <div class="csf-form-actions">
          <button v-if="editable" type="submit" class="button button-accent" :disabled="busy || !dirty">
            {{ t('Simpan') }}</button
          ><button type="button" class="button button-quiet" :disabled="busy" @click="close">
            {{ t('Tutup') }}
          </button>
        </div>
      </form>
    </dialog>
    <dialog
      v-if="vulnerability"
      ref="vulnerabilityDialog"
      class="ta-dialog ta-vulnerability-dialog"
      aria-labelledby="ta-vulnerability-title"
      @cancel.prevent="closeVulnerabilities"
    >
      <div class="ta-form">
        <h3 id="ta-vulnerability-title">
          {{ t('Pencarian kandidat CVE') }}: {{ vulnerability.name }} {{ vulnerability.version }}
        </h3>
        <p>
          {{
            t(
              'Pencarian kata kunci NVD bukan konfirmasi produk terdampak. Cocokkan vendor, rentang versi, CPE dan konfigurasi pada sumber. Hasil kosong tidak berarti aman.',
            )
          }}
        </p>
        <label
          ><input v-model="vulnerability.recent" type="checkbox" :disabled="vulnerabilityBusy" />
          {{ t('Diperbarui dalam 119 hari terakhir') }}</label
        >
        <div class="toolbar">
          <button
            type="button"
            class="button button-quiet"
            :disabled="vulnerabilityBusy"
            @click="lookupVulnerabilities()"
          >
            {{ t('Periksa ulang') }}</button
          ><a
            :href="
              'https://nvd.nist.gov/vuln/search/results?query=' +
              encodeURIComponent(vulnerability.name + ' ' + vulnerability.version) +
              '&search_type=all'
            "
            target="_blank"
            rel="noopener noreferrer"
            >{{ t('Buka pencarian NVD') }}</a
          >
        </div>
        <p v-if="vulnerabilityError" role="alert" class="ta-error">{{ t(vulnerabilityError) }}</p>
        <p v-if="vulnerabilityBusy" role="status">{{ t('Mengambil data NVD...') }}</p>
        <template v-if="vulnerabilityResult"
          ><p>
            {{ vulnerabilityResult.total }} {{ t('kandidat ditemukan') }} ?
            {{ vulnerabilityResult.checkedAt }}
            {{ vulnerabilityResult.cached ? t('Cache maksimum 5 menit') : '' }}
          </p>
          <article v-for="item in vulnerabilityResult.items" :key="item.id" class="ta-technology-editor">
            <a :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.id }}</a> ?
            {{ item.severity }} ? CVSS {{ item.score ?? t('Belum diketahui') }}
            <p>{{ item.description }}</p>
            <p>
              {{ t('Diterbitkan') }}: {{ item.published }} ? {{ t('Diperbarui') }}: {{ item.modified }} ?
              {{ item.status }}
            </p>
          </article>
          <p v-if="!vulnerabilityResult.items.length">
            {{ t('Tidak ada kandidat pada pencarian ini. Tetap verifikasi rentang versi di sumber.') }}
          </p>
          <div class="toolbar">
            <button
              type="button"
              class="button button-quiet"
              :disabled="vulnerabilityBusy || vulnerabilityResult.startIndex === 0"
              @click="lookupVulnerabilities(vulnerabilityResult.startIndex - 20)"
            >
              {{ t('Sebelumnya') }}</button
            ><button
              type="button"
              class="button button-quiet"
              :disabled="
                vulnerabilityBusy ||
                vulnerabilityResult.startIndex + 20 >= vulnerabilityResult.total ||
                vulnerabilityResult.startIndex >= 10000
              "
              @click="lookupVulnerabilities(vulnerabilityResult.startIndex + 20)"
            >
              {{ t('Berikutnya') }}
            </button>
          </div></template
        >
        <p>{{ t('Data dari NVD API. Produk ini tidak disahkan atau disertifikasi oleh NVD.') }}</p>
        <button
          type="button"
          class="button button-quiet"
          :disabled="vulnerabilityBusy"
          @click="closeVulnerabilities"
        >
          {{ t('Tutup') }}
        </button>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
.technology-asset .ta-dialog .button.ta-apply-filter {
  background: #1d4ed8;
  color: #fff;
  border: 1px solid #1d4ed8;
}
.technology-asset .ta-dialog .button.ta-apply-filter:hover {
  background: #1e40af;
  border-color: #1e40af;
}
.technology-asset .ta-dialog .button.ta-apply-filter:focus-visible {
  outline: 3px solid #60a5fa;
  outline-offset: 3px;
}
.ta-rule-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
}
.ta-rule-row label {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.ta-rule-row input,
.ta-rule-row select {
  width: 100%;
  min-width: 0;
}
@media (max-width: 700px) {
  .ta-rule-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
.technology-asset {
  min-width: 0;
}
.ta-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin: 20px 0;
}
.ta-kpis article {
  display: grid;
  gap: 12px;
  margin: 0;
}
.ta-kpis strong {
  font-size: 30px;
}
.ta-error {
  color: var(--danger, #b42318);
}
.ta-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.ta-filters label {
  display: grid;
  gap: 6px;
  min-width: 120px;
}
.technology-asset .excel-wrap {
  max-width: 100%;
  overflow: auto;
}
.technology-asset .excel-table {
  width: 100%;
  table-layout: fixed;
  min-width: 0;
}
.technology-asset th,
.technology-asset td {
  overflow-wrap: anywhere;
  white-space: normal;
}
.technology-asset td small {
  display: block;
  color: var(--muted);
  margin-top: 8px;
}
.technology-asset .insight-panel {
  margin-top: 20px;
}
.technology-asset [role='tab'][aria-selected='true'] {
  background: var(--navy, #243650);
  color: var(--paper, #fff);
}
.ta-badge {
  display: inline-block;
  padding: 3px 7px;
  border-radius: 5px;
  background: #b477121a;
  font-size: 11px;
  margin: 3px;
}
.ta-radar-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(220px, 1fr);
  gap: 24px;
}
.ta-radar {
  width: 100%;
  max-width: 660px;
}
.ta-svg-label {
  fill: var(--ink, #29425f);
  font: 12px sans-serif;
}
.ta-radar-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 650px;
  overflow: auto;
}
.ta-ring-description {
  display: block;
  margin: 5px 0 0 16px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.ta-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.ta-graph-scroll {
  max-width: 100%;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.ta-graph-scroll svg {
  display: block;
  max-width: none;
}
.ta-graph-panel .page-heading {
  flex-wrap: wrap;
  gap: 12px;
}
.ta-selection {
  padding: 14px;
  margin-top: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow-wrap: anywhere;
}
.ta-dialog {
  width: min(1080px, calc(100vw - 32px));
  max-height: 90vh;
  overflow: auto;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--paper, #fff);
  color: var(--ink, #243650);
}
.ta-dialog::backdrop {
  background: #0006;
}
.ta-form {
  display: grid;
  gap: 20px;
  padding: 28px;
}
.ta-form h3,
.ta-form p {
  margin: 0;
  line-height: 1.7;
}
.ta-form fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  display: grid;
  gap: 20px;
}
.ta-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.ta-fields label {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.ta-fields input,
.ta-fields select,
.ta-fields textarea {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.ta-wide {
  grid-column: 1/-1;
}
.ta-technology-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 12px;
  align-items: start;
}
.ta-technology-editor summary {
  cursor: pointer;
  overflow-wrap: anywhere;
}
.ta-technology-editor summary strong {
  margin-right: 8px;
}
.ta-technology-editor summary > span {
  display: inline-block;
}
.ta-technology-editor[open] summary {
  margin-bottom: 16px;
}
.ta-technology-editor .ta-fields {
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
.ta-scan-technologies {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
  gap: 10px;
  list-style: none;
  padding: 0;
  margin: 12px 0;
  max-height: 280px;
  overflow: auto;
  align-content: start;
}
.ta-scan-progress {
  display: grid;
  gap: 8px;
}
.ta-scan-progress progress {
  width: 100%;
  height: 16px;
  accent-color: #367ccb;
}
.ta-detection-detail {
  width: 100%;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.ta-detection-detail summary {
  cursor: pointer;
}
.ta-detection-detail p {
  margin: 8px 0;
}
.ta-scan-technologies li {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  min-width: 0;
  background: var(--paper, #fff);
}
.ta-technology-editor {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.ta-technology-editor > button {
  margin-top: 12px;
}
.ta-scan-result {
  padding: 14px;
  border: 1px solid var(--line);
  overflow-wrap: anywhere;
  border-radius: 8px;
}
g[role='button'] {
  cursor: pointer;
}
g[role='button']:focus-visible {
  outline: 2px solid #287bcc;
  outline-offset: 3px;
}
@media (max-width: 700px) {
  .ta-radar-layout,
  .ta-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .ta-form {
    padding: 20px;
  }
  .ta-wide {
    grid-column: auto;
  }
  .technology-asset .page-heading {
    flex-wrap: wrap;
    gap: 12px;
  }
  .ta-filters input,
  .ta-filters select {
    max-width: 100%;
    min-width: 0;
  }
  .ta-filters label {
    min-width: 0;
    flex: 1 1 140px;
  }
}
</style>
