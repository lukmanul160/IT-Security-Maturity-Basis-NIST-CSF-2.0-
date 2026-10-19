const test = require('node:test'), assert = require('node:assert/strict');
const { createLimit } = require('../src/middleware/statementRateLimit');
test('audit logs redact signature strokes and signature images',()=>{
  const sanitized=require('../src/middleware/audit').sanitize({signature:[[[0,0],[1,1]]],signatureImage:'data:image/png;base64,secret'});
  assert.equal(sanitized.signature,'[redacted]');assert.equal(sanitized.signatureImage,'[redacted]');
});
test('statement request limit applies across IPs for the same employee and isolates employees', () => {
  const limit = createLimit({ limit: 2, key: req => req.employee.nip });
  let accepted = 0, status, retry;
  const res = { status(value) { status = value; return this; }, set(_key, value) { retry = value; return this; }, json() {} };
  for (const ip of ['a', 'b', 'c']) limit({ ip, employee: { nip: '123' } }, res, () => accepted++);
  assert.equal(accepted, 2); assert.equal(status, 429); assert.ok(Number(retry) > 0);
  limit({ ip: 'c', employee: { nip: '456' } }, res, () => accepted++); assert.equal(accepted, 3);
});
