const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function load(name, overrides = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/services/' + name), 'utf8'), {
    module, exports: module.exports, require: key => Object.hasOwn(overrides, key) ? overrides[key] : require(key), ...globals
  });
  return module.exports;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('scheduler retries connection failure, avoids overlap, resumes hourly and redacts secrets', async () => {
  let now = 0, tick, count = 0, finish;
  const logs = [];
  const service = load('reminderScheduler', {}, {
    Date: { now: () => now }, console: { error: value => logs.push(value) },
    setInterval(fn, ms) { tick = fn; assert.equal(ms, 300000); return { unref() {} }; }
  });
  service.startReminderScheduler(async () => {
    count++;
    if (count === 1) throw new Error('connection timeout postgres://secret-password');
    if (count === 2) await new Promise(resolve => { finish = resolve; });
  }, 'test-reminder');
  await flush();
  now = 299999; await tick(); assert.equal(count, 1);
  now = 300000; const pending = tick(); await flush();
  now = 600000; await tick(); assert.equal(count, 2);
  finish(); await pending;
  now = 4199999; await tick(); assert.equal(count, 2);
  now = 4200000; await tick(); assert.equal(count, 3);
  assert.match(logs[0], /5 menit/); assert.doesNotMatch(logs[0], /secret-password/);
});
test('real SMTP transport sends message to a local fixture and rejects refused recipients', async t => {
  const net = require('node:net');
  const nodemailer = require('nodemailer');
  const messages = [];
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.write('220 fixture ESMTP\r\n');
    let buffer = '', data = false, lines = [];
    socket.on('data', chunk => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (data) {
          if (line === '.') { messages.push(lines.join('\r\n')); lines = []; data = false; socket.write('250 queued\r\n'); }
          else lines.push(line);
        } else if (line.startsWith('DATA')) { data = true; socket.write('354 send data\r\n'); }
        else if (line.startsWith('RCPT TO:') && line.includes('refused@')) socket.write('550 recipient refused\r\n');
        else if (line.startsWith('QUIT')) { socket.end('221 bye\r\n'); }
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  const smtp = load('smtpService', { '../config/database': { pool: {} }, '../config/paths': { dataRoot: '' } });
  const transport = nodemailer.createTransport({ host: '127.0.0.1', port: server.address().port, secure: false, ignoreTLS: true, connectionTimeout: 2000, socketTimeout: 2000 });
  const message = { from: 'sender@example.test', to: 'owner@example.test', subject: 'Reminder fixture', text: 'Review due 2026-11-30' };
  await smtp.send(transport, message);
  assert.equal(messages.length, 1); assert.match(messages[0], /Reminder fixture/); assert.match(messages[0], /Review due 2026-11-30/);
  await assert.rejects(smtp.send(transport, { ...message, to: 'refused@example.test' }), { status: 502 });
  assert.equal(messages.length, 1); transport.close();
});
