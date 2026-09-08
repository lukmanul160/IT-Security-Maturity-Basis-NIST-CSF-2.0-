const backupService = require('../services/backupService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const restoreUpload = multer({
  dest: path.join(os.tmpdir(), 'nist-basis-restore'),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, ['.dump', '.json'].includes(path.extname(file.originalname).toLowerCase())),
});

async function list(req, res) {
  res.json(await backupService.listBackups());
}

async function create(req, res) {
  res.status(201).json(await backupService.createBackup());
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

module.exports = { list, create, download, remove, restore, restoreUpload };