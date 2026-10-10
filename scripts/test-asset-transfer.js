const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {pool}=require('../src/config/database');
async function run(){
 const schema='asset_transfer_test_'+Date.now();const originalConnect=pool.connect.bind(pool),savedQuery=pool.query;const originalQuery=async(sql,args)=>{const c=await originalConnect();try{return await c.query(sql,args);}finally{c.release();}};
 const names=['managed_assets','asset_racks','asset_rack_devices','asset_relations','asset_related_risks','asset_renewal_deliveries','managed_asset_photos','asset_rack_photos','asset_diagram_layout','asset_diagram_canvases','asset_reminder_settings','evidence_files'];
 const pattern=new RegExp('\\b('+names.concat('sync_asset_uploaded_file').join('|')+')\\b','g');
 const rewrite=sql=>sql.replace(pattern,`"${schema}".$1`);
 try{
 await require('../src/services/assetDiagramService').ensureStore();
 await originalQuery(`CREATE SCHEMA "${schema}"`);for(const name of names)await originalQuery(`CREATE TABLE "${schema}".${name} (LIKE public.${name} INCLUDING ALL)`);
 pool.query=(sql,args)=>originalQuery(rewrite(sql),args);pool.connect=async()=>{const c=await originalConnect();return {query:(sql,args)=>c.query(rewrite(sql),args),release:()=>c.release()};};
 const service=require('../src/services/assetManagementService'),photos=require('../src/services/assetRackPhotoService'),diagram=require('../src/services/assetDiagramService'),transfer=require('../src/services/assetTransferService');
 const user=(await originalQuery("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user);user.role='admin';
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5foAAAAASUVORK5CYII=','base64');
 const asset=await service.saveAsset(null,{tag:'TEST-1',name:'Server test',owner:'Network',type:'Server',status:'in-use',criticality:'medium',reminderEnabled:false,reminderDays:30,assetAssessment:{confidentiality:3,integrity:4,availability:4,likelihood:3}},{files:{front:[{buffer:png,mimetype:'image/png'}],rear:[{buffer:png,mimetype:'image/png'}]},body:{},user});
 const second=await service.saveAsset(null,{...asset,tag:'TEST-2',name:'Firewall',type:'Firewall'});
 const rack=await service.saveRack(null,{name:'Test rack',location:'Lab',units:12});await service.place({assetId:asset.id,rackId:rack.id,startUnit:2,height:2,facing:'front',fullDepth:true});await service.relate({sourceId:asset.id,targetId:second.id,type:'connects-to'});await diagram.save({version:0,nodes:[{id:asset.id,x:100,y:100},{id:second.id,x:400,y:100}]});
 const canvas=await diagram.createCanvas({name:'Data center'});assert.deepEqual((await diagram.readCanvas(canvas.id)).nodes,[]);
 const layout=await diagram.saveCanvas(canvas.id,{version:0,nodes:[{id:asset.id,x:900,y:700}]});assert.equal(layout.version,1);
 await assert.rejects(diagram.saveCanvas(canvas.id,{version:0,nodes:[]}),e=>e.status===409);
 await assert.rejects(diagram.saveCanvas(canvas.id,{version:1,nodes:[{id:randomUUID(),x:1,y:1}]}),e=>e.status===409);
 await assert.rejects(diagram.createCanvas({name:'Data center'}),e=>e.status===409);
 await diagram.renameCanvas(canvas.id,{name:'Production',version:1});assert.equal((await diagram.readCanvas(canvas.id)).version,2);
 assert.equal((await diagram.read()).nodes[0].x,100);
 const backup=await transfer.exportData();assert.equal(backup.data.canvases.length,1);assert.equal(backup.data.assets.length,2);assert.equal(backup.data.photos.length,2);assert.equal(backup.data.nodes.length,2);
 await pool.query('DELETE FROM managed_asset_photos');await pool.query('DELETE FROM asset_rack_devices');await pool.query('DELETE FROM asset_relations');await pool.query('DELETE FROM asset_related_risks');await pool.query('DELETE FROM managed_assets');await pool.query('DELETE FROM asset_racks');await pool.query('DELETE FROM asset_diagram_layout');await pool.query('DELETE FROM asset_diagram_canvases');
 const result=await transfer.importData(backup,user,Buffer.from(JSON.stringify(backup)));assert.equal(result.assets,2);assert.equal(result.photos,2);
 const restored=await transfer.exportData();assert.equal(restored.data.canvases[0].name,'Production');assert.equal(restored.data.canvases[0].nodes[0].x,900);assert.ok(restored.data.assets.some(a=>a.id===restored.data.canvases[0].nodes[0].id));assert.equal(restored.data.assets.find(a=>a.tag==='TEST-1').assetAssessment.level,'medium');assert.equal(restored.data.placements.length,1);assert.equal(restored.data.relations.length,1);assert.equal(restored.data.nodes.length,2);for(const p of restored.data.photos)assert.ok(Buffer.from(p.content,'base64').equals(png));
 await transfer.importData(backup,user);assert.equal((await service.list('assets')).length,2);assert.equal((await service.list('relations')).length,1);assert.equal((await transfer.exportData()).data.canvases.length,1);
 const broken=structuredClone(backup);broken.data.assets[0].name='Must roll back';broken.data.placements.push({asset_id:backup.data.assets.find(a=>a.id!==backup.data.placements[0].asset_id).id,rack_id:rack.id,start_unit:2,height:2,facing:'front',full_depth:true});
 await assert.rejects(transfer.importData(broken,user),/bertabrakan/);assert.ok(!(await service.list('assets')).some(a=>a.name==='Must roll back'));
 assert.ok((await pool.query("SELECT path FROM evidence_files WHERE path LIKE 'Asset Management/imports/%'")).rows.length);
 console.log('PASS: export/import round trip with CIA, photos, placements, relations and diagram; remapped IDs, repeat import, atomic collision rollback, and Uploaded Files registration. Isolated database schema only.');
 }finally{pool.query=savedQuery;pool.connect=originalConnect;await originalQuery(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
