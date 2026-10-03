const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const app = require('../src/app');

test('landing screenshots load publicly with caching while workspace remains protected', async t => {
  t.mock.method(require('../src/services/auditService'), 'record', async () => {});
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const landing = await fetch(base);
  assert.equal(landing.status, 200);
  const html = await landing.text();
  assert.ok(Buffer.byteLength(html) < 120000, 'landing HTML should stay below 120 KB');
  assert.ok(!html.includes('data:image/webp;base64,'));
  const images = [...html.matchAll(/src="(\/landing-media\/[^\"]+)"/g)].map(match => match[1]);
  assert.equal(images.length, 12);
  for (const image of images) {
    const response = await fetch(base + image);
    assert.equal(response.status, 200, image);
    assert.match(response.headers.get('content-type'), /image\/webp/);
    assert.match(response.headers.get('cache-control'), /public.*max-age=86400/);
    const actual = Buffer.from(await response.arrayBuffer());
    const expected = await fs.readFile(path.join(__dirname, '../frontend/public', image));
    assert.deepEqual(actual, expected);
    const cached = await fetch(base + image, { headers: { 'If-None-Match': response.headers.get('etag'), 'Cache-Control': 'max-age=0' } });
    assert.equal(cached.status, 304);
  }
  const missing = await fetch(base + '/landing-media/missing.webp');
  assert.equal(missing.status, 404);
  for (const route of ['/app', '/vue/index.html', '/styles.css', '/landing-media/../login.html']) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.status, 302, route);
    assert.equal(response.headers.get('location'), '/login');
  }
  assert.equal((await fetch(base + '/api/auth/me')).status, 401);
});
