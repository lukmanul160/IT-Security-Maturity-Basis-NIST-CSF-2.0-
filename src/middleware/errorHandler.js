const multer = require('multer');

function notFound(req, res) { const requestId = req.requestId || ''; res.status(404).json({ error: 'Route not found', requestId }); }
function errorHandler(error, req, res, next) {
	if (error instanceof multer.MulterError) {
		const tooLarge = error.code === 'LIMIT_FILE_SIZE';
		return res.status(tooLarge ? 413 : 400).json({
			error: tooLarge ? 'Ukuran file melebihi batas upload yang diizinkan.' : 'Upload tidak valid. Periksa jumlah file dan field upload.',
			requestId: req.requestId || '',
		});
	}
	const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
	const requestId = req.requestId || '';
	console.error(`[${requestId}]`, error);
	res.status(status).json({ error: status < 500 ? error.message : 'Internal server error', requestId });
}

module.exports = { notFound, errorHandler };
