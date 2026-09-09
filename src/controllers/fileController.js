const fileService = require('../services/fileService');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { uploadRoot } = require('../config/paths');

const safeSegment = value => path.basename(String(value || '')).replace(/[^a-zA-Z0-9._ -]/g, '_');
const inlineFileTypes = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-word',
	'application/vnd.ms-word.document.macroenabled.12',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
]);
const upload = multer({
	storage: multer.diskStorage({
		destination: (req, file, callback) => {
			const folder = req.body.kind === 'policy' ? 'Policy' : 'Practice';
			const destination = path.join(uploadRoot, safeSegment(req.body.functionName), folder);
			fs.mkdir(destination, { recursive: true }, error => callback(error, destination));
		},
		filename: (req, file, callback) => {
			const uniqueName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}-${safeSegment(file.originalname)}`;
			callback(null, uniqueName);
		},
	}),
	fileFilter: (req, file, callback) => {
		try {
			fileService.validateUploadFile(file.originalname, file.mimetype);
			callback(null, true);
		} catch (error) {
			callback(error);
		}
	},
	limits: { fileSize: 50 * 1024 * 1024, files: 20 },
});
const replacementUpload = multer({
	storage: multer.memoryStorage(),
	fileFilter: (req, file, callback) => {
		try {
			fileService.validateUploadFile(file.originalname, file.mimetype);
			callback(null, true);
		} catch (error) {
			callback(error);
		}
	},
	limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

async function list(req, res) { res.json(await fileService.listFiles()); }
async function create(req, res) {
	if (!req.file) return res.status(400).json({ error: 'File is required' });

	fileService.validateUploadFile(req.file.originalname, req.file.mimetype);
	fileService.validateUploadMetadata(req.body.functionName, req.body.kind, req.file.originalname);
	const file = await fileService.saveFile({
		functionName: req.body.functionName,
		kind: req.body.kind,
		file: req.file,
		rejectDuplicate: req.body.rejectDuplicate === 'true',
	});
	res.status(201).json(file);
}

async function createBatch(req, res) {
	if (!req.files?.length) return res.status(400).json({ error: 'At least one file is required' });
	if (req.files.reduce((total, file) => total + file.size, 0) > 200 * 1024 * 1024) {
		await Promise.all(req.files.map(file => fs.promises.rm(file.path, { force: true })));
		return res.status(413).json({ error: 'Upload batch is too large' });
	}

	req.files.forEach(file => fileService.validateUploadMetadata(req.body.functionName, req.body.kind, file.originalname));
	req.files.forEach(file => fileService.validateUploadFile(file.originalname, file.mimetype));
	const files = await fileService.saveFiles({
		functionName: req.body.functionName,
		kind: req.body.kind,
		files: req.files,
		rejectDuplicate: req.body.rejectDuplicate === 'true',
	});
	res.status(201).json(files);
}
const filePath = req => Array.isArray(req.params.path) ? req.params.path.join('/') : req.params.path;
async function download(req, res) {
	const relativePath = filePath(req);
	const file = await fileService.readFile(relativePath);
	const extension = path.extname(relativePath).toLowerCase();
	const disposition = inlineFileTypes.has(file.type) || ['.pdf', '.doc', '.docx', '.dot', '.dotx', '.docm', '.dotm'].includes(extension)
		? 'inline'
		: 'attachment';
	res.set('Content-Disposition', `${disposition}; filename="${safeSegment(path.basename(relativePath))}"`);
	res.type(file.type).send(file.content);
}
async function replace(req, res) {
	if (!req.file) return res.status(400).json({ error: 'Replacement file is required' });
	res.json(await fileService.replaceFile(filePath(req), req.file));
}
async function remove(req, res) { await fileService.deleteFile(filePath(req)); res.status(204).end(); }

module.exports = { list, create, createBatch, download, replace, remove, upload, replacementUpload };
