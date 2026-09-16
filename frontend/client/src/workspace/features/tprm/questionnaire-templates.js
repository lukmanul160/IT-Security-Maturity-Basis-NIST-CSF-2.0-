async function loadQuestionnaireTemplates() { const response = await fetch('/api/questionnaire-templates', { cache: 'no-store' }); if (!response.ok) throw new Error('Templates unavailable'); questionnaireTemplates = await response.json(); renderTemplates(); }
function renderTemplates() { $('templateCount').textContent = `${questionnaireTemplates.length} template${questionnaireTemplates.length === 1 ? '' : 's'}`; $('templateBody').innerHTML = questionnaireTemplates.map(template => `<tr><td><strong>${escapeHtml(template.template_name)}</strong></td><td>${escapeHtml(template.description)}</td><td>${template.sections ? template.sections.length : 0}</td><td>${template.is_default ? '✓' : ''}</td><td><button class="attachment-action-button" type="button" data-template-edit="${template.id}">Edit</button><button class="attachment-action-button danger" type="button" data-template-delete="${template.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5">Belum ada template questionnaire.</td></tr>'; }
function normalizeTemplateSections(sections = []) {
  if (!Array.isArray(sections)) return [];
  return sections.reduce((normalized, section) => {
    if (!Array.isArray(section)) return normalized;
    const [title, questions] = section;
    const sectionTitle = String(title || '').trim();
    const sectionQuestions = Array.isArray(questions)
      ? questions.map(question => String(question || '').trim()).filter(Boolean)
      : [];
    if (sectionTitle) normalized.push([sectionTitle, sectionQuestions]);
    return normalized;
  }, []);
}

function readTemplateSections() {
  return [...document.querySelectorAll('[data-template-section]')].map(section => {
    const title = section.querySelector('[data-template-section-title]').value;
    const questions = [...section.querySelectorAll('[data-template-question]')]
      .map(input => input.value);
    return [title, questions];
  });
}

function renderTemplateSections() {
  const container = $('templateSections');
  container.innerHTML = templateDraftSections.map(([title, questions], sectionIndex) => `
    <fieldset class="questionnaire-section" data-template-section>
      <div class="template-section-header">
        <label>Section title<input data-template-section-title value="${escapeHtml(title)}" maxlength="200" required></label>
        <button class="attachment-action-button danger" type="button" data-template-remove-section="${sectionIndex}">Remove section</button>
      </div>
      <div class="template-question-list">
        ${questions.map((question, questionIndex) => `<div class="template-question-row"><label>Question ${questionIndex + 1}<textarea data-template-question rows="2" maxlength="1000" required>${escapeHtml(question)}</textarea></label><button class="attachment-action-button danger" type="button" data-template-remove-question="${sectionIndex}:${questionIndex}">Remove</button></div>`).join('')}
      </div>
      <button class="attachment-action-button" type="button" data-template-add-question="${sectionIndex}">Add question</button>
    </fieldset>
  `).join('') || '<p class="muted">Add a section, then add the questions for this template.</p>';
}

function resetTemplateForm() {
  $('templateForm').reset();
  $('templateId').value = '';
  $('templateDelete').hidden = true;
  $('templateFormTitle').textContent = 'New template';
  $('templateStatus').textContent = 'Ready';
  templateDraftSections = [['New section', ['']]];
  renderTemplateSections();
}

function fillTemplateForm(template) {
  $('templateId').value = template.id;
  $('templateDelete').hidden = false;
  $('templateName').value = template.template_name;
  $('templateDescription').value = template.description;
  $('templateIsDefault').checked = template.is_default;
  $('templateFormTitle').textContent = `Edit ${template.template_name}`;
  $('templateStatus').textContent = 'Editing template';
  templateDraftSections = normalizeTemplateSections(template.sections);
  renderTemplateSections();
  $('templateModal').showModal();
}

async function saveTemplate(event) {
  event.preventDefault();
  const id = $('templateId').value;
  const sections = normalizeTemplateSections(readTemplateSections());
  if (!sections.length || sections.some(([, questions]) => !questions.length)) {
    $('templateStatus').textContent = 'Each section must contain at least one question';
    return;
  }

  const data = {
    template_name: $('templateName').value,
    description: $('templateDescription').value,
    is_default: $('templateIsDefault').checked,
    sections,
  };
  const response = await fetch(id ? `/api/questionnaire-templates/${id}` : '/api/questionnaire-templates', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    $('templateStatus').textContent = (await response.json().catch(() => ({}))).error || 'Save failed';
    return;
  }

  resetTemplateForm();
  $('templateModal').close();
  await loadQuestionnaireTemplates();
}
async function deleteTemplate(id) { if (!confirm('Delete this template?')) return; const response = await fetch(`/api/questionnaire-templates/${id}`, { method: 'DELETE' }); if (response.ok) await loadQuestionnaireTemplates(); }
function showTemplateSelectionModal(row) { selectedTemplateForQuestionnaire = row; $('templateSelectionList').innerHTML = questionnaireTemplates.map(template => `<button class="template-selection-card" type="button" data-template-select="${template.id}"><span class="template-selection-copy"><strong>${escapeHtml(template.template_name)}</strong><small>${escapeHtml(template.description)}</small></span></button>`).join('') || '<p class="muted">No questionnaire templates available.</p>'; $('templateSelectionModal').showModal(); }
function showTemplateView() { document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('questionnaireTemplateView').classList.add('active-view'); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'questionnaire-templates')); loadQuestionnaireTemplates().catch(() => { $('templateStatus').textContent = 'Database unavailable'; }); saveUiState('questionnaire-templates'); }
document.querySelector('#templateNewButton').addEventListener('click', () => { resetTemplateForm(); $('templateModal').showModal(); }); document.querySelector('#templateForm').addEventListener('submit', saveTemplate); document.querySelector('#templateCancel').addEventListener('click', () => $('templateModal').close()); document.querySelector('#templateDelete').addEventListener('click', async () => { const id = $('templateId').value; if (id) await deleteTemplate(id); resetTemplateForm(); $('templateModal').close(); }); document.querySelector('#templateAddSection').addEventListener('click', () => { templateDraftSections = readTemplateSections(); templateDraftSections.push(['New section', ['']]); renderTemplateSections(); }); document.querySelector('#templateSections').addEventListener('click', event => { const addQuestion = event.target.closest('[data-template-add-question]'); const removeQuestion = event.target.closest('[data-template-remove-question]'); const removeSection = event.target.closest('[data-template-remove-section]'); if (!addQuestion && !removeQuestion && !removeSection) return; templateDraftSections = readTemplateSections(); if (addQuestion) templateDraftSections[Number(addQuestion.dataset.templateAddQuestion)][1].push(''); if (removeQuestion) { const [sectionIndex, questionIndex] = removeQuestion.dataset.templateRemoveQuestion.split(':').map(Number); templateDraftSections[sectionIndex][1].splice(questionIndex, 1); } if (removeSection) templateDraftSections.splice(Number(removeSection.dataset.templateRemoveSection), 1); renderTemplateSections(); }); document.querySelector('#templateBody').addEventListener('click', event => { const edit = event.target.closest('[data-template-edit]'); const remove = event.target.closest('[data-template-delete]'); if (edit) fillTemplateForm(questionnaireTemplates.find(t => String(t.id) === edit.dataset.templateEdit)); if (remove) deleteTemplate(remove.dataset.templateDelete); }); document.querySelector('#templateSelectionCancel').addEventListener('click', () => { $('templateSelectionModal').close(); }); document.querySelector('#templateSelectionList').addEventListener('click', async event => { const selectBtn = event.target.closest('[data-template-select]'); if (!selectBtn) return; const templateId = selectBtn.dataset.templateSelect; const template = questionnaireTemplates.find(t => String(t.id) === templateId); $('templateSelectionModal').close(); if (selectedTemplateForQuestionnaire && template) { startQuestionnaire(selectedTemplateForQuestionnaire, template); } });
document.querySelector('#questionnaireNewButton').addEventListener('click', () => { resetQuestionnaireForm(); $('questionnaireModal').showModal(); }); document.querySelector('#questionnaireForm').addEventListener('submit', saveQuestionnaire); document.querySelector('#questionnaireCancel').addEventListener('click', () => $('questionnaireModal').close()); document.querySelector('#questionnaireAssessmentForm').addEventListener('submit', saveQuestionnaireAnswers); document.querySelector('#questionnaireAssessmentCancel').addEventListener('click', () => $('questionnaireAssessmentModal').close()); document.querySelector('#questionnaireSections').addEventListener('click', event => { const button = event.target.closest('[data-questionnaire-decision]'); if (!button) return; const group = button.closest('.questionnaire-decision'); group.querySelector('[data-questionnaire-decision-value]').value = button.dataset.questionnaireDecision; group.querySelectorAll('[data-questionnaire-decision]').forEach(choice => { const selected = choice === button; choice.classList.toggle('selected', selected); choice.setAttribute('aria-pressed', String(selected)); }); }); ['questionnairePiiExposure', 'questionnaireSecurityMaturity', 'questionnaireFinancial', 'questionnaireReputation'].forEach(id => { const element = $(id); if (element) element.addEventListener('input', () => { const values = updateQuestionnaireTierFromInputs(); $('questionnaireAssessmentStatus').textContent = `Risk score ${values.total} · ${$('questionnaireRiskTier').value}`; }); }); document.querySelector('#questionnaireDelete').addEventListener('click', async () => { const id = $('questionnaireId').value; if (id) await deleteQuestionnaire(id); resetQuestionnaireForm(); $('questionnaireModal').close(); }); document.querySelector('#questionnaireBody').addEventListener('click', event => { const start = event.target.closest('[data-questionnaire-start]'); const edit = event.target.closest('[data-questionnaire-edit]'); const remove = event.target.closest('[data-questionnaire-delete]'); if (start) showTemplateSelectionModal(questionnaireRows.find(row => String(row.id) === start.dataset.questionnaireStart)); if (edit) fillQuestionnaireForm(questionnaireRows.find(row => String(row.id) === edit.dataset.questionnaireEdit)); if (remove) deleteQuestionnaire(remove.dataset.questionnaireDelete); });
