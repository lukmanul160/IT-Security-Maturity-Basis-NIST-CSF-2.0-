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

// Enable request tracing only when troubleshooting; avoid duplicate console I/O.
app.use((req, res, next) => {
	if (process.env.LOG_HTTP_REQUESTS === 'true') {
		console.log(`[app] ${req.method} ${req.originalUrl}`);
	}
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
app.use('/api', auditRequest);
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
app.use('/api/auth', authRoutes);
app.get(['/brand-logo.jpeg', '/favicon.ico'], (req, res) => {
	res.sendFile(path.join(publicRoot, 'brand-logo.jpeg'), error => {
		if (error && !res.headersSent) res.sendStatus(error.statusCode || 500);
	});
});
// Only demonstration screenshots are public. Other workspace files require auth.
app.use('/landing-media', express.static(path.join(publicRoot, 'landing-media'), {
	index: false,
	maxAge: '1d',
	fallthrough: false,
}));
// The login page shares the compiled theme with the authenticated workspace.
app.get('/tailwind.css', (req, res) => res.sendFile(path.join(publicRoot, 'tailwind.css')));
app.get('/i18n.js', (req, res) => res.sendFile(path.join(publicRoot, 'i18n.js')));
app.get('/login', (req, res) => {
	const token = parseCookies(req.headers.cookie)[sessionCookie];
	if (getSession(token)) return res.redirect('/app');

	res.set('Cache-Control', 'no-store');
	return res.sendFile(path.join(publicRoot, 'login.html'));
});

console.error('[app] Mounting /api routes with requireAuth');
app.use('/api', requireAuth, require('./middleware/uploadCapacity').createUploadCapacity(), apiRoutes);

app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(publicRoot, 'landing.html')));
app.get('/app', requireAuth, (req, res) => res.sendFile(vueWorkspaceIndex));
app.use(requireAuth, express.static(publicRoot, { index: false }));
app.use(requireAuth, (req, res, next) => {
	if (req.path.startsWith('/api/')) return next();
	return res.sendFile(vueWorkspaceIndex);
});
app.use(notFound);
app.use(errorHandler);

module.exports = app;
