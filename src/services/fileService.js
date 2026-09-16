const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');
const { uploadRoot } = require('../config/paths');
const storage = require('./storageService');

const safeSegment = value => path.basename(String(value || '')).replace(/[^a-zA-Z0-9._ -]/g, '_');
const allowedUploadMimeTypes = {
	'.pdf': new Set(['application/pdf']),
	'.doc': new Set(['application/msword']),
	'.docx': new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
	'.ppt': new Set(['application/vnd.ms-powerpoint']),
	'.pptx': new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation']),
};
const normalizePath = relativePath => {
	const normalized = path.posix
		.normalize(String(relativePath || '').replaceAll('\\', '/'))
		.replace(/^\.?\//, '');

	if (
		!normalized ||
		normalized === '.' ||
		normalized === '..' ||
		normalized.startsWith('../') ||
		path.posix.isAbsolute(normalized) ||
		/^[A-Za-z]:\//.test(normalized)
	) {
		const error = new Error('Invalid file path');
		error.status = 400;
		throw error;
	}

	return normalized;
};

const storagePath = relativePath => storage.normalizePath(normalizePath(relativePath));
function validateUploadMetadata(functionName, kind, fileName) {
	const validFunction = typeof functionName === 'string' && functionName.length >= 1 && functionName.length <= 100;
	const validKind = ['policy', 'practice'].includes(kind);
	const validFileName = typeof fileName === 'string' && fileName.length >= 1 && fileName.length <= 255;

	if (validFunction && validKind && validFileName) return;

	const error = new Error('Invalid upload metadata');
	error.status = 400;
	throw error;
}
function validateUploadFile(fileName, mimeType) {
	const extension = path.extname(String(fileName || '')).toLowerCase();
	const allowedMimeTypes = allowedUploadMimeTypes[extension];
	if (!allowedMimeTypes || !allowedMimeTypes.has(String(mimeType || '').toLowerCase())) {
		const error = new Error('Only PDF, Word, and PowerPoint files are allowed');
		error.status = 400;
		throw error;
	}
}
async function ensureUploadRoot() { await fs.mkdir(uploadRoot, { recursive: true }); }
async function listFiles() { const result = await pool.query('SELECT path FROM evidence_files ORDER BY name'); return result.rows.map(row => `upload/${row.path}`); }
async function saveFile({ functionName, kind, file, rejectDuplicate = false }) {
	const safeFunction = safeSegment(functionName);
	const safeName = safeSegment(file?.originalname);
	const folder = kind === 'policy' ? 'Policy' : 'Practice';

	if (!safeFunction || !safeName || !file?.path) {
		const error = new Error('Invalid multipart file payload');
		error.status = 400;
		throw error;
	}

	const existing = await pool.query(
		'SELECT path, name, octet_length(content) AS size, mime_type, updated_at FROM evidence_files WHERE name = $1 ORDER BY updated_at DESC LIMIT 1',
		[safeName]
	);

	if (existing.rowCount) {
		await fs.rm(file.path, { force: true });
		if (rejectDuplicate) {
			const error = new Error(`File name already exists: ${safeName}`);
			error.status = 409;
			throw error;
		}

		return {
			...existing.rows[0],
			path: `upload/${existing.rows[0].path}`,
			size: Number(existing.rows[0].size || file.size),
			type: existing.rows[0].mime_type,
			updatedAt: existing.rows[0].updated_at,
		};
	}

	const relativePath = path.posix.join(safeFunction, folder, safeName);
	try {
		await storage.put(relativePath, { sourcePath: file.path, name: safeName, mimeType: file.mimetype || 'application/octet-stream' });
	} finally { await fs.rm(file.path, { force: true }); }

	return {
		name: safeName,
		path: `upload/${relativePath}`,
		size: file.size,
		type: file.mimetype || 'application/octet-stream',
		updatedAt: new Date().toISOString(),
	};
}
async function saveFiles({ functionName, kind, files, rejectDuplicate = false }) { const names = files.map(file => safeSegment(file.originalname)); const uniqueNames = new Set(names); if (uniqueNames.size !== names.length) { await Promise.all(files.map(file => fs.rm(file.path, { force: true }))); const error = new Error('Duplicate filenames in upload batch'); error.status = 409; throw error; } const existing = await pool.query('SELECT name FROM evidence_files WHERE name = ANY($1)', [names]); if (existing.rowCount && rejectDuplicate) { await Promise.all(files.map(file => fs.rm(file.path, { force: true }))); const error = new Error(`File name already exists: ${existing.rows[0].name}`); error.status = 409; throw error; } try { return await Promise.all(files.map(file => saveFile({ functionName, kind, file, rejectDuplicate }))); } catch (error) { await Promise.all(files.map(file => fs.rm(file.path, { force: true }))); throw error; } }
async function readFile(relativePath) {
	const normalized = storagePath(relativePath);
	const result = await pool.query('SELECT content, mime_type FROM evidence_files WHERE path = $1', [normalized]);
	let content;
	try { content = await storage.read(normalized); }
	catch (error) {
		if (error.code !== 'ENOENT' || !result.rows[0]?.content) throw error;
		content = result.rows[0].content;
	}
	return { content, type: result.rows[0]?.mime_type || 'application/octet-stream' };
}
async function replaceFile(relativePath, file) {
	const normalized = storagePath(relativePath);
	if (!file?.buffer) {
		const error = new Error('Replacement file is required');
		error.status = 400;
		throw error;
	}

	validateUploadFile(file.originalname, file.mimetype);
	const currentExtension = path.extname(normalized).toLowerCase();
	const replacementExtension = path.extname(file.originalname).toLowerCase();
	if (currentExtension !== replacementExtension) {
		const error = new Error(`Replacement file must use the same ${currentExtension || 'file'} format`);
		error.status = 400;
		throw error;
	}

	const existsOnDisk = await storage.exists(normalized);
	const stored = await pool.query('SELECT path, name FROM evidence_files WHERE path = $1', [normalized]);
	if (!existsOnDisk && !stored.rowCount) {
		const error = new Error('File not found');
		error.status = 404;
		throw error;
	}

	const name = stored.rows[0]?.name || path.basename(normalized);
	await storage.put(normalized, { buffer: file.buffer, name, mimeType: file.mimetype }, { replace: true });

	return {
		name,
		path: `upload/${normalized}`,
		size: file.size,
		type: file.mimetype,
		updatedAt: new Date().toISOString(),
	};
}
async function referenceCounts(relativePath) {
	const normalized = storagePath(relativePath);
	const result = await pool.query(`SELECT
	  (SELECT COUNT(*)::int FROM assessment_state,
	    LATERAL jsonb_each(CASE WHEN jsonb_typeof(data->'attachments') = 'object' THEN data->'attachments' ELSE '{}'::jsonb END) AS attachment(key,value),
	    LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(attachment.value) = 'array' THEN attachment.value ELSE '[]'::jsonb END) AS item
	    WHERE item->>'path' = ANY($1::text[])) AS assessment,
	  (SELECT COUNT(*)::int FROM controls,
	    LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(evidence) = 'array' THEN evidence ELSE '[]'::jsonb END) AS item
	    WHERE item->>'path' = ANY($1::text[])) AS controls,
	  (SELECT COUNT(*)::int FROM policy_register WHERE attachment_path = ANY($1::text[])) AS policies`, [[normalized, `upload/${normalized}`, `uploads/${normalized}`]]);
	return result.rows[0];
}
async function deleteFile(relativePath) {
	const normalized = storagePath(relativePath);
	const counts = await referenceCounts(normalized);
	// The assessment UI removes its own reference after this request succeeds.
	if (counts.assessment > 1 || counts.controls > 0 || counts.policies > 0) return;
	await storage.remove(normalized);
	await pool.query('DELETE FROM evidence_files WHERE path = $1', [normalized]);
}
async function removeUnreferencedFile(relativePath) {
	const normalized = storagePath(relativePath);
	const counts = await referenceCounts(normalized);
	if (counts.assessment > 0 || counts.controls > 0 || counts.policies > 0) return;
	await storage.remove(normalized);
	await pool.query('DELETE FROM evidence_files WHERE path = $1', [normalized]);
}
async function resetFiles() {
	const result = await pool.query('SELECT path FROM evidence_files');
	for (const row of result.rows) await removeUnreferencedFile(row.path);
}

async function resetFilesForAssessment(assessmentId) {
	const state = await pool.query('SELECT data FROM assessment_state WHERE id = $1', [assessmentId]);
	const paths = new Set();
	for (const attachments of Object.values(state.rows[0]?.data?.attachments || {})) {
		for (const attachment of Array.isArray(attachments) ? attachments : []) {
			if (typeof attachment.path === 'string') paths.add(attachment.path.replace(/^upload\//, ''));
		}
	}
	await pool.query('DELETE FROM assessment_state WHERE id = $1', [assessmentId]);
	for (const relativePath of paths) {
		await removeUnreferencedFile(relativePath);
	}
}

module.exports = { ensureUploadRoot, listFiles, saveFile, saveFiles, readFile, replaceFile, deleteFile, removeUnreferencedFile, resetFiles, resetFilesForAssessment, validateUploadMetadata, validateUploadFile };
