const settings = require('../services/websiteSettingsService');
const fs = require('node:fs/promises');
const path = require('node:path');

function tooLarge(mb) { return Object.assign(new Error(`Ukuran export melebihi batas ${mb} MB. Kurangi cakupan export atau ubah Website Setting.`), { status: 413 }); }
async function fileLimits(req, res, next) {
  try {
    req.fileLimits = settings.fileLimits(await settings.read());
    if (/import|restore/i.test(req.path) && req.is('application/json') && Buffer.byteLength(JSON.stringify(req.body ?? {})) > req.fileLimits.importMb * 1048576) {
      return res.status(413).json({ error: `Ukuran data import melebihi batas ${req.fileLimits.importMb} MB.` });
    }
    const mb = req.fileLimits.exportMb, maxBytes = mb * 1048576;
    const send = res.send;
    res.send = function (body) {
      const attachment = /^attachment/i.test(String(res.getHeader('Content-Disposition') || '')) && !/\/files(?:\/|$)|\/certificate(?:\/|$)/.test(req.path);
      if (attachment && (Buffer.isBuffer(body) || typeof body === 'string') && Buffer.byteLength(body) > maxBytes) {
        res.removeHeader('Content-Disposition'); res.removeHeader('Content-Length');
        res.type('application/json');
        return next(tooLarge(mb));
      }
      return send.call(this, body);
    };
    const download = res.download;
    res.download = function (file, ...args) {
      const options = args.find(value => value && typeof value === 'object');
      const target = options?.root ? path.resolve(options.root, file) : path.resolve(file);
      const fail = error => { const callback = args.find(value => typeof value === 'function'); if(callback) callback(error); else next(error); };
      fs.stat(target).then(stat => {
        if (stat.size > maxBytes) return fail(tooLarge(mb));
        download.call(res, file, ...args);
      }).catch(fail);
      return res;
    };
    next();
  } catch (error) { next(error); }
}
module.exports = { fileLimits, tooLarge };
