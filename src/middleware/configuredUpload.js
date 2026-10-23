const multer = require('multer');
const settings = require('../services/websiteSettingsService');

// Preserve each parser's storage, file filters, count limits and format ceiling.
function configuredUpload(options = {}) {
  const { limitKey, ...parserOptions } = options;
  options = parserOptions;
  const parser = multer(options);
  return Object.assign(parser, Object.fromEntries(['single', 'array', 'fields', 'any', 'none'].map(method => [method, (...args) => async (req, res, next) => {
    try {
      const limits = req.fileLimits || settings.fileLimits(await settings.read());
      req.fileLimits = limits;
      const importing = /import|restore|workbook/i.test(req.originalUrl || req.url);
      const mb = limits[limitKey || (importing ? 'importMb' : 'uploadMb')];
      const fileSize = Math.min(options.limits?.fileSize ?? Infinity, mb * 1048576);
      multer({ ...options, storage: parser.storage, limits: { ...options.limits, fileSize } })[method](...args)(req, res, error => {
        if (error?.code === 'LIMIT_FILE_SIZE') return next(Object.assign(new Error(`Ukuran file melebihi batas ${limitKey === 'documentEditMb' ? 'edit dokumen' : importing ? 'import' : 'upload'} ${fileSize / 1048576} MB.`), { status: 413 }));
        next(error);
      });
    } catch (error) { next(error); }
  }])));
}
Object.assign(configuredUpload, multer);
module.exports = configuredUpload;
