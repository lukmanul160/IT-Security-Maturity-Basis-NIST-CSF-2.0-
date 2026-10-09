const fileService = require('../services/fileService');
const evidenceAccess = require('../services/evidenceAccessService');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { uploadRoot } = require('../config/paths');
const { MAX_FILE_SIZE_BYTES } = require('../config/upload');

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
	storage: require('../services/boundedUploadStorage').createBoundedUploadStorage(path.join(uploadRoot, '.incoming')),
	fileFilter: (req, file, callback) => {
		try {
			fileService.validateUploadFile(file.originalname, file.mimetype);
			callback(null, true);
		} catch (error) {
			callback(error);
		}
	},
	limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 20 },
});
const replacementUpload = multer({
	storage: multer.memoryStorage(),
	fileFilter: (req, file, callback) => {
		try {
			if (!filePath(req).startsWith('audit-finding/') && !filePath(req).startsWith('Knowledge Notes/imports/')) fileService.validateUploadFile(file.originalname, file.mimetype);
			callback(null, true);
		} catch (error) {
			callback(error);
		}
	},
	limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

async function list(req, res) { const detailed = req.query.details === 'true'; const files = await (detailed ? evidenceAccess.searchableList(req.user) : evidenceAccess.list(req.user)); res.set('Cache-Control','no-store').json(detailed ? files : files.map(file => file.path)); }
async function create(req, res) {
	if (!req.file) return res.status(400).json({ error: 'File is required' });
	try {
	fileService.validateUploadFile(req.file.originalname, req.file.mimetype);
	fileService.validateUploadMetadata(req.body.functionName, req.body.kind, req.file.originalname);
	const file = await fileService.saveFile({
		uploadedBy: await evidenceAccess.userId(req.user),
		functionName: req.body.functionName,
		kind: req.body.kind,
		file: req.file,
		rejectDuplicate: req.body.rejectDuplicate === 'true',
	});
	res.status(201).json(file);
	} finally {
		await fs.promises.rm(req.file.path, { force: true });
	}
}

async function createBatch(req, res) {
	if (!req.files?.length) return res.status(400).json({ error: 'At least one file is required' });
	try {
	if (req.files.reduce((total, file) => total + file.size, 0) > 200 * 1024 * 1024) {
		await Promise.all(req.files.map(file => fs.promises.rm(file.path, { force: true })));
		return res.status(413).json({ error: 'Upload batch is too large' });
	}

	req.files.forEach(file => fileService.validateUploadMetadata(req.body.functionName, req.body.kind, file.originalname));
	req.files.forEach(file => fileService.validateUploadFile(file.originalname, file.mimetype));
	const files = await fileService.saveFiles({
		uploadedBy: await evidenceAccess.userId(req.user),
		functionName: req.body.functionName,
		kind: req.body.kind,
		files: req.files,
		rejectDuplicate: req.body.rejectDuplicate === 'true',
	});
	res.status(201).json(files);
	} finally {
		await Promise.all(req.files.map(file => fs.promises.rm(file.path, { force: true })));
	}
}
const filePath = req => Array.isArray(req.params.path) ? req.params.path.join('/') : req.params.path;
async function download(req, res) {
	const relativePath = filePath(req);
	await evidenceAccess.assertReadAccess(relativePath, req.user);
	const file = await fileService.readFile(relativePath);
	const extension = path.extname(relativePath).toLowerCase();
	const disposition = inlineFileTypes.has(file.type) || String(file.type || '').startsWith('image/') || ['.pdf', '.doc', '.docx', '.dot', '.dotx', '.docm', '.dotm'].includes(extension)
		? 'inline'
		: 'attachment';
	res.set('Content-Disposition', `${disposition}; filename="${safeSegment(path.basename(relativePath))}"`);
	// Isolate uploaded content, including forged MIME types, from the application origin.
	res.set('Content-Security-Policy', "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'");
	res.type(file.type).send(file.content);
}
async function access(req, res) { res.json({ canModify: await evidenceAccess.canModify(filePath(req), req.user) }); }
async function open(req, res) { await evidenceAccess.assertReadAccess(filePath(req), req.user); const page = await fileService.openPage(filePath(req)); res.redirect(`/api/files/${filePath(req).split('/').map(encodeURIComponent).join('/')}#page=${page}`); }
async function getOpenPage(req, res) { await evidenceAccess.assertReadAccess(filePath(req), req.user); res.json({ openPage: await fileService.openPage(filePath(req)) }); }
async function setOpenPage(req, res) { await evidenceAccess.assertAccess(filePath(req), req.user); res.json({ openPage: await fileService.setOpenPage(filePath(req), req.body?.openPage) }); }
async function replace(req, res) {
	await evidenceAccess.assertAccess(filePath(req), req.user);
	if (!req.file) return res.status(400).json({ error: 'Replacement file is required' });
	res.json(await fileService.replaceFile(filePath(req), req.file));
}
async function remove(req, res) { await evidenceAccess.assertAccess(filePath(req), req.user); await fileService.deleteFile(filePath(req), { library: req.query.library === 'true' }); res.status(204).end(); }

module.exports = { list, create, createBatch, download, access, open, getOpenPage, setOpenPage, replace, remove, upload, replacementUpload };
