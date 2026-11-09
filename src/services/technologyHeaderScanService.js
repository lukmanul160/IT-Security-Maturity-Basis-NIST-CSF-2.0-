/** Bounded internal/public HTTP page scan. Every redirect is revalidated and DNS is pinned per connection. */
const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http'),
  https = require('node:https');
const zlib = require('node:zlib');
const { headerNames } = require('../shared/technologyFingerprint');
class ScanError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ScanError';
    this.status = status;
  }
}
const fail = (message, status = 400) => new ScanError(message, status);
function connectionError(error) {
  if (error.code === 'ETIMEDOUT') return fail('Website tidak merespons dalam batas waktu.', 504);
  if (error.code === 'ECONNREFUSED')
    return fail('Koneksi website ditolak. Periksa port dan layanan aplikasi tujuan.', 502);
  if (['ENETUNREACH', 'EHOSTUNREACH'].includes(error.code))
    return fail(
      'Jaringan tujuan tidak dapat dijangkau dari server. Periksa routing, VPN atau firewall.',
      502,
    );
  if (/CERT|TLS|SSL/.test(error.code || ''))
    return fail(
      'Verifikasi TLS website gagal. Periksa sertifikat, hostname dan CA yang dipercaya server.',
      502,
    );
  return fail('Scan website gagal. Periksa URL, TLS, DNS atau akses jaringan server.', 502);
}
function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (net.isIP(address) !== 6) return false;
  const first = Number.parseInt(address.split(':')[0], 16),
    second = Number.parseInt(address.split(':')[1] || '0', 16);
  // Global unicast only; exclude transition, documentation and special-purpose prefixes.
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x0200 || second === 0x0db8)) &&
    !(first >= 0x3ff0)
  );
}
function internalAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIP(address) !== 6) return false;
  const first = Number.parseInt(address.split(':')[0], 16);
  return first >= 0xfc00 && first <= 0xfdff;
}
function allowedAddress(address) {
  if (!net.isIP(address)) return false;
  const canonical = net.isIP(address) === 6 ? new URL('http://[' + address + ']/').hostname : address;
  if (['100.100.100.200', '168.63.129.16', '[fd00:ec2::254]'].includes(canonical)) return false;
  return publicAddress(address) || internalAddress(address);
}
function validateUrl(value) {
  let url;
  try {
    if (typeof value !== 'string' || value.length > 2048) throw Error();
    url = new URL(value);
  } catch {
    throw fail('Gunakan URL http/https yang valid.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw fail('Scan hanya mendukung HTTP/HTTPS tanpa kredensial URL.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    ['metadata.google.internal', 'metadata.goog', 'instance-data', 'instance-data.ec2.internal'].includes(
      hostname,
    ) ||
    (net.isIP(hostname) && !allowedAddress(hostname))
  )
    throw fail('Alamat loopback, metadata, link-local atau reserved tidak dapat dipindai.');
  url.hash = '';
  return url;
}
async function target(value, resolve = dns.lookup.bind(dns)) {
  const url = validateUrl(value),
    hostname = url.hostname.replace(/^\[|\]$/g, '');
  let timer, addresses;
  try {
    addresses = net.isIP(hostname)
      ? [{ address: hostname, family: net.isIP(hostname) }]
      : await Promise.race([
          resolve(hostname, { all: true, verbatim: true }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(fail('DNS scan tidak merespons.', 502)), 3000);
          }),
        ]);
  } catch (error) {
    if (error.status) throw error;
    throw fail('Nama website tidak dapat di-resolve.', 502);
  } finally {
    clearTimeout(timer);
  }
  if (!addresses.length || addresses.some((row) => !allowedAddress(row.address)))
    throw fail('Alamat loopback, metadata, link-local atau reserved tidak dapat dipindai.');
  const selected = addresses.find((row) => row.family === 4) || addresses[0];
  return {
    url,
    address: selected.address,
    family: selected.family,
    scope: internalAddress(selected.address) ? 'internal' : 'public',
  };
}
const HTML_LIMIT = 512 * 1024;
function requestPage(destination, method = 'GET', options = {}) {
  return new Promise((resolve, reject) => {
    const transport = destination.url.protocol === 'https:' ? https : http;
    let settled = false,
      timer;
    const req = transport.request(
      destination.url,
      {
        method,
        maxHeaderSize: 16384,
        agent: false,
        family: destination.family,
        autoSelectFamily: false,
        lookup: (host, options, callback) =>
          options.all
            ? callback(null, [{ address: destination.address, family: destination.family }])
            : callback(null, destination.address, destination.family),
        headers: {
          'User-Agent': 'NIST-Basis-Technology-Inventory/1.0',
          Accept: options.asset
            ? 'text/javascript,application/javascript,text/css;q=0.9,*/*;q=0.5'
            : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'identity',
        },
        rejectUnauthorized: true,
      },
      (res) => {
        const result = {
          status: res.statusCode,
          headers: res.headers,
          html: '',
          htmlBytes: 0,
          truncated: false,
        };
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        };
        const type = String(res.headers['content-type'] || '');
        const accepted = options.asset
          ? /^(?:text\/(?:javascript|css)|application\/(?:javascript|x-javascript))\b/i.test(type)
          : /^text\/html\b|^application\/xhtml\+xml\b/i.test(type);
        const limit = options.asset ? (options.browserAsset ? 2 * 1024 * 1024 : 128 * 1024) : HTML_LIMIT;
        if (method === 'HEAD' || [301, 302, 303, 307, 308].includes(res.statusCode) || !accepted) {
          finish();
          res.destroy();
          return;
        }
        const chunks = [];
        const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
        const decoder =
          encoding === 'gzip'
            ? zlib.createGunzip()
            : encoding === 'deflate'
              ? zlib.createInflate()
              : encoding === 'br'
                ? zlib.createBrotliDecompress()
                : null;
        const body = decoder ? res.pipe(decoder) : res;
        const stop = () => {
          result.truncated = true;
          result.html = Buffer.concat(chunks).toString('utf8');
          finish();
          res.destroy();
          decoder?.destroy();
        };
        let wireBytes = 0;
        if (decoder)
          res.on('data', (chunk) => {
            wireBytes += chunk.length;
            if (wireBytes > limit) stop();
          });
        body.on('data', (chunk) => {
          const remaining = limit - result.htmlBytes;
          if (remaining > 0) {
            const part = chunk.subarray(0, remaining);
            chunks.push(part);
            result.htmlBytes += part.length;
          }
          if (result.htmlBytes >= limit) stop();
        });
        body.on('end', () => {
          result.html = Buffer.concat(chunks).toString('utf8');
          finish();
        });
        const failed = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            res.destroy();
            decoder?.destroy();
            reject(fail('Halaman website gagal dibaca.', 502));
          }
        };
        body.on('error', failed);
        if (decoder) res.on('error', failed);
      },
    );
    timer = setTimeout(
      () => req.destroy(Object.assign(new Error('Scan timeout'), { code: 'ETIMEDOUT' })),
      options.asset ? 3000 : 5500,
    );
    req.once('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(connectionError(error));
      }
    });
    req.once('close', () => {
      if (settled) clearTimeout(timer);
    });
    req.end();
  });
}
function requestHeaders(destination) {
  return requestPage(destination, 'HEAD');
}
async function scan(value, dependencies = {}) {
  const progress = (percent, stage) => dependencies.onProgress?.({ percent, stage });
  progress(5, 'validating');
  let next = value,
    initialScope;
  for (let hop = 0; hop < 4; hop++) {
    const destination = await target(next, dependencies.resolve);
    if (!initialScope) initialScope = destination.scope;
    else if (initialScope === 'public' && destination.scope === 'internal')
      throw fail('Redirect publik ke jaringan internal diblokir. Scan URL internal secara langsung.');
    progress(20, 'navigation');
    const response = await (dependencies.request || requestPage)(destination);
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      if (hop === 3) throw fail('Redirect website melebihi batas scan.', 502);
      try {
        next = new URL(response.headers.location, destination.url).href;
      } catch {
        throw fail('Redirect website tidak valid.', 502);
      }
      continue;
    }
    const assets = [];
    let assetFailures = 0;
    const profile = require('../shared/technologyFingerprint');
    const urls = profile.assetUrls(response.html || '', destination.url.href);
    let checked = 0;
    for (const url of urls) {
      progress(30 + Math.floor((50 * checked++) / Math.max(1, urls.length)), 'resources');
      try {
        const assetTarget = await target(url, dependencies.resolve);
        if (initialScope === 'public' && assetTarget.scope === 'internal')
          throw fail('Redirect publik ke jaringan internal diblokir. Scan URL internal secara langsung.');
        const asset = await (
          dependencies.assetRequest || ((target) => requestPage(target, 'GET', { asset: true }))
        )(assetTarget);
        if (asset.status >= 200 && asset.status < 300) assets.push({ text: asset.html || '' });
        else assetFailures++;
      } catch {
        assetFailures++;
      }
    }
    progress(90, 'signatures');
    const headers = Object.fromEntries(
      headerNames
        .filter((name) => typeof response.headers[name] === 'string')
        .map((name) => [name, response.headers[name].slice(0, 256)]),
    );
    return {
      url: destination.url.href,
      status: response.status,
      scannedAt: new Date().toISOString(),
      technologies: require('../shared/technologyFingerprint').detectPage(
        headers,
        response.html || '',
        response.headers['set-cookie'],
        assets,
      ),
      headers,
      scope: destination.scope,
      htmlBytes: response.htmlBytes || 0,
      truncated: Boolean(response.truncated),
      assetsChecked: assets.length,
      assetFailures,
    };
  }
}
module.exports = {
  ScanError,
  connectionError,
  publicAddress,
  internalAddress,
  allowedAddress,
  validateUrl,
  target,
  scan,
  requestHeaders,
  requestPage,
  HTML_LIMIT,
};
