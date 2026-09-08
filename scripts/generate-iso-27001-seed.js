const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const workbookPath = path.join(__dirname, '..', 'ISO_27001_2022_Requirements_and_Audit_Checklist.xlsx');
const outputPath = path.join(__dirname, '..', 'data', 'iso-27001-data.json');
const workbook = XLSX.readFile(workbookPath, { cellDates: false });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets['ISO 27001 Clauses 4-10'], { header: 1, defval: '' });

const seed = rows.slice(4)
  .filter(row => /^\d+(\.\d+)+$/.test(String(row[0]).trim()))
  .map(row => {
    const code = String(row[0]).trim();
    const clause = code.split('.')[0];
    return {
      id: code,
      function: `Clause ${clause}`,
      category: 'ISO 27001 Clauses 4-10',
      subcategory: String(row[1]).trim(),
      implementation: String(row[2]).trim(),
      references: String(row[3]).trim(),
      minimumEvidence: String(row[4]).trim(),
      evidence: [],
      applicability: 'Applicable',
    };
  });

fs.writeFileSync(outputPath, `${JSON.stringify(seed, null, 2)}\n`);
console.log(`Generated ${seed.length} ISO 27001 controls at ${outputPath}`);

const annexRows = XLSX.utils.sheet_to_json(workbook.Sheets['ISO 27001 Annex A Controls'], { header: 1, defval: '' });
const annexSeed = annexRows.slice(4)
  .filter(row => /^A\.\d+\.\d+$/.test(String(row[0]).trim()))
  .map(row => ({
    id: String(row[0]).trim(),
    function: String(row[2]).trim(),
    category: 'ISO 27001 Annex A Controls',
    subcategory: String(row[1]).trim(),
    implementation: String(row[3]).trim(),
    references: String(row[4]).trim(),
    minimumEvidence: String(row[5]).trim(),
    evidence: [],
    applicability: 'Applicable',
  }));
fs.writeFileSync(path.join(__dirname, '..', 'data', 'iso-27001-soa-data.json'), `${JSON.stringify(annexSeed, null, 2)}\n`);
console.log(`Generated ${annexSeed.length} ISO 27001 SOA controls`);