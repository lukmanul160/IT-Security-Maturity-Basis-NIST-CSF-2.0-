function notFound(req, res) { const requestId = req.requestId || ''; res.status(404).json({ error: 'Route not found', requestId }); }
function errorHandler(error, req, res, next) {
	const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
	const requestId = req.requestId || '';
	console.error(`[${requestId}]`, error);
	res.status(status).json({ error: status < 500 ? error.message : 'Internal server error', requestId });
}

module.exports = { notFound, errorHandler };
