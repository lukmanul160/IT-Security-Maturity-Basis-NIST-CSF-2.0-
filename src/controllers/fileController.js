const fileService = require('../services/fileService');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { uploadRoot } = require('../config/paths');

const safeSegment = value => path.basename(String(value || '')).replace(/[^a-zA-Z0-9._ -]/g, '_');
const upload = multer({ storage: multer.diskStorage({
	destination: (req, file, callback) => { const folder = req.body.kind === 'policy' ? 'Policy' : 'Practice'; const destination = path.join(uploadRoot, safeSegment(req.body.functionName), folder); fs.mkdir(destination, { recursive: true }, error => callback(error, destination)); },
		filename: (req, file, callback) => callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeSegment(file.originalname)}`),
}), limits: { fileSize: 100 * 1024 * 1024 } });

async function list(req, res) { res.json(await fileService.listFiles()); }
async function create(req, res) { if (!req.file) return res.status(400).json({ error: 'File is required' }); res.status(201).json(await fileService.saveFile({ functionName: req.body.functionName, kind: req.body.kind, file: req.file })); }
async function create(req, res) { if (!req.file) return res.status(400).json({ error: 'File is required' }); res.status(201).json(await fileService.saveFile({ functionName: req.body.functionName, kind: req.body.kind, file: req.file, rejectDuplicate: req.body.rejectDuplicate === 'true' })); }
async function createBatch(req, res) { if (!req.files?.length) return res.status(400).json({ error: 'At least one file is required' }); res.status(201).json(await fileService.saveFiles({ functionName: req.body.functionName, kind: req.body.kind, files: req.files, rejectDuplicate: req.body.rejectDuplicate === 'true' })); }
const filePath = req => Array.isArray(req.params.path) ? req.params.path.join('/') : req.params.path;
async function download(req, res) { const file = await fileService.readFile(filePath(req)); res.type(file.type).send(file.content); }
async function remove(req, res) { await fileService.deleteFile(filePath(req)); res.status(204).end(); }

module.exports = { list, create, createBatch, download, remove, upload };
