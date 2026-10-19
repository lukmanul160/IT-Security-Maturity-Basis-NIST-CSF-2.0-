const backupService = require('../services/backupService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const restoreUpload = multer({
  dest: path.join(os.tmpdir(), 'nist-basis-restore'),
  // Stream database dumps directly to disk; website import limits do not apply.
  limits: { files: 1, fields: 0, parts: 1 },
  fileFilter: (req, file, callback) => callback(null, ['.dump', '.json'].includes(path.extname(file.originalname).toLowerCase())),
});

const batchUpload = multer({
  dest: path.join(os.tmpdir(), 'nist-basis-restore'),
  fileFilter: (req, file, callback) => callback(null, /^nist-basis-\d{8}T\d{6}Z-[a-f0-9-]{36}(?:\.manifest\.json|\.dump\.part-\d+)$/.test(file.originalname)),
});
async function restoreBatch(req, res) { res.json(await backupService.restoreBackupParts(req.files)); }

async function list(req, res) {
  res.json(await backupService.listBackups());
}

async function create(req, res) {
  res.status(201).json(await backupService.createBackup({ partSizeMb: req.body?.partSizeMb ?? 500 }));
}

async function download(req, res) {
  const filePath = await backupService.readBackup(req.params.fileName);
  res.download(filePath, req.params.fileName);
}

async function remove(req, res) {
  await backupService.deleteBackup(req.params.fileName);
  res.status(204).end();
}

async function restore(req, res) {
  if (!req.file) return res.status(400).json({ error: 'A .dump or .json backup file is required' });
  try {
    res.json(await backupService.restoreBackup(req.file));
  } catch (error) {
    await fs.promises.rm(req.file.path, { force: true });
    throw error;
  }
}

module.exports = { batchUpload, restoreBatch, list, create, download, remove, restore, restoreUpload };