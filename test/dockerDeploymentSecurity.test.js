const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const compose = fs.readFileSync('compose.yaml', 'utf8');
const nginx = fs.readFileSync('deploy/nginx/templates/default.conf.template', 'utf8');

function serviceBlock(name, nextName) {
  const start = compose.indexOf(`  ${name}:`);
  const end = nextName ? compose.indexOf(`  ${nextName}:`, start + 1) : compose.indexOf('\nvolumes:', start);
  assert.notEqual(start, -1, `${name} service exists`);
  assert.notEqual(end, -1, `${name} service has a boundary`);
  return compose.slice(start, end);
}

test('Docker services bound process growth, log growth and privilege escalation', () => {
  const services = [
    serviceBlock('nginx', 'app'),
    serviceBlock('app', 'redis'),
    serviceBlock('redis', 'db'),
    serviceBlock('db'),
  ];
  assert.match(compose, /max-size: "10m"[\s\S]*max-file: "5"/);
  for (const service of services) {
    assert.match(service, /security_opt:\s*\n\s+- no-new-privileges:true/);
    assert.match(service, /pids_limit: \d+/);
    assert.match(service, /logging: \*default-logging/);
  }
  assert.match(services[1], /cap_drop:\s*\n\s+- ALL/);
});

test('database and cache stay on internal networks without published ports', () => {
  const redis = serviceBlock('redis', 'db');
  const database = serviceBlock('db');
  assert.doesNotMatch(redis, /\n\s+ports:/);
  assert.doesNotMatch(database, /\n\s+ports:/);
  assert.match(compose, /database:\s*\n\s+internal: true/);
  assert.match(compose, /cache:\s*\n\s+internal: true/);
});

test('Nginx rejects unexpected hosts and limits TLS metadata exposure', () => {
  assert.equal((nginx.match(/if \(\$host != "\$\{BLACKOWL_ADDRESS\}"\) \{ return 421; \}/g) || []).length, 2);
  assert.match(nginx, /server_tokens off;/);
  assert.match(nginx, /ssl_session_tickets off;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/);
});
