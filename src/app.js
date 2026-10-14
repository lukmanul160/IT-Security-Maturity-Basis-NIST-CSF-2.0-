const express = require('express');
const compression = require('compression');
const path = require('path');
const apiRoutes = require('./routes');
const authRoutes = require('./routes/authRoutes');
const { publicRoot } = require('./config/paths');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');
const { getSession, parseCookies, sessionCookie } = require('./config/auth');
const { auditRequest } = require('./middleware/audit');
const { sessionCookieSecure } = require('./config/env');

const app = express();
app.disable('x-powered-by');
// Compress code/styles and static page HTML; API data, downloads and images retain
// their original response behavior. Keep compression CPU cost moderate.
app.use(compression({
	level: 4,
	filter: (req, res) => (/\.(?:js|css)$/.test(req.path) || ['/', '/index.html', '/login', '/app', '/virtual-office', '/virtual-office/'].includes(req.path)) && compression.filter(req, res),
}));
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

	if (process.env.NODE_ENV === 'production' && sessionCookieSecure) {
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
// Public office exposes display names, roles and module labels, never session tokens.
app.get('/api/public/virtual-office', async (req, res, next) => {
	try { res.set('Cache-Control', 'no-store').json(await require('./services/virtualOfficeService').snapshot()); }
	catch (error) { next(error); }
});
app.post('/api/office-presence', requireAuth, async (req, res, next) => {
	try {
		const key = req.body?.module;
		const service = require('./services/virtualOfficeService');
		if (typeof key !== 'string' || !Object.hasOwn(service.labels, key)) return res.status(400).json({ error: 'Invalid module' });
		if (key !== 'backups' && !(await require('./services/permissionService').has(req.user.role, key, 'read'))) return res.status(403).json({ error: 'Forbidden' });
		if (key === 'backups' && req.user.role !== 'admin') return res.sendStatus(403);
		req.user.officeModule = key;
		res.sendStatus(204);
	} catch (error) { next(error); }
});
app.get(['/virtual-office', '/virtual-office/'], (req, res) => res.sendFile(path.join(publicRoot, 'virtual-office', 'index.html')));
app.use('/virtual-office/assets', express.static(path.join(publicRoot, 'virtual-office', 'assets'), { index: false, fallthrough: false }));
app.get('/api/public/website-settings',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(require('./services/websiteSettingsService').publicSettings(await require('./services/websiteSettingsService').read()));}catch(error){next(error);}});
app.get('/website-assets/:kind',async(req,res,next)=>{try{if(!['logo','favicon'].includes(req.params.kind))return res.sendStatus(404);const data=await require('./services/websiteSettingsService').read();const asset=data[req.params.kind];res.set('Cache-Control','no-cache');if(!asset)return res.sendFile(path.join(publicRoot,'brand-logo.png'));res.type(asset.mime).send(Buffer.from(asset.base64,'base64'));}catch(error){next(error);}});
app.get('/branding.js',(req,res)=>res.sendFile(path.join(publicRoot,'branding.js')));
app.use('/fonts', express.static(path.join(publicRoot,'fonts'), {index:false,fallthrough:false,maxAge:'365d',immutable:true}));
app.get('/brand-logo.jpeg', (req, res) => {
	res.sendFile(path.join(publicRoot, 'brand-logo.jpeg'), error => {
		if (error && !res.headersSent) res.sendStatus(error.statusCode || 500);
	});
});
app.get('/loading-logo.png', (req, res) => res.sendFile(path.join(publicRoot, 'loading-logo.png'), { maxAge: '7d' }));
app.get(['/brand-logo.png', '/favicon.ico'], (req, res) => {
	res.redirect('/website-assets/'+(req.path==='/favicon.ico'?'favicon':'logo'));
});
// Only demonstration screenshots are public. Other workspace files require auth.
app.use('/landing-media', express.static(path.join(publicRoot, 'landing-media'), {
	index: false,
	maxAge: '1d',
	fallthrough: false,
}));
// The login page shares the compiled theme with the authenticated workspace.
app.get('/tailwind.css', (req, res) => res.sendFile(path.join(publicRoot, 'tailwind.css')));
app.get('/theme.js', (req, res) => res.sendFile(path.join(publicRoot, 'theme.js')));
app.get('/theme.css', (req, res) => res.sendFile(path.join(publicRoot, 'theme.css')));
app.get('/i18n.js', (req, res) => res.sendFile(path.join(publicRoot, 'i18n.js')));
app.get('/login', (req, res) => {
	const token = parseCookies(req.headers.cookie)[sessionCookie];
	if (getSession(token)) return res.redirect('/app');

	res.set('Cache-Control', 'no-store');
	return res.sendFile(path.join(publicRoot, 'login.html'));
});

console.error('[app] Mounting /api routes with requireAuth');
app.use('/api', requireAuth, require('./middleware/mutationGuard').createMutationGuard(), require('./middleware/uploadCapacity').createUploadCapacity(), apiRoutes);

app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(publicRoot, 'landing.html')));
app.get('/app', requireAuth, (req, res) => res.sendFile(vueWorkspaceIndex));
// Content-hashed bundles are safe to reuse until the next build. Keep the
// authentication check and private cache scope for workspace resources.
app.use('/vue/assets', requireAuth, express.static(path.join(publicRoot, 'vue', 'assets'), {
	index: false,
	setHeaders: res => res.setHeader('Cache-Control', 'private, max-age=31536000, immutable'),
}));
app.use(requireAuth, express.static(publicRoot, { index: false }));
app.use(requireAuth, (req, res, next) => {
	if (req.path.startsWith('/api/')) return next();
	return res.sendFile(vueWorkspaceIndex);
});
app.use(notFound);
app.use(errorHandler);

module.exports = app;
