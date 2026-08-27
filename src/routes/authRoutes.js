const express = require('express');
const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();
router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.currentUser);
router.put('/me', requireAuth, controller.updateProfile);
router.put('/me/password', requireAuth, controller.updatePassword);
router.get('/users', requireAuth, requireAdmin, controller.listUsers);
router.post('/users', requireAuth, requireAdmin, controller.createUser);
router.put('/users/:id', requireAuth, requireAdmin, controller.updateUser);
router.delete('/users/:id', requireAuth, requireAdmin, controller.deleteUser);
router.get('/permissions', requireAuth, requireAdmin, controller.listPermissions);
router.put('/permissions/:role', requireAuth, requireAdmin, controller.updatePermissions);

module.exports = router;
