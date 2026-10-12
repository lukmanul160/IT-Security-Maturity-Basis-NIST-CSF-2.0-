const seed=require('../../data/ikas-data.json');
async function initializePeriods(pool){
  const data={assessment:{scores:{},notes:{},attachments:{},targetScores:{},respondent:{}},controls:{ikas:seed.controls},targets:{ikas:[...new Set(seed.controls.map(row=>row.category))].map(category=>({category,targetScore:3}))},gaps:{ikas:[]},objectives:[]};
  // The marker and first snapshot are inserted atomically; deleted years stay deleted.
  await pool.query(`WITH initialized AS (INSERT INTO assessment_period_initializations(framework_id) VALUES('ikas') ON CONFLICT DO NOTHING RETURNING framework_id)
    INSERT INTO assessment_periods(framework_id,assessment_year,data,creation_mode) SELECT framework_id,2026,$1::jsonb,'new' FROM initialized ON CONFLICT DO NOTHING`,[JSON.stringify(data)]);
}
function validateControlMetadata(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!/^\d+\.\d+\.\d+$/.test(value.subcategoryId)||typeof value.subcategory!=='string'||typeof value.scope!=='string'||!Array.isArray(value.rubric)||value.rubric.length!==6||value.rubric.some(text=>typeof text!=='string'||!text.trim())||![.25,.30,.20].includes(value.weight))throw Object.assign(Error('Subkategori, ruang lingkup, dan enam rubrik indeks IKAS wajib diisi.'),{status:400});
  return structuredClone(value);
}
module.exports={initializePeriods,validateControlMetadata,seed};
