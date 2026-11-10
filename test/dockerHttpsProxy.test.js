const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const http = require('node:http');
const { createRequestOriginGuard } = require('../src/middleware/requestOrigin');

function post(url, headers) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'POST', headers }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
    request.end();
  });
}

// Execute the real bootstrap before route mounting, without loading services/DB.
function bootstrap(env) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const prefix = source.slice(0, source.indexOf('// Compress code/styles'));
  return vm.runInNewContext(`${prefix}\napp;`, {
    require: name => name === 'express' ? express : {},
    process: { env },
  });
}

test('Docker single-hop proxy preserves HTTPS origin and isolates spoofed forwarded IPs', async t => {
  const app = bootstrap({ TRUST_PROXY_HOPS: '1' });
  app.use(createRequestOriginGuard({ secure: true }));
  app.post('/fixture', (req, res) => res.json({ ip: req.ip, protocol: req.protocol }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/fixture`;
  for (const host of ['192.168.130.12', 'nist.example.com']) {
    const headers = { host, origin: `https://${host}`, 'x-forwarded-proto': 'https',
      'x-forwarded-for': '198.51.100.99, 192.0.2.10' };
    const response = await post(url, headers);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { ip: '192.0.2.10', protocol: 'https' });
    const rejected = await post(url, { ...headers, origin: 'https://evil.example' });
    assert.equal(rejected.status, 403);
  }
});

test('direct/manual deployment does not trust forwarded headers by default', () => {
  assert.equal(bootstrap({}).get('trust proxy'), false);
  assert.equal(bootstrap({ TRUST_PROXY_HOPS: 'invalid' }).get('trust proxy'), false);
});
