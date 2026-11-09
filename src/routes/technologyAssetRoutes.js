/** Technology Asset permissions are independent of the existing hardware register. */
const router = require('express').Router();
const { requirePermission } = require('../middleware/permission');
const permission = require('../services/permissionService');
const service = require('../services/technologyAssetService');
router.use(requirePermission('technology-asset'));
router.param('id', (req, res, next, id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? next()
    : res.status(400).json({ error: 'ID Technology Asset tidak valid.' }),
);
router.get('/vulnerabilities', async (req, res) =>
  res
    .set('Cache-Control', 'no-store')
    .json(await require('../services/technologyVulnerabilityService').lookup(req.query)),
);
router.get('/', async (req, res) => res.set('Cache-Control', 'no-store').json(await service.list()));
const recent = new Map();
let active = 0;
router.post('/scan', async (req, res) => {
  if (
    !(await permission.has(req.user.role, 'technology-asset', 'create')) &&
    !(await permission.has(req.user.role, 'technology-asset', 'update'))
  )
    return res.status(403).json({ error: 'Access denied for technology-asset scan' });
  if (req.body?.mode !== undefined && !['standard', 'browser'].includes(req.body.mode))
    return res.status(400).json({ error: 'Mode scan tidak valid.' });
  const now = Date.now();
  for (const [user, time] of recent) if (now - time > 60000) recent.delete(user);
  if (active >= 2 || now - (recent.get(req.user.username) || 0) < 10000)
    return res.status(429).json({ error: 'Tunggu 10 detik sebelum scan berikutnya.' });
  recent.set(req.user.username, now);
  active++;
  const streaming = req.get('accept')?.includes('application/x-ndjson');
  let percent = 0;
  const emit = (event) => {
    if (!res.destroyed && !res.writableEnded) {
      res.write(JSON.stringify(event) + '\n');
      res.flush?.();
    }
  };
  if (streaming) {
    res.set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
  }
  const onProgress = (event) => {
    if (event.percent < percent) return;
    percent = Math.max(percent, Math.min(99, event.percent));
    if (streaming) emit({ type: 'progress', percent, stage: event.stage });
  };
  try {
    const engine =
      req.body?.mode === 'browser'
        ? require('../services/technologyBrowserScanService')
        : require('../services/technologyHeaderScanService');
    onProgress({ percent: 2, stage: 'validating' });
    const result = await engine.scan(req.body?.url, { onProgress });
    if (streaming) {
      emit({ type: 'progress', percent: 100, stage: result.partial ? 'partial' : 'complete' });
      emit({ type: 'result', result });
      res.end();
    } else res.set('Cache-Control', 'no-store').json(result);
  } catch (error) {
    const { ScanError } = require('../services/technologyHeaderScanService');
    if (streaming) {
      if (!(error instanceof ScanError)) console.error('[technology scan]', error);
      emit({
        type: 'error',
        status: error instanceof ScanError ? error.status : 500,
        error: error instanceof ScanError ? error.message : 'Internal server error',
        requestId: req.requestId || '',
      });
      res.end();
    } else {
      if (!(error instanceof ScanError)) throw error;
      res
        .status(error.status)
        .set('Cache-Control', 'no-store')
        .json({ error: error.message, requestId: req.requestId || '' });
    }
  } finally {
    active--;
  }
});
router.post('/', requirePermission('technology-asset', 'create'), async (req, res) =>
  res.status(201).json(await service.save(null, req.body)),
);
router.put('/:id', requirePermission('technology-asset', 'update'), async (req, res) =>
  res.json(await service.save(req.params.id, req.body)),
);
router.delete('/:id', requirePermission('technology-asset', 'delete'), async (req, res) => {
  await service.remove(req.params.id, req.body?.version);
  res.status(204).end();
});
module.exports = router;
