// Capture the year before a request starts, including autosaves and import/export.
const assessmentPeriodStorage = 'nist-assessment-years';
let assessmentYears;
try { assessmentYears = JSON.parse(localStorage.getItem(assessmentPeriodStorage) || '{}'); } catch { assessmentYears = {}; }
if (!assessmentYears || typeof assessmentYears !== 'object' || Array.isArray(assessmentYears)) assessmentYears = {};
for (const key of ['csf','privacy','iso27001','ikas']) if (!Number.isInteger(assessmentYears[key])) assessmentYears[key] = 2026;
const assessmentNativeFetch = window.fetch.bind(window);
const assessmentPeriodLists = new Map();
const assessmentPendingWrites = new Set();
const assessmentWriteErrors = new Set();
function assessmentGroupForUrl(input) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.origin);
  if (url.origin !== location.origin) return null;
  const path = url.pathname;
  if (/^\/api\/(?:ikas(?:\/|$)|ikas-workbook(?:\/|$)|assessment-gaps\/ikas(?:\/|$)|frameworks\/ikas\/(?:controls|targets)(?:\/|$))/.test(path)) return 'ikas';
  if (/^\/api\/(?:assessment(?:\/|$)|csf(?:\/|$)|assessment-gaps\/csf(?:\/|$)|frameworks\/csf\/(?:controls|targets)(?:\/|$))/.test(path)) return 'csf';
  if (/^\/api\/(?:privacy(?:\/|$)|assessment-gaps\/privacy(?:\/|$)|frameworks\/privacy\/(?:controls|targets)(?:\/|$))/.test(path)) return 'privacy';
  if (/^\/api\/(?:frameworks\/iso27001(?:-soa)?\/(?:controls|targets|objectives|assessment)(?:\/|$)|assessment-gaps\/iso27001(?:-soa)?(?:\/|$))/.test(path)) return 'iso27001';
  return null;
}
async function assessmentPeriodsFor(group) {
  if (!assessmentPeriodLists.has(group)) {
    const pending = assessmentNativeFetch(`/api/assessment-periods/${group}`, {cache:'no-store'}).then(async response => {
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Daftar tahun assessment tidak tersedia.');
      const rows = await response.json();
      if (!rows.some(row => row.year === assessmentYears[group])) {
        assessmentYears[group] = rows.find(row => row.legacy)?.year || rows[0]?.year || 2026;
        localStorage.setItem(assessmentPeriodStorage,JSON.stringify(assessmentYears));
      }
      return rows;
    });
    assessmentPeriodLists.set(group,pending);
  }
  return assessmentPeriodLists.get(group);
}
const assessmentFetch = (input, options = {}) => {
  const group = assessmentGroupForUrl(input), capturedYear = group ? assessmentYears[group] : null;
  const method = String(options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const operation = (async () => {
    if (!group) return assessmentNativeFetch(input,options);
    const periods = await assessmentPeriodsFor(group).catch(() => null);
    const year = periods && !periods.some(row => row.year === capturedYear) ? assessmentYears[group] : capturedYear;
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url,location.origin);
    if (!url.searchParams.has('assessmentYear')) url.searchParams.set('assessmentYear',year);
    return assessmentNativeFetch(input instanceof Request ? new Request(url,input) : url.pathname + url.search,options);
  })();
  if (!['GET','HEAD'].includes(method)) {
    assessmentPendingWrites.add(operation);
    operation.then(response => {assessmentPendingWrites.delete(operation);if(group){if(response.ok)assessmentWriteErrors.delete(group);else assessmentWriteErrors.add(group);}}, () => {assessmentPendingWrites.delete(operation);if(group)assessmentWriteErrors.add(group);});
  }
  return operation;
};

window.fetch = assessmentFetch;
