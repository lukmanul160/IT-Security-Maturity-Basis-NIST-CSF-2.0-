const { pool } = require('../config/database');
const questionnaires = require('./tprmQuestionnaireService');
const workbook = require('./tprmQuestionnaireWorkbook');
const { invalid } = require('../shared/tprmWorkflow');

async function templateFor(record, templateId) {
  const selected = templateId || record?.responses?.templateId;
  if (selected && (!Number.isSafeInteger(Number(selected)) || Number(selected) < 1)) throw invalid('Template ID tidak valid.');
  if (record?.responses?.questionnaireSections?.length && (!templateId || String(selected) === String(record.responses.templateId))) {
    const result = await pool.query('SELECT template_name FROM questionnaire_templates WHERE id=$1',[selected]);
    return { id:selected, template_name:result.rows[0]?.template_name || 'Vendor Questionnaire', sections:record.responses.questionnaireSections };
  }
  const result = await pool.query(selected ? 'SELECT * FROM questionnaire_templates WHERE id=$1' : 'SELECT * FROM questionnaire_templates ORDER BY is_default DESC,id LIMIT 1',selected ? [selected] : []);
  if (!result.rowCount) throw invalid('Template kuesioner tidak ditemukan.',404);
  return result.rows[0];
}
async function exportRecord(id, {templateId, blank = false} = {}) {
  const record = await questionnaires.get(id), template = await templateFor(record,templateId);
  const changedTemplate = record.responses.templateId && String(template.id) !== String(record.responses.templateId);
  return {buffer:workbook.write({record,template,blank:blank || changedTemplate}),filename:`TPRM-Vendor-${id}-${record.vendorName.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,80)}.xlsx`};
}
async function exportTemplate(id) {
  const template = await templateFor(null,id);
  return {buffer:workbook.write({template,blank:true}),filename:`TPRM-Template-${template.id}.xlsx`};
}
async function plan(id, buffer) {
  const opened = workbook.open(buffer), record = await questionnaires.get(id), template = await templateFor(record,opened.meta.templateId);
  return {record,...workbook.read(opened,{record,template})};
}
async function preview(id, buffer) { return (await plan(id,buffer)).preview; }
async function importRecord(id, buffer, actor, expectedRevision) {
  if (!Number.isSafeInteger(Number(expectedRevision)) || Number(expectedRevision) < 0 || expectedRevision === undefined || expectedRevision === '') throw invalid('Pratinjau import wajib dilakukan terlebih dahulu.');
  const result = await plan(id,buffer);
  if (!result.preview.updated && !result.preview.respondentUpdated) throw invalid('Tidak ada isian vendor untuk diimport.');
  const row = await questionnaires.update(id,{...result.record,status:'In progress',result:'Pending',responses:result.responses},actor,{expectedRevision:Number(expectedRevision),preserveInternal:true,expectedSections:result.responses.questionnaireSections});
  return {record:row,preview:result.preview,imported:true};
}
module.exports={exportRecord,exportTemplate,preview,importRecord};
