// Remove only links to the selected file; keep records, scores and other files.
async function detach(client, normalized) {
  const paths = [normalized, `upload/${normalized}`, `uploads/${normalized}`];
  const filter = expression => `COALESCE((SELECT jsonb_agg(item ORDER BY position) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${expression})='array' THEN ${expression} ELSE '[]'::jsonb END) WITH ORDINALITY AS files(item,position) WHERE NOT COALESCE(item->>'path'=ANY($1::text[]),false)), '[]'::jsonb)`;
  await client.query(`UPDATE assessment_state SET data=jsonb_set(data,'{attachments}',
    COALESCE((SELECT jsonb_object_agg(key,${filter('value')}) FROM jsonb_each(data->'attachments')), '{}'::jsonb)), updated_at=NOW()
    WHERE jsonb_typeof(data->'attachments')='object' AND EXISTS (
      SELECT 1 FROM jsonb_each(data->'attachments') AS groups(key,value),
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(value)='array' THEN value ELSE '[]'::jsonb END) AS item
      WHERE item->>'path'=ANY($1::text[]))`, [paths]);
  await client.query(`UPDATE controls SET evidence=${filter('evidence')}, updated_at=NOW()
    WHERE evidence @> '[]'::jsonb AND EXISTS (SELECT 1 FROM jsonb_array_elements(evidence) AS item WHERE item->>'path'=ANY($1::text[]))`, [paths]);
  await client.query(`UPDATE policy_register SET attachment_path='', attachment_name='', attachment_type='', updated_at=NOW()
    WHERE attachment_path=ANY($1::text[])`, [paths]);
  await client.query(`UPDATE tprm_due_diligence_questionnaires SET responses=jsonb_set(responses,'{vendorDocuments}',${filter("responses->'vendorDocuments'")}), updated_at=NOW()
    WHERE jsonb_typeof(responses->'vendorDocuments')='array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(responses->'vendorDocuments') AS item WHERE item->>'path'=ANY($1::text[]))`, [paths]);
  // Legacy binary copies must also be cleared so migrations cannot restore a deleted file.
  const auditRows = await client.query(`SELECT id,data,filename FROM audit_finding_records
    WHERE data->>'attachmentPath'=ANY($1::text[]) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'attachments')='array' THEN data->'attachments' ELSE '[]'::jsonb END) AS item WHERE item->>'path'=ANY($1::text[])) FOR UPDATE`, [paths]);
  for (const row of auditRows.rows) {
    const attachments = (Array.isArray(row.data.attachments) ? row.data.attachments : row.data.attachmentPath ? [{path:row.data.attachmentPath,name:row.filename}] : []).filter(file=>!paths.includes(file.path));
    const data = {...row.data, attachments};
    if (attachments.length) data.attachmentPath=attachments[0].path;
    else delete data.attachmentPath;
    await client.query('UPDATE audit_finding_records SET data=$2,filename=$3,content=NULL,updated_at=NOW() WHERE id=$1', [row.id,data,attachments[0]?.name || null]);
  }
}
module.exports = { detach };
