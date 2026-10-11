const express = require('express');
const controller = require('../controllers/personnelCertificationController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');
const router = express.Router();
router.get('/', requirePermission('personnel-certification', 'read'), controller.list);
router.get('/organization-personnel', requirePermission('personnel-certification', 'read'), controller.organizationList);
router.post('/organization-personnel', requirePermission('personnel-certification', 'create'), controller.organizationCreate);
router.put('/organization-personnel/:personnelId', requirePermission('personnel-certification', 'update'), controller.organizationUpdate);
router.delete('/organization-personnel/:personnelId', requirePermission('personnel-certification', 'delete'), controller.organizationDelete);
// Employee records and certificates share the configured personnel feature actions.
const certificateUpload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize:5*1024*1024, files:1, fields:2, fieldSize:50000 } }).single('certificate');
router.get('/:id/certificate', requirePermission('personnel-certification','read'), (req,res,next)=>require('../services/personnelCertificateFileService').read(req.params.id).then(file=>res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`${req.query.download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`}).type(file.type).send(file.content)).catch(next));
router.post('/', requirePageAccess('personnel-certification', 'create'), certificateUpload, controller.create);
router.put('/:id/layout', requirePageAccess('personnel-certification', 'update'), controller.updateLayout);
router.put('/:id', requirePageAccess('personnel-certification', 'update'), certificateUpload, controller.update);
router.delete('/:id', requirePageAccess('personnel-certification', 'delete'), controller.remove);
module.exports = router;
