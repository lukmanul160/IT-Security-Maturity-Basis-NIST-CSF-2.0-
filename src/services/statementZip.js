const yauzl = require('yauzl');
const fail = () => Object.assign(new Error('Arsip dokumen tidak valid atau terlalu besar.'), { status: 400 });

// Enforce limits on actual decompressed bytes, including forged ZIP size headers.
function validate(buffer, { maxBytes = 25 * 1024 * 1024, maxFileBytes = 5 * 1024 * 1024, maxEntries = 600 } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length > maxFileBytes) return Promise.reject(fail());
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(fail());
      let total = 0, count = 0, settled = false;
      const names = new Set();
      const abort = () => { if (!settled) { settled = true; zip.close(); reject(fail()); } };
      zip.on('error', abort);
      zip.on('end', () => { if (!settled) { settled = true; resolve(); } });
      zip.on('entry', entry => {
        if (++count > maxEntries || names.has(entry.fileName.toLowerCase()) || entry.uncompressedSize > maxBytes - total || entry.generalPurposeBitFlag & 1) return abort();
        names.add(entry.fileName.toLowerCase());
        zip.openReadStream(entry, (error, stream) => {
          if (error) return abort();
          stream.on('error', abort);
          stream.on('data', chunk => { total += chunk.length; if (total > maxBytes) { stream.destroy(); abort(); } });
          stream.on('end', () => { if (!settled) zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}
module.exports = { validate };
