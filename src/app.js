const express = require('express');
const path = require('path');
const apiRoutes = require('./routes');
const authRoutes = require('./routes/authRoutes');
const { publicRoot } = require('./config/paths');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100mb' }));
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, apiRoutes);
app.get('/login', (req, res) => res.sendFile(path.join(publicRoot, 'login.html')));
app.use(requireAuth, express.static(publicRoot));
app.use(requireAuth, (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(publicRoot, 'index.html')));
app.use(notFound);
app.use(errorHandler);

module.exports = app;