// Dashboard snapshots use existing endpoints and never introduce another registry.
let tdData = { vendors: [], questionnaires: [], templates: [] }, tdSources = {}, tdDrill = null, tdQuestionDrill = null;
function tdQuestionMatches(row) { return !tdQuestionDrill || tdQuestionDrill.has(String(row.id)); }
function tdOpenQuestions(status, tier) {
  const scoped = ['tdSearch','tdRisk','tdRelationship','tdReview'].some(id=>$(id).value), ids = new Set(tdData.vendors.filter(tdScope).map(r=>String(r.questionnaireId)));
  tdQuestionDrill = new Set(tdData.questionnaires.filter(q=>(!scoped||ids.has(String(q.id)))&&(!status||q.status===status)&&(!tier||(q.responses?.riskTier||'')===tier)).map(q=>String(q.id)));
  questionnaireFilter={query:'',status:'all',result:'all'};
  const view=$('tprmQuestionnaireView');let context=$('tdQuestionContext');
  if(!context){context=document.createElement('div');context.id='tdQuestionContext';context.className='gd-list-context';view.querySelector('.page-heading').after(context);}
  context.hidden=false;context.innerHTML=`<p>${tdQuestionDrill.size} pengajuan dari dashboard.</p><button type="button" class="button button-quiet" id="tdClearQuestions">Tampilkan semua pengajuan</button>`;
  $('tdClearQuestions').onclick=()=>{tdQuestionDrill=null;context.hidden=true;renderQuestionnaires();};
  document.querySelector('[data-view="tprm-questionnaire"]')?.click();
}
function tdScope(row) {
  const query = $('tdSearch').value.trim().toLowerCase();
  return (!query || [row.thirdParty, row.serviceDependency].some(v => String(v || '').toLowerCase().includes(query))) && (!$('tdRisk').value || row.riskLevel === $('tdRisk').value) && (!$('tdRelationship').value || normalizeTprmRelationshipStatus(row.relationshipStatus) === $('tdRelationship').value) && gdReviewMatches(row.nextReview, $('tdReview').value, normalizeTprmRelationshipStatus(row.relationshipStatus) === 'Active');
}
function tdIsHigh(row) { return /high|tier 1/i.test(row.riskLevel || row.dueDiligenceAssessment?.riskTier || '') || /high|tier 1/i.test(tdData.questionnaires.find(q => String(q.id) === String(row.questionnaireId))?.responses?.riskTier || ''); }
function tdDue(row) { const days = gdDays(row.nextReview); return normalizeTprmRelationshipStatus(row.relationshipStatus) === 'Active' && days !== null && days <= 30; }
function tdVendorMatches(row) {
  if (!tdDrill) return true;
  if (!tdDrill.ids.has(String(row.id))) return false;
  return true;
}
function tdOpenVendor(kind, value) {
  const rows = tdData.vendors.filter(tdScope).filter(row => kind === 'all' || kind === 'high' && tdIsHigh(row) || kind === 'complete' && (row.assessmentStatus === 'Complete' || !!row.dueDiligenceAssessment?.riskTier) || kind === 'due' && tdDue(row) || kind === 'date' && gdDate(row.nextReview) === value || kind === 'risk' && (row.riskLevel || '') === value || kind === 'assessment' && (row.assessmentStatus || '') === value || kind === 'review' && tdReviewLabel(row) === value);
  tdDrill = { ids: new Set(rows.map(row => String(row.id))) }; tprmPage = 1;
  $('tdListContext').hidden = false; $('tdListLabel').textContent = `${rows.length} vendor dari dashboard. Filter daftar tetap berlaku.`;
  document.querySelector('[data-tprm-register-tab="register"]').click(); renderTprmRows();
}
function tdReviewLabel(row) { const days = gdDays(row.nextReview); return normalizeTprmRelationshipStatus(row.relationshipStatus) !== 'Active' ? 'Tidak aktif' : days === null ? 'Belum dijadwalkan' : days < 0 ? 'Terlambat' : days <= 30 ? 'Dalam 30 hari' : 'Terjadwal'; }
function renderTprmDashboard() {
  const rows = tdData.vendors.filter(tdScope), scoped = !!($('tdSearch').value || $('tdRisk').value || $('tdRelationship').value || $('tdReview').value);
  const questionnaireIds = new Set(rows.map(row => String(row.questionnaireId || '')));
  const qs = scoped ? tdData.questionnaires.filter(q => questionnaireIds.has(String(q.id))) : tdData.questionnaires;
  const available = source => tdSources[source] === 'ready';
  gdKpis('tdKpis', [
    ['all','Total vendor',available('vendors') ? rows.length : 'Belum tersedia','TPRM Risk Register','tprmDashboardTotal'],
    ['high','High risk',available('vendors') ? rows.filter(tdIsHigh).length : 'Belum tersedia','CIA / due diligence yang sudah dinilai','tprmDashboardHigh'],
    ['complete','CIA assessment selesai',available('vendors') ? rows.filter(r => r.assessmentStatus === 'Complete' || r.dueDiligenceAssessment?.riskTier).length : 'Belum tersedia','Assessment tersimpan','tprmDashboardComplete'],
    ['due','Review perlu perhatian',available('vendors') ? rows.filter(tdDue).length : 'Belum tersedia','Aktif, terlambat atau dalam 30 hari','tprmDashboardDue'],
    ['questionnaires','Due diligence',available('questionnaires') ? qs.length : 'Belum tersedia','Pengajuan sesuai cakupan vendor'],
    ['templates','Questionnaire templates',available('templates') ? tdData.templates.length : 'Belum tersedia','Template yang tersedia; tidak mengikuti filter vendor']
  ], 'td-kpi');
  gdBars('tprmDashboardChart',rows,r=>r.riskLevel,'td-risk','Belum dinilai');
  gdBars('tprmAssessmentChart',rows,r=>r.assessmentStatus,'td-assessment');
  gdBars('tprmReviewChart',rows,tdReviewLabel,'td-review');
  gdBars('tdQuestionnaireChart',qs,r=>r.status,'td-questionnaire');
  gdBars('tdTierChart',qs,r=>r.responses?.riskTier,'td-tier','Belum dinilai');
  $('tdTemplateChart').innerHTML = available('templates') ? tdData.templates.map(t=>`<button class="rd-bar" type="button" data-td-nav="questionnaire-templates"><span>${escapeHtml(t.template_name)}</span><strong>${(t.sections||[]).reduce((n,s)=>n+(Array.isArray(s[1])?s[1].length:0),0)} pertanyaan</strong><small>${(t.sections||[]).length} bagian${t.is_default?' · default':''}</small></button>`).join('') || '<p class="muted">Belum ada template.</p>' : '<p class="muted">Sumber template belum tersedia.</p>';
  gdCalendar('tdCalendar','tdMonth',rows.filter(r=>normalizeTprmRelationshipStatus(r.relationshipStatus)==='Active'),r=>r.nextReview,'td-date');
  $('tdStatus').textContent = Object.entries(tdSources).map(([key,state])=>`${{vendors:'Vendor',questionnaires:'Due diligence',templates:'Template'}[key]}: ${state==='ready'?'tersedia':state==='denied'?'tidak ada akses':state==='loading'?'memuat':'belum tersedia'}`).join(' · ');
  document.querySelectorAll('[data-td-nav]').forEach(button=>button.disabled=!canPerform(button.dataset.tdNav,'read'));
  document.querySelectorAll('[data-td-kpi]').forEach(button=>button.disabled=!available(['questionnaires','templates'].includes(button.dataset.tdKpi)?button.dataset.tdKpi:'vendors'));
}
async function loadTprmDashboard() {
  const sources = [['vendors','tprm-register','/api/tprm'],['questionnaires','tprm-questionnaire','/api/tprm-questionnaires'],['templates','questionnaire-templates','/api/questionnaire-templates']];
  tdData = {vendors:[],questionnaires:[],templates:[]}; tdSources = Object.fromEntries(sources.map(([key,module])=>[key,canPerform(module,'read')?'loading':'denied'])); renderTprmDashboard();
  await Promise.allSettled(sources.map(async ([key,module,url])=>{if(!canPerform(module,'read'))return;try{const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error();const data=await response.json();if(!Array.isArray(data))throw new Error();tdData[key]=data;tdSources[key]='ready';}catch{tdSources[key]='failed';}}));
  gdOptions('tdRisk',tdData.vendors.map(r=>r.riskLevel),'Semua level');gdOptions('tdRelationship',tdData.vendors.map(r=>normalizeTprmRelationshipStatus(r.relationshipStatus)),'Semua status');renderTprmDashboard();
}
document.querySelector('[data-view="tprm-register"]').addEventListener('click',loadTprmDashboard);
document.querySelector('[data-tprm-register-tab="dashboard"]').addEventListener('click',loadTprmDashboard);
$('tdRefresh').addEventListener('click',loadTprmDashboard);
['tdSearch','tdRisk','tdRelationship','tdReview','tdMonth'].forEach(id=>$(id).addEventListener(id==='tdSearch'?'input':'change',renderTprmDashboard));
$('tdReset').addEventListener('click',()=>{['tdSearch','tdRisk','tdRelationship','tdReview'].forEach(id=>$(id).value='');renderTprmDashboard();});
$('tdClearDrill').addEventListener('click',()=>{tdDrill=null;$('tdListContext').hidden=true;renderTprmRows();});
$('tprmDashboardPanel').addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.tdNav){document.querySelector(`[data-view="${button.dataset.tdNav}"]`)?.click();return;}
  if(button.dataset.tdKpi==='questionnaires'){tdOpenQuestions();return;}
  if(button.dataset.tdKpi==='templates'){document.querySelector(`[data-view="${button.dataset.tdKpi==='templates'?'questionnaire-templates':'tprm-questionnaire'}"]`)?.click();return;}
  if(button.hasAttribute('data-td-questionnaire')||button.hasAttribute('data-td-tier')){tdOpenQuestions(button.dataset.tdQuestionnaire,button.dataset.tdTier);return;}
  for(const [attribute,kind] of [['tdKpi',null],['tdRisk','risk'],['tdAssessment','assessment'],['tdReview','review'],['tdDate','date']])if(button.dataset[attribute]!==undefined){tdOpenVendor(kind||button.dataset[attribute],button.dataset[attribute]);break;}
});
$('tdExport').addEventListener('change',()=>{const format=$('tdExport').value;if(!format)return;const rows=tdData.vendors.filter(tdScope);gdExport('tprm-dashboard',format==='csv'?rows:{vendors:rows,questionnaires:tdData.questionnaires.filter(q=>!['tdSearch','tdRisk','tdRelationship','tdReview'].some(id=>$(id).value)||rows.some(r=>String(r.questionnaireId)===String(q.id))),templates:tdData.templates,sources:tdSources},[['Vendor',r=>r.thirdParty],['Service',r=>r.serviceDependency],['Risk',r=>r.riskLevel],['Relationship',r=>r.relationshipStatus],['Assessment',r=>r.assessmentStatus],['Next review',r=>r.nextReview]],format);$('tdExport').value='';});
