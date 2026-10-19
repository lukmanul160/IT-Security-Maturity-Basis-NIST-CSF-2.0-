// Local, closed-loop HTTP benchmark. Business endpoints are read-only;
// normal API audit records are retained. No passwords or sessions are persisted.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const { fork } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (process.argv.includes('--server')) {
  (async () => {
    const { pool } = require('../src/config/database');
    const auth = require('../src/config/auth');
    const user = (await pool.query("SELECT username, role FROM app_users WHERE role='admin' LIMIT 1")).rows[0];
    if (!user) throw Error('Existing admin required');
    const token = auth.createSession(user);
    const server = require('../src/app').listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const histogram = monitorEventLoopDelay({ resolution: 20 }); histogram.enable();
    let cpu, start, peak, timer;
    process.on('message', async message => {
      if (message === 'begin') {
        histogram.reset(); cpu = process.cpuUsage(); start = performance.now(); peak = process.memoryUsage().rss;
        timer = setInterval(() => peak = Math.max(peak, process.memoryUsage().rss), 50);
        process.send({ begun: true });
      }
      if (message === 'metrics') {
        clearInterval(timer);
        const used = process.cpuUsage(cpu);
        process.send({ metrics: { cpuPercentOneCore: (used.user + used.system) / ((performance.now() - start) * 10), peakRssMB: peak / 1048576, eventLoopP99Ms: histogram.percentile(99) / 1e6, dbWaiting: pool.waitingCount } });
      }
      if (message === 'stop') {
        clearInterval(timer); auth.destroySession(token); server.closeAllConnections();
        await new Promise(r => server.close(r)); await pool.end(); process.disconnect();
      }
    });
    process.send({ port: server.address().port, cookie: `${auth.sessionCookie}=${token}` });
  })().catch(e => { console.error(e.message); process.exit(1); });
} else {
  (async () => {
    const duration = Number(process.env.LOAD_SECONDS || 10) * 1000;
    const levels = (process.env.LOAD_LEVELS || '1,10,25,50,100').split(',').map(Number);
    if (!(duration > 0) || levels.some(n => !Number.isInteger(n) || n < 1 || n > 200)) throw Error('Invalid load settings');
    const child = fork(__filename, ['--server'], { windowsHide: true, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const message = () => new Promise((resolve, reject) => {
      const failed = code => { child.off('message', received); reject(Error(`Server exited: ${code}`)); };
      const received = data => { child.off('exit', failed); resolve(data); };
      child.once('message', received); child.once('exit', failed);
    });
    const report = { startedAt: new Date().toISOString(), node: process.version, host: { platform: os.platform(), cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, ramGB: os.totalmem() / 1073741824 }, methodology: 'Separate local app and generator processes, shared host and existing PostgreSQL data; keep-alive, gzip, no think time, one in-flight request per connection. Single in-memory admin session; auth/password hashing not benchmarked. Normal API audit writes enabled. Each stage includes drain time in throughput. No production capacity or concurrent-human-user claim.', durationSeconds: duration / 1000, results: [] };
    fs.mkdirSync('output', { recursive: true });
    try {
      const ready = await message();
      for (const path of ['/login', '/api/public/website-settings', '/api/asset-management/assets', '/api/monitoring-dashboard']) {
        for (const concurrency of levels) {
          const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
          const request = () => new Promise(resolve => {
            const start = performance.now();
            const req = http.get({ host: '127.0.0.1', port: ready.port, path, agent, headers: { Cookie: path === '/login' ? '' : ready.cookie, 'Accept-Encoding': 'gzip', 'User-Agent': 'NIST-local-performance-test' } }, res => {
              let bytes = 0; res.on('data', b => bytes += b.length);
              res.on('end', () => resolve({ ms: performance.now() - start, status: res.statusCode, bytes }));
              res.on('error', () => resolve({ ms: performance.now() - start, status: 'response-error', bytes }));
            });
            req.setTimeout(15000, () => req.destroy(Error('timeout')));
            req.on('error', () => resolve({ ms: performance.now() - start, status: 'network-error', bytes: 0 }));
          });
          for (let i = 0; i < 3; i++) { const check = await request(); if (check.status !== 200) throw Error(`${path}: preflight ${check.status}`); }
          let pending = message(); child.send('begin'); await pending;
          const samples = [], start = performance.now(), deadline = start + duration;
          await Promise.all(Array.from({ length: concurrency }, async () => { while (performance.now() < deadline) samples.push(await request()); }));
          const elapsed = (performance.now() - start) / 1000;
          pending = message(); child.send('metrics'); const { metrics } = await pending;
          agent.destroy();
          const sorted = samples.map(s => s.ms).sort((a, b) => a - b), percentile = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
          const statuses = {}; for (const s of samples) statuses[s.status] = (statuses[s.status] || 0) + 1;
          const ok = samples.filter(s => s.status === 200).length;
          const row = { path, concurrency, requests: samples.length, elapsedSeconds: elapsed, successfulRps: ok / elapsed, totalRps: samples.length / elapsed, errorPercent: 100 * (samples.length - ok) / samples.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: sorted.at(-1), transferredMB: samples.reduce((n, s) => n + s.bytes, 0) / 1048576, statuses, ...metrics };
          report.results.push(row);
          fs.writeFileSync('output/load-test-results.json', JSON.stringify(report, null, 2));
          console.log(`${path} c=${concurrency} requests=${row.requests} rps=${row.successfulRps.toFixed(1)} p95=${row.p95Ms.toFixed(1)}ms errors=${row.errorPercent.toFixed(2)}%`);
          await sleep(500);
        }
      }
    } finally {
      if (child.connected) child.send('stop');
      if (child.exitCode === null) await new Promise(resolve => {
        const timer = setTimeout(() => child.kill(), 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
  })().catch(e => { console.error(e); process.exitCode = 1; });
}

