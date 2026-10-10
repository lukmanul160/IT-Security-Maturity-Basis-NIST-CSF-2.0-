const {pool}=require('../config/database');
const {randomUUID}=require('node:crypto');
const assets=require('./assetManagementService');
const photos=require('./assetRackPhotoService');
const diagram=require('./assetDiagramService');
const reminders=require('./assetReminderSettingsService');
const fail=message=>Object.assign(new Error(message),{status:400});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function ensure(){await photos.ensureStore();await diagram.ensureStore();await reminders.ensureStore();}
async function exportData(){
 await ensure();const c=await pool.connect();
 try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const registered=(await c.query('SELECT id,data FROM managed_assets ORDER BY created_at DESC,id')).rows;
 const links=(await c.query('SELECT asset_id,risk_id FROM asset_related_risks')).rows;
 const data={assets:registered.map(a=>({id:a.id,...a.data,riskRegisterIds:links.filter(r=>r.asset_id===a.id).map(r=>r.risk_id)})),racks:(await c.query('SELECT * FROM asset_racks')).rows,placements:(await c.query('SELECT * FROM asset_rack_devices')).rows,relations:(await c.query('SELECT * FROM asset_relations')).rows,nodes:(await c.query('SELECT nodes FROM asset_diagram_layout WHERE id=1')).rows[0]?.nodes||[],photos:[]};
 data.canvases=(await c.query('SELECT id,name,nodes FROM asset_diagram_canvases ORDER BY created_at DESC,id')).rows;
 for(const [kind,table,column] of [['assets','managed_asset_photos','asset_id'],['racks','asset_rack_photos','rack_id']])for(const p of (await c.query(`SELECT ${column} AS owner_id,side,mime_type,content FROM ${table}`)).rows)data.photos.push({kind,id:p.owner_id,side:p.side,type:p.mime_type,content:p.content.toString('base64')});
 const reminder=(await c.query('SELECT settings FROM asset_reminder_settings WHERE id=1')).rows[0]?.settings||reminders.defaults;data.reminderTemplate={subjectTemplate:reminder.subjectTemplate,bodyTemplate:reminder.bodyTemplate};
 await c.query('COMMIT');return {format:'nist-basis-asset-management',version:1,exportedAt:new Date().toISOString(),data};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
function validate(payload){
 const d=payload?.data;if(payload?.format!=='nist-basis-asset-management'||payload.version!==1||!d)throw fail('Gunakan file export Asset Management versi 1.');
 for(const key of ['assets','racks','placements','relations','nodes','photos'])if(!Array.isArray(d[key])||d[key].length>5000)throw fail('Daftar '+key+' tidak valid (maksimal 5.000 record).');
 if(d.reminderTemplate)reminders.validate({...d.reminderTemplate,smtpAccountId:'default'});
 const assetIds=new Set(),rackIds=new Set(),tags=new Set(),names=new Set();
 for(const a of d.assets){if(!uuid(a?.id)||assetIds.has(a.id))throw fail('ID aset duplikat/tidak valid.');const clean=assets.validateAsset(a);if(tags.has(clean.tag))throw fail('Tag aset duplikat.');tags.add(clean.tag);assetIds.add(a.id);assets.validateRiskIds(a.riskRegisterIds||[]);}
 for(const r of d.racks){if(!uuid(r?.id)||rackIds.has(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>150||names.has(r.name.trim())||typeof r.location!=='string'||!r.location.trim()||r.location.length>250||!Number.isInteger(r.units)||r.units<1||r.units>60)throw fail('Data rak tidak valid/duplikat.');rackIds.add(r.id);names.add(r.name.trim());}
 const placed=new Set();for(const p of d.placements){if(!assetIds.has(p?.asset_id)||!rackIds.has(p.rack_id)||placed.has(p.asset_id)||(p.full_depth!==undefined&&typeof p.full_depth!=='boolean'))throw fail('Referensi penempatan tidak valid/duplikat.');placed.add(p.asset_id);}
 for(const r of d.relations)if(!assetIds.has(r?.source_id)||!assetIds.has(r.target_id)||r.source_id===r.target_id||!assets.relationships.includes(r.type)||typeof r.notes!=='string'||r.notes.length>1000||typeof r.change_reference!=='string'||r.change_reference.length>250)throw fail('Data relasi tidak valid.');
 diagram.validate({nodes:d.nodes,version:0});if(d.nodes.some(n=>!assetIds.has(n.id)))throw fail('Aset pada diagram tidak ditemukan dalam file.');
 if(d.canvases!==undefined){if(!Array.isArray(d.canvases)||d.canvases.length>500)throw fail('Daftar kanvas tidak valid (maksimal 500).');const ids=new Set(),names=new Set();for(const canvas of d.canvases){const name=diagram.validateName(canvas);if(!uuid(canvas.id)||ids.has(canvas.id)||names.has(name))throw fail('Kanvas duplikat/tidak valid.');ids.add(canvas.id);names.add(name);diagram.validate({nodes:canvas.nodes,version:0});if(canvas.nodes.some(n=>!assetIds.has(n.id)))throw fail('Aset pada kanvas tidak ditemukan dalam file.');}}
 const sides=new Set();for(const p of d.photos){const key=p?.kind+'/'+p?.id+'/'+p?.side;if(!['assets','racks'].includes(p?.kind)||!(p.kind==='assets'?assetIds:rackIds).has(p.id)||!['front','rear'].includes(p.side)||sides.has(key)||typeof p.content!=='string'||p.content.length>7*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.content))throw fail('Foto atau referensi foto tidak valid.');sides.add(key);photos.validateFile({buffer:Buffer.from(p.content,'base64'),mimetype:p.type});}
 return d;
}
async function importData(payload,user,source){
 const d=validate(payload);await ensure();const uploader=await require('./evidenceAccessService').userId(user);const c=await pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(872146)');await c.query('SELECT pg_advisory_xact_lock(872148)');
 const assetMap=new Map(),rackMap=new Map();
 for(const a of d.assets){const clean=assets.validateAsset(a);if(clean.managedVendorId&&!(await c.query('SELECT id FROM tprm_risk_register WHERE id=$1',[clean.managedVendorId])).rowCount)throw fail('Vendor TPRM tidak ditemukan untuk '+a.tag+'. Import TPRM dahulu atau kosongkan vendor.');
 const risks=a.riskRegisterIds||[];if(risks.length&&(await c.query('SELECT risk_id FROM risk_register WHERE risk_id=ANY($1::text[])',[risks])).rows.length!==risks.length)throw fail('Related risk tidak ditemukan untuk '+a.tag+'. Import Risk Management dahulu.');
 const old=(await c.query('SELECT id FROM managed_assets WHERE tag=$1 FOR UPDATE',[clean.tag])).rows[0],id=old?.id||randomUUID();assetMap.set(a.id,id);
 await c.query('INSERT INTO managed_assets(id,tag,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET tag=EXCLUDED.tag,data=EXCLUDED.data,updated_at=NOW()',[id,clean.tag,clean]);
 await c.query('DELETE FROM asset_related_risks WHERE asset_id=$1',[id]);if(risks.length)await c.query('INSERT INTO asset_related_risks(asset_id,risk_id) SELECT $1,unnest($2::text[])',[id,risks]);}
 for(const r of d.racks){const old=(await c.query('SELECT id FROM asset_racks WHERE name=$1 FOR UPDATE',[r.name.trim()])).rows[0],id=old?.id||randomUUID();rackMap.set(r.id,id);await c.query('INSERT INTO asset_racks(id,name,location,units) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,location=EXCLUDED.location,units=EXCLUDED.units',[id,r.name.trim(),r.location,r.units]);}
 const importedPlacementIds=d.placements.map(p=>assetMap.get(p.asset_id));if(importedPlacementIds.length)await c.query('DELETE FROM asset_rack_devices WHERE asset_id=ANY($1::uuid[])',[importedPlacementIds]);
 for(const p of d.placements){const assetId=assetMap.get(p.asset_id),rackId=rackMap.get(p.rack_id),rack=(await c.query('SELECT * FROM asset_racks WHERE id=$1',[rackId])).rows[0];const input={assetId,rackId,startUnit:p.start_unit,height:p.height,facing:p.facing||'front',fullDepth:p.full_depth!==false};assets.validatePlacement(input,rack.units,(await c.query('SELECT * FROM asset_rack_devices WHERE rack_id=$1',[rackId])).rows);await c.query('INSERT INTO asset_rack_devices(asset_id,rack_id,start_unit,height,facing,full_depth) VALUES($1,$2,$3,$4,$5,$6)',[assetId,rackId,input.startUnit,input.height,input.facing,input.fullDepth]);}
 for(const r of d.relations)await c.query('INSERT INTO asset_relations(id,source_id,target_id,type,notes,change_reference) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_id,target_id,type) DO UPDATE SET notes=EXCLUDED.notes,change_reference=EXCLUDED.change_reference',[randomUUID(),assetMap.get(r.source_id),assetMap.get(r.target_id),r.type,r.notes,r.change_reference]);
 const invalid=(await c.query("SELECT 1 FROM asset_rack_devices p JOIN managed_assets a ON a.id=p.asset_id WHERE a.data->>'status' IN ('retired','disposed') OR a.data->>'type' IN ('Software','License','Cloud') UNION ALL SELECT 1 FROM asset_relations r JOIN managed_assets a ON a.id=r.source_id OR a.id=r.target_id WHERE a.data->>'status' IN ('retired','disposed') LIMIT 1")).rowCount;if(invalid)throw fail('Aset retired/disposed atau nonfisik tidak dapat dipasang atau menjadi relasi aktif.');
 for(const rackId of rackMap.values()){const rack=(await c.query('SELECT units FROM asset_racks WHERE id=$1',[rackId])).rows[0];const devices=(await c.query('SELECT * FROM asset_rack_devices WHERE rack_id=$1',[rackId])).rows;for(const p of devices)assets.validatePlacement({assetId:p.asset_id,startUnit:p.start_unit,height:p.height,facing:p.facing,fullDepth:p.full_depth},rack.units,devices);}
 for(const p of d.photos)await photos.applyChanges(c,p.kind,(p.kind==='assets'?assetMap:rackMap).get(p.id),[{side:p.side,type:p.type,buffer:Buffer.from(p.content,'base64'),name:'photo'}],uploader);
 const previous=(await c.query('SELECT nodes,version FROM asset_diagram_layout WHERE id=1 FOR UPDATE')).rows[0];const importedNodes=d.nodes.map(n=>({...n,id:assetMap.get(n.id)})),ids=new Set(importedNodes.map(n=>n.id));const nodes=[...(previous?.nodes||[]).filter(n=>!ids.has(n.id)),...importedNodes];diagram.validate({nodes,version:0});await c.query('INSERT INTO asset_diagram_layout(id,nodes,version) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET nodes=EXCLUDED.nodes,version=EXCLUDED.version',[JSON.stringify(nodes),(previous?.version||0)+1]);
 for(const canvas of d.canvases||[]){const name=diagram.validateName(canvas),nodes=canvas.nodes.map(n=>({...n,id:assetMap.get(n.id)}));await c.query('INSERT INTO asset_diagram_canvases(id,name,nodes,version) VALUES($1,$2,$3,1) ON CONFLICT(name) DO UPDATE SET nodes=EXCLUDED.nodes,version=asset_diagram_canvases.version+1',[randomUUID(),name,JSON.stringify(nodes)]);}
 if(d.reminderTemplate){const existing=(await c.query('SELECT settings FROM asset_reminder_settings WHERE id=1')).rows[0]?.settings||reminders.defaults;const settings=reminders.validate({...existing,...d.reminderTemplate,smtpAccountId:existing.smtpAccountId});await c.query('INSERT INTO asset_reminder_settings(id,settings) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings',[settings]);}
 if(source)await c.query('INSERT INTO evidence_files(path,name,content,mime_type,uploaded_by) VALUES($1,$2,$3,$4,$5)',['Asset Management/imports/'+randomUUID()+'/asset-management.json','asset-management.json',source,'application/json',uploader]);
 await c.query('COMMIT');return {assets:d.assets.length,racks:d.racks.length,placements:d.placements.length,relations:d.relations.length,photos:d.photos.length};
 }catch(e){await c.query('ROLLBACK');if(e.code==='23505')throw fail('Data duplikat. Periksa tag, nama rak, dan relasi.');throw e;}finally{c.release();}
}
module.exports={exportData,importData,validate};
