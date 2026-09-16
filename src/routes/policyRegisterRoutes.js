const express = require('express');
const controller = require('../controllers/policyRegisterController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');

console.log('[policyRegisterRoutes] Loading routes');

const router = express.Router();
const reminders = require('../services/policyReminderService');
const adminOnly = (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Pengaturan reminder hanya dapat diakses admin.' });
const reminderHandler = action => async (req, res, next) => {
  try { res.json(await action(req)); } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Pengaturan reminder belum dapat diproses.' });
  }
};
router.get('/reminder-settings', adminOnly, reminderHandler(() => reminders.getSettings()));
router.put('/reminder-settings', adminOnly, reminderHandler(req => reminders.saveSettings(req.body)));
router.post('/reminder-settings/test', adminOnly, reminderHandler(req => reminders.testEmail(req.body?.to)));

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
