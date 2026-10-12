const {pool}=require('../../src/config/database');const service=require('../../src/services/reminderRecipientService');
(async()=>{try{const results=await Promise.all([
 pool.query("SELECT option_value AS owner,'' AS email FROM policy_register_dropdown_options WHERE field_name='owners'"),
 pool.query("SELECT owner,'' AS email FROM policy_register"),
 pool.query("SELECT data->>'owner' AS owner,data->>'ownerEmail' AS email FROM managed_assets"),
 pool.query("SELECT data->>'owner' AS owner,data->>'ownerEmail' AS email FROM audit_finding_records WHERE kind='finding'"),
 pool.query("SELECT entry->>'owner' AS owner,entry->>'email' AS email FROM policy_reminder_settings CROSS JOIN LATERAL jsonb_array_elements(settings->'owners') entry"),
 pool.query("SELECT entry->>'owner' AS owner,entry->>'email' AS email FROM audit_finding_reminder_settings CROSS JOIN LATERAL jsonb_array_elements(settings->'owners') entry")]);const before=(await service.list()).length;await service.registerOwners(results.flatMap(result=>result.rows));const rows=await service.list();console.log(JSON.stringify({registered:rows.length,added:rows.length-before,withoutEmail:rows.filter(row=>!row.email).length,existingEmailsPreserved:true}));}finally{await pool.end();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
