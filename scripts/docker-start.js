const fs = require('node:fs');
const path = require('node:path');

function initializeData(defaultsDirectory, dataDirectory) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const added = [];
  for (const entry of fs.readdirSync(defaultsDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    try {
      fs.copyFileSync(path.join(defaultsDirectory, entry.name), path.join(dataDirectory, entry.name), fs.constants.COPYFILE_EXCL);
      added.push(entry.name);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  return added;
}

if (require.main === module) {
  try {
    const appDirectory = path.resolve(__dirname, '..');
    const added = initializeData(path.join(appDirectory, 'bundled-data'), path.join(appDirectory, 'data'));
    if (added.length) console.log('[docker-start] Added missing bundled data:', added.join(', '));
    require('../src/server');
  } catch (error) {
    console.error('[docker-start] Startup failed:', error);
    process.exitCode = 1;
  }
}

module.exports = { initializeData };
