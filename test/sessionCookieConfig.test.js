const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function config(env) {
  const context = { module: { exports: {} }, process: { env }, require: () => ({ config() {} }) };
  vm.runInNewContext(fs.readFileSync('src/config/env.js', 'utf8'), context);
  return context.module.exports;
}

test('production cookies stay Secure unless local HTTP is explicitly configured', () => {
  assert.equal(config({ NODE_ENV: 'production' }).sessionCookieSecure, true);
  assert.equal(config({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' }).sessionCookieSecure, false);
  assert.equal(config({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'invalid' }).sessionCookieSecure, true);
  assert.equal(config({ NODE_ENV: 'development' }).sessionCookieSecure, false);
  assert.equal(config({ NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'true' }).sessionCookieSecure, true);
});
