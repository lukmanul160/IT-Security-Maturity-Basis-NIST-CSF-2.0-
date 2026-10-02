const { getAssessment, saveAssessment } = require('../services/assessmentService');
const { resetFilesForAssessment } = require('../services/fileService');
const evidenceAccess = require('../services/evidenceAccessService');

async function get(req, res) { res.json(await getAssessment(req.assessmentId || 'default')); }
async function update(req, res) {
  const id = req.assessmentId || 'default';
  const previous = await getAssessment(id);
  const nextAttachments = req.body?.attachments || {};
  for (const key of new Set([...Object.keys(previous.attachments || {}), ...Object.keys(nextAttachments)])) {
    const files = nextAttachments[key] || [];
    if (!Array.isArray(files)) return res.status(400).json({error:'Daftar evidence tidak valid.'});
    await evidenceAccess.assertReferences(files, previous.attachments?.[key], req.user);
  }
  res.json(await saveAssessment(req.body, id));
}
async function reset(req, res) { await resetFilesForAssessment(req.assessmentId || 'default'); res.status(204).end(); }

module.exports = { get, update, reset };
