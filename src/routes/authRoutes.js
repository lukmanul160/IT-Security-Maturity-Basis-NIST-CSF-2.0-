const express = require('express');
const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();
const { createLoginRateLimit } = require('../middleware/loginRateLimit');
const passwordAccountLimit = createLoginRateLimit({ limit: 10, key: req => req.user.username });
const passwordIpLimit = createLoginRateLimit({ limit: 30 });
function limitPasswordVerification(req, res, next) {
  if (req.path === '/me' && !['currentPassword', 'newPassword', 'confirmPassword'].some(field => req.body?.[field] !== undefined)) return next();
  passwordIpLimit(req, res, () => passwordAccountLimit(req, res, next));
}
router.post('/login', require('../middleware/loginRateLimit').createLoginRateLimit(), controller.login);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.currentUser);
router.put('/me', requireAuth, limitPasswordVerification, controller.updateProfile);
router.put('/me/password', requireAuth, limitPasswordVerification, controller.updatePassword);
router.get('/users', requireAuth, requireAdmin, controller.listUsers);
router.post('/users', requireAuth, requireAdmin, controller.createUser);
router.put('/users/:id', requireAuth, requireAdmin, controller.updateUser);
router.delete('/users/:id', requireAuth, requireAdmin, controller.deleteUser);
router.get('/permissions', requireAuth, requireAdmin, controller.listPermissions);
router.put('/permissions/:role', requireAuth, requireAdmin, controller.updatePermissions);

module.exports = router;
