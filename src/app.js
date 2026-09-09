const express = require('express');
const path = require('path');
const apiRoutes = require('./routes');
const authRoutes = require('./routes/authRoutes');
const { publicRoot } = require('./config/paths');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');
const { getSession, parseCookies, sessionCookie } = require('./config/auth');
const { auditRequest } = require('./middleware/audit');

const app = express();
app.disable('x-powered-by');
const vueWorkspaceIndex = path.join(publicRoot, 'vue', 'index.html');

// Log all requests
app.use((req, res, next) => {
	const msg = `[app] ${req.method} ${req.originalUrl}`;
	console.error(msg);
	console.log(msg);
	next();
});

app.use((req, res, next) => {
	res.set({
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
		'Referrer-Policy': 'no-referrer',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	});

	if (process.env.NODE_ENV === 'production') {
		res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	next();
});
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
	const origin = req.get('origin');
	if (!origin) return next();
	try {
		if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Invalid request origin' });
	} catch (error) {
		return res.status(403).json({ error: 'Invalid request origin' });
	}
	return next();
});
app.use('/api/auth', auditRequest, authRoutes);
// The login page shares the compiled theme with the authenticated workspace.
app.get('/tailwind.css', (req, res) => res.sendFile(path.join(publicRoot, 'tailwind.css')));
app.get('/login', (req, res) => {
	const token = parseCookies(req.headers.cookie)[sessionCookie];
	if (getSession(token)) return res.redirect('/');

	res.set('Cache-Control', 'no-store');
	return res.sendFile(path.join(publicRoot, 'login.html'));
});

console.error('[app] Mounting /api routes with requireAuth');
app.use('/api', requireAuth, auditRequest, apiRoutes);

app.get(['/', '/index.html'], requireAuth, (req, res) => res.sendFile(vueWorkspaceIndex));
app.use(requireAuth, express.static(publicRoot, { index: false }));
app.use(requireAuth, (req, res, next) => {
	if (req.path.startsWith('/api/')) return next();
	return res.sendFile(vueWorkspaceIndex);
});
app.use(notFound);
app.use(errorHandler);

module.exports = app;
