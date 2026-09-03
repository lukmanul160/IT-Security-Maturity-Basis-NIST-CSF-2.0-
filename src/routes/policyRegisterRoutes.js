const express = require('express');
const controller = require('../controllers/policyRegisterController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');

console.log('[policyRegisterRoutes] Loading routes');

const router = express.Router();

// Log all requests to this router
router.use((req, res, next) => {
  console.log(`[policyRegisterRoutes] ${req.method} ${req.path}`);
  next();
});

router.get('/dropdowns', requirePermission('policy-register', 'read'), controller.listDropdowns);
router.post('/dropdowns', requirePageAccess('policy-register', 'create'), controller.createDropdown);
router.put('/dropdowns/:id', requirePageAccess('policy-register', 'update'), controller.updateDropdown);
router.delete('/dropdowns/:id', requirePageAccess('policy-register', 'delete'), controller.removeDropdown);

router.get('/:id/items', requirePermission('policy-register', 'read'), controller.listItems);
router.post('/:id/items', requirePageAccess('policy-register', 'create'), controller.createItem);
router.put('/:id/items/:itemId', requirePageAccess('policy-register', 'update'), controller.updateItem);
router.delete('/:id/items/:itemId', requirePageAccess('policy-register', 'delete'), controller.removeItem);

// GET /api/policy-register - List all policies
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
);

// POST /api/policy-register - Create new policy
router.post(
  '/',
  requirePageAccess('policy-register', 'create'),
  controller.upload.single('file'),
  controller.create
);

// PUT /api/policy-register/:id - Update policy
router.put(
  '/:id',
  requirePageAccess('policy-register', 'update'),
  controller.upload.single('file'),
  controller.update
);

// DELETE /api/policy-register/:id - Delete policy
router.delete(
  '/:id',
  requirePageAccess('policy-register', 'delete'),
  controller.remove
);

console.log('[policyRegisterRoutes] Routes configured successfully');

module.exports = router;
