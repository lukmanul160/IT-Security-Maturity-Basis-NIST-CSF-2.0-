const XLSX = require('xlsx');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const register = require('./riskManagementService');

const columns = [
  ['Risk ID', 'riskId'], ['Identification risk', 'identificationRisk'], ['Category', 'riskCategory'],
  ['Affected asset', 'effectedAsset'], ['Device', 'deviceName'], ['Risk owner', 'riskOwner'],
  ['Likelihood', 'likelihood'], ['Impact', 'impact'], ['Inherent rating', 'riskRating'],
  ['Residual likelihood', 'residualLikelihood'], ['Residual impact', 'residualImpact'], ['Residual rating', 'residualRating'],
  ['Treatment', 'treatmentAction'], ['Treatment description', 'riskTreatmentDescription'],
  ['Action owner', 'ownerOfAction'], ['Deadline', 'deadline'], ['Comment', 'comment'], ['Updated at', 'updatedAt']
];
function score(row, residual = false) {
  const l = Number(row[residual ? 'residualLikelihood' : 'likelihood']), i = Number(row[residual ? 'residualImpact' : 'impact']);
  return [l, i].every(n => Number.isInteger(n) && n >= 1 && n <= 5) ? l * i : '';
}
async function createReport(input) {
  if (!input || !['xlsx', 'pdf'].includes(input.format) || !Array.isArray(input.riskIds) || input.riskIds.some(id => typeof id !== 'string')) {
    throw Object.assign(new Error('Format laporan atau daftar Risk ID tidak valid.'), { status: 400 });
  }
  // Fetch authoritative data; never trust scores or content supplied by the browser.
  const ids = new Set(input.riskIds), rows = (await register.listRegister()).filter(row => ids.has(row.riskId));
  if (input.format === 'xlsx') {
    const table = [columns.map(([label]) => label).concat(['Inherent score', 'Residual score']), ...rows.map(row => columns.map(([, field]) => {
      const value = row[field]; return value instanceof Date ? value.toISOString() : value ?? '';
    }).concat([score(row), score(row, true)]))];
    const workbook = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet(table);
    sheet['!autofilter'] = { ref: sheet['!ref'] };
    sheet['!cols'] = columns.map(([, field]) => ({ wch: field === 'identificationRisk' || field === 'comment' ? 55 : 22 })).concat([{ wch: 18 }, { wch: 18 }]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Risk Register');
    const summary = [['Risk Dashboard'], ['Risks in report', rows.length], ['Inherent exposure score', rows.reduce((n, r) => n + (score(r) || 0), 0)], ['Residual exposure score', rows.reduce((n, r) => n + (score(r, true) || 0), 0)], ['Exposure unit', 'Risk score; financial exposure is not recorded'], ['Generated at (UTC)', new Date().toISOString()]];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Summary');
    return { extension: 'xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) };
  }
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page, y;
  const plain = value => String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E\n]/g, '?');
  const newPage = () => { page = pdf.addPage([842, 595]); y = 550; page.drawText('Risk Register | Executive Report', { x: 35, y, font: bold, size: 18, color: rgb(0.08, 0.2, 0.35) }); y -= 25; page.drawText(`${rows.length} risks | ${new Date().toISOString().slice(0, 10)} | Exposure uses risk scores`, { x: 35, y, font, size: 10 }); y -= 30; };
  const draw = (text, isBold = false) => {
    const face = isBold ? bold : font;
    for (const paragraph of plain(text).split('\n')) {
      let line = '';
      // Character wrapping handles long titles and unbroken identifiers without overflow.
      for (const char of paragraph) {
        if (face.widthOfTextAtSize(line + char, 10) > 765) { if (y < 40) newPage(); page.drawText(line, { x: 35, y, font: face, size: 10 }); y -= 15; line = ''; }
        line += char;
      }
      if (y < 40) newPage(); if (line) page.drawText(line, { x: 35, y, font: face, size: 10 }); y -= 15;
    }
  };
  newPage();
  if (!rows.length) draw('No risks match the selected filters.');
  for (const row of rows) {
    if (y < 150) newPage();
    draw(`${row.riskId} | ${row.identificationRisk}`, true);
    draw(`Category: ${row.riskCategory || '-'} | Owner: ${row.riskOwner || '-'} | Asset: ${row.effectedAsset || '-'} | Device: ${row.deviceName || '-'}`);
    draw(`Inherent: ${score(row) || 'Unrated'} | Residual: ${score(row, true) || 'Unrated'} | Treatment: ${row.treatmentAction || 'Unassigned'} | Deadline: ${row.deadline ? String(row.deadline).slice(0, 10) : '-'}`);
    if (row.riskTreatmentDescription) draw(`Treatment plan: ${row.riskTreatmentDescription}`);
    if (row.comment) draw(`Comment: ${row.comment}`);
    y -= 12;
  }
  return { extension: 'pdf', contentType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}
module.exports = { createReport };
