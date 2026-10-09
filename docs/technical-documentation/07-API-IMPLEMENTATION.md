# Lampiran implementasi API

Snapshot deklarasi dan handler dari kode lokal. Daftar field atau response yang hanya didelegasikan ke service harus dibaca bersama kontrak domain di bab API dan source service. Tidak memuat credential atau record pengguna. Wrapper async dapat menyembunyikan inner function; deklarasi route dan controller/service tetap sumber otoritatif.


## POST /api/auth/login

Source: `src/routes/authRoutes.js:14`; izin: public.

```javascript
router.post('/login', require('../middleware/loginRateLimit').createLoginRateLimit(), controller.login)
```

Handler `login`:

```javascript
async function login(req, res) {
  const { username, password } = req.body || {};
  const key = loginKey(req, username);
  const now = Date.now();
  for (const [attemptKey, record] of loginAttempts) {
    if (now - record.firstFailure > loginWindow && !(record.blockedUntil > now)) loginAttempts.delete(attemptKey);
  }
  const attempt = loginAttempts.get(key);
  if (attempt && attempt.blockedUntil > now) return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi nanti.' });
  if (attempt && now - attempt.firstFailure > loginWindow) loginAttempts.delete(key);
  if (!loginAttempts.has(key) && loginAttempts.size >= 10000) return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi nanti.' });
  const user = await authenticate(username, password);
  if (!user) {
    const current = loginAttempts.get(key) || { failures: 0, firstFailure: now };
    current.failures += 1;
    current.blockedUntil = current.failures >= maxLoginFailures ? now + loginWindow : 0;
    loginAttempts.set(key, current);
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  loginAttempts.delete(key);
  req.user = user;
  const token = createSession(user);
  res.cookie(sessionCookie, token, { httpOnly: true, sameSite: 'lax', secure: sessionCookieSecure, maxAge: 8 * 60 * 60 * 1000 });
  return res.json({ username: user.username, role: user.role });
}
```


## POST /api/auth/logout

Source: `src/routes/authRoutes.js:15`; izin: public.

```javascript
router.post('/logout', controller.logout)
```

Handler `logout`:

```javascript
function logout(req, res) { destroySession(parseCookies(req.headers.cookie)[sessionCookie]); res.clearCookie(sessionCookie); res.status(204).end(); }
```


## GET /api/auth/me

Source: `src/routes/authRoutes.js:16`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.get('/me', requireAuth, controller.currentUser)
```

Handler `currentUser`:

```javascript
async function currentUser(req, res) { const profile = await accountService.getProfile(req.user.username); profile.actions = await permissionService.getRoleActions(profile.role); profile.ownEvidenceDelete = await permissionService.canDeleteOwnedEvidence(profile.role); profile.permissions = Object.keys(profile.actions).filter(key=>profile.actions[key].read); res.json(profile); }
```


## PUT /api/auth/me

Source: `src/routes/authRoutes.js:17`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.put('/me', requireAuth, limitPasswordVerification, controller.updateProfile)
```

Handler `updateProfile`:

```javascript
async function updateProfile(req, res) { const data = req.body || {}; if (req.user.role !== 'admin' && Object.keys(data).some(field => field !== 'fullName')) return res.status(403).json({ error: 'Only administrators can change account security settings' }); res.json(await accountService.updateProfile(req.user.username, data)); }
```


## PUT /api/auth/me/password

Source: `src/routes/authRoutes.js:18`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.put('/me/password', requireAuth, limitPasswordVerification, controller.updatePassword)
```

Handler `updatePassword`:

```javascript
async function updatePassword(req, res) { res.json(await accountService.updatePassword(req.user.username, req.body || {})); }
```


## GET /api/auth/users

Source: `src/routes/authRoutes.js:19`; izin: admin.

```javascript
router.get('/users', requireAuth, requireAdmin, controller.listUsers)
```

Handler `listUsers`:

```javascript
async function listUsers(req, res) { res.json(await accountService.listUsers()); }
```


## POST /api/auth/users

Source: `src/routes/authRoutes.js:20`; izin: admin.

```javascript
router.post('/users', requireAuth, requireAdmin, controller.createUser)
```

Handler `createUser`:

```javascript
async function createUser(req, res) { res.status(201).json(await accountService.createUser(req.body || {})); }
```


## PUT /api/auth/users/:id

Source: `src/routes/authRoutes.js:21`; izin: admin.

```javascript
router.put('/users/:id', requireAuth, requireAdmin, controller.updateUser)
```

Handler `updateUser`:

```javascript
async function updateUser(req, res) { res.json(await accountService.updateUser(req.params.id, req.body || {})); }
```


## DELETE /api/auth/users/:id

Source: `src/routes/authRoutes.js:22`; izin: admin.

```javascript
router.delete('/users/:id', requireAuth, requireAdmin, controller.deleteUser)
```

Handler `deleteUser`:

```javascript
async function deleteUser(req, res) { await accountService.deleteUser(req.params.id, req.user.username); res.status(204).end(); }
```


## GET /api/auth/permissions

Source: `src/routes/authRoutes.js:23`; izin: admin.

```javascript
router.get('/permissions', requireAuth, requireAdmin, controller.listPermissions)
```

Handler `listPermissions`:

```javascript
async function listPermissions(req, res) { res.json({ permissions: permissionService.permissions, assignments: await permissionService.list() }); }
```


## PUT /api/auth/permissions/:role

Source: `src/routes/authRoutes.js:24`; izin: admin.

```javascript
router.put('/permissions/:role', requireAuth, requireAdmin, controller.updatePermissions)
```

Handler `updatePermissions`:

```javascript
async function updatePermissions(req, res) { res.json(await permissionService.update(req.params.role, req.body || {})); }
```


## GET /api/asset-management/export

Source: `src/routes/assetManagementRoutes.js:17`; izin: asset-register + server-racks + asset-modelling: read.

```javascript
router.get('/export',...transferPermissions(['read']),wrap(async(req,res)=>{const data=JSON.stringify(await transfer.exportData());if(Buffer.byteLength(data)>100*1024*1024)throw Object.assign(new Error('Export melebihi 100 MB. Gunakan Database Backup dan File Backup.'),{status:400});res.set({'Content-Disposition':'attachment; filename="asset-management.json"','Cache-Control':'private, no-store'}).type('application/json').send(data);}))
```


## POST /api/asset-management/import

Source: `src/routes/assetManagementRoutes.js:18`; izin: asset-register + server-racks + asset-modelling: read/create/update; TPRM/risk read jika ada referensi.

```javascript
router.post('/import',...transferPermissions(['read','create','update']),transferUpload,wrap(async(req,res)=>{
 if(!req.file||!req.file.originalname.toLowerCase().endsWith('.json'))throw Object.assign(new Error('Pilih file JSON Asset Management.'),{status:400});
 let payload;try{payload=JSON.parse(req.file.buffer.toString('utf8').replace(/^\uFEFF/,''));}catch{throw Object.assign(new Error('File JSON tidak valid.'),{status:400});}
 transfer.validate(payload);
 if(payload.data.assets.some(a=>a.managedVendorId)&&!await permissions.has(req.user?.role,'tprm-register','read'))throw Object.assign(new Error('Akses baca TPRM diperlukan untuk import vendor pengelola.'),{status:403});
 if(payload.data.assets.some(a=>a.riskRegisterIds?.length)&&!await permissions.has(req.user?.role,'risk-management','read'))throw Object.assign(new Error('Akses baca Risk Management diperlukan untuk import Related risk.'),{status:403});
 res.json(await transfer.importData(payload,req.user,req.file.buffer));
}))
```


## GET /api/asset-management/reminder-settings

Source: `src/routes/assetManagementRoutes.js:26`; izin: asset-register:read.

```javascript
router.get('/reminder-settings',requirePermission('asset-register','read'),wrap(async(req,res)=>res.json(await reminderSettings.getSettings())))
```


## PUT /api/asset-management/reminder-settings

Source: `src/routes/assetManagementRoutes.js:27`; izin: asset-register:update.

```javascript
router.put('/reminder-settings',requirePermission('asset-register','update'),wrap(async(req,res)=>res.json(await reminderSettings.saveSettings(req.body))))
```


## GET /api/asset-management/vendor-catalog

Source: `src/routes/assetManagementRoutes.js:28`; izin: asset-register:read + tprm-register:read.

```javascript
router.get('/vendor-catalog',requirePermission('asset-register','read'),requirePermission('tprm-register','read'),wrap(async(req,res)=>res.json(await service.managedVendorCatalog())))
```


## GET /api/asset-management/risk-catalog

Source: `src/routes/assetManagementRoutes.js:29`; izin: asset-register:read + risk-management:read.

```javascript
router.get('/risk-catalog',requirePermission('asset-register','read'),requirePermission('risk-management','read'),wrap(async(req,res)=>res.json(await require('../services/riskManagementService').listRegister())))
```


## GET /api/asset-management/diagram

Source: `src/routes/assetManagementRoutes.js:30`; izin: asset-modelling:read.

```javascript
router.get('/diagram',requirePermission('asset-modelling','read'),wrap(async(req,res)=>res.json(await diagram.read())))
```


## PUT /api/asset-management/diagram

Source: `src/routes/assetManagementRoutes.js:31`; izin: asset-modelling:update.

```javascript
router.put('/diagram',requirePermission('asset-modelling','update'),wrap(async(req,res)=>res.json(await diagram.save(req.body))))
```


## GET /api/asset-management/assets

Source: `src/routes/assetManagementRoutes.js:35`; izin: asset-register:read.

```javascript
router.get('/'+kind,requirePermission(key,'read'),wrap(async(req,res)=>res.json(await service.list(kind))))
```


## DELETE /api/asset-management/assets/:id

Source: `src/routes/assetManagementRoutes.js:36`; izin: asset-register:delete.

```javascript
router.delete('/'+kind+'/:id',requirePermission(key,'delete'),wrap(async(req,res)=>{await service.remove(kind,req.params.id);res.status(204).end();}))
```


## GET /api/asset-management/racks

Source: `src/routes/assetManagementRoutes.js:35`; izin: server-racks:read.

```javascript
router.get('/'+kind,requirePermission(key,'read'),wrap(async(req,res)=>res.json(await service.list(kind))))
```


## DELETE /api/asset-management/racks/:id

Source: `src/routes/assetManagementRoutes.js:36`; izin: server-racks:delete.

```javascript
router.delete('/'+kind+'/:id',requirePermission(key,'delete'),wrap(async(req,res)=>{await service.remove(kind,req.params.id);res.status(204).end();}))
```


## GET /api/asset-management/placements

Source: `src/routes/assetManagementRoutes.js:35`; izin: server-racks:read.

```javascript
router.get('/'+kind,requirePermission(key,'read'),wrap(async(req,res)=>res.json(await service.list(kind))))
```


## DELETE /api/asset-management/placements/:id

Source: `src/routes/assetManagementRoutes.js:36`; izin: server-racks:delete.

```javascript
router.delete('/'+kind+'/:id',requirePermission(key,'delete'),wrap(async(req,res)=>{await service.remove(kind,req.params.id);res.status(204).end();}))
```


## GET /api/asset-management/relations

Source: `src/routes/assetManagementRoutes.js:35`; izin: asset-modelling:read.

```javascript
router.get('/'+kind,requirePermission(key,'read'),wrap(async(req,res)=>res.json(await service.list(kind))))
```


## DELETE /api/asset-management/relations/:id

Source: `src/routes/assetManagementRoutes.js:36`; izin: asset-modelling:delete.

```javascript
router.delete('/'+kind+'/:id',requirePermission(key,'delete'),wrap(async(req,res)=>{await service.remove(kind,req.params.id);res.status(204).end();}))
```


## PUT /api/asset-management/assets/:id/related-risks

Source: `src/routes/assetManagementRoutes.js:44`; izin: asset-register:update + risk-management:read.

```javascript
router.put('/assets/:id/related-risks',requirePermission('asset-register','update'),requirePermission('risk-management','read'),wrap(async(req,res)=>res.json(await service.saveRiskLinks(req.params.id,req.body?.riskRegisterIds))))
```


## POST /api/asset-management/assets

Source: `src/routes/assetManagementRoutes.js:45`; izin: asset-register:create.

```javascript
router.post('/assets',requirePermission('asset-register','create'),assetUpload,wrap(async(req,res)=>res.status(201).json(await saveRegisteredAsset(req,null))))
```


## PUT /api/asset-management/assets/:id

Source: `src/routes/assetManagementRoutes.js:46`; izin: asset-register:update.

```javascript
router.put('/assets/:id',requirePermission('asset-register','update'),assetUpload,wrap(async(req,res)=>res.json(await saveRegisteredAsset(req,req.params.id))))
```


## POST /api/asset-management/racks

Source: `src/routes/assetManagementRoutes.js:48`; izin: server-racks:create.

```javascript
router.post('/'+kind,requirePermission(keys[kind],'create'),wrap(async(req,res)=>res.status(201).json(await save(null,req.body))))
```


## PUT /api/asset-management/racks/:id

Source: `src/routes/assetManagementRoutes.js:49`; izin: server-racks:update.

```javascript
router.put('/'+kind+'/:id',requirePermission(keys[kind],'update'),wrap(async(req,res)=>res.json(await save(req.params.id,req.body))))
```


## GET /api/asset-management/catalog

Source: `src/routes/assetManagementRoutes.js:51`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.get('/catalog',wrap(async(req,res,next)=>{const p=require('../services/permissionService');if(!await p.has(req.user?.role,'server-racks','read')&&!await p.has(req.user?.role,'asset-modelling','read'))return res.status(403).json({error:'Akses ditolak.'});res.json((await service.list('assets')).map(({id,tag,name,type,status,rackName})=>({id,tag,name,type,status,rackName})));}))
```


## PUT /api/asset-management/placements

Source: `src/routes/assetManagementRoutes.js:52`; izin: server-racks:update.

```javascript
router.put('/placements',requirePermission('server-racks','update'),wrap(async(req,res)=>res.json(await service.place(req.body))))
```


## POST /api/asset-management/relations

Source: `src/routes/assetManagementRoutes.js:53`; izin: asset-modelling:create.

```javascript
router.post('/relations',requirePermission('asset-modelling','create'),wrap(async(req,res)=>res.status(201).json(await service.relate(req.body))))
```


## PUT /api/asset-management/relations/:id

Source: `src/routes/assetManagementRoutes.js:54`; izin: asset-modelling:update.

```javascript
router.put('/relations/:id',requirePermission('asset-modelling','update'),wrap(async(req,res)=>res.json(await service.relate(req.body,req.params.id))))
```


## GET /api/asset-management/photos

Source: `src/routes/assetManagementRoutes.js:55`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.get('/photos',wrap(async(req,res)=>{const rackRead=await permissions.has(req.user?.role,'server-racks','read');const assetRead=await permissions.has(req.user?.role,'asset-register','read');if(!rackRead&&!assetRead)return res.status(403).json({error:'Akses foto ditolak.'});res.json(await photos.list(rackRead?undefined:'assets'));}))
```


## GET /api/asset-management/photos/:kind/:id/:side

Source: `src/routes/assetManagementRoutes.js:57`; izin: assets: asset-register; racks: server-racks; read foto aset juga via server-racks.

```javascript
router.get('/photos/:kind/:id/:side',photoPermission('read'),wrap(async(req,res)=>{const photo=await photos.read(req.params.kind,req.params.id,req.params.side);res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}).type(photo.mime_type).send(photo.content);}))
```


## PUT /api/asset-management/photos/:kind/:id

Source: `src/routes/assetManagementRoutes.js:58`; izin: assets: asset-register; racks: server-racks; read foto aset juga via server-racks.

```javascript
router.put('/photos/:kind/:id',photoPermission('update'),assetUpload,wrap(async(req,res)=>res.json(await photos.save(req.params.kind,req.params.id,req.files,req.body,req.user))))
```


## GET /api/knowledge-notes

Source: `src/routes/knowledgeNoteRoutes.js:29`; izin: knowledge-notes:read.

```javascript
router.get('/', requirePermission('knowledge-notes','read'), async(req,res)=>res.json(await service.list()))
```


## GET /api/knowledge-notes/folders

Source: `src/routes/knowledgeNoteRoutes.js:30`; izin: knowledge-notes:read.

```javascript
router.get('/folders',requirePermission('knowledge-notes','read'),async(req,res)=>res.json(await service.folders()))
```


## GET /api/knowledge-notes/images

Source: `src/routes/knowledgeNoteRoutes.js:31`; izin: knowledge-notes:read.

```javascript
router.get('/images',requirePermission('knowledge-notes','read'),async(req,res)=>res.json(await images.list()))
```


## GET /api/knowledge-notes/images/:id

Source: `src/routes/knowledgeNoteRoutes.js:32`; izin: knowledge-notes:read.

```javascript
router.get('/images/:id',requirePermission('knowledge-notes','read'),async(req,res)=>{
 const image=await images.read(req.params.id);
 res.set({'Cache-Control':'private, no-store','Content-Security-Policy':"sandbox; default-src 'none'"}).type(image.type).send(image.content);
})
```


## POST /api/knowledge-notes/images

Source: `src/routes/knowledgeNoteRoutes.js:36`; izin: knowledge-notes:create.

```javascript
router.post('/images',requirePermission('knowledge-notes','create'),upload.array('images',1),async(req,res)=>{
 try{const values=await uploadedImages(req);if(values.length!==1)throw Object.assign(new Error('Pilih satu gambar.'),{status:400});await service.importNotes([],[],values);res.status(201).json((await images.list()).find(image=>image.path===values[0].path));}
 finally{await cleanup(req);}
})
```


## PUT /api/knowledge-notes/images/:id

Source: `src/routes/knowledgeNoteRoutes.js:40`; izin: knowledge-notes:update.

```javascript
router.put('/images/:id',requirePermission('knowledge-notes','update'),async(req,res)=>res.json(await images.move(req.params.id,req.body?.folder)))
```


## DELETE /api/knowledge-notes/images/:id

Source: `src/routes/knowledgeNoteRoutes.js:41`; izin: knowledge-notes:delete.

```javascript
router.delete('/images/:id',requirePermission('knowledge-notes','delete'),async(req,res)=>{await images.remove(req.params.id);res.sendStatus(204);})
```


## POST /api/knowledge-notes/import-with-images

Source: `src/routes/knowledgeNoteRoutes.js:42`; izin: knowledge-notes:create.

```javascript
router.post('/import-with-images',requirePermission('knowledge-notes','create'),upload.fields([{name:'images',maxCount:100},{name:'documents',maxCount:200}]),async(req,res)=>{
 try{const payload=JSON.parse(req.body.payload||'{}');
 const files=req.files?.documents||[],paths=JSON.parse(req.body.documentPaths||'[]');
 if(!Array.isArray(paths)||paths.length!==files.length)throw Object.assign(new Error('Daftar file catatan tidak valid.'),{status:400});
 const uploadedBy=await require('../services/evidenceAccessService').userId(req.user);
 const documents=await Promise.all(files.map(async(file,index)=>({path:paths[index],content:await fs.readFile(file.path),uploadedBy})));
 res.status(201).json(await service.importNotes(payload.notes,payload.folders,await uploadedImages(req),documents));}

 finally{await cleanup(req);}
})
```


## POST /api/knowledge-notes/folders

Source: `src/routes/knowledgeNoteRoutes.js:52`; izin: knowledge-notes:create.

```javascript
router.post('/folders',requirePermission('knowledge-notes','create'),async(req,res)=>res.status(201).json(await service.createFolder(req.body?.path)))
```


## PUT /api/knowledge-notes/folders

Source: `src/routes/knowledgeNoteRoutes.js:53`; izin: knowledge-notes:update.

```javascript
router.put('/folders',requirePermission('knowledge-notes','update'),async(req,res)=>res.json(await service.moveFolder(req.body?.source,req.body?.destination)))
```


## DELETE /api/knowledge-notes/folders

Source: `src/routes/knowledgeNoteRoutes.js:54`; izin: knowledge-notes:delete.

```javascript
router.delete('/folders',requirePermission('knowledge-notes','delete'),async(req,res)=>res.json(await service.removeFolder(req.body?.path,req.body?.mode)))
```


## GET /api/knowledge-notes/export

Source: `src/routes/knowledgeNoteRoutes.js:55`; izin: knowledge-notes:read.

```javascript
router.get('/export', requirePermission('knowledge-notes','read'), async(req,res)=>{
  const notes = await service.list();
  const folders = await service.folders();
  const archive = require('archiver')('zip');
  archive.on('error', error=>res.destroy(error));
  res.attachment('knowledge-notes.zip'); archive.pipe(res);
  for (const folder of folders) archive.append('',{name:folder+'/'});
  for (const note of notes) archive.append(note.content,{name:`${note.folder ? note.folder+'/' : ''}${note.title}.md`});
  for(const image of await images.list())archive.append((await images.read(image.id)).content,{name:image.path});
  // Original titles preserve wiki-link resolution when importing the JSON backup.
  archive.append(JSON.stringify({format:'knowledge-notes-v1',notes,folders},null,2),{name:'knowledge-notes.json'});
  await archive.finalize();
})
```


## POST /api/knowledge-notes/import

Source: `src/routes/knowledgeNoteRoutes.js:68`; izin: knowledge-notes:create.

```javascript
router.post('/import',requirePermission('knowledge-notes','create'),async(req,res)=>res.status(201).json(await service.importNotes(req.body?.notes,req.body?.folders)))
```


## POST /api/knowledge-notes

Source: `src/routes/knowledgeNoteRoutes.js:69`; izin: knowledge-notes:create.

```javascript
router.post('/',requirePermission('knowledge-notes','create'),async(req,res)=>res.status(201).json(await service.create(req.body)))
```


## PUT /api/knowledge-notes/:id

Source: `src/routes/knowledgeNoteRoutes.js:70`; izin: knowledge-notes:update.

```javascript
router.put('/:id',requirePermission('knowledge-notes','update'),async(req,res)=>res.json(await service.update(req.params.id,req.body)))
```


## DELETE /api/knowledge-notes/:id

Source: `src/routes/knowledgeNoteRoutes.js:71`; izin: knowledge-notes:delete.

```javascript
router.delete('/:id',requirePermission('knowledge-notes','delete'),async(req,res)=>{await service.remove(req.params.id);res.sendStatus(204);})
```


## POST /api/threat-modelling/validate

Source: `src/routes/threatModelRoutes.js:4`; izin: threat-modelling:read.

```javascript
router.post('/validate', requirePermission('threat-modelling', 'read'), (req, res) => { service.validate(req.body); res.json({ valid: true }); })
```


## GET /api/threat-modelling

Source: `src/routes/threatModelRoutes.js:5`; izin: threat-modelling:read.

```javascript
router.get('/', requirePermission('threat-modelling', 'read'), async (req, res) => res.json(await service.list()))
```


## POST /api/threat-modelling

Source: `src/routes/threatModelRoutes.js:6`; izin: threat-modelling:create.

```javascript
router.post('/', requirePermission('threat-modelling', 'create'), async (req, res) => res.status(201).json(await service.create(req.body)))
```


## PUT /api/threat-modelling/:id

Source: `src/routes/threatModelRoutes.js:7`; izin: threat-modelling:update.

```javascript
router.put('/:id', requirePermission('threat-modelling', 'update'), async (req, res) => res.json(await service.update(req.params.id, req.body)))
```


## DELETE /api/threat-modelling/:id

Source: `src/routes/threatModelRoutes.js:8`; izin: threat-modelling:delete.

```javascript
router.delete('/:id', requirePermission('threat-modelling', 'delete'), async (req, res) => { await service.remove(req.params.id); res.sendStatus(204); })
```


## GET /api/audit-finding-tracker/reminder-settings

Source: `src/routes/auditFindingRoutes.js:9`; izin: admin.

```javascript
router.get('/reminder-settings', requireAdmin, wrap(async (req, res) => res.json(await reminder.getSettings())))
```


## PUT /api/audit-finding-tracker/reminder-settings

Source: `src/routes/auditFindingRoutes.js:10`; izin: admin.

```javascript
router.put('/reminder-settings', requireAdmin, wrap(async (req, res) => res.json(await reminder.saveSettings(req.body))))
```


## POST /api/audit-finding-tracker/reminder-settings/test

Source: `src/routes/auditFindingRoutes.js:11`; izin: admin.

```javascript
router.post('/reminder-settings/test', requireAdmin, wrap(async (req, res) => res.json(await reminder.testEmail(req.body?.to))))
```


## GET /api/audit-finding-tracker

Source: `src/routes/auditFindingRoutes.js:13`; izin: audit-finding-tracker:read.

```javascript
router.get('/', requirePermission('audit-finding-tracker', 'read'), wrap(async (req, res) => res.json(await service.list(req.user))))
```


## GET /api/audit-finding-tracker/available-files

Source: `src/routes/auditFindingRoutes.js:14`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.get('/available-files', async (req,res,next) => { const permissions=require('../services/permissionService'); if(await permissions.has(req.user?.role,'audit-finding-tracker','create') || await permissions.has(req.user?.role,'audit-finding-tracker','update')) return next(); res.status(403).json({error:'Access denied for audit attachments'}); }, wrap(async (req, res) => {
  const access = require('../services/evidenceAccessService');
  const files = await access.searchableList(req.user);
  res.set('Cache-Control','no-store').json(files.map(file => ({path:access.normalize(file.path),name:file.name,source:file.source,policyDetails:file.policyDetails,knowledgeDetails:file.knowledgeDetails})));
}))
```


## GET /api/audit-finding-tracker/:id/download

Source: `src/routes/auditFindingRoutes.js:19`; izin: audit-finding-tracker:read.

```javascript
router.get('/:id/download', requirePermission('audit-finding-tracker', 'read'), wrap(async (req, res) => {
  const file = await service.download(req.params.id, req.user, req.query.path);
  res.set('Cache-Control', 'no-store').attachment(file.filename).type('application/octet-stream').send(file.content);
}))
```


## POST /api/audit-finding-tracker

Source: `src/routes/auditFindingRoutes.js:23`; izin: audit-finding-tracker:create.

```javascript
router.post('/', requirePageAccess('audit-finding-tracker', 'create'), upload.array('file',10), wrap(async (req, res) => res.status(201).json(await service.save(req.body.kind, null, req.body.parentId, req.body, req.files, req.user))))
```


## PUT /api/audit-finding-tracker/:id

Source: `src/routes/auditFindingRoutes.js:24`; izin: audit-finding-tracker:update.

```javascript
router.put('/:id', requirePageAccess('audit-finding-tracker', 'update'), upload.array('file',10), wrap(async (req, res) => res.json(await service.save(req.body.kind, req.params.id, null, req.body, req.files, req.user))))
```


## DELETE /api/audit-finding-tracker/:id

Source: `src/routes/auditFindingRoutes.js:25`; izin: audit-finding-tracker:delete.

```javascript
router.delete('/:id', requirePageAccess('audit-finding-tracker', 'delete'), wrap(async (req, res) => { await service.remove(req.params.id, req.user); res.status(204).end(); }))
```


## GET /api/smtp-settings/accounts

Source: `src/routes/smtpRoutes.js:9`; izin: admin.

```javascript
router.get('/accounts',handle(()=>smtp.listAccounts()))
```


## POST /api/smtp-settings/accounts

Source: `src/routes/smtpRoutes.js:10`; izin: admin.

```javascript
router.post('/accounts',handle(req=>smtp.createAccount(req.body)))
```


## PUT /api/smtp-settings/accounts/:id

Source: `src/routes/smtpRoutes.js:11`; izin: admin.

```javascript
router.put('/accounts/:id',handle(req=>smtp.saveSettings(req.body,req.params.id)))
```


## GET /api/smtp-settings

Source: `src/routes/smtpRoutes.js:12`; izin: admin.

```javascript
router.get('/',handle(()=>smtp.getSettings()))
```


## PUT /api/smtp-settings

Source: `src/routes/smtpRoutes.js:13`; izin: admin.

```javascript
router.put('/',handle(req=>smtp.saveSettings(req.body)))
```


## POST /api/smtp-settings/test

Source: `src/routes/smtpRoutes.js:14`; izin: admin.

```javascript
router.post('/test',handle(req=>smtp.testEmail(req.body?.to,req.body?.smtpAccountId)))
```


## GET /api/assessment

Source: `src/routes/assessmentRoutes.js:6`; izin: assessment:read.

```javascript
router.get('/', requirePermission('assessment', 'read'), controller.get)
```

Handler `get`:

```javascript
async function get(req, res) { res.json(await getAssessment(req.assessmentId || 'default')); }
```


## PUT /api/assessment

Source: `src/routes/assessmentRoutes.js:7`; izin: assessment:update.

```javascript
router.put('/', requirePageAccess('assessment', 'update'), controller.update)
```

Handler `update`:

```javascript
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
```


## POST /api/assessment/reset

Source: `src/routes/assessmentRoutes.js:8`; izin: assessment:delete.

```javascript
router.post('/reset', requirePermission('assessment', 'delete'), controller.reset)
```

Handler `reset`:

```javascript
async function reset(req, res) { await resetFilesForAssessment(req.assessmentId || 'default'); res.status(204).end(); }
```


## GET /api/files

Source: `src/routes/fileRoutes.js:12`; izin: files:read.

```javascript
router.get('/', requirePermission('files', 'read'), controller.list)
```

Handler `list`:

```javascript
async function list(req, res) { const detailed = req.query.details === 'true'; const files = await (detailed ? evidenceAccess.searchableList(req.user) : evidenceAccess.list(req.user)); res.set('Cache-Control','no-store').json(detailed ? files : files.map(file => file.path)); }
```


## POST /api/files

Source: `src/routes/fileRoutes.js:13`; izin: files:create.

```javascript
router.post('/', requirePageAccess('files', 'create'), controller.upload.single('file'), requireCsfFileAccess, controller.create)
```

Handler `create`:

```javascript
async function create(req, res) {
	if (!req.file) return res.status(400).json({ error: 'File is required' });
	try {
	fileService.validateUploadFile(req.file.originalname, req.file.mimetype);
	fileService.validateUploadMetadata(req.body.functionName, req.body.kind, req.file.originalname);
	const file = await fileService.saveFile({
		uploadedBy: await evidenceAccess.userId(req.user),
		functionName: req.body.functionName,
		kind: req.body.kind,
		file: req.file,
		rejectDuplicate: req.body.rejectDuplicate === 'true',
	});
	res.status(201).json(file);
	} finally {
		await fs.promises.rm(req.file.path, { force: true });
	}
}
```


## POST /api/files/batch

Source: `src/routes/fileRoutes.js:14`; izin: files:create.

```javascript
router.post('/batch', requirePageAccess('files', 'create'), controller.upload.array('files', 50), requireCsfFileAccess, controller.createBatch)
```

Handler `createBatch`:

```javascript
async function createBatch(req, res) {
	if (!req.files?.length) return res.status(400).json({ error: 'At least one file is required' });
	try {
	if (req.files.reduce((total, file) => total + file.size, 0) > 200 * 1024 * 1024) {
		await Promise.all(req.files.map(file => fs.promises.rm(file.path, { force: true })));
		return res.status(413).json({ error: 'Upload batch is too large' });
	}

	req.files.forEach(file => fileService.validateUploadMetadata(req.body.functionName, req.body.kind, file.originalname));
	req.files.forEach(file => fileService.validateUploadFile(file.originalname, file.mimetype));
	const files = await fileService.saveFiles({
		uploadedBy: await evidenceAccess.userId(req.user),
		functionName: req.body.functionName,
		kind: req.body.kind,
		files: req.files,
		rejectDuplicate: req.body.rejectDuplicate === 'true',
	});
	res.status(201).json(files);
	} finally {
		await Promise.all(req.files.map(file => fs.promises.rm(file.path, { force: true })));
	}
}
```


## GET /api/files/access/*path

Source: `src/routes/fileRoutes.js:16`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.get('/access/*path', controller.access)
```

Handler `access`:

```javascript
async function access(req, res) { res.json({ canModify: await evidenceAccess.canModify(filePath(req), req.user) }); }
```


## GET /api/files/open/*path

Source: `src/routes/fileRoutes.js:17`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.get('/open/*path', controller.open)
```

Handler `open`:

```javascript
async function open(req, res) { await evidenceAccess.assertReadAccess(filePath(req), req.user); const page = await fileService.openPage(filePath(req)); res.redirect(`/api/files/${filePath(req).split('/').map(encodeURIComponent).join('/')}#page=${page}`); }
```


## GET /api/files/open-page/*path

Source: `src/routes/fileRoutes.js:18`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.get('/open-page/*path', controller.getOpenPage)
```

Handler `getOpenPage`:

```javascript
async function getOpenPage(req, res) { await evidenceAccess.assertReadAccess(filePath(req), req.user); res.json({ openPage: await fileService.openPage(filePath(req)) }); }
```


## PUT /api/files/open-page/*path

Source: `src/routes/fileRoutes.js:19`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.put('/open-page/*path', controller.setOpenPage)
```

Handler `setOpenPage`:

```javascript
async function setOpenPage(req, res) { await evidenceAccess.assertAccess(filePath(req), req.user); res.json({ openPage: await fileService.setOpenPage(filePath(req), req.body?.openPage) }); }
```


## PUT /api/files/*path

Source: `src/routes/fileRoutes.js:20`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.put('/*path', async (req, res, next) => {
  await require('../services/evidenceAccessService').assertAccess(Array.isArray(req.params.path) ? req.params.path.join('/') : req.params.path, req.user);
  next();
}, controller.replacementUpload.single('file'), controller.replace)
```

Handler `replace`:

```javascript
async function replace(req, res) {
	await evidenceAccess.assertAccess(filePath(req), req.user);
	if (!req.file) return res.status(400).json({ error: 'Replacement file is required' });
	res.json(await fileService.replaceFile(filePath(req), req.file));
}
```


## GET /api/files/*path

Source: `src/routes/fileRoutes.js:25`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.get('/*path', controller.download)
```

Handler `download`:

```javascript
async function download(req, res) {
	const relativePath = filePath(req);
	await evidenceAccess.assertReadAccess(relativePath, req.user);
	const file = await fileService.readFile(relativePath);
	const extension = path.extname(relativePath).toLowerCase();
	const disposition = inlineFileTypes.has(file.type) || String(file.type || '').startsWith('image/') || ['.pdf', '.doc', '.docx', '.dot', '.dotx', '.docm', '.dotm'].includes(extension)
		? 'inline'
		: 'attachment';
	res.set('Content-Disposition', `${disposition}; filename="${safeSegment(path.basename(relativePath))}"`);
	// Isolate uploaded content, including forged MIME types, from the application origin.
	res.set('Content-Security-Policy', "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'");
	res.type(file.type).send(file.content);
}
```


## DELETE /api/files/*path

Source: `src/routes/fileRoutes.js:26`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.delete('/*path', controller.remove)
```

Handler `remove`:

```javascript
async function remove(req, res) { await evidenceAccess.assertAccess(filePath(req), req.user); await fileService.deleteFile(filePath(req), { library: req.query.library === 'true' }); res.status(204).end(); }
```


## GET /api/storage-settings

Source: `src/routes/storageRoutes.js:6`; izin: admin.

```javascript
router.get('/', async (req, res) => res.json(await storage.getSettings()))
```


## PUT /api/storage-settings

Source: `src/routes/storageRoutes.js:7`; izin: admin.

```javascript
router.put('/', async (req, res) => res.json(await storage.saveSettings(req.body)))
```


## POST /api/storage-settings/test

Source: `src/routes/storageRoutes.js:8`; izin: admin.

```javascript
router.post('/test', async (req, res) => res.json(await storage.testSettings(req.body)))
```


## GET /api/csf

Source: `src/routes/csfRoutes.js:7`; izin: csf:read.

```javascript
router.get('/', requirePermission('csf', 'read'), controller.list)
```

Handler `list`:

```javascript
async function list(req, res) { res.json(await csfService.getAll()); }
```


## POST /api/csf

Source: `src/routes/csfRoutes.js:8`; izin: csf:create.

```javascript
router.post('/', requirePageAccess('csf', 'create'), controller.create)
```

Handler `create`:

```javascript
async function create(req, res) { res.status(201).json(await csfService.create(req.body)); }
```


## PUT /api/csf/:id

Source: `src/routes/csfRoutes.js:9`; izin: csf:update.

```javascript
router.put('/:id', requirePageAccess('csf', 'update'), controller.update)
```

Handler `update`:

```javascript
async function update(req, res) { res.json(await csfService.update(req.params.id, req.body)); }
```


## DELETE /api/csf/:id

Source: `src/routes/csfRoutes.js:10`; izin: csf:delete.

```javascript
router.delete('/:id', requirePageAccess('csf', 'delete'), controller.remove)
```

Handler `remove`:

```javascript
async function remove(req, res) { await csfService.remove(req.params.id); res.status(204).end(); }
```


## GET /api/privacy

Source: `src/routes/privacyRoutes.js:7`; izin: privacy:read.

```javascript
router.get('/', requirePermission('privacy', 'read'), controller.list)
```

Handler `list`:

```javascript
async function list(req, res) { res.json(await privacyService.getAll()); }
```


## POST /api/privacy

Source: `src/routes/privacyRoutes.js:8`; izin: privacy:create.

```javascript
router.post('/', requirePageAccess('privacy', 'create'), controller.create)
```

Handler `create`:

```javascript
async function create(req, res) { res.status(201).json(await privacyService.create(req.body)); }
```


## GET /api/privacy/assessment

Source: `src/routes/privacyRoutes.js:9`; izin: privacy-assessment:read.

```javascript
router.get('/assessment', requirePermission('privacy-assessment', 'read'), (req, res, next) => { req.assessmentId = 'privacy'; next(); }, assessmentController.get)
```

Handler `get`:

```javascript
async function get(req, res) { res.json(await getAssessment(req.assessmentId || 'default')); }
```


## PUT /api/privacy/assessment

Source: `src/routes/privacyRoutes.js:10`; izin: privacy-assessment:update.

```javascript
router.put('/assessment', requirePageAccess('privacy-assessment', 'update'), (req, res, next) => { req.assessmentId = 'privacy'; next(); }, assessmentController.update)
```

Handler `update`:

```javascript
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
```


## POST /api/privacy/assessment/reset

Source: `src/routes/privacyRoutes.js:11`; izin: privacy-assessment:delete.

```javascript
router.post('/assessment/reset', requirePermission('privacy-assessment', 'delete'), (req, res, next) => { req.assessmentId = 'privacy'; next(); }, assessmentController.reset)
```

Handler `reset`:

```javascript
async function reset(req, res) { await resetFilesForAssessment(req.assessmentId || 'default'); res.status(204).end(); }
```


## PUT /api/privacy/:id

Source: `src/routes/privacyRoutes.js:12`; izin: privacy:update.

```javascript
router.put('/:id', requirePageAccess('privacy', 'update'), controller.update)
```

Handler `update`:

```javascript
async function update(req, res) { res.json(await privacyService.update(req.params.id, req.body)); }
```


## DELETE /api/privacy/:id

Source: `src/routes/privacyRoutes.js:13`; izin: privacy:delete.

```javascript
router.delete('/:id', requirePageAccess('privacy', 'delete'), controller.remove)
```

Handler `remove`:

```javascript
async function remove(req, res) { await privacyService.remove(req.params.id); res.status(204).end(); }
```


## GET /api/frameworks

Source: `src/routes/frameworkRoutes.js:8`; izin: framework:read.

```javascript
router.get('/', requirePermission('framework', 'read'), controller.list)
```

Handler `list`:

```javascript
async function list(req, res) { res.json(await frameworkService.listFrameworks()); }
```


## POST /api/frameworks

Source: `src/routes/frameworkRoutes.js:9`; izin: framework:create.

```javascript
router.post('/', requirePageAccess('framework', 'create'), controller.create)
```

Handler `create`:

```javascript
async function create(req, res) { res.status(201).json(await frameworkService.createFramework(req.body)); }
```


## GET /api/frameworks/:frameworkId/controls

Source: `src/routes/frameworkRoutes.js:10`; izin: key framework/assessment dinamis:read.

```javascript
router.get('/:frameworkId/controls', frameworkPermission('read'), controller.listControls)
```

Handler `listControls`:

```javascript
async function listControls(req, res) { res.json(await frameworkService.getControls(req.params.frameworkId)); }
```


## GET /api/frameworks/:frameworkId/targets

Source: `src/routes/frameworkRoutes.js:11`; izin: key framework/assessment dinamis:read.

```javascript
router.get('/:frameworkId/targets', targetPermission('read'), controller.listCategoryTargets)
```

Handler `listCategoryTargets`:

```javascript
async function listCategoryTargets(req, res) { res.json(await frameworkService.listCategoryTargets(req.params.frameworkId)); }
```


## PUT /api/frameworks/:frameworkId/targets/:category

Source: `src/routes/frameworkRoutes.js:12`; izin: key framework/assessment dinamis:update.

```javascript
router.put('/:frameworkId/targets/:category', targetPermission('update'), controller.updateCategoryTarget)
```

Handler `updateCategoryTarget`:

```javascript
async function updateCategoryTarget(req, res) { res.json(await frameworkService.updateCategoryTarget(req.params.frameworkId, req.params.category, req.body.targetScore)); }
```


## GET /api/frameworks/iso27001/objectives

Source: `src/routes/frameworkRoutes.js:13`; izin: iso27001:read.

```javascript
router.get('/iso27001/objectives', requirePermission('iso27001', 'read'), controller.listInformationSecurityObjectives)
```

Handler `listInformationSecurityObjectives`:

```javascript
async function listInformationSecurityObjectives(req, res) { res.json(await frameworkService.listInformationSecurityObjectives(req.query.year)); }
```


## POST /api/frameworks/iso27001/assessment/reset

Source: `src/routes/frameworkRoutes.js:14`; izin: iso27001:delete.

```javascript
router.post('/iso27001/assessment/reset', requirePageAccess('iso27001', 'delete'), controller.resetIso27001Assessment)
```

Handler `resetIso27001Assessment`:

```javascript
async function resetIso27001Assessment(req, res) { await frameworkService.resetIso27001Assessment(); res.status(204).end(); }
```


## POST /api/frameworks/iso27001/objectives

Source: `src/routes/frameworkRoutes.js:15`; izin: iso27001:create.

```javascript
router.post('/iso27001/objectives', requirePageAccess('iso27001', 'create'), controller.createInformationSecurityObjective)
```

Handler `createInformationSecurityObjective`:

```javascript
async function createInformationSecurityObjective(req, res) { res.status(201).json(await frameworkService.createInformationSecurityObjective(req.body)); }
```


## PUT /api/frameworks/iso27001/objectives/:id

Source: `src/routes/frameworkRoutes.js:16`; izin: iso27001:update.

```javascript
router.put('/iso27001/objectives/:id', requirePageAccess('iso27001', 'update'), controller.updateInformationSecurityObjective)
```

Handler `updateInformationSecurityObjective`:

```javascript
async function updateInformationSecurityObjective(req, res) { res.json(await frameworkService.updateInformationSecurityObjective(req.params.id, req.body)); }
```


## DELETE /api/frameworks/iso27001/objectives/:id

Source: `src/routes/frameworkRoutes.js:17`; izin: iso27001:delete.

```javascript
router.delete('/iso27001/objectives/:id', requirePageAccess('iso27001', 'delete'), controller.deleteInformationSecurityObjective)
```

Handler `deleteInformationSecurityObjective`:

```javascript
async function deleteInformationSecurityObjective(req, res) { await frameworkService.deleteInformationSecurityObjective(req.params.id); res.status(204).end(); }
```


## PUT /api/frameworks/:frameworkId/controls/:code/evidence

Source: `src/routes/frameworkRoutes.js:18`; izin: framework / iso27001 / iso27001-soa:update.

```javascript
router.put('/:frameworkId/controls/:code/evidence', requireFrameworkEvidenceAccess(), controller.updateControlEvidence)
```

Handler `updateControlEvidence`:

```javascript
async function updateControlEvidence(req, res) { await checkEvidence(req); res.json(await frameworkService.updateControlEvidence(req.params.frameworkId, req.params.code, req.body.evidence)); }
```


## POST /api/frameworks/:frameworkId/controls

Source: `src/routes/frameworkRoutes.js:19`; izin: key framework/assessment dinamis:create.

```javascript
router.post('/:frameworkId/controls', frameworkPermission('create'), controller.createControl)
```

Handler `createControl`:

```javascript
async function createControl(req, res) { await checkEvidence(req,true); res.status(201).json(await frameworkService.createControl(req.params.frameworkId, req.body)); }
```


## PUT /api/frameworks/:frameworkId/controls/:code

Source: `src/routes/frameworkRoutes.js:20`; izin: key framework/assessment dinamis:update.

```javascript
router.put('/:frameworkId/controls/:code', frameworkPermission('update'), controller.updateControl)
```

Handler `updateControl`:

```javascript
async function updateControl(req, res) { await checkEvidence(req); res.json(await frameworkService.updateControl(req.params.frameworkId, req.params.code, req.body)); }
```


## DELETE /api/frameworks/:frameworkId/controls/:code

Source: `src/routes/frameworkRoutes.js:21`; izin: key framework/assessment dinamis:delete.

```javascript
router.delete('/:frameworkId/controls/:code', frameworkPermission('delete'), controller.deleteControl)
```

Handler `deleteControl`:

```javascript
async function deleteControl(req, res) { await frameworkService.deleteControl(req.params.frameworkId, req.params.code); res.status(204).end(); }
```


## GET /api/risk-acceptance

Source: `src/routes/riskAcceptanceRoutes.js:6`; izin: risk-acceptance:read.

```javascript
router.get('/', requirePermission('risk-acceptance', 'read'), controller.list)
```

Handler `list`:

```javascript
async function list(req, res) { res.json(await service.list()); }
```


## POST /api/risk-acceptance

Source: `src/routes/riskAcceptanceRoutes.js:7`; izin: risk-acceptance:create.

```javascript
router.post('/', requirePageAccess('risk-acceptance', 'create'), controller.create)
```

Handler `create`:

```javascript
async function create(req, res) { res.status(201).json(await service.create(req.body)); }
```


## GET /api/risk-acceptance/:id/export/pdf

Source: `src/routes/riskAcceptanceRoutes.js:8`; izin: risk-acceptance:read.

```javascript
router.get('/:id/export/pdf', requirePermission('risk-acceptance', 'read'), controller.exportPdf)
```

Handler `exportPdf`:

```javascript
async function exportPdf(req, res) { const document = await service.exportPdf(req.params.id); res.type('application/pdf').attachment(`Cybersecurity-Risk-Acceptance-Form-${req.params.id}.pdf`).send(document); }
```


## PUT /api/risk-acceptance/:id

Source: `src/routes/riskAcceptanceRoutes.js:9`; izin: risk-acceptance:update.

```javascript
router.put('/:id', requirePageAccess('risk-acceptance', 'update'), controller.update)
```

Handler `update`:

```javascript
async function update(req, res) { res.json(await service.update(req.params.id, req.body)); }
```


## DELETE /api/risk-acceptance/:id

Source: `src/routes/riskAcceptanceRoutes.js:10`; izin: risk-acceptance:delete.

```javascript
router.delete('/:id', requirePageAccess('risk-acceptance', 'delete'), controller.remove)
```

Handler `remove`:

```javascript
async function remove(req, res) { await service.remove(req.params.id); res.status(204).end(); }
```


## GET /api/risk-management/dashboard

Source: `src/routes/riskManagementRoutes.js:5`; izin: risk-management:read.

```javascript
router.get('/dashboard', requirePermission('risk-management', 'read'), controller.dashboard)
```


## GET /api/risk-management/indicators

Source: `src/routes/riskManagementRoutes.js:6`; izin: risk-management:read.

```javascript
router.get('/indicators', requirePermission('risk-management', 'read'), controller.indicators)
```


## GET /api/risk-management/dropdowns

Source: `src/routes/riskManagementRoutes.js:7`; izin: risk-management:read.

```javascript
router.get('/dropdowns', requirePermission('risk-management', 'read'), controller.dropdowns)
```


## POST /api/risk-management/dropdowns

Source: `src/routes/riskManagementRoutes.js:8`; izin: risk-management:create.

```javascript
router.post('/dropdowns', requirePageAccess('risk-management', 'create'), controller.createDropdown)
```


## PUT /api/risk-management/dropdowns/:id

Source: `src/routes/riskManagementRoutes.js:9`; izin: risk-management:update.

```javascript
router.put('/dropdowns/:id', requirePageAccess('risk-management', 'update'), controller.updateDropdown)
```


## DELETE /api/risk-management/dropdowns/:id

Source: `src/routes/riskManagementRoutes.js:10`; izin: risk-management:delete.

```javascript
router.delete('/dropdowns/:id', requirePageAccess('risk-management', 'delete'), controller.removeDropdown)
```


## POST /api/risk-management/indicators

Source: `src/routes/riskManagementRoutes.js:11`; izin: risk-management:create.

```javascript
router.post('/indicators', requirePageAccess('risk-management', 'create'), controller.createIndicator)
```


## PUT /api/risk-management/indicators/:id

Source: `src/routes/riskManagementRoutes.js:12`; izin: risk-management:update.

```javascript
router.put('/indicators/:id', requirePageAccess('risk-management', 'update'), controller.updateIndicator)
```


## DELETE /api/risk-management/indicators/:id

Source: `src/routes/riskManagementRoutes.js:13`; izin: risk-management:delete.

```javascript
router.delete('/indicators/:id', requirePageAccess('risk-management', 'delete'), controller.removeIndicator)
```


## GET /api/risk-management

Source: `src/routes/riskManagementRoutes.js:14`; izin: risk-management:read.

```javascript
router.get('/', requirePermission('risk-management', 'read'), controller.list)
```


## POST /api/risk-management

Source: `src/routes/riskManagementRoutes.js:15`; izin: risk-management:create.

```javascript
router.post('/', requirePageAccess('risk-management', 'create'), controller.create)
```


## PUT /api/risk-management/:id

Source: `src/routes/riskManagementRoutes.js:16`; izin: risk-management:update.

```javascript
router.put('/:id', requirePageAccess('risk-management', 'update'), controller.update)
```


## DELETE /api/risk-management/:id

Source: `src/routes/riskManagementRoutes.js:17`; izin: risk-management:delete.

```javascript
router.delete('/:id', requirePageAccess('risk-management', 'delete'), controller.remove)
```


## DELETE /api/risk-management

Source: `src/routes/riskManagementRoutes.js:18`; izin: risk-management:delete.

```javascript
router.delete('/', requirePageAccess('risk-management', 'delete'), controller.reset)
```


## GET /api/personnel-certifications

Source: `src/routes/personnelCertificationRoutes.js:5`; izin: personnel-certification:read.

```javascript
router.get('/', requirePermission('personnel-certification', 'read'), controller.list)
```


## GET /api/personnel-certifications/organization-personnel

Source: `src/routes/personnelCertificationRoutes.js:6`; izin: personnel-certification:read.

```javascript
router.get('/organization-personnel', requirePermission('personnel-certification', 'read'), controller.organizationList)
```


## POST /api/personnel-certifications/organization-personnel

Source: `src/routes/personnelCertificationRoutes.js:7`; izin: personnel-certification:create.

```javascript
router.post('/organization-personnel', requirePermission('personnel-certification', 'create'), controller.organizationCreate)
```


## PUT /api/personnel-certifications/organization-personnel/:personnelId

Source: `src/routes/personnelCertificationRoutes.js:8`; izin: personnel-certification:update.

```javascript
router.put('/organization-personnel/:personnelId', requirePermission('personnel-certification', 'update'), controller.organizationUpdate)
```


## DELETE /api/personnel-certifications/organization-personnel/:personnelId

Source: `src/routes/personnelCertificationRoutes.js:9`; izin: personnel-certification:delete.

```javascript
router.delete('/organization-personnel/:personnelId', requirePermission('personnel-certification', 'delete'), controller.organizationDelete)
```


## POST /api/personnel-certifications

Source: `src/routes/personnelCertificationRoutes.js:11`; izin: personnel-certification:create.

```javascript
router.post('/', requirePageAccess('personnel-certification', 'create'), controller.create)
```


## PUT /api/personnel-certifications/:id/layout

Source: `src/routes/personnelCertificationRoutes.js:12`; izin: personnel-certification:update.

```javascript
router.put('/:id/layout', requirePageAccess('personnel-certification', 'update'), controller.updateLayout)
```


## PUT /api/personnel-certifications/:id

Source: `src/routes/personnelCertificationRoutes.js:13`; izin: personnel-certification:update.

```javascript
router.put('/:id', requirePageAccess('personnel-certification', 'update'), controller.update)
```


## DELETE /api/personnel-certifications/:id

Source: `src/routes/personnelCertificationRoutes.js:14`; izin: personnel-certification:delete.

```javascript
router.delete('/:id', requirePageAccess('personnel-certification', 'delete'), controller.remove)
```


## GET /api/certification-roadmap-catalog

Source: `src/routes/certificationRoadmapCatalogRoutes.js:5`; izin: personnel-certification:read.

```javascript
router.get('/', requirePermission('personnel-certification', 'read'), controller.list)
```


## POST /api/certification-roadmap-catalog

Source: `src/routes/certificationRoadmapCatalogRoutes.js:6`; izin: personnel-certification:create.

```javascript
router.post('/', requirePermission('personnel-certification', 'create'), controller.create)
```


## PUT /api/certification-roadmap-catalog/:id

Source: `src/routes/certificationRoadmapCatalogRoutes.js:7`; izin: personnel-certification:update.

```javascript
router.put('/:id', requirePermission('personnel-certification', 'update'), controller.update)
```


## DELETE /api/certification-roadmap-catalog/:id

Source: `src/routes/certificationRoadmapCatalogRoutes.js:8`; izin: personnel-certification:delete.

```javascript
router.delete('/:id', requirePermission('personnel-certification', 'delete'), controller.remove)
```


## GET /api/tprm

Source: `src/routes/tprmRoutes.js:5`; izin: tprm-register:read.

```javascript
router.get('/', requirePermission('tprm-register', 'read'), controller.list)
```


## POST /api/tprm

Source: `src/routes/tprmRoutes.js:6`; izin: tprm-register:create.

```javascript
router.post('/', requirePageAccess('tprm-register', 'create'), controller.create)
```


## PUT /api/tprm/:id

Source: `src/routes/tprmRoutes.js:7`; izin: tprm-register:update.

```javascript
router.put('/:id', requirePageAccess('tprm-register', 'update'), controller.update)
```


## DELETE /api/tprm/:id

Source: `src/routes/tprmRoutes.js:8`; izin: tprm-register:delete.

```javascript
router.delete('/:id', requirePageAccess('tprm-register', 'delete'), controller.remove)
```


## GET /api/tprm-questionnaires

Source: `src/routes/tprmQuestionnaireRoutes.js:5`; izin: tprm-questionnaire:read.

```javascript
router.get('/', requirePermission('tprm-questionnaire', 'read'), controller.list)
```


## POST /api/tprm-questionnaires

Source: `src/routes/tprmQuestionnaireRoutes.js:6`; izin: tprm-questionnaire:create.

```javascript
router.post('/', requirePageAccess('tprm-questionnaire', 'create'), controller.create)
```


## PUT /api/tprm-questionnaires/:id

Source: `src/routes/tprmQuestionnaireRoutes.js:7`; izin: tprm-questionnaire:update.

```javascript
router.put('/:id', requirePageAccess('tprm-questionnaire', 'update'), controller.update)
```


## PUT /api/tprm-questionnaires/:id/documents

Source: `src/routes/tprmQuestionnaireRoutes.js:8`; izin: tprm-questionnaire:update.

```javascript
router.put('/:id/documents', requirePageAccess('tprm-questionnaire', 'update'), controller.updateDocuments)
```


## DELETE /api/tprm-questionnaires/:id

Source: `src/routes/tprmQuestionnaireRoutes.js:9`; izin: tprm-questionnaire:delete.

```javascript
router.delete('/:id', requirePageAccess('tprm-questionnaire', 'delete'), controller.remove)
```


## GET /api/questionnaire-templates

Source: `src/routes/questionnaireTemplateRoutes.js:6`; izin: questionnaire-templates:read.

```javascript
router.get('/', requirePermission('questionnaire-templates', 'read'), async (req, res) => {
  try {
    const templates = await list();
    res.json(templates);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
})
```


## POST /api/questionnaire-templates

Source: `src/routes/questionnaireTemplateRoutes.js:15`; izin: questionnaire-templates:create.

```javascript
router.post('/', requirePageAccess('questionnaire-templates', 'create'), async (req, res) => {
  try {
    const template = await create(req.body);
    res.json(template);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
})
```


## PUT /api/questionnaire-templates/:id

Source: `src/routes/questionnaireTemplateRoutes.js:24`; izin: questionnaire-templates:update.

```javascript
router.put('/:id', requirePageAccess('questionnaire-templates', 'update'), async (req, res) => {
  try {
    const template = await update(req.params.id, req.body);
    res.json(template);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
})
```


## DELETE /api/questionnaire-templates/:id

Source: `src/routes/questionnaireTemplateRoutes.js:33`; izin: questionnaire-templates:delete.

```javascript
router.delete('/:id', requirePageAccess('questionnaire-templates', 'delete'), async (req, res) => {
  try {
    const template = await remove(req.params.id);
    res.json(template);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
})
```


## GET /api/policy-register/reminder-settings

Source: `src/routes/policyRegisterRoutes.js:15`; izin: admin.

```javascript
router.get('/reminder-settings', adminOnly, reminderHandler(() => reminders.getSettings()))
```


## PUT /api/policy-register/reminder-settings

Source: `src/routes/policyRegisterRoutes.js:16`; izin: admin.

```javascript
router.put('/reminder-settings', adminOnly, reminderHandler(req => reminders.saveSettings(req.body)))
```


## POST /api/policy-register/reminder-settings/test

Source: `src/routes/policyRegisterRoutes.js:17`; izin: admin.

```javascript
router.post('/reminder-settings/test', adminOnly, reminderHandler(req => reminders.testEmail(req.body?.to)))
```


## GET /api/policy-register/dropdowns

Source: `src/routes/policyRegisterRoutes.js:25`; izin: policy-register:read.

```javascript
router.get('/dropdowns', requirePermission('policy-register', 'read'), controller.listDropdowns)
```

Handler `listDropdowns`:

```javascript
async (req, res, next) => {
  try {
    const items = await service.listDropdowns();
    return res.json(items);
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'Failed to load dropdown options';
    return res.status(status).json({ error: message });
  }
}
```


## POST /api/policy-register/dropdowns

Source: `src/routes/policyRegisterRoutes.js:26`; izin: policy-register:create.

```javascript
router.post('/dropdowns', requirePageAccess('policy-register', 'create'), controller.createDropdown)
```

Handler `createDropdown`:

```javascript
async (req, res, next) => {
  try {
    const item = await service.createDropdown(req.body || {});
    return res.status(201).json(item);
  } catch (error) {
    const status = error.status || 400;
    const message = error.message || 'Failed to create dropdown option';
    return res.status(status).json({ error: message });
  }
}
```


## PUT /api/policy-register/dropdowns/:id

Source: `src/routes/policyRegisterRoutes.js:27`; izin: policy-register:update.

```javascript
router.put('/dropdowns/:id', requirePageAccess('policy-register', 'update'), controller.updateDropdown)
```

Handler `updateDropdown`:

```javascript
async (req, res, next) => {
  try {
    const item = await service.updateDropdown(req.params.id, req.body || {});
    return res.json(item);
  } catch (error) {
    const status = error.status || 400;
    const message = error.message || 'Failed to update dropdown option';
    return res.status(status).json({ error: message });
  }
}
```


## DELETE /api/policy-register/dropdowns/:id

Source: `src/routes/policyRegisterRoutes.js:28`; izin: policy-register:delete.

```javascript
router.delete('/dropdowns/:id', requirePageAccess('policy-register', 'delete'), controller.removeDropdown)
```

Handler `removeDropdown`:

```javascript
async (req, res, next) => {
  try {
    await service.removeDropdown(req.params.id);
    return res.status(204).send();
  } catch (error) {
    const status = error.status || 400;
    const message = error.message || 'Failed to delete dropdown option';
    return res.status(status).json({ error: message });
  }
}
```


## GET /api/policy-register/:id/items

Source: `src/routes/policyRegisterRoutes.js:30`; izin: policy-register:read.

```javascript
router.get('/:id/items', requirePermission('policy-register', 'read'), controller.listItems)
```

Handler `listItems`:

```javascript
async (req, res) => {
  try {
    return res.json(await service.listItems(req.params.id));
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Failed to load policy details' });
  }
}
```


## POST /api/policy-register/:id/items

Source: `src/routes/policyRegisterRoutes.js:31`; izin: policy-register:create.

```javascript
router.post('/:id/items', requirePageAccess('policy-register', 'create'), controller.createItem)
```

Handler `createItem`:

```javascript
async (req, res) => {
  try {
    return res.status(201).json(await service.createItem(req.params.id, req.body || {}));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Failed to create policy detail' });
  }
}
```


## PUT /api/policy-register/:id/items/:itemId

Source: `src/routes/policyRegisterRoutes.js:32`; izin: policy-register:update.

```javascript
router.put('/:id/items/:itemId', requirePageAccess('policy-register', 'update'), controller.updateItem)
```

Handler `updateItem`:

```javascript
async (req, res) => {
  try {
    return res.json(await service.updateItem(req.params.id, req.params.itemId, req.body || {}));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Failed to update policy detail' });
  }
}
```


## DELETE /api/policy-register/:id/items/:itemId

Source: `src/routes/policyRegisterRoutes.js:33`; izin: policy-register:delete.

```javascript
router.delete('/:id/items/:itemId', requirePageAccess('policy-register', 'delete'), controller.removeItem)
```

Handler `removeItem`:

```javascript
async (req, res) => {
  try {
    return res.json(await service.removeItem(req.params.id, req.params.itemId));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Failed to delete policy detail' });
  }
}
```


## GET /api/policy-register

Source: `src/routes/policyRegisterRoutes.js:36`; izin: policy-register:read.

```javascript
router.get(
  '/',
  (req, res, next) => {
    console.log('[policyRegisterRoutes] GET / - before permission check');
    next();
  },
  requirePermission('policy-register', 'read'),
  (req, res, next) => {
    console.log('[policyRegisterRoutes] GET / - after permission, calling list');
    next();
  },
  controller.list
)
```

Handler `list`:

```javascript
async (req, res, next) => {
  console.log('[policyRegisterController.list] Handler called');
  try {
    const items = await service.list();
    console.log('[policyRegisterController.list] Returning', items.length, 'policies');
    return res.json(items);
  } catch (error) {
    console.error('[policyRegisterController.list] Error:', error.message);
    const status = error.status || 500;
    const message = error.message || 'Failed to load policies';
    return res.status(status).json({ error: message });
  }
}
```


## POST /api/policy-register

Source: `src/routes/policyRegisterRoutes.js:51`; izin: policy-register:create.

```javascript
router.post(
  '/',
  requirePageAccess('policy-register', 'create'),
  controller.upload.single('file'),
  controller.create
)
```

Handler `create`:

```javascript
async (req, res, next) => {
  console.log('[policyRegisterController.create] Handler called');
  try {
    const payload = getPayload(req);

    const selectedPath = payload.attachmentPath || payload.attachment_path;
    if (!req.file && selectedPath) await evidenceAccess.assertReferences([{path:selectedPath}], [], req.user);

    // Attach file metadata jika ada file
    await storeAttachment(req, payload);

    const item = await service.create(payload);
    return res.status(201).json(item);
  } catch (error) {
    console.error('[policyRegisterController.create] Error:', error.message);
    const status = error.status || 400;
    const message = error.message || 'Failed to create policy';
    return res.status(status).json({ error: message });
  }
}
```


## PUT /api/policy-register/:id

Source: `src/routes/policyRegisterRoutes.js:59`; izin: policy-register:update.

```javascript
router.put(
  '/:id',
  requirePageAccess('policy-register', 'update'),
  controller.upload.single('file'),
  controller.update
)
```

Handler `update`:

```javascript
async (req, res, next) => {
  console.log('[policyRegisterController.update] Handler called');
  try {
    const { id } = req.params;
    const payload = getPayload(req);
    const selectedPath = payload.removeAttachment === true ? '' : payload.attachmentPath ?? payload.attachment_path;
    const previous = (await pool.query('SELECT attachment_path FROM policy_register WHERE id=$1', [id])).rows[0]?.attachment_path;
    if (req.file && previous) await evidenceAccess.assertAccess(previous, req.user);
    if (!req.file && selectedPath !== undefined) await evidenceAccess.assertReferences(selectedPath ? [{ path: selectedPath }] : [], previous ? [{ path: previous }] : [], req.user);

    // Attach file metadata jika ada file baru
    await storeAttachment(req, payload);

    const item = await service.update(id, payload);
    return res.json(item);
  } catch (error) {
    console.error('[policyRegisterController.update] Error:', error.message);
    const status = error.status || 400;
    const message = error.message || 'Failed to update policy';
    return res.status(status).json({ error: message });
  }
}
```


## DELETE /api/policy-register/:id

Source: `src/routes/policyRegisterRoutes.js:67`; izin: policy-register:delete.

```javascript
router.delete(
  '/:id',
  requirePageAccess('policy-register', 'delete'),
  controller.remove
)
```

Handler `remove`:

```javascript
async (req, res, next) => {
  console.log('[policyRegisterController.remove] Handler called');
  try {
    const { id } = req.params;
    // The route checks Policy Delete; deleting this reference never modifies its original file.
    await service.remove(id);
    return res.status(204).send();
  } catch (error) {
    console.error('[policyRegisterController.remove] Error:', error.message);
    const status = error.status || 400;
    const message = error.message || 'Failed to delete policy';
    return res.status(status).json({ error: message });
  }
}
```


## GET /api/audit

Source: `src/routes/auditRoutes.js:6`; izin: admin.

```javascript
router.get('/', requireAdmin, async (req, res, next) => {
  try { res.json(await auditService.list(req.query)); } catch (error) { next(error); }
})
```


## POST /api/audit/activity

Source: `src/routes/auditRoutes.js:11`; izin: session; pemeriksaan tambahan di handler/service (lihat source).

```javascript
router.post('/activity', async (req, res) => {
  const { action, module, filename, count, outcome, message, error } = req.body || {};
  if (!['export', 'import', 'report', 'download'].includes(action) || typeof module !== 'string' || module.length > 100 || (filename != null && (typeof filename !== 'string' || filename.length > 255))) return res.status(400).json({ error: 'Aktivitas tidak valid' });
  if (!['initiated', 'success', 'failed'].includes(outcome) || [message, error].some(value => value != null && (typeof value !== 'string' || value.length > 2000))) return res.status(400).json({ error: 'Hasil aktivitas tidak valid' });
  req.auditDetails = { action: `data.${action}`, module, filename, count: Number.isSafeInteger(count) && count >= 0 ? count : undefined, outcome, message, error, source: 'browser-declared' };
  try {
    await auditService.record({ requestId: req.requestId, actorUsername: req.user.username, actorRole: req.user.role,
      eventType: `data.${action}`, method: req.method, path: '/api/audit/activity', statusCode: 204,
      ipAddress: req.ip, userAgent: req.get('user-agent'), details: require('../middleware/audit').sanitize(req.auditDetails) });
    req.auditRecorded = true;
    res.status(204).end();
  } catch (error) {
    console.error('[audit] Transfer persistence failed:', error.message);
    res.status(503).json({ error: 'Audit trail tidak dapat disimpan ke database. Periksa koneksi database atau tabel audit_events.', requestId: req.requestId });
  }
})
```


## GET /api/backups

Source: `src/routes/backupRoutes.js:7`; izin: admin.

```javascript
router.get('/', controller.list)
```

Handler `list`:

```javascript
async function list(req, res) {
  res.json(await backupService.listBackups());
}
```


## POST /api/backups

Source: `src/routes/backupRoutes.js:8`; izin: admin.

```javascript
router.post('/', controller.create)
```

Handler `create`:

```javascript
async function create(req, res) {
  res.status(201).json(await backupService.createBackup());
}
```


## POST /api/backups/restore

Source: `src/routes/backupRoutes.js:9`; izin: admin.

```javascript
router.post('/restore', controller.restoreUpload.single('backup'), controller.restore)
```

Handler `restore`:

```javascript
async function restore(req, res) {
  if (!req.file) return res.status(400).json({ error: 'A .dump or .json backup file is required' });
  try {
    res.json(await backupService.restoreBackup(req.file));
  } catch (error) {
    await fs.promises.rm(req.file.path, { force: true });
    throw error;
  }
}
```


## DELETE /api/backups/:fileName

Source: `src/routes/backupRoutes.js:10`; izin: admin.

```javascript
router.delete('/:fileName', controller.remove)
```

Handler `remove`:

```javascript
async function remove(req, res) {
  await backupService.deleteBackup(req.params.fileName);
  res.status(204).end();
}
```


## GET /api/backups/:fileName

Source: `src/routes/backupRoutes.js:11`; izin: admin.

```javascript
router.get('/:fileName', controller.download)
```

Handler `download`:

```javascript
async function download(req, res) {
  const filePath = await backupService.readBackup(req.params.fileName);
  res.download(filePath, req.params.fileName);
}
```


## GET /api/file-backups

Source: `src/routes/fileBackupRoutes.js:10`; izin: admin.

```javascript
router.get('/', async (req, res) => res.json(await service.list()))
```


## GET /api/file-backups/folders

Source: `src/routes/fileBackupRoutes.js:11`; izin: admin.

```javascript
router.get('/folders', async (req, res) => res.json(await service.folders()))
```


## POST /api/file-backups

Source: `src/routes/fileBackupRoutes.js:12`; izin: admin.

```javascript
router.post('/', async (req, res) => res.status(201).json(await service.create({ folder: req.body?.folder })))
```


## POST /api/file-backups/restore

Source: `src/routes/fileBackupRoutes.js:13`; izin: admin.

```javascript
router.post('/restore', upload.single('backup'), async (req, res) => res.json(await service.restore(req.file, { folder: req.body?.folder })))
```


## GET /api/file-backups/:fileName

Source: `src/routes/fileBackupRoutes.js:14`; izin: admin.

```javascript
router.get('/:fileName', async (req, res) => res.download(await service.resolve(req.params.fileName), req.params.fileName))
```


## DELETE /api/file-backups/:fileName

Source: `src/routes/fileBackupRoutes.js:15`; izin: admin.

```javascript
router.delete('/:fileName', async (req, res) => { await service.remove(req.params.fileName); res.status(204).end(); })
```


## GET /api/health

Source: `src/routes/index.js:25`; izin: session.

```javascript
(req, res) => res.json({ ok: true })
```


## GET /api/health/db

Source: `src/routes/index.js:25`; izin: session.

```javascript
async function database(req, res) {
  try {
    const result = await checkDatabaseConnection();
    res.status(200).json({ status: 'ok', database: 'postgresql', ...result });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'postgresql', connected: false, message: nodeEnv === 'production' ? 'Database connection failed' : error.message });
  }
}
```
