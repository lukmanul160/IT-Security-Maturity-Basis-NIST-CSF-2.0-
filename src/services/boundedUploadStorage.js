const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform, pipeline } = require('node:stream');
function createBoundedUploadStorage(directory, maxBytes = 200 * 1024 * 1024) {
  const totals = new WeakMap();
  return {
    _handleFile(req, file, callback) {
      fs.mkdir(directory, { recursive: true }, error => {
        if (error) return callback(error);
        const filename = crypto.randomUUID();
        const target = path.join(directory, filename);
        let size = 0;
        const counter = new Transform({ transform(chunk, encoding, done) {
          const total = (totals.get(req) || 0) + chunk.length;
          totals.set(req, total);
          if (total > maxBytes) return done(Object.assign(new Error('Upload batch maksimum 200 MB.'), { status: 413 }));
          size += chunk.length;
          done(null, chunk);
        } });
        pipeline(file.stream, counter, fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }), error => {
          if (!error) return callback(null, { destination: directory, filename, path: target, size });
          fs.rm(target, { force: true }, () => callback(error));
        });
      });
    },
    _removeFile(req, file, callback) { fs.rm(file.path, { force: true }, callback); },
  };
}
module.exports = { createBoundedUploadStorage };
