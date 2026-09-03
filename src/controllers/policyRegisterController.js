const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const service = require('../services/policyRegisterService');
const { uploadRoot } = require('../config/paths');

console.log('[policyRegisterController] Module loaded');

// Sanitize filename untuk keamanan
const sanitizeFilename = (filename) => {
  return path.basename(String(filename || '')).replace(/[^a-zA-Z0-9._ -]/g, '_');
};

// Configure Multer untuk file upload
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(uploadRoot, 'policy-register');
      fs.mkdir(uploadDir, { recursive: true }, (err) => {
        if (err) return cb(err);
        cb(null, uploadDir);
      });
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const random = crypto.randomBytes(8).toString('hex');
      const safe = sanitizeFilename(file.originalname);
      const filename = `${timestamp}-${random}-${safe}`;
      cb(null, filename);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

// Extract payload dari request body (support FormData dan JSON)
const getPayload = (req) => {
  if (req.body?.data && typeof req.body.data === 'string') {
    try {
      return JSON.parse(req.body.data);
    } catch {
      return req.body;
    }
  }
  return req.body || {};
};

// Handler: List all policy dropdowns
const listDropdowns = async (req, res, next) => {
  try {
    const items = await service.listDropdowns();
    return res.json(items);
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'Failed to load dropdown options';
    return res.status(status).json({ error: message });
  }
};

const createDropdown = async (req, res, next) => {
  try {
    const item = await service.createDropdown(req.body || {});
    return res.status(201).json(item);
  } catch (error) {
    const status = error.status || 400;
    const message = error.message || 'Failed to create dropdown option';
    return res.status(status).json({ error: message });
  }
};

const updateDropdown = async (req, res, next) => {
  try {
    const item = await service.updateDropdown(req.params.id, req.body || {});
    return res.json(item);
  } catch (error) {
    const status = error.status || 400;
    const message = error.message || 'Failed to update dropdown option';
    return res.status(status).json({ error: message });
  }
};

const removeDropdown = async (req, res, next) => {
  try {
    await service.removeDropdown(req.params.id);
    return res.status(204).send();
  } catch (error) {
    const status = error.status || 400;
    const message = error.message || 'Failed to delete dropdown option';
    return res.status(status).json({ error: message });
  }
};

const listItems = async (req, res) => {
  try {
    return res.json(await service.listItems(req.params.id));
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Failed to load policy details' });
  }
};

const createItem = async (req, res) => {
  try {
    return res.status(201).json(await service.createItem(req.params.id, req.body || {}));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Failed to create policy detail' });
  }
};

const updateItem = async (req, res) => {
  try {
    return res.json(await service.updateItem(req.params.id, req.params.itemId, req.body || {}));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Failed to update policy detail' });
  }
};

const removeItem = async (req, res) => {
  try {
    return res.json(await service.removeItem(req.params.id, req.params.itemId));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Failed to delete policy detail' });
  }
};

// Handler: List all policies
const list = async (req, res, next) => {
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
};

// Handler: Create new policy
const create = async (req, res, next) => {
  console.log('[policyRegisterController.create] Handler called');
  try {
    const payload = getPayload(req);

    // Attach file metadata jika ada file
    if (req.file) {
      payload.attachmentName = req.file.originalname;
      payload.attachmentPath = `policy-register/${req.file.filename}`;
      payload.attachmentType = req.file.mimetype || 'application/octet-stream';
    }

    const item = await service.create(payload);
    return res.status(201).json(item);
  } catch (error) {
    console.error('[policyRegisterController.create] Error:', error.message);
    const status = error.status || 400;
    const message = error.message || 'Failed to create policy';
    return res.status(status).json({ error: message });
  }
};

// Handler: Update existing policy
const update = async (req, res, next) => {
  console.log('[policyRegisterController.update] Handler called');
  try {
    const { id } = req.params;
    const payload = getPayload(req);

    // Attach file metadata jika ada file baru
    if (req.file) {
      payload.attachmentName = req.file.originalname;
      payload.attachmentPath = `policy-register/${req.file.filename}`;
      payload.attachmentType = req.file.mimetype || 'application/octet-stream';
    }

    const item = await service.update(id, payload);
    return res.json(item);
  } catch (error) {
    console.error('[policyRegisterController.update] Error:', error.message);
    const status = error.status || 400;
    const message = error.message || 'Failed to update policy';
    return res.status(status).json({ error: message });
  }
};

// Handler: Delete policy
const remove = async (req, res, next) => {
  console.log('[policyRegisterController.remove] Handler called');
  try {
    const { id } = req.params;
    await service.remove(id);
    return res.status(204).send();
  } catch (error) {
    console.error('[policyRegisterController.remove] Error:', error.message);
    const status = error.status || 400;
    const message = error.message || 'Failed to delete policy';
    return res.status(status).json({ error: message });
  }
};

// Export handlers
module.exports = {
  upload,
  listDropdowns,
  createDropdown,
  updateDropdown,
  removeDropdown,
  listItems,
  createItem,
  updateItem,
  removeItem,
  list,
  create,
  update,
  remove,
};
